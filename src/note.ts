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

    public FlagDirty(): void {
        this._needsDbSave = true;
        DB.SaveNote(this);
    }

    public get text() { return this.data.text; }
    public set text(value: string) {
        if (this.data.text === value) return;
        this.data.text = value;
        this.FlagDirty();
    }

    private get data(): NoteData { return this._meta.data }
    public get id(): string { return this.data.id; }

    public get folderId(): string | Nil { return this.data.folderId; }
    public set folderId(value: string | Nil) {
        if (value === "") value = undefined;
        this.data.folderId = value ?? undefined;
        this.FlagDirty();
    }
    public get folder(): Folder | Nil {
        let id = this.folderId;
        return DB.AllFolders().find(f => f.id === id);
    }
    public get creationUtc(): Date { return new Date(this.data.creationUtc); }

    public get childrenIds(): string[] { return this.data.childrenIds; }
    public get children(): Note[] {
        return this.childrenIds.map(i => DB.GetNoteById(i)).filter(n => !!n);
    }
    public get isChild(): boolean { return !!DB.TryGetParent(this); }
    public get parent(): Note | Nil { return DB.TryGetParent(this); }
    public getChildNoteCluster(): Note[] { // return this, plus children in an array
        if (this.childrenIds.length > 0)
            return [this, ...this.children];
        return [this];
    }
    public addChild(child: Note) {
        this.data.childrenIds.push(child.id);
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