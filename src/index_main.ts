import { DB } from "./DB";
import { Flow, Route } from "./flow";
import { Rest } from "@shared/util";
import { View, ViewData } from "./view";
import { scalableTextarea, simpleCollapsableSection } from "./common";
import { Config } from "./settings";
import { Search } from "./search";
import { mkNoteWrapper } from "./index_note";


export function mkMain(flow: Flow, view: ViewData) {
    flow.root("div", { className: "mainInner" });

    let header = flow.bindCtl(mkViewHeader);
    let folderOptions = flow.child("div");
    flow.placeholder(f => mkFolderHeader(f, view), folderOptions, () => !!view.folder);

    let viewContainer = flow.child("div", { className: "viewContainer" });

    // this snapshots the route at time of construction, because we manage this via views at parent level
    flow.routePage(viewContainer, Route.GetUniqPage());

    let pad = flow.child("div", { className: "scrollPad" });
    flow.bindMail('Route.Launch', null, () => {
        let elem = view.focusOnBottom ? pad : header;
        requestAnimationFrame(() => elem.scrollIntoView());
        elem.scrollIntoView();
    });
}

function mkViewHeader(flow: Flow) {
    flow.root("span", { className: "viewHeader" });
    let prefix = flow.child("span", { className: "prefix" });
    flow.bind(() => { prefix.innerText = View.CurrView().title; });
    let edit = flow.child("span");
    flow.conditional(edit, () => !!View.CurrView().folder, mkEditFolderName);
}

function mkFolderHeader(flow: Flow, view: ViewData) {
    let folder = view.folder;
    if (!folder) return;
    let [container, header, body] = simpleCollapsableSection(flow, "Summary");
    header.classList.add('folderSumaryHead');
    body.classList.add('folderSumary');

    let summaryHead = flow.elem(body, "div", { className: "lblSumHead" });
    flow.elem(summaryHead, "span", { innerText: 'Summary' });
    scalableTextarea(flow, () => folder.summary ?? '', (s) => folder.summary = s, body);

    let vocabHead = flow.elem(body, "div", { className: "lblSumHead" });
    flow.elem(vocabHead, "span", { innerText: 'Transcription Vocabulary' });
    let btGenVocab = flow.elem<HTMLButtonElement>(vocabHead, "button", {
        type: "button",
        innerText: "Auto-Extract",
        className: "btExtract",
    });
    flow.conditionalStyle(btGenVocab, "noDisp", () => !Config.backendHandlesSummary());
    btGenVocab.addEventListener("click", async () => {
        let response = await Rest.postLong(Config.getBackendUrl()!, "v1/folderVocab", {
            id: folder.id,
        });
        if (response.success) {
            folder.vocab = response.response as string ?? '';
        }
    });
    scalableTextarea(flow, () => folder.vocab ?? '', (s) => folder.vocab = s, body);
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
    let bind = flow.bindArray(() => view.notes, mkNoteWrapper);
    bind.setAnimRemoval(200, "fade-out");
}

async function preLoadNotes(): Promise<void> {
    await DB.ReloadIfChangedExternally();
}

async function preLoadSearch(path: { [key: string]: string }): Promise<void> {
    let { input } = path;
    let notes = await Search.SearchNotes(input);
    View.Search(notes, input);
}

Route.Register("all", (flow) => {
    rendNotesList(flow);
}, () => View.ShowAll(), preLoadNotes, true);

Route.Register("conflicted", (flow) => {
    rendNotesList(flow);
}, () => View.Conflicted(), preLoadNotes);

Route.Register("unsorted", (flow) => {
    rendNotesList(flow);
}, () => View.Unsorted(), preLoadNotes);

Route.Register("recycle", (flow) => {
    rendNotesList(flow);
}, () => View.Deleted(), preLoadNotes);

Route.Register("folder", (flow, pars) => {
    rendNotesList(flow);
}, pars => {
    let folder = DB.GetFolderById(pars["id"]);
    if (!folder) Route.ErrorFallback();
    else {
        View.Folder(folder);
    }
}, preLoadNotes);

Route.Register("note", (flow, pars) => {
    rendNotesList(flow);
}, pars => {
    let note = DB.GetNoteById(pars['id']);
    if (!note) Route.ErrorFallback();
    else View.SingleNote(note);
});

Route.Register("search", (flow, pars) => {
    rendNotesList(flow);
}, pars => { }, preLoadSearch)
