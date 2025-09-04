import { DB } from "./DB";
import { Flow, Route } from "./flow";
import { mkMain } from "./index_main";
import { mkNavigation } from "./index_navigation";
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

    let btAddNote = route.child<HTMLButtonElement>("button", {
        type: "button",
        innerText: "+ Add Note",
        className: "btPrimary",
    });
    btAddNote.addEventListener("click", () => {
        let note = DB.CreateNote();
        if (View.CurrFolder()) note.folderId = View.CurrFolder()?.id;
        View.ForceAdd(note);
    });
}

async function setup(): Promise<void> {
    await DB.Init();
    View.ShowAll();
    Flow.Dirty();
}