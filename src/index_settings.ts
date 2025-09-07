import { Flow, Route } from "./flow";
import { Nil } from "./util";
import { eSettingsPage, View } from "./view";

export interface ISettings {
    v: number;
    transcriptType?: string | Nil;
    transcriptUrl?: string | Nil;
}

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

Route.Register("settings", (flow, pars) => {
    mkSettings(flow, pars["sub"]);
}, pars => View.Settings(parseSettings(pars["sub"])));

function parseSettings(subPage: string): eSettingsPage {
    if (subPage?.toLowerCase() === "main") return eSettingsPage.Main;
    return eSettingsPage.None;
}
export function mkSettings(flow: Flow, subPage: string) {
    switch (parseSettings) {
        default: // main
            mkMain(flow);
            break;
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

interface IAudioService{
    name: string;
    key?: string;
    description?: string;
}

let _audioPipelines: IAudioService[] = [
    { name: "Disabled" },
    { 
        name: "Whisper-ASR",
        key: "WhisperAsr",
        description: `
            Whisper-ASR you to point to an <a href="https://github.com/ahmetoner/whisper-asr-webservice">
            openai-whisper-asr-webservice</a> end point. NOTE: With a default 
            <a href="https://hub.docker.com/r/onerahmet/openai-whisper-asr-webservice">Docker install</a>,
            locally, you will likely need a reverse proxy to override the CORS headers, as this is invoked
            from the front end. The URL should be the base URL, and the /asr will be appeneded automatically.
        `.trim(),
     },
];

function mkTranscriptMode(flow: Flow) {
    lbl(flow, "Transcription Service:");
    let opts: Option[] = _audioPipelines.map(svc => [svc.key ?? "", svc.name]);
    boundDropDown(flow, opts,
        () => _config.transcriptType ?? "",
        v => _config.transcriptType = v,
    );
    boundDescription(flow, () => _audioPipelines.find(a => a.key == _config.transcriptType)?.description);
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

function boundDescription(flow: Flow, getter: () => (string | Nil), parent?: HTMLElement){
    let container = flow.elem(parent, "div", { className: "settingDescription" });
    flow.bind(() => container.innerHTML = getter() ?? "");
    flow.conditionalStyle(container, "noDisp", () => getter() == "");
}