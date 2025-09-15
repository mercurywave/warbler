import { AILinkage } from "./ai_link";
import { Flow, Route } from "./flow";
import { Rest, Nil, util, Deferred } from "./util";
import { eSettingsPage, View } from "./view";

export interface ISettings {
    v: number;
    transcriptType?: string | Nil;
    transcriptUrl?: string | Nil;
    llmServers: ILlmServer[];

    summaryAi: IAIFunction;
    cleanAudioAi: IAIFunction;

    backendOverride?: string;
}

export interface ILlmServer {
    id: string;
    type: string;
    url?: string;
    alias?: string;
}

export interface IAIFunction {
    serverKey?: string;
    model?: string;
    systemPrompt?: string;
}

export interface IBackendFunctions {
    ASR?: boolean;
}

interface IService {
    name: string;
    key?: string;
    description?: string;
}
type Option = [value: string, display: string];

function serverToOption(svc: IService): Option {
    return [svc.key ?? "", svc.name];
}
function loopConfigedAiFunctions(): IAIFunction[] {
    return [_config.summaryAi, _config.summaryAi];
}

let _config: ISettings;
let _isStaticWebPage: boolean = false;
let _backendFuncs: IBackendFunctions | Nil = null;
let _pollBackendJob: Deferred<boolean> | Nil = null;
export function Config(): ISettings { return _config; }
export async function LoadSettings(): Promise<void> {
    let str = window.localStorage.getItem("warbler-settings");
    if (str) try {
        _config = JSON.parse(str);
        CleanSettings();
    } catch { ResetSettings(); }
    else ResetSettings();
    if (!await tryPullFromBackend(true))
        _isStaticWebPage = true;
}
function CleanSettings() {
    if (!_config.llmServers) _config.llmServers = []; // TODO: remove backwards compatability break
    if (!_config.summaryAi) _config.summaryAi = {};
    if (!_config.cleanAudioAi) _config.cleanAudioAi = {};

    // ignore invalid options
    _config.llmServers = _config.llmServers.filter(s => _llmPipelines.find(p => p.key === s.type));

    // force-create servers if something gets unlinked
    for (const aiFunc of loopConfigedAiFunctions()) {
        if (aiFunc.serverKey && !_config.llmServers.find(s => s.id === aiFunc.serverKey)) {
            _config.llmServers.push({ id: aiFunc.serverKey, type: _llmPipelines[0].key ?? "", alias: "???" });
        }
    }
}
function ResetSettings() {
    _config = {
        v: 1,
        llmServers: [],
        summaryAi: {},
        cleanAudioAi: {},
    };
}
function SaveSettings() {
    window.localStorage.setItem("warbler-settings", JSON.stringify(_config));
    Flow.Dirty();
}
function getBackendUrl(defaultToUrl?: boolean): string | Nil {
    if (_config.backendOverride)
        return _config.backendOverride;
    if (!_isStaticWebPage || defaultToUrl)
        return window.location.origin + window.location.pathname;
    return null;
}
async function tryPullFromBackend(defaultToUrl?: boolean): Promise<boolean> {
    if (_pollBackendJob != null) return await _pollBackendJob;
    _backendFuncs = null;
    _pollBackendJob = new Deferred();
    let url = getBackendUrl(defaultToUrl);
    if (!url) return false;
    let result = await Rest.get(url, "v1/config");
    if (result.success) {
        _backendFuncs = result.response!!;
    }
    _pollBackendJob.resolve(result.success);
    _pollBackendJob = null;
    return result.success;
}

Route.Register("settings", (flow, pars) => {
    mkSettings(flow, pars["sub"]);
}, pars => View.Settings(parseSettings(pars["sub"])),
    async () => { await tryPullFromBackend() });

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
    addSection(flow, "Database", mkSyncServer);
    addSection(flow, "Transcription", mkTranscription);
    addSection(flow, "LLM Servers", mkLlmServers);
    let aiContainer = flow.child("div");
    addSection(flow, "AI Summary", f => mkAiConfig(f, _config.summaryAi), aiContainer);
    addSection(flow, "AI Transcribe Filter", f => mkAiConfig(f, _config.cleanAudioAi), aiContainer);
    flow.conditionalStyle(aiContainer, "noDisp", () => _config.llmServers.length < 1);
}

function mkSyncServer(flow: Flow) {
    lbl(flow, "Status:");
    let stats = boundDescription(flow, () => _backendFuncs ? `Online` : `Offline`);
    flow.conditionalStyle(stats, "setErr", () => !_backendFuncs);

    boundDescription(flow, () => _isStaticWebPage ? `
        You're connected to a static web page with no back end.
        You can connect to back end server independently 
        to synchronize your data and route AI connections.
    `.trim() : '');

    let url = flow.child("div");
    flow.conditional(url, () => _isStaticWebPage || !!_config.backendOverride, mkBackendUrl);
}

function mkBackendUrl(flow: Flow) {
    lbl(flow, "Server URL:");
    let container = flow.child("div", {className: "setRow"});
    let input = boundTextInput(flow,
        () => _config.backendOverride ?? "",
        v => {
            // TODO: This needs to be bigger deal
            // If you have local unsynced notes, you need to be able to select what to do
            _config.backendOverride = v;
            tryPullFromBackend().then(() => Flow.Dirty());
        }, container
    );
    flow.bind(() => input.disabled = _pollBackendJob != null);
    boundSpan(flow, () => _pollBackendJob ? 'Testing connection...' : '', container);
}

