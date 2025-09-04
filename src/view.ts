import { DB } from "./DB";
import { Flow } from "./flow";
import { Folder } from "./folder";
import { Note } from "./note";
import { Nil } from "./util";

class ViewData {
    public currView: Note[] = [];
    private _fullResults: Note[] = [];
    public folder: Folder | Nil = null;
    public tag: string | Nil = null;
    public title: string = "???";
    public isChron: boolean = false; // chronologically ordered

    public get more(): number { return this._fullResults.length - this.currView.length; }

    // will automatically include children notes along side the main note
    public setChronResults(notes: Note[]) {
        notes.sort((a, b) => a.creationUtc.getTime() - b.creationUtc.getTime());
        notes = notes.map(n => n.getChildNoteCluster()).flat();
        this.isChron = true;
        this._fullResults = notes;
        this.currView = notes; // TODO: truncate
    }
    public forceAdd(note: Note): boolean {
        if (this.currView.includes(note)) return false; // already added
        if (this.isChron) {
            if (note.isChild) {
                let parentIdx = this.currView.findIndex(n => n === note.parent);
                if (parentIdx >= 0) {
                    let nextIdx = this.currView.findIndex((n, i) => i > parentIdx && n.parent !== note.parent);
                    if (nextIdx >= 0)
                        this.currView.splice(nextIdx, 0, note);
                }
            }
        }
        // fallback for a bunch of cases is to just add to the end
        if (!this.currView.includes(note)) {
            this.currView.push(note);
        }
        return true;
    }
}

export namespace View {
    let _data: ViewData = new ViewData();

    export function CurrNotes(): Note[] {
        return _data.currView;
    }

    export function CurrFolder(): Folder | Nil {
        return _data.folder;
    }
    export function CurrTag(): string | Nil {
        return _data.tag;
    }
    export function CurrTitle(): string {
        return _data.title;
    }
    export function IsChron(): boolean { return _data.isChron; }
    export function UniqHash(): string {
        // Can bind to this name to know if the user changed
        return `${_data.title}: ${_data.folder?.id} || ${_data.tag}`;
    }

    function reset() {
        _data = new ViewData();
    }

    function finalize() {
        Flow.Dirty();
    }

    export function ForceAdd(note: Note) {
        if (_data.forceAdd(note))
            Flow.Dirty();
    }

    export function Unsorted() {
        reset();
        let list = DB.AllParents().filter(n => !n.folderId);
        _data.setChronResults(list);
        _data.title = "Unsorted";
        finalize();
    }

    export function ShowAll() {
        reset();
        _data.setChronResults(DB.AllParents());
        _data.title = "All";
        finalize();
    }

    export function Folder(folder: Folder) {
        reset();
        let list = DB.AllParents().filter(n => n.folderId === folder.id);
        _data.setChronResults(list);
        _data.folder = folder;
        _data.title = "Folder";
        finalize();
    }
}