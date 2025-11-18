import { Request, Response } from 'express';
import * as z from "zod";
import { DocStore } from "./docstore";
import { util } from "@shared/util";
import { autoThreeWayTextMerge } from '../shared/diff';
import { VectorIndex } from './vector';
import { AuditStore } from './auditstore';

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

export interface EditData {
    id: string;
    text: string;
    editUtc: string;
}

let _db: DocStore<NoteData> = new DocStore("./data", "notes");
let _vectorIndex = new VectorIndex<NoteData>(_db, "notes", 1, o => o.text);
let _audit: AuditStore<EditData> = new AuditStore<EditData>("notes_audit");

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

    export async function postLoadEdits(req: Request, res: Response): Promise<void> {
        const VReq = z.object({
            id: z.string().optional(),
        });
        let parse = VReq.safeParse(req.body);
        if (parse.success) {
            let id = parse.data.id;
            let search = await _audit.searchForHistory(id ?? '');
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
    let result = _db.saveMerge(note.id, (curr) => {
        let [text, conflicts] = autoThreeWayTextMerge(anscestor, curr?.text ?? '', note.text);
        note.text = text;
        return [note, conflicts];
    });
    logChange(note);
    return result;
}

function logChange(note: NoteData) {
    _audit.log(note.id, {
        id: note.id,
        text: note.text,
        editUtc: new Date().toJSON(),
    });
}