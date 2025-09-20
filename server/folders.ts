import { Request, Response } from 'express';
import * as z from "zod";
import { DocStore } from "./docstore";
import { util } from "./util";

const VFolderData = z.object({
    v: z.number(),
    id: z.guid(),
    title: z.string(),
    deleted: z.boolean().optional(),
    creationUtc: z.string().refine(util.zValidDate),
    editsUtc: z.array(z.string().refine(util.zValidDate)),
});
type FolderData = z.infer<typeof VFolderData>;

let _db: DocStore<FolderData> = new DocStore("./data", "folders");

export namespace FolderApis {
    export async function getFolders(req: Request, res: Response): Promise<void> {
        // returns all folders as objects
        let found = await _db.findRecentIds(new Date(0));
        let loaded = found.map(i => _db.load(i)).filter(i => i != null);
        res.json(loaded);
    }

    export async function postUpdateFolders(req: Request, res: Response): Promise<void> {
        const VArr = z.array(VFolderData);
        let parse = VArr.safeParse(req.body);
        if (parse.success) {
            let arr: FolderData[] = parse.data;
            let saveResult = arr.map(n => {
                try {
                    return updateFolder(n);
                } catch (e) { return [n, [`Error Saving - ${e}`]]; }
            });
            res.json(saveResult);
        } else {
            console.error(z.treeifyError(parse.error));
            res.status(400).json({ error: parse.error });
        }
    }
}

function updateFolder(folder: FolderData): [FolderData, string[]] {
    return _db.saveMerge(folder.id, (curr) => {
        return [folder, []];
    });
}