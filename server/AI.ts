import { Request, Response } from 'express';
import { Nil, util, Rest } from "@shared/util";
import z from 'zod';
import { Folders } from './folders';
import { Notes } from './notes';

export class AIServer {
    public type: string;
    public url: string;
    public constructor(type: string, url: string) {
        type = type.toUpperCase();
        if (['OLLAMA'].includes(type)) {
            this.type = type;
            this.url = url;
        } else {
            console.log("AI features not configured (correctly?)");
            this.type = '';
            this.url = '';
        }
    }

    public get isEnabled(): boolean { return !!this.type && !!this.url; }

    public get summaryModel(): string | Nil { return process.env.SUMMARY_MODEL; }

    public async TestConnection(): Promise<[boolean, string]> {
        let baseUrl = this.url;
        if (!baseUrl) return [false, 'URL is required'];
        let url = util.appendPathToUrl(baseUrl, 'api/tags');
        console.log("GET", url.toString());
        try {
            const response = await fetch(url, {
                method: 'GET',
            });

            if (response.ok) {
                const result = await response.json();
                console.log('Response from backend:', result);
                return [true, "👍"];
            } else {
                console.error('Failed:', response.status, response.statusText);
                return [false, `Error: ${response.status} ${response.statusText}`];
            }
        } catch (error) {
            console.error('Error:', error);
            return [false, `Error: ${error}`];
        }
    }

    public async generate(model: string, prompt: string): Promise<string> {
        let result = await Rest.postLong(this.url, "api/generate", {
            model, prompt,
            stream: false,
            raw: true,
            options: {
                temperature: 0.25,
                stop: ['\n'],
            }
        });
        if (result.success)
            return result.response as string;
        else {
            console.error(result.error);
            throw 'Failed to generate';
        }
    }
}

export let AI = new AIServer(process.env.LLM_TYPE ?? '', process.env.LLM_URL ?? '');

// Prompt Clean - clean up multi-line prompts
export function pc(input?: string): string {
    return (input ?? '')
        .trim()
        .replace(/\t| {4}/g, '') // Remove tabs and four-space blocks
        .replace(/\n(?!\n)/g, ' ') // Remove single newlines not followed by another newline
        .replace(/\n{2,}/g, '\n'); // Collapse multiple newlines into one
}

export namespace AiApis {
    export async function postSummarizeFolder(req: Request, res: Response): Promise<void> {
        // NOTE: this is not functional, I'm just leaving it half-implemented
        // I can see the path to implementing this, *but I'm not sure it's useful*
        // at least the way I write, there's not much hope of a useful summary being generate
        // If it can figure it out, it's because I wrote a note that is basically the summary
        // So I should probably just write in that field. Vocab is probably more useful
        const VId = z.object({
            id: z.guid(),
        });
        let model = AI.summaryModel;
        if (!model || !AI.isEnabled) {
            res.status(501).json({ error: 'Summary model not configured' });
            return;
        }
        let parse = VId.safeParse(req.body);
        if (parse.success) {
            let id = parse.data.id;
            let folder = Folders.getById(id);
            if (!folder) {
                res.status(400).send('folder does not exist on database');
                return;
            }
            const divider = '\n\n================================\n\n';

            let notes = await Notes.getAllInFolder(id);
            let noteChunks = chunkArrayByCharacterLength(notes.map(n => n.text));
            let summaries: string[] = [];
            for (const chunk of noteChunks) {

                let prompt = pc(`
                    Summarize the overall subject and purpsoe of these note(s) 
                    into 2-4 sentences, then stop.

                    <<NOTES>>

                    ${chunk.join(divider)}

                    <<SUMMARY>>
                `);
                let result = await AI.generate(model, prompt);
                console.log(result);
                summaries.push(result);
            }
            // console.log("SUMMARIES:", summaries);
            // let futures = notes.map(async note => {
            //     if (note.text.length < 50) return ''; // you're just going to get hallucinations
            //     let prompt = pc(`
            //         Summarize the key points of this NOTE in no more than 2-4 sentences.

            //         ### NOTE:
            //         ${note.text}

            //         ### SUMMARY:`);
            //     return await AI.generate(model, prompt);
            // });
            // let summaries = (await Promise.all(futures)).filter(s => s.length > 10);
            
            // let chunks = chunkArrayByCharacterLength(summaries);

            // 
            // let hierarchy = await Promise.all(chunks.map(async arr => {
            //     let notes = arr.join(divider);
            //     return await AI.generate(model, notes, `
            //         Aggregate the insights from these summaries into a single overview, 
            //         highlighting recurring patterns and unique contributions:
            //     `);
            // }));
            // console.log("HIERARCHIES:", hierarchy);

            // let final = await AI.generate(model, hierarchy.join(divider), `
            //     Based on the following aggregated summaries, 
            //     produce a high-level executive summary that captures the 
            //     overall findings, trends, and implications.
            //     Write it from the perspective of the author.
            // `);
            // console.log("FINAL:", final);

            // res.json(final);
            res.json("???");
        } else {
            console.error(z.treeifyError(parse.error));
            res.status(400).json({ error: parse.error });
        }
    }
}

function chunkArrayByCharacterLength(arr: string[], maxChunkSize: number = 2000): string[][] {
    const result: string[][] = [];
    let currentChunk: string[] = [];

    for (const str of arr) {
        currentChunk.push(str);

        if (currentChunk.join('').length > maxChunkSize) {
            result.push(currentChunk);
            currentChunk = [];
        }
    }

    // Push any remaining strings as the last chunk
    if (currentChunk.length > 0) {
        result.push(currentChunk);
    }

    return result;
}
