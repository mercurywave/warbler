import { DB } from "./DB";
import { Flow, Route } from "./flow";
import { Folder } from "./folder";
import { mkSettings } from "./index_settings";
import { Note } from "./note";
import { util } from "./util";
import { eView, View, ViewData } from "./view";


export function mkMain(route: Route, view: ViewData) {
    route.root("div", { className: "mainInner" });
    route.bindCtl(mkViewHeader);
    let viewContainer = route.child("div", { className: "viewContainer" });
    route.bindObject(() => View.CurrView(), mkMainPane, viewContainer);
    route.child("div", { className: "scrollPad" })
}

function mkViewHeader(route: Route) {
    route.root("span", { className: "viewHeader" });
    let prefix = route.child("span", { className: "prefix" });
    route.bind(() => { prefix.innerText = View.CurrView().title; });
    let edit = route.child("span");
    route.conditional(edit, () => !!View.CurrView().folder, mkEditFolderName);
}

function mkEditFolderName(route: Route) {
    let folder = View.CurrView().folder;
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

function mkMainPane(route: Route, view: ViewData) {
    route.root("div", { id: "notesMain" });
    if (view.type === eView.Settings) {
        mkSettings(route, view.settings);
    }
    else {
        let bind = route.bindArray(() => view.currView, mkNoteControl);
        bind.setAnimRemoval(200, "fade-out");
    }
}

function mkNoteControl(route: Route, note: Note) {
    let root = route.root("div", { className: "bubble" });
    route.conditionalStyle(root, "childNote", () => note.isChild);

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
    mkNoteFooter(route, footer, note);
}

function mkNoteFooter(route: Route, span: HTMLElement, note: Note) {
    let btAdd = route.elem<HTMLButtonElement>(span, "button", {
        type: "button",
        innerText: "+ Sub Note",
        className: "btAddSubNote",
    });
    btAdd.addEventListener("click", () => {
        if (note.isChild) return;
        let child = DB.CreateNote();
        note.addChild(child);
        View.ForceAdd(child);
    });
    route.conditionalStyle(btAdd, "noDisp", () => note.isChild);
    mkNoteFolderPicker(route, span, note);

    route.elem(span, "span", {
        className: "noteCreation",
        innerText: `created ${util.getRelativeTime(note.creationUtc)}`,
        title: `created ${note.creationUtc}`,
    });
}

function mkNoteFolderPicker(route: Route, span: HTMLElement, note: Note) {
    route.conditionalStyle(span, "noDisp", () => note.isChild || DB.AllFolders().length < 1);
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

function mkFolderOption(route: Route, folder: Folder) {
    let opt = route.root<HTMLOptionElement>("option");
    route.bind(() => {
        opt.text = folder.title;
    });
    opt.value = folder.id;
    return opt;
}