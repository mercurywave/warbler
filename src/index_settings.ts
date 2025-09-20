import { brotliCompressSync } from "zlib";
import { AILinkage } from "./ai_link";
import { DB } from "./DB";
import { Flow, Route } from "./flow";
import { Config, IAIFunction, ILlmServer, IService } from "./settings";
import { Nil, util } from "./util";
import { eSettingsPage, View } from "./view";


type Option = [value: string, display: string];

function serverToOption(svc: IService): Option {
    return [svc.key ?? "", svc.name];
}

// this lives here to make sure webpack pulls this file in
export function mkSettingsLauncher(flow: Flow) {
    let btSettings = flow.child<HTMLButtonElement>("button", {
        id: "btSettings",
        type: "button",
        innerText: "Settings",
        className: "btNavigate",
    });
    btSettings.addEventListener("click", () => {
        Route.Launch("settings");
    });
}


Route.Register("settings", (flow, pars) => {
    mkSettings(flow, pars["sub"]);
}, pars => View.Settings(parseSettings(pars["sub"])),
    async () => { await Config.tryPullFromBackend() });


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
    addSection(flow, "Transcription", mkTranscription, Config.backendHandlesAsr);
    addSection(flow, "LLM Servers", mkLlmServers);
    let doShowAi = () => Config.getllmServers().length < 1;
    addSection(flow, "AI Summary", f => mkAiConfig(f, Config.getSummaryAi()), doShowAi);
    addSection(flow, "AI Transcribe Filter", f => mkAiConfig(f, Config.getCleanAudioAi()), doShowAi);
}

function mkSyncServer(flow: Flow) {
    lbl(flow, "Status:");
    let stats = boundDescription(flow, () => Config.isOnline() ? `Online` : `Offline`);
    flow.conditionalStyle(stats, "setErr", () => !Config.isOnline());

    boundDescription(flow, () => Config.isStaticWebPage() ? `
        You're connected to a static web page with no back end.
        You can connect to back end server independently 
        to synchronize your data and route AI connections.
    `.trim() : '');

    let url = flow.child("div");
    flow.conditional(url, () => Config.isStaticWebPage() || !Config.isOnline(), mkBackendUrl);

    boundWarning(flow, () => Config.canChangePrimaryServer() ? `
        You are connected to a backend, but the data on your device
        did not originate from that server. Changes will not sync
        until you connect to the original server, or make this your
        primary server.
    `.trim() : '');

    boundWarning(flow, () => (Config.canChangePrimaryServer() && DB.AnyNotesToServerSave()) ? `
        You also have notes on this device that have not been saved to a backend server!
    `.trim() : '');

    boundWarning(flow, () => Config.canChangePrimaryServer() ? `These options cannot be undone!` : '');

    let btSync = flow.child<HTMLButtonElement>("button", {
        type: "button",
        innerText: "Sync Local Changes To Server",
        title: `Make this server my primary server, and send pending changes to this server`,
        className: "btCaution",
    });
    flow.conditionalStyle(btSync, "noDisp", () => !(Config.canChangePrimaryServer() && DB.AnyNotesToServerSave()));
    btSync.addEventListener("click", () => {
        let uid = Config.getConnectedServerId();
        if (uid) {
            console.log(`Setting primary server to "${uid}"`)
            Config.setPrimaryServer(uid);
        }
        DB.ServerSync();
    });

    let btPull = flow.child<HTMLButtonElement>("button", {
        type: "button",
        innerText: "Make This My Primary",
        className: "btCaution",
    });
    flow.bind(() => {
        btPull.innerText = DB.AnyNotesToServerSave() ?
            `DISCARD Local Changes And Switch To This Server` :
            `Make This Server MY Primary`;
        btPull.title = DB.AnyNotesToServerSave() ?
            `DISCARD ALL PENDING NOTES, and make this my primary server` :
            `Load the notes on this server and make this my primary server`;
    });
    flow.conditionalStyle(btPull, "noDisp", () => !Config.canChangePrimaryServer());
    btPull.addEventListener("click", () => {
        let uid = Config.getConnectedServerId();
        if (uid) {
            console.log(`Setting primary server to "${uid}"`)
            Config.setPrimaryServer(uid);
        }
        DB.FullServerRefresh();
    });
    mkServerManagement(flow);
}

function mkBackendUrl(flow: Flow) {
    lbl(flow, "Server URL:");
    let container = flow.child("div", { className: "setRow" });
    let input = boundTextInput(flow,
        () => Config.getBackendOverride() ?? "",
        v => {
            // TODO: This needs to be bigger deal
            // If you have local unsynced notes, you need to be able to select what to do
            Config.setBackendOverride(v);
            Config.tryPullFromBackend()
                .then(() => Flow.Dirty());
        }, container
    );
    flow.bind(() => input.disabled = Config.isCheckingOnlineStatus());
    boundSpan(flow, () => Config.isCheckingOnlineStatus() ? 'Testing connection...' : '', container);
}

