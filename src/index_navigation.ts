import { DB } from "./DB";
import { Flow } from "./flow";
import { Folder } from "./folder";
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
        View.ShowAll();
    });
    let btUnsorted = flow.child<HTMLButtonElement>("button", {
        type: "button",
        className: "btNavigate",
    });
    flow.bind(() => {
        let cnt = DB.AllNotes().filter(n => !n.folder).length;
        btUnsorted.innerText = 'Unsorted' + (cnt > 0 ? ` (${cnt})` : '');
    });
    btUnsorted.addEventListener("click", () => {
        View.Unsorted();
    });
    flow.bindCtl(mkFolderList);
    let btSettings = flow.child<HTMLButtonElement>("button", {
        id: "btSettings",
        type: "button",
        innerText: "Settings",
        className: "btNavigate",
    });
    btSettings.addEventListener("click", () => {
        View.Settings(eSettingsPage.Main);
    });
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
            View.Folder(folder);
        }
    });
}