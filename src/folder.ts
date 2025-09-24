import { Nil } from "@shared/util";
import { DB } from "./DB";


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
        if(value) this._data.summary = value;
        else delete this._data.summary;
        this.FlagDirty();
    }

    public get vocab(): string | Nil { return this._data.vocab; }
    public set vocab(value: string | Nil) { 
        if(value) this._data.vocab = value;
        else delete this._data.vocab;
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
}