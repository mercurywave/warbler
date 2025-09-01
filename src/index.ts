import { DB } from "./DB";
import { Flow, Route } from "./flow";
import { Note } from "./note";

document.addEventListener("DOMContentLoaded", () => {
    initUi();
    setup();
});

let __mainPane: Note[] = [];

function initUi() {
    let main = document.querySelector("body") as HTMLElement;
    let elem = Flow.Init(mkRoot);
    main.replaceChildren(elem);
}

function mkRoot(route: Route) {
    route.root("div", { id: "mainWrap" });
    route.bindCtl(mkNavigation);
    let main = route.child("main");
    route.bindCtl(mkMain, main);
}

function mkNavigation(route: Route) {
    route.root("div", { id: "navigation" });
    let btAddNote = route.child<HTMLButtonElement>("button", {
        type: "button",
        innerText: "Add Note",
    });
    btAddNote.addEventListener("click", () => {
        let note = DB.CreateNote();
        note.text = `new note ${new Date()}`;
        __mainPane = DB.AllNotes();
        Flow.Dirty();
    });
}

function mkMain(route: Route) {
    route.root("div", { id: "mainInner" });
    route.bindCtl(mkNoteList);
}

function mkNoteList(route: Route){
    route.root("div", {id: "notesMain"});
    route.bindArray(() =>__mainPane, mkNoteControl);
}

function mkNoteControl(route: Route, note: Note){
    route.root("div", {innerText: note.text});
}

async function setup(): Promise<void> {
    await DB.Init();
    __mainPane = DB.AllNotes();
    Flow.Dirty();
}