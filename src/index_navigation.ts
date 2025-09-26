import { DB } from "./DB";
import { Flow, Route } from "./flow";
import { Folder } from "./folder";
import { mkSettingsLauncher } from "./index_settings";
import { eSettingsPage, View } from "./view";



export function mkNavigation(flow: Flow) {
    flow.root("div", { id: "navigation" });
    flow.bindCtl(mkSearch);
    let btAll = flow.child<HTMLButtonElement>("button", {
        type: "button",
        innerText: "All",
        className: "btNavigate",
    });
    btAll.addEventListener("click", () => {
        Route.LaunchHome();
    });

    let btConflicted = flow.child<HTMLButtonElement>("button", {
        type: "button",
        className: "btNavigate btConflicts",
    });
    flow.bind(() => {
        let cnt = DB.ConflictedNotes().length;
        btConflicted.innerText = 'Conflicted' + (cnt > 0 ? ` (${cnt})` : '');
    });
    btConflicted.addEventListener("click", () => {
        Route.Launch("conflicted");
    });
    flow.conditionalStyle(btConflicted, "noDisp", () => DB.ConflictedNotes().length == 0);

    let btUnsorted = flow.child<HTMLButtonElement>("button", {
        type: "button",
        className: "btNavigate",
    });
    flow.bind(() => {
        let cnt = DB.Unsorted().length;
        btUnsorted.innerText = 'Unsorted' + (cnt > 0 ? ` (${cnt})` : '');
    });
    btUnsorted.addEventListener("click", () => {
        Route.Launch("unsorted");
    });
    flow.conditionalStyle(btUnsorted, "noDisp", () => DB.Unsorted().length == 0);

    let btRecycling = flow.child<HTMLButtonElement>("button", {
        type: "button",
        innerText: "Recycle Bin",
        className: "btNavigate",
    });
    btRecycling.addEventListener("click", () => {
        Route.Launch("recycle");
    });
    flow.conditionalStyle(btRecycling, "noDisp", () => DB.DeletedNotes().length == 0);

    flow.bindCtl(mkFolderList);
    mkSettingsLauncher(flow);
}


function mkSearch(flow: Flow) {
    let div = flow.root("div", { id: "search" });
    let txtField = flow.child<HTMLInputElement>("input", {
        type: "text",
        id: "search-input",
        placeholder: "Search ...", // the space currently tricks edge into NOT disrespecting autocomplete
        autocomplete: "off",
        ariaHidden: "true",
    });
    txtField.addEventListener("keypress", e => {
        if (e.key == 'Enter') {
            if (txtField.value.trim() != "")
                Route.Launch("search", { input: txtField.value.trim() });
        }
    });
    let dropDown = flow.child<HTMLSelectElement>("select", {
        id: "search-list",
        size: 8,
    });
    flow.conditionalStyle(dropDown, "noDisp", () => {
        return !div.contains(document.activeElement) // is focus in here somewhere
            || dropDown.childElementCount < 1;
    });
}

function mkFolderList(flow: Flow) {
    flow.root("div", { id: "folders" });
    let header = flow.child("div");
    flow.elem(header, "span", { innerText: "Folders" });
    let btAddFolder = flow.elem<HTMLButtonElement>(header, "button", {
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
    let list = flow.child("div");
    flow.bindArray(() => DB.AllFolders(), mkFolder, list);
}

function mkFolder(flow: Flow, folder: Folder) {
    let input = flow.root<HTMLButtonElement>("button", {
        className: "folder",
    });
    flow.bind(() => {
        input.innerText = folder.title;
    });
    input.addEventListener("click", () => {
        if (View.CurrView().folder !== folder) {
            Route.Launch("folder", { id: folder.id });
        }
    });
}