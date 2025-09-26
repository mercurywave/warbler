import { Rest } from "@shared/util";
import { Note } from "./note";
import { Config } from "./settings";
import { DB } from "./DB";

export namespace Search {
    export async function SearchNotes(input: string): Promise<Note[]> {
        let notes: Note[] = [];
        if (Config.backendHandlesEmbed()) {
            let future = Rest.post(Config.getBackendUrl()!, "v1/notesSearch", { input });
            let client = clientSearch(input);
            let response = await future;
            if (response.success) {
                let ids: string[] = response.response as any;
                let combinedIds = [...client, ...ids.filter(i => !client.includes(i))];
                notes = combinedIds.map(i => DB.GetNoteById(i))
                    .filter(n => !!n);
            }
            else return client.map(i => DB.GetNoteById(i)).filter(n => !!n);
        } else {
            return clientSearch(input)
                .map(i => DB.GetNoteById(i))
                .filter(n => !!n);
        }
        return notes;
    }
}

type IResult = {
    id: string;
    score: number;
}

function clientSearch(raw: string): string[] {
    let terms = cleanTerms(raw);
    if (terms.length == 0) return [];

    let results: IResult[] = DB.AllNotes().map(n => {
        let score = scoreNoteSearch(raw, terms, n);
        return { id: n.id, score }
    });
    results = results.filter(r => r.score > .1);
    results.sort((a, b) => b.score - a.score);
    return results.map(r => r.id);
}

function cleanTerms(raw: string): string[] {
    return raw
        .trim()
        .toLocaleLowerCase()
        .split(/\W+/)
        .map(s => s.trim())
        .filter(s => s !== '');
}

function normalize(text: string): string {
    return text
        .replace(/[^\w\s]/g, '') // strip punctuation
        .toLocaleLowerCase(); // normalize
}

function scoreNoteSearch(raw: string, terms: string[], note: Note): number {
    // assumes terms were pre-cleaned, trimmed, and filtered
    let score = 0;
    let clean = normalize(note.text);
    for (const word of terms) {
        let count = countOccurences(word, clean);
        if (count > 0)
            score += count / terms.length;
    }

    // dumb backup for weird literal search, like punctuation for some reaons
    if (score == 0 && countOccurences(raw, note.text) > 0)
        score += .5;
    return score > 1 ? 1 : curveScore(score);
}

function countOccurences(word: string, text: string) {
    // Use the regex pattern to find all matches and count them
    const exact = text.match(new RegExp(`\\b${word}\\b`, 'g'))?.length ?? 0;
    const matches = text.match(new RegExp(`\\b${word}`, 'g'))?.length ?? 0;
    return exact * 2 + matches;
}

function curveScore(val: number): number {
    return val > 1 ? 1 : 1 - Math.pow(2, -10 * val);
}