function mkServerManagement(flow: Flow) {
    let [container, header, body] = simpleCollapsableSection(flow, `Server Management`);
    flow.conditionalStyle(container, "noDisp", () => !Config.isOnline());

    let btPull = flow.elem<HTMLButtonElement>(body, "button", {
        type: "button",
        innerText: "Discard All Local Data and Refresh From Server",
        className: "btCaution",
    });
    btPull.addEventListener("click", () => {
        DB.FullServerRefresh();
    });
}

function mkTranscription(flow: Flow) {
    mkTranscriptMode(flow);
    let url = flow.child("div");
    flow.conditional(url, () => !!Config.getTranscriptType(), mkTranscriptUrl);
}

function mkTranscriptMode(flow: Flow) {
    lbl(flow, "Transcription Service:");
    let opts: Option[] = Config.audioPipelines.map(serverToOption);
    addDropDown(flow, opts,
        () => Config.getTranscriptType() ?? "",
        v => Config.setTranscriptType(v),
    );
    boundDescription(flow, () => Config.audioPipelines.find(a => a.key == Config.getTranscriptType())?.description);
}

function mkTranscriptUrl(flow: Flow) {
    lbl(flow, "URL:");
    boundTextInput(flow,
        () => Config.getTranscriptUrl() ?? "",
        v => Config.setTranscriptUrl(v),
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
        Config.getllmServers().push({ id: id, type: Config.llmPipelines[0].key ?? "", url: "" });
        Flow.Dirty();
    });
    let elList = flow.child("div", { className: "liSetServers" });
    flow.bindArray(() => Config.getllmServers(), mkLlmLine, elList);
}

function mkLlmLine(flow: Flow, server: ILlmServer) {
    let span = flow.root("div", { className: "setServer" });
    let opts: Option[] = Config.llmPipelines.map(serverToOption);
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
        Config.setllmServers(Config.getllmServers().filter(s => s !== server));
        Config.Save();
        Flow.Dirty();
    });
    flow.bind(() => {
        btRemove.disabled = !!Config.loopConfigedAiFunctions().find(c => c.serverKey === server.id);
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
        () => [["", ""], ...Config.getllmServers().map(s => [s.id, getServerName(s)] as Option)],
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
        Config.Save();
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
        Config.Save();
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
        Config.Save();
    });
    return dropDown;
}

function addBoundDropDown(flow: Flow, opts: () => Option[], getter: () => string, setter: (val: string) => void, parent?: HTMLElement): HTMLSelectElement {
    let dropDown = flow.elem<HTMLSelectElement>(parent, "select");
    flow.bindArray(opts, _boundOpt, dropDown);
    flow.bind(() => dropDown.value = getter());
    dropDown.addEventListener("change", () => {
        setter(dropDown.value);
        Config.Save();
    });
    return dropDown;
}
function _boundOpt(flow: Flow, opt: Option) {
    let root = flow.root<HTMLOptionElement>("option", { value: opt[0] });
    flow.bind(() => root.innerText = opt[1]);
}

function addSection(flow: Flow, label: string, builder: (flow: Flow) => void, hideIf?: () => boolean) {
    let host = flow.child("div");
    flow.elem(host, "div", { innerText: label, className: "settingHead" });
    let section = flow.elem(host, "div", { className: "section" });
    flow.bindCtl(builder, section);
    if (hideIf)
        flow.conditionalStyle(host, "noDisp", hideIf);
}

function boundDescription(flow: Flow, getter: () => (string | Nil), parent?: HTMLElement): HTMLElement {
    let container = flow.elem(parent, "div", { className: "settingDescription" });
    flow.bind(() => container.innerHTML = getter() ?? "");
    flow.conditionalStyle(container, "noDisp", () => getter() == "");
    return container;
}

function boundWarning(flow: Flow, getter: () => (string | Nil), parent?: HTMLElement): HTMLElement {
    let container = flow.elem(parent, "div", { className: "settingWarning" });
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

// starts collapsed and manages collapse state itself
function simpleCollapsableSection(flow: Flow, title: string, parent?: HTMLElement)
    : [container: HTMLElement, header: HTMLElement, body: HTMLElement] {

    let container = flow.elem(parent, "div", { className: "collapser" });
    let header = flow.elem(container, "div", { className: "collapseHead" });
    let label = flow.elem(header, "span", { innerText: title });
    let btToggle = flow.elem(header, "button", {
        innerText: "▶",
        className: "btCollapse",
    });
    let body = flow.elem(container, "div", { className: "collapseBody noDisp" });
    header.addEventListener('click', () => {
        let hidden = body.classList.toggle('noDisp');
        btToggle.innerText = hidden ? '▶' : '▼';
    });
    return [container, header, body];
}