import { DB } from "./DB";

// in-memory interface
export class Note {
    public _meta: NoteMeta;
    public _needsDbSave: boolean = false;
    public constructor(meta: NoteMeta) {
        this._meta = meta;
    }

    public FlagDirty(): void{
        this._needsDbSave = true;
        DB.SaveNote(this);
    }

    public get text() { return this._meta.data.text; }
    public set text(value: string) {
        if(this._meta.data.text === value) return;
        this._meta.data.text = value;
        this.FlagDirty();
    }

}

// main interface, stored in indexdb
export interface NoteMeta {
    id: string;
    fileName: string;
    data: NoteData;
    needsFileSave: boolean;
}

//what is saved to files
export interface NoteData {
    v: number;
    id: string;
    //title: string;
    text: string;
    folderId?: string;
    tags: string[];
    childrenIds: string[];
    deleted?: boolean;
    creationUtc: string;
    editsUtc: string[];
}