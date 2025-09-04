import { DB } from "./DB";
import { Flow, Route } from "./flow";
import { Folder } from "./folder";
import { View } from "./view";



export function mkNavigation(route: Route) {
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
        className: "btNavigate",
    });
    route.bind(() => {
        let cnt = DB.AllNotes().filter(n => !n.folder).length;
        btUnsorted.innerText = 'Unsorted' + (cnt > 0 ? ` (${cnt})` : '');
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