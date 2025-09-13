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

    let pad = flow.child("div", { className: "scrollPad" });
    flow.bindMail('Route.Launch', null, () => {
        requestAnimationFrame(() => pad.scrollIntoView())
        pad.scrollIntoView();
    });
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
    let view = View.CurrView();
    let bind = flow.bindArray(() => view.notes, mkNoteControl);
    bind.setAnimRemoval(200, "fade-out");
}

Route.Register("all", (flow) => {
    rendNotesList(flow);
}, () => View.ShowAll(), true);

Route.Register("unsorted", (flow) => {
    rendNotesList(flow);
}, () => View.Unsorted());

Route.Register("recycle", (flow) => {
    rendNotesList(flow);
}, () => View.Deleted());

Route.Register("folder", (flow, pars) => {
    rendNotesList(flow);
}, pars => {
    let folder = DB.GetFolderById(pars["id"]);
    if (!folder) Route.ErrorFallback();
    else {
        View.Folder(folder);
    }
});

Route.Register("note", (flow, pars) => {
    rendNotesList(flow);
}, pars => {
    let note = DB.GetNoteById(pars['id']);
    if (!note) Route.ErrorFallback();
    else View.SingleNote(note);
});


function mkNoteControl(flow: Flow, note: Note) {
    let root = flow.root("div", { className: "bubble" });
    let view = View.CurrView();
    flow.conditionalStyle(root, "childNote", () => note.isChild && view.groupByParents);
    flow.conditionalStyle(root, "orphanedNote", () => note.isChild && !view.groupByParents);

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

    flow.bindMail('noteFocus', m => m.data === note, () => {
        edit.focus();
    });

    flow.bindMail('noteView', m => m.data === note, () => {
        root.scrollIntoView();
    });

    let recordings = flow.child("div");
    flow.bindArray(() => note._pendingAudio, Speech.mkRecordWidget, recordings);

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

    let linkParent = flow.elem<HTMLAnchorElement>(span, "a", {
        className: "parentLink",
        innerText: "Parent Note",
    });
    let view = View.CurrView();
    flow.conditionalStyle(linkParent, "noDisp", () => !(note.isChild && !view.groupByParents));
    linkParent.addEventListener("click", () => {
        Route.Launch("note", { id: note.parent?.id ?? "" });
    });

    flow.elem(span, "span", { className: "spacer" });

    flow.elem(span, "span", {
        className: "noteCreation",
        innerText: util.getRelativeTime(note.creationUtc),
        title: `created ${note.creationUtc}`,
    });

    let mnuNote = mkMoreMenu(flow, span);
    let mUndelete = mkMoreMenuOpt(flow, mnuNote, "Undelete Note", () => {
        note.isDeleted = false;
    });
    let mHardDelete = mkMoreMenuOpt(flow, mnuNote, "Hard Delete Note", () => {
        DB.HardDeleteNote(note)
            .then(() => {
                View.CurrView().forceRemove(note);
                Flow.Dirty();
            });
    });
    let mDelete = mkMoreMenuOpt(flow, mnuNote, "Delete Note", () => {
        note.isDeleted = true;
    });
    flow.bind(() => {
        mUndelete.hidden = !note.isDeleted;
        mHardDelete.hidden = !note.isDeleted;
        mDelete.hidden = note.isDeleted;
    });
}

function mkMoreMenu(flow: Flow, parent?: HTMLElement): HTMLSelectElement {
    let wrapper = flow.elem(parent, "div", { className: "mnuOptWrap" });
    let mnuDrop = flow.elem<HTMLSelectElement>(wrapper, "select", { className: "mnuDropdown" });
    // this makes a hidden element selected - this is all a dumb hack, but all the options are dumb hacks
    let badOpt = flow.elem<HTMLOptionElement>(mnuDrop, "option", { value: "", disabled: true, selected: true, hidden: true });
    mnuDrop.addEventListener("change", () => setTimeout(() => badOpt.selected = true));
    flow.elem<HTMLButtonElement>(wrapper, "div", {
        innerText: "•••",
        className: "btFakeMenu",
    });
    return mnuDrop;
}

function mkMoreMenuOpt(flow: Flow, select: HTMLSelectElement, lbl: string, onClick: () => void): HTMLOptionElement {
    // note - this dumb hacky dropdown requires every element to have a unique name - can't fully bind options
    lbl = lbl + "\xA0\xA0\xA0\xA0"; // non-breaking spaces help the dumb hack look less janky
    let opt = flow.elem<HTMLOptionElement>(select, "option", {
        className: "mnuOpt",
        textContent: lbl,
        value: lbl
    });
    select.addEventListener("change", e => {
        if (select.value === lbl)
            onClick();
    });
    return opt;
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