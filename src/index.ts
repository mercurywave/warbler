import { DB } from "./DB";
import { Flow, Route } from "./flow";
import { mkMain } from "./index_main";
import { mkNavigation } from "./index_navigation";
import { LoadSettings } from "./index_settings";
import { MicInterface, Speech } from "./speech";
import { View } from "./view";

document.addEventListener("DOMContentLoaded", () => {
    setup();
    initUi();
});

function initUi() {
    let main = document.querySelector("body") as HTMLElement;
    Flow.Init(main, mkRoot);
}

function mkRoot(flow: Flow) {
    flow.bindCtl(mkNavigation);
    let main = flow.child("div", { id: "main" });

    let outer = flow.elem(main, "div", { id: "mainOuter" });
    let bind = flow.bindObject(() => View.CurrView(), mkMain, outer);
    bind.setAnimRemoval(200, "fade-out-view");
    flow.bindAsMainRouteScroll(outer);

    let actionCenter = flow.child("div", { className: "actionPanel" });
    flow.conditionalStyle(actionCenter, "noDisp", () => !View.CurrView().canAddNotes);

    let btAddNote = flow.elem<HTMLButtonElement>(actionCenter, "button", {
        type: "button",
        innerText: "+ Add Note",
        className: "btPrimary",
    });
    btAddNote.addEventListener("click", () => spawnNote());

    let btAddVoiceNote = flow.elem<HTMLButtonElement>(actionCenter, "button", {
        type: "button",
        innerText: "🎙️",
        className: "btPrimary",
    });
    btAddVoiceNote.addEventListener("click", () => {
        if(MicInterface.isRecording()){
            MicInterface.stop();
        }
        else
            spawnNote(true);
    });
    flow.conditionalStyle(btAddVoiceNote, "noDisp", () => !Speech.isEnabled());
    flow.conditionalStyle(btAddVoiceNote, "recording", () => MicInterface.isRecording());
}

function spawnNote(startRecording?: boolean) {
    let note = DB.CreateNote(View.CurrView().folder);
    View.ForceAdd(note);
    if(startRecording) Flow.SendMail('autoRecord', note);
    Flow.SendMail('noteFocus', note);
}

async function setup(): Promise<void> {
    LoadSettings();
    await DB.Init();
    Route.Init();
}
window.addEventListener('popstate', () => Route.OnNavigate());