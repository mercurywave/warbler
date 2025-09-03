import { DB } from "./DB";
import { Flow, Route } from "./flow";
import { Folder } from "./folder";
import { Note } from "./note";
import { util } from "./util";
import { View } from "./view";

document.addEventListener("DOMContentLoaded", () => {
    initUi();
    setup();
});

function initUi() {
    let main = document.querySelector("body") as HTMLElement;
    Flow.Init(main, mkRoot);
}

function mkRoot(route: Route) {
    route.bindCtl(mkNavigation);
    let main = route.child("div", { id: "main" });
    let outer = route.elem(main, "div", { id: "mainOuter" });
    let bind = route.bindObject(() => View.UniqHash(), mkMain, outer);
    bind.setAnimRemoval(200, "fade-out-view");
}

function mkNavigation(route: Route) {
    route.root("div", { id: "navigation" });
    route.bindCtl(mkSearch);
    let btAll = route.child<HTMLButtonElement>("button", {
        type: "button",
        innerText: "All",
        className: "btNavigate",
    });
    btAll.addEventListener("click", () => {
        View.ShowAll();
    });
    let btUnsorted = route.child<HTMLButtonElement>("button", {
        type: "button",
        innerText: "Unsorted",
        className: "btNavigate",
    });
    btUnsorted.addEventListener("click", () => {
        View.Unsorted();
    });
    route.bindCtl(mkFolderList);
}

function mkSearch(route: Route) {
    let div = route.root("div", { id: "search" });
    let txtField = route.child<HTMLInputElement>("input", {
        type: "text",
        id: "search-input",
        placeholder: "Search ...", // the space currently tricks edge into NOT disrespecting autocomplete
        autocomplete: "off",
        ariaHidden: "true",
    });
    let dropDown = route.child<HTMLSelectElement>("select", {
        id: "search-list",
        size: 8,
    });
    route.conditionalStyle(dropDown, "noDisp", () => {
        return !div.contains(document.activeElement) // is focus in here somewhere
            || dropDown.childElementCount < 1;
    });
}

function mkFolderList(route: Route) {
    route.root("div", { id: "folders" });
    let header = route.child("div");
    route.elem(header, "span", { innerText: "Folders" });
    let btAddFolder = route.elem<HTMLButtonElement>(header, "button", {
        id: "btAddFolder",
        type: "button",
        innerText: "+",
        className: "btAdd",
    });
    btAddFolder.addEventListener("click", () => {
        let folder = DB.CreateFolder();
        folder.title = "New Folder";
        Flow.Reflow();
    });
    let list = route.child("div");
    route.bindArray(() => DB.AllFolders(), mkFolder, list);
}

function mkFolder(route: Route, folder: Folder) {
    let input = route.root<HTMLButtonElement>("button", {
        className: "folder",
    });
    route.bind(() => {
        input.innerText = folder.title;
    });
    input.addEventListener("click", () => {
        if (View.CurrFolder() !== folder) {
            View.Folder(folder);
        }
    });
}

function mkMain(route: Route, view: string) {
    route.root("div", { className: "mainInner" });
    route.bindCtl(mkViewHeader);
    route.bindCtl(mkNoteList);
    let btAddNote = route.child<HTMLButtonElement>("button", {
        type: "button",
        innerText: "Add Note",
        className: "btPrimary",
    });
    btAddNote.addEventListener("click", () => {
        let note = DB.CreateNote();
        note.text = `new note ${new Date()}`;
        if (View.CurrFolder()) note.folderId = View.CurrFolder()?.id;
        View.ForceAdd(note);
        Flow.Dirty();
    });
}

function mkViewHeader(route: Route) {
    route.root("span", { className: "viewHeader" })
    let prefix = route.child("span", { className: "prefix" });
    route.bind(() => { prefix.innerText = View.CurrTitle(); });
    let edit = route.child("span");
    route.conditional(edit, () => !!View.CurrFolder(), mkEditFolderName);
}

function mkEditFolderName(route: Route) {
    let folder = View.CurrFolder();
    if (!folder) return; // ?
    route.child("span", { innerText: ":" });
    let input = route.child<HTMLInputElement>("input", {
        className: "edFolder",
        type: "text",
        placeholder: "Unnamed Folder",
        autocomplete: "off",
    });
    route.bind(() => {
        input.value = folder.title;
    });
    input.addEventListener("change", () => {
        folder.title = input.value;
        Flow.Dirty();
    });
}

function mkNoteList(route: Route) {
    route.root("div", { id: "notesMain" });
    let bind = route.bindArray(() => View.CurrNotes(), mkNoteControl);
    bind.setAnimRemoval(200, "fade-out");
}

function mkNoteControl(route: Route, note: Note) {
    route.root("div", { className: "bubble" });
    route.child("div", {
        className: "noteCreation",
        innerText: `created ${util.getRelativeTime(note.creationUtc)}`,
        title: `created ${note.creationUtc}`,
    });
    let wrapper = route.child("div", { className: "growWrap" });
    let edit = route.elem<HTMLTextAreaElement>(wrapper, "textarea");
    let updateSize = () => wrapper.dataset.replicatedValue = edit.value;
    edit.addEventListener("input", updateSize);
    route.bind(() => {
        edit.value = note.text
        updateSize();
    });
    edit.addEventListener("change", () => {
        note.text = edit.value;
        Flow.Dirty();
    });
}

async function setup(): Promise<void> {
    await DB.Init();
    View.ShowAll();
    Flow.Dirty();
}