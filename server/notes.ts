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

    export async function getRecentNotes(req: Request, res: Response): Promise<void> {
        // return a list of all note IDs updated since the given date
        let { since } = req.query;
        let dt = new Date(Date.parse(since as string ?? ""));
        let found = _db.findRecentIds(dt);
        res.json(found);
    }

    export async function postUpdateNotes(req: Request, res: Response): Promise<void> {
        const VArr = z.array(VNoteData);
        console.log(req.body);
        let parse = VArr.safeParse(req.body);
        if (parse.success) {
            let arr: NoteData[] = parse.data;
            let saveResult = arr.map(n => updateNote(n));
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