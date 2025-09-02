import { DB } from "./DB";
import { Folder } from "./folder";
import { Nil } from "./util";

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

    public get text() { return this.data.text; }
    public set text(value: string) {
        if(this.data.text === value) return;
        this.data.text = value;
        this.FlagDirty();
    }

    private get data():NoteData { return this._meta.data }

    public get folderId():string | Nil { return this.data.folderId; }
    public set folderId(value:string | Nil) {
        this.data.folderId = value ?? undefined;
        this.FlagDirty();
    }
    public get folder():Folder | Nil {
        let id = this.folderId;
        return DB.AllFolders().find(f => f.id === id);
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