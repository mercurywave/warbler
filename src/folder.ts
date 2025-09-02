import { DB } from "./DB";


// in-memory interface
export class Folder {
    public _data: FolderData;
    public _needsDbSave: boolean = false;
    public constructor(meta: FolderData) {
        this._data = meta;
    }

    public FlagDirty(): void{
        this._needsDbSave = true;
        DB.SaveFolder(this);
    }

    public get title() { return this._data.title; }
    public set title(value: string) {
        if(this._data.title === value) return;
        this._data.title = value;
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
    editsUtc: string[];
}