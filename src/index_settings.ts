import { Flow, Route } from "./flow";
import { Nil } from "./util";
import { eSettingsPage } from "./view";

export interface ISettings {
    v: number;
    transcriptType?: string | Nil;
    transcriptUrl?: string | Nil;
}
export type sTranscriptType = "WhisperDock" | Nil;

let _config: ISettings;
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
    //window.localStorage.setItem("warbler-settings", JSON.stringify(_config));
    Flow.Dirty();
}

export function Config(): ISettings { return _config; }


export function mkSettings(route: Route, page: eSettingsPage) {
    switch (page) {
        case eSettingsPage.Main:
            mkMain(route);
            break;
        default: break;
    }
}

function mkMain(route: Route) {
    addSection(route, "Transcription", mkTranscription);
}

function mkTranscription(route: Route) {
    mkTranscriptMode(route);
    let url = route.child("div");
    route.conditional(url, () => !!_config.transcriptType, mkTranscriptUrl);
}

function mkTranscriptMode(route: Route) {
    lbl(route, "Transcription Service:");
    let opts: Option[] = [
        ["", ""],
        ["WhisperDock", "WhisperDock"],
    ];
    boundDropDown(route, opts, 
        () => _config.transcriptType ?? "", 
        v => _config.transcriptType = v,
    );
}

function mkTranscriptUrl(route: Route) {
    lbl(route, "URL:");
    boundTextInput(route,
        () => _config.transcriptUrl ?? "",
        v => _config.transcriptUrl = v,
    );
}

function lbl(route: Route, str: string, parent?: HTMLElement) {
    const props = { className: "lblSet", innerText: str };
    if (parent)
        route.elem(parent, "div", props);
    else route.child("div", props);
}

function boundTextInput(route: Route, getter: () => string, setter: (val: string) => void, parent?: HTMLElement): HTMLInputElement {
    let input = route.elem<HTMLInputElement>(parent, "input", {
        className: "edSetText",
        type: "text",
        autocomplete: "off",
    });
    route.bind(() => {
        input.value = getter();
    });
    input.addEventListener("change", () => {
        setter(input.value);
        SaveSettings();
    });
    return input;
}


type Option = [value: string, display: string];
function boundDropDown(route: Route, opts: Option[], getter: () => string, setter: (val: string) => void, parent?: HTMLElement) {
    // assumes a static list, like options available in settings
    let dropDown = route.elem<HTMLSelectElement>(parent, "select");
    for (const pair of opts) {
        route.elem<HTMLOptionElement>(dropDown, "option", { value: pair[0], innerText: pair[1] });
    }
    route.bind(() => dropDown.value = getter());
    dropDown.addEventListener("change", () => {
        setter(dropDown.value);
        SaveSettings();
    });
}

function addSection(route: Route, label: string, builder: (route: Route) => void) {
    route.child("div", { innerText: label, className: "settingHead" });
    let section = route.child("div", { className: "section" });
    route.bindCtl(builder, section);
}