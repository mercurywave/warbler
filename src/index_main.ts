import { DB } from "./DB";
import { Flow, Route } from "./flow";
import { Folder } from "./folder";
import { mkSettings } from "./index_settings";
import { Note } from "./note";
import { Speech } from "./speech";
import { util } from "./util";
import { eView, View, ViewData } from "./view";


export function mkMain(flow: Flow, view: ViewData) {
    flow.root("div", { className: "mainInner" });
    flow.bindCtl(mkViewHeader);
    let viewContainer = flow.child("div", { className: "viewContainer" });
    
    // this snapshots the route at time of construction, because we manage this via views at parent level
    flow.routePage(viewContainer, Route.GetUniqPage());

    flow.child("div", { className: "scrollPad" })
}

function mkViewHeader(flow: Flow) {
    flow.root("span", { className: "viewHeader" });
    let prefix = flow.child("span", { className: "prefix" });
    flow.bind(() => { prefix.innerText = View.CurrView().title; });
    let edit = flow.child("span");
    flow.conditional(edit, () => !!View.CurrView().folder, mkEditFolderName);
}

function mkEditFolderName(flow: Flow) {
    let folder = View.CurrView().folder;
    if (!folder) return; // ?
    flow.child("span", { innerText: ":" });
    let input = flow.child<HTMLInputElement>("input", {
        className: "edFolder",
        type: "text",
        placeholder: "Unnamed Folder",
        autocomplete: "off",
    });
    flow.bind(() => {
        input.value = folder.title;
    });
    input.addEventListener("change", () => {
        folder.title = input.value;
        Flow.Dirty();
    });
}

function rendNotesList(flow: Flow) {
    let bind = flow.bindArray(() => View.CurrView().notes, mkNoteControl);
    bind.setAnimRemoval(200, "fade-out");
}

Route.Register("all", (flow) => {
    rendNotesList(flow);
}, () => View.ShowAll(), true);

Route.Register("unsorted", (flow) => {
    rendNotesList(flow);
}, () => View.Unsorted());

Route.Register("folder", (flow, pars) => {
    rendNotesList(flow);
}, pars => {
    let folder = DB.GetFolderById(pars["id"]);
    if (!folder) Route.ErrorFallback();
    else {
        View.Folder(folder);
    }
});


function mkNoteControl(flow: Flow, note: Note) {
    let root = flow.root("div", { className: "bubble" });
    flow.conditionalStyle(root, "childNote", () => note.isChild);

    let wrapper = flow.child("div", { className: "growWrap" });
    let edit = flow.elem<HTMLTextAreaElement>(wrapper, "textarea");
    let updateSize = () => wrapper.dataset.replicatedValue = edit.value;
    edit.addEventListener("input", updateSize);
    flow.bind(() => {
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

    let footer = flow.child("div", { className: "bubbleFooter" });
    mkNoteFooter(flow, footer, note);
}

function mkNoteFooter(flow: Flow, span: HTMLElement, note: Note) {
    Speech.mkRecordButton(flow, span, note);

    let btAdd = flow.elem<HTMLButtonElement>(span, "button", {
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
    mkNoteFolderPicker(flow, span, note);
    flow.conditionalStyle(btAdd, "noDisp", () => note.isChild);

    flow.elem(span, "span", {
        className: "noteCreation",
        innerText: `created ${util.getRelativeTime(note.creationUtc)}`,
        title: `created ${note.creationUtc}`,
    });
}

function mkNoteFolderPicker(flow: Flow, span: HTMLElement, note: Note) {
    let subSpan = flow.elem(span, "span");
    flow.conditionalStyle(subSpan, "noDisp", () => note.isChild);
    flow.elem(subSpan, "span", { innerText: "🗀" });
    let dropDown = flow.elem<HTMLSelectElement>(subSpan, "select");
    flow.bindArray(() => DB.AllFolders(), mkFolderOption, dropDown);
    flow.bind(() => {
        dropDown.value = note.folder?.id ?? "";
    });
    dropDown.addEventListener("change", () => {
        note.folderId = dropDown.value;
        Flow.Dirty();
    });
}

function mkFolderOption(flow: Flow, folder: Folder) {
    let opt = flow.root<HTMLOptionElement>("option");
    flow.bind(() => {
        opt.text = folder.title;
    });
    opt.value = folder.id;
    return opt;
}