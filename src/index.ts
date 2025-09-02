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
    Flow.Init(main, mkRoot);
}

function mkRoot(route: Route) {
    route.applyProps({ id: "mainWrap" });
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
    route.applyProps({ id: "mainInner" });
    route.bindCtl(mkNoteList);
}

function mkNoteList(route: Route) {
    route.root("div", { id: "notesMain" });
    route.bindArray(() => __mainPane, mkNoteControl);
}

function mkNoteControl(route: Route, note: Note) {
    route.root("div");
    let wrapper = route.child("div", { className: "bubbleWrap" });
    let edit = route.elem<HTMLTextAreaElement>(wrapper, "textarea", { className: "bubble", rows: 1 });
    route.bind(() => edit.value = note.text);
    edit.addEventListener("change", () => {
        note.text = edit.value;
        Flow.Dirty();
    });
}

async function setup(): Promise<void> {
    await DB.Init();
    __mainPane = DB.AllNotes();
    Flow.Dirty();
}