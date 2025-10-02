import { Nil } from "@shared/util";
import { DB } from "./DB";
import { Note } from "./note";


// in-memory interface
export class Folder {
    public _data: FolderData;
    public _needsDbSave: boolean = false;
    public _needsServerSave: boolean = false; // TODO: this should probably be saved to the db, or reconsidered
    public constructor(meta: FolderData) {
        this._data = meta;
    }

    public FlagDirty(): void {
        this._needsDbSave = true;
        this._needsServerSave = true;
        this._data.lastEdit = new Date().toUTCString();
        DB.SaveFolder(this);
    }

    public get title() { return this._data.title; }
    public set title(value: string) {
        if (this._data.title === value) return;
        this._data.title = value;
        this.FlagDirty();
    }

    public get id(): string { return this._data.id; }

    public get summary(): string | Nil { return this._data.summary; }
    public set summary(value: string | Nil) {
        if (value) this._data.summary = value;
        else delete this._data.summary;
        this.FlagDirty();
    }

    public get vocab(): string | Nil { return this._data.vocab; }
    public set vocab(value: string | Nil) {
        if (value) this._data.vocab = value;
        else delete this._data.vocab;
        this.FlagDirty();
    }

    public get childrenIds(): string[] { return [...this._data.children]; }
    public get children(): Note[] {
        return this.childrenIds
            .map(i => DB.GetNoteById(i))
            .filter(n => !!n);
    }
    public addNote(note: Note) {
        this._data.children.push(note.id);
        this.FlagDirty();
    }
    public insertNote(child: Note, before?: Note) {
        let idx = before ? this._data.children.indexOf(before.id) : -1;
        if (idx < 0)
            this._data.children.push(child.id);
        else
            this._data.children.splice(idx, 0, child.id);
        this.FlagDirty();
    }
    public insertNoteAfter(child: Note, after?: Note) {
        let idx = after ? this._data.children.indexOf(after.id) : -1;
        if (idx < 0)
            this._data.children.splice(0, 0, child.id);
        else
            this._data.children.splice(idx + 1, 0, child.id);
        this.FlagDirty();
    }
    public insertRelative(child: Note, relative: Note, under: boolean) {
        if (under) this.insertNoteAfter(child, relative);
        else this.insertNote(child, relative);
    }
    public removeNote(note: Note) {
        this._data.children = this._data.children.filter(i => i != note.id);
        this.FlagDirty();
    }
}

//what is saved to settings file and db
export interface FolderData {
    v: number;
    id: string;
    title: string;
    deleted?: boolean;
    creationUtc: string;
    lastEdit?: string;
    summary?: string;
    vocab?: string;
    children: string[];
}