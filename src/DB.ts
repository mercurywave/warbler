import { Note, NoteData, NoteMeta } from "./note";
import { Deferred } from "./util";

export namespace DB {
    let _db: IDBDatabase;
    let _cache: Note[] = [];

    export async function Init(): Promise<void> {
        let future = new Deferred();
        let request = indexedDB.open("warbler-cache", 1);

        request.onupgradeneeded = (ev) => {
            let db = request.result;
            let store = db.createObjectStore("notes", { keyPath: "id" });
        };

        request.onsuccess = () => {
            _db = request.result;
            future.resolve();
        };

        request.onerror = (ev) => {
            future.reject(`Error creating database: ${ev}`);
        };
        await future;

        await LoadNotes();
    }

    async function LoadNotes(): Promise<void> {
        let future = new Deferred<NoteMeta[]>();
        let trans = _db.transaction("notes", "readonly");
        let store = trans.objectStore("notes");
        let request = store.getAll();
        request.onsuccess = (_) => {
            future.resolve(request.result);
        };
        request.onerror = (e) => { future.reject(`Error loading all notes: ${e}`) }
        let metas = await future;
        _cache = [];
        for (const m of metas) {
            let note = new Note(m);
            _cache.push(note);
        }
    }

    export function CreateNote(): Note {
        let now = new Date().toUTCString();
        let id = crypto.randomUUID();
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
        _cache.push(note);
        return note;
    }

    export async function SaveNote(note: Note): Promise<void> {
        let future = new Deferred();
        let trans = _db.transaction(["notes"], "readwrite");
        let store = trans.objectStore("notes");
        let request = store.put(note._meta);
        note._needsDbSave = false;
        note._meta.needsFileSave = true;
        request.onerror = (e) => { future.reject(`Error adding note: ${e}`); };
        request.onsuccess = () => { future.resolve(); };
        await future;
    }

    export function AllNotes(): Note[] { return _cache; }
}