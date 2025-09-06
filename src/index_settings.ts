import { Flow } from "./flow";
import { Nil } from "./util";
import { eSettingsPage } from "./view";

export interface ISettings {
    v: number;
    transcriptType?: string | Nil;
    transcriptUrl?: string | Nil;
}
export type sTranscriptType = "WhisperDock" | Nil;

let _config: ISettings;
export function Config(): ISettings { return _config; }
export function LoadSettings() {
    let str = window.localStorage.getItem("warbler-settings");
    if (str) try { _config = JSON.parse(str) } catch { ResetSettings(); }
    else ResetSettings();
}
function ResetSettings() {
    _config = {
        v: 1,
    };
}
function SaveSettings() {
    window.localStorage.setItem("warbler-settings", JSON.stringify(_config));
    Flow.Dirty();
}



export function mkSettings(flow: Flow, page: eSettingsPage) {
    switch (page) {
        case eSettingsPage.Main:
            mkMain(flow);
            break;
        default: break;
    }
}

function mkMain(flow: Flow) {
    addSection(flow, "Transcription", mkTranscription);
}

function mkTranscription(flow: Flow) {
    mkTranscriptMode(flow);
    let url = flow.child("div");
    flow.conditional(url, () => !!_config.transcriptType, mkTranscriptUrl);
}

function mkTranscriptMode(flow: Flow) {
    lbl(flow, "Transcription Service:");
    let opts: Option[] = [
        ["", "Disabled"],
        ["WhisperDock", "WhisperDock"],
    ];
    boundDropDown(flow, opts, 
        () => _config.transcriptType ?? "", 
        v => _config.transcriptType = v,
    );
}

function mkTranscriptUrl(flow: Flow) {
    lbl(flow, "URL:");
    boundTextInput(flow,
        () => _config.transcriptUrl ?? "",
        v => _config.transcriptUrl = v,
    );
}

function lbl(flow: Flow, str: string, parent?: HTMLElement) {
    const props = { className: "lblSet", innerText: str };
    if (parent)
        flow.elem(parent, "div", props);
    else flow.child("div", props);
}

function boundTextInput(flow: Flow, getter: () => string, setter: (val: string) => void, parent?: HTMLElement): HTMLInputElement {
    let input = flow.elem<HTMLInputElement>(parent, "input", {
        className: "edSetText",
        type: "text",
        autocomplete: "off",
    });
    flow.bind(() => {
        input.value = getter();
    });
    input.addEventListener("change", () => {
        setter(input.value);
        SaveSettings();
    });
    return input;
}


type Option = [value: string, display: string];
function boundDropDown(flow: Flow, opts: Option[], getter: () => string, setter: (val: string) => void, parent?: HTMLElement) {
    // assumes a static list, like options available in settings
    let dropDown = flow.elem<HTMLSelectElement>(parent, "select");
    for (const pair of opts) {
        flow.elem<HTMLOptionElement>(dropDown, "option", { value: pair[0], innerText: pair[1] });
    }
    flow.bind(() => dropDown.value = getter());
    dropDown.addEventListener("change", () => {
        setter(dropDown.value);
        SaveSettings();
    });
}

function addSection(flow: Flow, label: string, builder: (flow: Flow) => void) {
    flow.child("div", { innerText: label, className: "settingHead" });
    let section = flow.child("div", { className: "section" });
    flow.bindCtl(builder, section);
}