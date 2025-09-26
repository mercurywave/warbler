import { Rest } from "@shared/util";
import { Note } from "./note";
import { Config } from "./settings";
import { DB } from "./DB";

export namespace Search {
    export async function SearchNotes(input: string): Promise<Note[]> {
        let notes: Note[] = [];
        if (Config.backendHandlesEmbed()) {
            let response = await Rest.post(Config.getBackendUrl()!, "v1/notesSearch", { input });
            if (response.success) {
                let ids: string[] = response.response as any;
                notes = ids.map(i => DB.GetNoteById(i))
                    .filter(n => !!n);
                if (notes.length != ids.length)
                    console.warn("search returned a note ID that isn't on the client", ids);
            }
        }
        return notes;
    }
}
