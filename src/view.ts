import { DB } from "./DB";
import { Flow } from "./flow";
import { Folder } from "./folder";
import { Note } from "./note";
import { Nil } from "./util";

export class ViewData {
    public type: eView;
    public settings: eSettingsPage = eSettingsPage.None;
    public _notes: Note[] = [];
    private _fullResults: Note[] = [];
    public folder: Folder | Nil = null;
    public tag: string | Nil = null;
    public title: string = "";
    public isChron: boolean = false; // chronologically ordered
    public showingDeleted: boolean = false;

    public constructor(type: eView) {
        this.type = type;
    }

    public get notes(): Note[] {
        if(!this.showingDeleted){
            this._notes = this._notes.filter(n => !n.isDeleted)
        }
        return this._notes;
    }

    public get canAddNotes(): boolean { return this.type != eView.Settings; }

    public get more(): number { return this._fullResults.length - this.notes.length; }

    // will automatically include children notes along side the main note
    public setChronResults(notes: Note[]) {
        notes.sort((a, b) => a.creationUtc.getTime() - b.creationUtc.getTime());
        notes = notes.map(n => n.getChildNoteCluster()).flat();
        this.isChron = true;
        this._fullResults = notes;
        this._notes = notes; // TODO: truncate
    }
    public forceAdd(note: Note): boolean {
        if (this.notes.includes(note)) return false; // already added
        if (this.isChron) {
            if (note.isChild) {
                let parentIdx = this.notes.findIndex(n => n === note.parent);
                if (parentIdx >= 0) {
                    let nextIdx = this.notes.findIndex((n, i) => i > parentIdx && n.parent !== note.parent);
                    if (nextIdx >= 0)
                        this.notes.splice(nextIdx, 0, note);
                }
            }
        }
        // fallback for a bunch of cases is to just add to the end
        if (!this.notes.includes(note)) {
            this._notes.push(note);
        }
        return true;
    }
}

export enum eView {
    None, All, Unsorted, Folder, Tag, Settings
};

export enum eSettingsPage {
    None, Main
};

export namespace View {
    let _data: ViewData = new ViewData(eView.None);

    export function CurrView(): ViewData { return _data; }

    function reset(type: eView) {
        _data = new ViewData(type);
    }

    function finalize() {
        Flow.Dirty();
    }

    export function ForceAdd(note: Note) {
        if (_data.forceAdd(note))
            Flow.Dirty();
    }

    export function Unsorted() {
        reset(eView.Unsorted);
        let list = DB.AllParents().filter(n => !n.folderId);
        _data.setChronResults(list);
        _data.title = "Unsorted";
        finalize();
    }

    export function ShowAll() {
        reset(eView.All);
        _data.setChronResults(DB.AllParents());
        _data.title = "All";
        finalize();
    }

    export function Folder(folder: Folder) {
        reset(eView.Folder);
        let list = DB.AllParents().filter(n => n.folderId === folder.id);
        _data.setChronResults(list);
        _data.folder = folder;
        _data.title = "Folder";
        finalize();
    }

    export function Settings(page: eSettingsPage) {
        reset(eView.Settings);
        _data.settings = page;
        _data.title = "Settings";
        finalize();
    }
}