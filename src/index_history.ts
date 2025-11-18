import { Rest, util } from "@shared/util";
import { Flow } from "./flow";
import { Config } from "./settings";
import { View } from "./view";


// audit history
export interface NoteEditData {
    id: string;
    text: string;
    editUtc: string;
}

export function mkNoteHistory(flow: Flow, id: string) {
    let view = View.CurrView();
    let bind = flow.bindArray(() => view._audits, mkNoteWrapper);
}
function mkNoteWrapper(flow: Flow, edit: NoteEditData) {
    let root = flow.root("div", { className: "bubble-wrap" });
    let inner = flow.child("div", { className: "bubble" });
    let dt = new Date(Date.parse(edit.editUtc));
    flow.elem(inner, "div", { 
        className: "edit-time",
        innerText: util.getRelativeTime(dt),
        title: edit.editUtc,
    });
    flow.elem(inner, "div", {
        className: "edit-body",
        innerText: edit.text,
    });
}

export async function loadNoteHistory(id: string): Promise<NoteEditData[]> {
    let url = Config.getBackendUrl();
    if (!url) return [];
    let raw = await Rest.post(url, "v1/loadNoteHistory", {id});
    if(raw.error) throw `Error loading history: ${raw.error}`;
    return raw.response as any;
}