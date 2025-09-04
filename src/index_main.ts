import { DB } from "./DB";
import { Flow, Route } from "./flow";
import { Folder } from "./folder";
import { Note } from "./note";
import { util } from "./util";
import { View } from "./view";


export function mkMain(route: Route, view: string) {
    route.root("div", { className: "mainInner" });
    route.bindCtl(mkViewHeader);
    route.bindCtl(mkNoteList);
    route.child("div", {className: "scrollPad"})
}

function mkViewHeader(route: Route) {
    route.root("span", { className: "viewHeader" });
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
        edit.value = note.text;
        updateSize();
    });
    edit.addEventListener("change", () => {
        note.text = edit.value;
        Flow.Dirty();
    });

    edit.spellcheck = false;
    edit.addEventListener("focus", () => edit.spellcheck = true);
    edit.addEventListener("blur", () => edit.spellcheck = false);

    let footer = route.child("div", { className: "bubbleFooter" });
    mkNoteFolderPicker(route, footer, note);
}

function mkNoteFolderPicker(route: Route, span: HTMLElement, note: Note) {
    route.conditionalStyle(span, "noDisp", () => DB.AllFolders().length < 1);
    route.elem(span, "span", { innerText: "🗀" });
    let dropDown = route.elem<HTMLSelectElement>(span, "select");
    route.bindArray(() => DB.AllFolders(), mkFolderOption, dropDown);
    route.bind(() => {
        dropDown.value = note.folder?.id ?? "";
    });
    dropDown.addEventListener("change", () => {
        note.folderId = dropDown.value;
        Flow.Dirty();
    });
}

function mkFolderOption(route: Route, folder: Folder){
    let opt = route.root<HTMLOptionElement>("option");
    route.bind(() => {
        opt.text = folder.title;
    });
    opt.value = folder.id;
    return opt;
}