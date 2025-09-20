import { DB } from "./DB";
import { Flow } from "./flow";
import { Folder } from "./folder";
import { RecordJob } from "./speech";
import { Nil, util } from "./util";

// in-memory interface
export class Note {
    public _meta: NoteMeta;
    public _needsDbSave: boolean = false;
    public _pendingAudio: PendingTranscription[] = [];
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

    public get data(): NoteData { return this._meta.data }
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

    public StartNewRecording(recording: RecordJob): PendingTranscription {
        let trans = new PendingTranscription(this, recording);
        this._pendingAudio.push(trans);
        Flow.Dirty();
        return trans;
    }
    public _syncRecordings() {
        if (this._pendingAudio.find(p => p.isCancelled)) {
            this._pendingAudio = this._pendingAudio.filter(p => !p.isCancelled);
            Flow.Dirty();
        }
        if (this._pendingAudio.every(p => p.isDone)) {
            for (const pend of this._pendingAudio) {
                if (pend._transcribedText != "")
                    this.text = util.appendPiece(this.text, '\n', pend._transcribedText);
            }
            this._pendingAudio = [];
            Flow.Dirty();
        }
    }

    public get isDeleted(): boolean { return this.data.deleted ?? false; }
    public set isDeleted(value: boolean) {
        this.data.deleted = value ? true : undefined;
        this.FlagDirty();
        Flow.Dirty();
    }
}

export class PendingTranscription {
    private _note: Note;
    public _transcribedText: string = "";
    public isDone: boolean = false;
    private _isCancelled: boolean = false;
    private _failureMsg: string | Nil = null;
    public _recording: RecordJob;

    public constructor(note: Note, recording: RecordJob) {
        this._note = note;
        this._recording = recording;
    }
    public get isCancelled(): boolean { return this._isCancelled; }
    public get hasErrored(): boolean { return !!this._failureMsg; }
    public get errorMsg(): string { return this._failureMsg ?? ""; }
    public Complete(textToAdd: string) {
        this._transcribedText = textToAdd;
        this.isDone = true;
        this._note._syncRecordings();
    }
    public Cancel() {
        this._isCancelled = true;
        this._note._syncRecordings();
    }
    public Fail(reason: string) {
        this._failureMsg = reason;
        Flow.Dirty();
    }
    public Retry() {
        this._failureMsg = null;
        Flow.Dirty();
    }
}

// main interface, stored in indexdb
export interface NoteMeta {
    id: string;
    data: NoteData;
    needsFileSave: boolean;
    lastSyncText: string;
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
}