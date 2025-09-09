import { DB } from "./DB";
import { Flow } from "./flow";
import { Folder } from "./folder";
import { Nil, util } from "./util";

// in-memory interface
export class Note {
    public _meta: NoteMeta;
    public _needsDbSave: boolean = false;
    public _pendingAudio: PendingRecording[] = [];
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

    public StartNewRecording(): PendingRecording {
        let pend = new PendingRecording(this);
        this._pendingAudio.push(pend);
        return pend;
    }
    public _syncRecordings() {
        if (this._pendingAudio.find(p => p._isCancelled)) {
            this._pendingAudio = this._pendingAudio.filter(p => p._isCancelled);
            Flow.Dirty();
        }
        if (this._pendingAudio.every(p => p.isDone)) {
            for (const pend of this._pendingAudio) {
                if (pend._processedText != "")
                    this.text = util.appendPiece(this.text, '\n', pend._processedText);
            }
            Flow.Dirty();
        }
    }
}

export class PendingRecording {
    private _note: Note;
    public _processedText: string = "";
    public isDone: boolean = false;
    public _isCancelled: boolean = false;
    public _failed: boolean = false;
    public constructor(note: Note) {
        this._note = note;
    }
    public Complete(textToAdd: string) {
        this._processedText = textToAdd;
        this.isDone = true;
        this._note._syncRecordings();
    }
    public Cancel() {
        this._isCancelled = true;
        this._note._syncRecordings();
    }
    public Fail() {
        this._failed = true;
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