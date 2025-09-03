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

    public get more(): number { return this._fullResults.length - this.currView.length; }
    public setResults(notes: Note[]) {
        notes.sort((a,b) => a.creationUtc.getTime() - b.creationUtc.getTime());
        this._fullResults = notes;
        this.currView = notes; // TODO: truncate
    }
}

export namespace View {
    let _data: ViewData = new ViewData();

    export function CurrNotes(): Note[] {
        return _data.currView;
    }

    export function CurrFolder(): Folder | Nil{
        return _data.folder;
    }
    export function CurrTag(): string | Nil{
        return _data.tag;
    }
    export function CurrTitle(): string {
        return _data.title;
    }
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

    export function ForceAdd(note: Note){
        if(!_data.currView.includes(note))
            _data.currView.push(note);
    }

    export function Unsorted() {
        reset();
        let list = DB.AllNotes().filter(n => !n.folderId);
        _data.setResults(list);
        _data.title = "Unsorted";
        finalize();
    }

    export function ShowAll() {
        reset();
        _data.setResults(DB.AllNotes());
        _data.title = "All";
        finalize();
    }

    export function Folder(folder: Folder) {
        reset();
        let list = DB.AllNotes().filter(n => n.folderId === folder.id);
        _data.setResults(list);
        _data.folder = folder;
        _data.title = "Folder";
        finalize();
    }
}