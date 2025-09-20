import { dir } from "console";
import { Folder, FolderData } from "./folder";
import { Note, NoteData, NoteMeta } from "./note";
import { Config } from "./settings";
import { Deferred, Nil, Rest, util } from "./util";
import { Flow } from "./flow";
import ur from "zod/v4/locales/ur.js";

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

        if(Config.isOnline()){
            await ServerSync();
        } else {
            await LoadFolders();
            await LoadNotes();
        }
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
            // this just quietly papers over that, though may cause a headache someday
            note._meta.data.childrenIds = note._meta.data.childrenIds.filter(c => !!GetNoteById(c));
        }
    }

    export async function ReloadIfChangedExternally() {
        if (!__needsUpdate) return;
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
            id: id,
            needsFileSave: false,
        }
        let note = new Note(meta);
        if (folder) note.data.folderId = folder.id;
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
        setTimeout(ServerSaveNotes, 100);
    }

    type ISyncResponse<T> = [T, string[]];
    let __synchingNotes: Deferred<void> | Nil = null;
    async function ServerSaveNotes() {
        await __synchingNotes;
        let dirty = GetNotesToServerSave();
        if (!dirty || !dirty.length || !Config.isOnline()) return;
        __synchingNotes = new Deferred();
        let toSync = dirty.map(n => n.data);

        try {
            let url = Config.getBackendUrl();
            if (url) {
                let result = await Rest.post(url, "v1/updateNotes", toSync);
                if (result.success) {
                    for (const response of result.response as ISyncResponse<NoteData>[]) {
                        let note = DB.GetNoteById(response[0].id);
                        if (note) {
                            note._meta.data = response[0];
                            note._meta.needsFileSave = false;
                            await saveHelper("notes", note._meta);
                        }
                    }
                    Flow.Dirty();
                }
            }
        } catch (e) { console.error(e); }
        __synchingNotes.resolve();
        __synchingNotes = null;
    }

    export async function SaveFolder(folder: Folder): Promise<void> {
        await saveHelper("folders", folder._data);
        folder._needsDbSave = false;
        setTimeout(ServerSaveFolders, 100);
    }
    let __synchingFolders: Deferred<void> | Nil = null;
    async function ServerSaveFolders() {
        let dirty = AllFolders().filter(f => f._needsServerSave);
        if (__synchingFolders || !dirty.length || !Config.isOnline()) return;
        __synchingFolders = new Deferred();
        let toSync = dirty.map(f => f._data);

        try {
            let url = Config.getBackendUrl();
            if (url) {
                let result = await Rest.post(url, "v1/updateFolders", toSync);
                if (result.success) {
                    for (const response of result.response as ISyncResponse<FolderData>[]) {
                        let folder = DB.GetFolderById(response[0].id);
                        if (folder) {
                            folder._data = response[0];
                            folder._needsServerSave = false;
                            await saveHelper("folders", folder._data);
                        }
                    }
                    Flow.Dirty();
                }
            }
        } catch (e) { console.error(e); }
        __synchingFolders.resolve();
        __synchingFolders = null;
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

    export async function ServerSync(): Promise<void> {
        if (!Config.isOnline()) return;
        await ServerSaveFolders();
        await ServerSaveNotes();

        let str = window.localStorage.getItem("warbler-cache");
        let num = Date.parse(str as string ?? "");
        let since = new Date(isNaN(num) ? 0 : num);
        let future = new Date(new Date().getTime() - 30 * 60 * 1000);
        await PullServerToDbFolders();
        await PullServerToDbNotes(since);
        window.localStorage.setItem("warbler-cache", future.toUTCString());
    }

    async function PullServerToDbNotes(since: Date) {
        let url = Config.getBackendUrl();
        if (!url || !Config.isOnline()) return;

        let ids = await pullServerNoteIds(since);

        let result = await Rest.post(url, "v1/loadNotes", ids);
        if (result.success) {
            let futures: Promise<void>[] = [];
            for (const response of result.response as NoteData[]) {
                let note = DB.GetNoteById(response.id);
                if (note) {
                    note._meta.data = response;
                    note._meta.needsFileSave = false;
                } else {
                    note = new Note({
                        data: response,
                        id: response.id,
                        needsFileSave: false,
                    });
                }
                futures.push(saveHelper("notes", note._meta));
            }
            await Promise.all(futures);
            await LoadNotes();
        }
    }
    async function pullServerNoteIds(since: Date): Promise<string[]> {
        let url = Config.getBackendUrl();
        if (!url || !Config.isOnline()) return [];
        let result = await Rest.get(url, "v1/recentNoteEdits", { since: since.toUTCString() });
        if (result.success) {
            return result.response as string[];
        }
        return [];
    }

    async function PullServerToDbFolders() {
        let url = Config.getBackendUrl();
        if (!url || !Config.isOnline()) return;
        let result = await Rest.get(url, "v1/getFolders");
        if (result.success) {
            for (const response of result.response as FolderData[]) {
                let folder = DB.GetFolderById(response.id);
                if (folder) {
                    folder._data = response;
                    folder._needsServerSave = false;
                } else {
                    folder = new Folder(response);
                }
                await saveHelper("folders", folder._data);
            }
            LoadFolders();
        }
    }

    export function AnyNotesToServerSave(): boolean { return GetNotesToServerSave().length > 0; }
    export function GetNotesToServerSave(): Note[] { return _notes.filter(n => n._meta.needsFileSave); }

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
    if (newKey !== __updateKey) {
        __updateKey = newKey;
        __needsUpdate = true;
    }
});
function _setDbDirty() {
    __updateKey = util.UUID();
    localStorage.setItem(UPDATE_KEY, __updateKey);
}