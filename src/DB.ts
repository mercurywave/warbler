import { Folder, FolderData } from "./folder";
import { Note, NoteData, NoteMeta } from "./note";
import { Deferred, Nil, util } from "./util";

export namespace DB {
    let _db: IDBDatabase;
    let _notes: Note[] = [];
    let _folders: Folder[] = [];

    export async function Init(): Promise<void> {
        let future = new Deferred();
        let request = indexedDB.open("warbler-cache", 1);

        request.onupgradeneeded = (ev) => {
            let db = request.result;
            let noteStore = db.createObjectStore("notes", { keyPath: "id" });
            let folderStore = db.createObjectStore("folders", { keyPath: "id" });
        };

        request.onsuccess = () => {
            _db = request.result;
            future.resolve();
        };

        request.onerror = (ev) => {
            future.reject(`Error creating database: ${ev}`);
        };
        await future;

        await LoadFolders();
        await LoadNotes();
    }

    async function LoadFolders(): Promise<void> {
        let metas = await loadHelper<FolderData>("folders");
        _folders = [];
        for (const m of metas) {
            let folder = new Folder(m);
            _folders.push(folder);
        }
    }
    async function LoadNotes(): Promise<void> {
        let metas = await loadHelper<NoteMeta>("notes");
        _notes = [];
        for (const m of metas) {
            let note = new Note(m);
            _notes.push(note);
        }
        for (const note of _notes) {
            // relationship is stored on the parent before the child is stored
            // this just quietly papers over that, though may cause a headach someday
            note._meta.data.childrenIds = note._meta.data.childrenIds.filter(c => !!GetNoteById(c));
        }
    }

    export async function ReloadIfChangedExternally() {
        if(!__needsUpdate) return;
        await LoadFolders();
        await LoadNotes();
    }

    async function loadHelper<T>(db: string): Promise<T[]> {
        let future = new Deferred<T[]>();
        let trans = _db.transaction(db, "readonly");
        let store = trans.objectStore(db);
        let request = store.getAll();
        request.onsuccess = (_) => {
            future.resolve(request.result);
        };
        request.onerror = (e) => { future.reject(`Error loading all ${db}: ${e}`) }
        return await future;
    }

    export function CreateNote(folder?: Folder | Nil): Note {
        let now = new Date().toUTCString();
        let id = util.UUID();
        let inner: NoteData = {
            childrenIds: [],
            creationUtc: now,
            editsUtc: [],
            id: id,
            tags: [],
            text: "",
            v: 1,
        };
        let meta: NoteMeta = {
            data: inner,
            fileName: now,
            id: id,
            needsFileSave: false,
        }
        let note = new Note(meta);
        if(folder) note.data.folderId = folder.id;
        _notes.push(note);
        return note;
    }

    export function CreateFolder(): Folder {
        let now = new Date().toUTCString();
        let id = util.UUID();
        let inner: FolderData = {
            id: id,
            title: "",
            v: 1,
            creationUtc: now,
            editsUtc: [],
        };
        let folder = new Folder(inner);
        _folders.push(folder);
        return folder;
    }

    export async function SaveNote(note: Note): Promise<void> {
        await saveHelper("notes", note._meta);
        note._needsDbSave = false;
        note._meta.needsFileSave = true;
    }

    export async function SaveFolder(folder: Folder): Promise<void> {
        await saveHelper("folders", folder._data);
        folder._needsDbSave = false;
    }

    async function saveHelper<T>(db: string, meta: T): Promise<void> {
        let future = new Deferred();
        let trans = _db.transaction([db], "readwrite");
        let store = trans.objectStore(db);
        let request = store.put(meta);
        request.onerror = (e) => { future.reject(`Error adding to ${db}: ${e}`); };
        request.onsuccess = () => { future.resolve(); };
        await future;
        _setDbDirty();
    }

    export function AllNotes(): Note[] { return _notes.filter(n => !n.isDeleted); }
    export function AllParents(): Note[] { return AllNotes().filter(n => !n.isChild); }
    export function Unsorted(): Note[] { return AllParents().filter(n => !n.folder); }
    export function DeletedNotes(): Note[] { return _notes.filter(n => n.isDeleted); }

    export function AllFolders(): Folder[] { return _folders; }

    export function TryGetParent(note: Note): Note | Nil {
        return _notes.find(n => n.childrenIds.includes(note.id));
    }
    export function GetNoteById(id: string): Note | Nil {
        return _notes.find(n => n.id === id);
    }
    export function GetFolderById(id: string): Folder | Nil {
        return _folders.find(n => n.id === id);
    }

    export async function HardDeleteNote(note: Note): Promise<void> {
        await _hardDelete('notes', note.id);
        _notes = _notes.filter(n => n !== note);
    }
    export async function HardDeleteFolder(folder: Folder): Promise<void> {
        await _hardDelete('folders', folder.id);
        _folders = _folders.filter(f => f !== folder);
    }
    async function _hardDelete<T>(db: string, id: string): Promise<void> {
        let future = new Deferred();
        let trans = _db.transaction([db], "readwrite");
        let store = trans.objectStore(db);
        let request = store.delete(id);
        request.onerror = (e) => { future.reject(`Error deleting ${id} from ${db}: ${e}`); };
        request.onsuccess = () => { future.resolve(); };
        await future;
        _setDbDirty();
    }

    
}

const UPDATE_KEY = "warbler-update-key";
let __updateKey = localStorage.getItem(UPDATE_KEY);
let __needsUpdate = false;
window.addEventListener('storage', () => {
    let newKey = localStorage.getItem(UPDATE_KEY);
    if(newKey !== __updateKey)
    {
        __updateKey = newKey;
        __needsUpdate = true;
    }
});
function _setDbDirty(){
    __updateKey = util.UUID();
    localStorage.setItem(UPDATE_KEY, __updateKey);
}