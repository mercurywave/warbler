import { Request, Response } from 'express';
import * as z from "zod";
import { DocStore } from "./docstore";
import { util } from "./util";

const VNoteData = z.object({
    v: z.number(),
    id: z.guid(),
    text: z.string(),
    folderId: z.string().optional(),
    tags: z.array(z.string()),
    childrenIds: z.array(z.guid()),
    deleted: z.boolean().optional(),
    creationUtc: z.string().refine(util.zValidDate),
    editsUtc: z.array(z.string().refine(util.zValidDate)),
});
type NoteData = z.infer<typeof VNoteData>;

let _db: DocStore<NoteData> = new DocStore("./data", "notes");

export namespace NoteApis {

    export async function getRecentNoteEdits(req: Request, res: Response): Promise<void> {
        // return a list of all note IDs updated since the given date
        let { since } = req.query;
        let num = Date.parse(since as string ?? "");
        let dt = new Date(isNaN(num) ? 0 : num);
        let found = await _db.findRecentIds(dt);
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
        const VArr = z.array(VNoteData);
        let parse = VArr.safeParse(req.body);
        if (parse.success) {
            let arr: NoteData[] = parse.data;
            let saveResult = arr.map(n => {
                try {
                    return updateNote(n);
                } catch (e) { return [n, [`Error Saving - ${e}`]]; }
            });
            res.json(saveResult);
        } else {
            console.error(z.treeifyError(parse.error));
            res.status(400).json({ error: parse.error });
        }
    }
}

function updateNote(note: NoteData): [NoteData, string[]] {
    return _db.saveMerge(note.id, (curr) => {
        return [note, []];
    });
}