function mkTranscription(flow: Flow) {
    mkTranscriptMode(flow);
    let url = flow.child("div");
    flow.conditional(url, () => !!_config.transcriptType, mkTranscriptUrl);
}

let _audioPipelines: IService[] = [
    { name: "Disabled" },
    {
        name: "Warbler-Container",
        key: "Warbler",
        description: `
            Connect to a Warbler backend server.
        `.trim(),
    },
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
    let opts: Option[] = _audioPipelines.map(serverToOption);
    addDropDown(flow, opts,
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

function mkLlmServers(flow: Flow) {
    let btAddServer = flow.child<HTMLButtonElement>("button", {
        type: "button",
        innerText: "+ Add Server",
        className: "btSetting",
    });
    btAddServer.addEventListener("click", () => {
        let id = util.UUID();
        _config.llmServers.push({ id: id, type: _llmPipelines[0].key ?? "", url: "" });
        Flow.Dirty();
    });
    let elList = flow.child("div", { className: "liSetServers" });
    flow.bindArray(() => _config.llmServers, mkLlmLine, elList);
}

let _llmPipelines: IService[] = [
    {
        name: "Ollama",
        key: "Ollama",
        description: `
            Ollama server. You may need to consider CORS to enable access
        `.trim(),
    },
];

function mkLlmLine(flow: Flow, server: ILlmServer) {
    let span = flow.root("div", { className: "setServer" });
    let opts: Option[] = _llmPipelines.map(serverToOption);
    addDropDown(flow, opts,
        () => server.type ?? "",
        v => server.type = v,
    );

    let lblUrl = flow.child("label", { innerText: " URL: " });
    boundTextInput(flow, () => server.url ?? "", v => server.url = v, lblUrl);

    let lblAlias = flow.child("label", { innerText: " Alias: " });
    let inAlias = boundTextInput(flow, () => server.alias ?? "", v => server.alias = v, lblAlias);
    inAlias.placeholder = server.id;

    let btRemove = flow.child<HTMLButtonElement>("button", {
        type: "button",
        innerText: "X",
        className: "btX",
    });
    btRemove.addEventListener("click", () => {
        _config.llmServers = _config.llmServers.filter(s => s !== server);
        SaveSettings();
        Flow.Dirty();
    });
    flow.bind(() => {
        btRemove.disabled = !!loopConfigedAiFunctions().find(c => c.serverKey === server.id);
    });

    let bttest = flow.child<HTMLButtonElement>("button", {
        type: "button",
        innerText: "Test",
    });
    let lblResult = flow.child("span");
    bttest.addEventListener("click", async () => {
        let ai = new AILinkage(server);
        let [succes, msg] = await ai.TestConnection();
        lblResult.innerText = msg;
        lblResult.classList.toggle("setErr", !succes);
    });
}
function getServerName(server: ILlmServer): string {
    return server.alias || server.url || server.id || "???";
}

function mkAiConfig(flow: Flow, aiFunction: IAIFunction) {
    lbl(flow, "LLM Server:");
    let server = addBoundDropDown(flow,
        () => [["", ""], ..._config.llmServers.map(s => [s.id, getServerName(s)] as Option)],
        () => aiFunction.serverKey ?? "",
        v => aiFunction.serverKey = v,
    );
    let container = flow.child("div");

    lbl(flow, "System Prompt", container);

    boundTextArea(flow,
        () => aiFunction.systemPrompt ?? "",
        v => aiFunction.systemPrompt = v,
        container
    )

    flow.conditionalStyle(container, "noDisp", () => server.value === "");
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

function boundTextArea(flow: Flow, getter: () => string, setter: (val: string) => void, parent?: HTMLElement): HTMLTextAreaElement {
    let input = flow.elem<HTMLTextAreaElement>(parent, "textarea", {
        className: "edSetTextArea",
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


function addDropDown(flow: Flow, opts: Option[], getter: () => string, setter: (val: string) => void, parent?: HTMLElement): HTMLSelectElement {
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
    return dropDown;
}

function addBoundDropDown(flow: Flow, opts: () => Option[], getter: () => string, setter: (val: string) => void, parent?: HTMLElement): HTMLSelectElement {
    let dropDown = flow.elem<HTMLSelectElement>(parent, "select");
    flow.bindArray(opts, _boundOpt, dropDown);
    flow.bind(() => dropDown.value = getter());
    dropDown.addEventListener("change", () => {
        setter(dropDown.value);
        SaveSettings();
    });
    return dropDown;
}
function _boundOpt(flow: Flow, opt: Option) {
    let root = flow.root<HTMLOptionElement>("option", { value: opt[0] });
    flow.bind(() => root.innerText = opt[1]);
}

function addSection(flow: Flow, label: string, builder: (flow: Flow) => void, host?: HTMLElement) {
    flow.elem(host, "div", { innerText: label, className: "settingHead" });
    let section = flow.elem(host, "div", { className: "section" });
    flow.bindCtl(builder, section);
}

function boundDescription(flow: Flow, getter: () => (string | Nil), parent?: HTMLElement): HTMLElement {
    let container = flow.elem(parent, "div", { className: "settingDescription" });
    flow.bind(() => container.innerHTML = getter() ?? "");
    flow.conditionalStyle(container, "noDisp", () => getter() == "");
    return container;
}

function boundSpan(flow: Flow, getter: () => (string | Nil), parent?: HTMLElement): HTMLElement {
    let container = flow.elem(parent, "span", { className: "setSpan" });
    flow.bind(() => container.innerHTML = getter() ?? "");
    flow.conditionalStyle(container, "noDisp", () => getter() == "");
    return container;
}