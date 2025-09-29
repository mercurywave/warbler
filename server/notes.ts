import { Request, Response } from 'express';
import * as z from "zod";
import { DocStore } from "./docstore";
import { util } from "@shared/util";
import { autoThreeWayTextMerge } from '../shared/diff';
import { VectorIndex } from './vector';

const VNoteData = z.object({
    v: z.number(),
    id: z.guid(),
    text: z.string(),
    folderId: z.string().optional(),
    tags: z.array(z.string()),
    childrenIds: z.array(z.guid()),
    deleted: z.boolean().optional(),
    creationUtc: z.string().refine(util.zValidDate),
});
export type NoteData = z.infer<typeof VNoteData>;

let _db: DocStore<NoteData> = new DocStore("./data", "notes");
let _vectorIndex = new VectorIndex<NoteData>(_db, "notes", 1, o => o.text);

export namespace NoteApis {

    export async function getRecentNoteEdits(req: Request, res: Response): Promise<void> {
        // return a list of all note IDs updated since the given date
        let { since } = req.query;
        let found = await _db.findRecentIds(util.parseDate(since as string));
        res.json(found);
    }

    export async function postLoadNotes(req: Request, res: Response): Promise<void> {
        const VArr = z.array(z.guid());
        let parse = VArr.safeParse(req.body);
        if (parse.success) {
            let arr: string[] = parse.data;
            let loaded = arr.map(i => _db.load(i)).filter(i => i != null);
            res.json(loaded);
        } else {
            console.error(z.treeifyError(parse.error));
            res.status(400).json({ error: parse.error });
        }
    }

    export async function postUpdateNotes(req: Request, res: Response): Promise<void> {
        const VReq = z.array(z.tuple([VNoteData, z.string()]));
        let parse = VReq.safeParse(req.body);
        if (parse.success) {
            let arr: [NoteData, string][] = parse.data;
            let saveResult = arr.map(o => {
                let [note, anscestor] = o;
                try {
                    return updateNote(note, anscestor);
                } catch (e) { return [note, [`Error Saving - ${e}`]]; }
            });
            res.json(saveResult);
        } else {
            console.error(z.treeifyError(parse.error));
            res.status(400).json({ error: parse.error });
        }
    }

    export async function postSearch(req: Request, res: Response): Promise<void> {
        const VReq = z.object({
            input: z.string(),
        });
        let parse = VReq.safeParse(req.body);
        if (parse.success) {
            let input = parse.data.input;
            let search = await _vectorIndex.vectorSearch(input);
            res.json(search);
        } else {
            console.error(z.treeifyError(parse.error));
            res.status(400).json({ error: parse.error });
        }
    }
}

export namespace Notes {
    export function getDB(): DocStore<NoteData> { return _db; }
    export async function getAllInFolder(id: string): Promise<NoteData[]> {
        let notes = await _db.search(n => n.folderId === id && !n.deleted);
        sortChronologically(notes);
        return notes;
    }

    export function sortChronologically(notes: NoteData[]) {
        notes.sort((a, b) => new Date(a.creationUtc).getTime() - new Date(b.creationUtc).getTime());
    }
}

function updateNote(note: NoteData, anscestor: string): [NoteData, string[]] {
    return _db.saveMerge(note.id, (curr) => {
        let [text, conflicts] = autoThreeWayTextMerge(anscestor, curr?.text ?? '', note.text);
        note.text = text;
        return [note, conflicts];
    });
}
