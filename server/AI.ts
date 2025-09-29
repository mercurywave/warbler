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
    public get embedModel(): string | Nil { return process.env.EMBED_MODEL; }

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

    public async generate(model: string, prompt: string, halt: string): Promise<string> {
        type IGenerateResp = {
            response: string;
        };
        let result = await Rest.postLong<IGenerateResp>(this.url, "api/generate", {
            model, prompt,
            stream: false,
            raw: true,
            options: {
                temperature: 0.25,
                stop: [halt, "<<DONE>>"],
            }
        });
        if (result.success)
            return result.response?.response ?? '';
        else {
            console.error(result.error);
            throw 'Failed to generate';
        }
    }

    public async embed(model: string, text: string): Promise<number[]> {
        type IGenerateResp = {
            embeddings: number[][];
        };
        let result = await Rest.postLong<IGenerateResp>(this.url, "api/embed", {
            model, input: text
        });
        if (result.success) {
            console.log(`embedding generated: ${text.substring(0, 30)}...`);
            return result.response?.embeddings[0] ?? [];
        }
        else {
            console.error(result.error);
            throw 'Failed to generate';
        }
    }
}

export let AI = new AIServer(process.env.LLM_TYPE ?? '', process.env.LLM_URL ?? '');

// Prompt Clean - clean up multi-line prompts
export function pcl(input?: string): string {
    return (input ?? '')
        .trim()
        .split('\n')
        .map(s => s.trim()) // trim each line
        .map(s => s === '' ? '\n' : s) //make sure double lines are line breaks
        .join(''); // join back up without a splitter
}
// Prompt Clean Short - leave line breaks if not blank
export function pcs(input?: string): string {
    return (input ?? '')
        .trim()
        .split('\n')
        .map(s => s.trim()) // trim each line
        .filter(s => s !== '') // remove empties
        .join('\n'); // join back up
}
// Prompt Clean Manual - leading "_" character indicates continuation
export function pcm(input?: string): string {
    return (input ?? '')
        .trim()
        .split('\n')
        .map(s => s.trim()) // trim each line
        // insert line breaks, unless _
        .map(s => (s.length > 0 && s[0] == '_') ? (' ' + s.slice(1)) : ('\n' + s))
        .join('').trim(); // join back up without a splitter
}

export namespace AiApis {
    export async function postCleanupTranscript(req: Request, res: Response): Promise<void> {
        const zInput = z.object({
            raw: z.string(),
            summary: z.string().optional(),
            vocab: z.string().optional(),
        });
        let model = AI.summaryModel;
        if (!model || !AI.isEnabled) {
            res.status(501).json({ error: 'Summary model not configured' });
            return;
        }
        let parse = zInput.safeParse(req.body);
        if (parse.success) {
            let { raw, summary, vocab } = parse.data;

            let prompt: string;
            let rules = pcs(`
                RULES:
                * Remove filler and repetition
                * Do NOT add any interpretation or context
                * Minimize changes from the original.
                * When complete, output <<<DONE>>>
            `);

            if (summary || vocab) {
                if (vocab) vocab = `<<<VOCABULARY>>>\n\n${vocab}`;
                prompt = pcm(`
                    You are an experienced secretary.
                    _Given the following automated transcript, please provide a refined version
                    _that is clear and concise. Use the provided references to ensure accuracy.

                    ${rules}
                    <<<REFERENCES>>>
                    ${summary ?? ''}
                    ${vocab ?? ''}
                `);

            } else {
                prompt = pcm(`
                    You are an experienced secretary.
                    _Given the following automated transcript, please provide a refined version
                    _that is clear and concise.
                    ${rules}
                `);
            }
            prompt += "\n" + pcs(`
                <<<TRANSCRIPT>>>
                ${raw}
                <<<DONE>>>
                <<<CLEANED TRANSCRIPT>>>
            `);

            let result = await AI.generate(model, prompt, '<<<DONE>>>');

            // maybe has trouble with the number of <'s before DONE
            if (result[result.length - 1] === "<") {
                result = result.slice(0, -1);
            }

            res.json(result.trim());
        } else {
            console.error(z.treeifyError(parse.error));
            res.status(400).json({ error: parse.error });
        }
    }
    export async function postExtractFolderVocab(req: Request, res: Response): Promise<void> {
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
            const divider = '\n\n';

            let notes = await Notes.getAllInFolder(id);
            let noteChunks = chunkArrayByCharacterLength(notes.map(n => n.text));
            let summaries: string[] = [];
            for (const chunk of noteChunks) {

                let prompt = pcl(`
                    Extract all jargon and shorthand from the following loose notes from the user
                    and provide a simple (<6 word!) reference description for each term or proper noun.
                    Output a bulleted list in the form "- Term: Description".

                    If the term is not extremely clear from the surrounding context,
                    leave a placeholder '???' as the description.

                    When complete, output <<DONE>>

                    <<NOTES>>

                    ${chunk.join(divider)}

                    <<SUMMARY>>
                `);
                let result = await AI.generate(model, prompt, '\n\n');
                result = util.replaceAll(result, '.-', '\n-'); // seems like a common issue generating lists
                summaries.push(result);
            }
            //TODO: collapse and cleanup duplicates

            res.json(summaries.join('\n'));
        } else {
            console.error(z.treeifyError(parse.error));
            res.status(400).json({ error: parse.error });
        }
    }

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

                let prompt = pcl(`
                    Summarize the overall subject and purpsoe of these note(s) 
                    into 2-4 sentences, then stop.

                    <<NOTES>>

                    ${chunk.join(divider)}

                    <<SUMMARY>>
                `);
                let result = await AI.generate(model, prompt, '\n');
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
