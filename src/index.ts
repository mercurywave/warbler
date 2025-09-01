import { Flow, Route } from "./flow";

document.addEventListener("DOMContentLoaded", () => {
    initUi();
    setup();
});

let __notes : string[] = [];


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
        __notes.push(`new note ${new Date()}`);
        Flow.Dirty();
    });
}

function mkMain(route: Route) {
    route.root("div", { id: "mainInner" });
    route.bindCtl(mkNoteList);
}

function mkNoteList(route: Route){
    route.root("div", {id: "notesMain"});
    route.bindArray(__notes, mkNoteControl);
}

function mkNoteControl(route: Route, elem: string){
    route.root("div", {innerText: elem});
}

async function setup() {
    console.log("Hello World");
}