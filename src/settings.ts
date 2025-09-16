import { Flow } from "./flow";
import { Deferred, Nil, Rest } from "./util";

interface ISettings {
    v: number;
    transcriptType?: string | Nil;
    transcriptUrl?: string | Nil;
    llmServers: ILlmServer[];

    summaryAi: IAIFunction;
    cleanAudioAi: IAIFunction;

    backendOverride?: string | Nil;
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

export interface IService {
    name: string;
    key?: string;
    description?: string;
}


let _config: ISettings;
let _isStaticWebPage: boolean = false;
let _backendFuncs: IBackendFunctions | Nil = null;
let _pollBackendJob: Deferred<boolean> | Nil = null;

export namespace Config {

    export function getTranscriptType(): string | Nil { return _config.transcriptType; }
    export function setTranscriptType(type: string | Nil) { _config.transcriptType = type; }

    export function getTranscriptUrl(): string | Nil { return _config.transcriptUrl; }
    export function setTranscriptUrl(type: string | Nil) { _config.transcriptUrl = type; }


    export function getllmServers(): ILlmServer[] { return _config.llmServers; }
    export function setllmServers(servers: ILlmServer[]) { _config.llmServers = servers; }


    export function getSummaryAi(): IAIFunction { return _config.summaryAi; }
    export function setSummaryAi(aiFunc: IAIFunction) { _config.summaryAi = aiFunc; }

    export function getCleanAudioAi(): IAIFunction { return _config.cleanAudioAi; }
    export function setCleanAudioAi(aiFunc: IAIFunction) { _config.cleanAudioAi = aiFunc; }


    export function getBackendOverride(): string | Nil { return _config.backendOverride; }
    export function setBackendOverride(url: string | Nil) { _config.backendOverride = url; }


    export function isOnline(): boolean { return !!_backendFuncs; }
    export function isStaticWebPage(): boolean { return _isStaticWebPage; }
    export function isCheckingOnlineStatus(): boolean { return !!_pollBackendJob; }

    export function backendHandlesAsr(): boolean { return !!_backendFuncs?.ASR; }


    export async function LoadSettings(): Promise<void> {
        let str = window.localStorage.getItem("warbler-settings");
        if (str) try {
            _config = JSON.parse(str);
            CleanSettings();
        } catch { ResetSettings(); }
        else ResetSettings();
        if (!await tryPullFromBackend(true) || _config.backendOverride)
            _isStaticWebPage = true;
    }


    export function Save() {
        window.localStorage.setItem("warbler-settings", JSON.stringify(_config));
        Flow.Dirty();
    }
    export function getBackendUrl(defaultToUrl?: boolean): string | Nil {
        if (_config.backendOverride)
            return _config.backendOverride;
        if (!_isStaticWebPage || defaultToUrl)
            return window.location.origin + window.location.pathname;
        return null;
    }
    export async function tryPullFromBackend(defaultToUrl?: boolean): Promise<boolean> {
        if (_pollBackendJob != null) return await _pollBackendJob;
        _backendFuncs = null;
        _pollBackendJob = new Deferred();
        let success = false;
        try {
            let url = getBackendUrl(defaultToUrl);
            if (url) {
                let result = await Rest.get(url, "v1/config");
                success = result.success;
                if (success) {
                    _backendFuncs = result.response!!;
                }
                _pollBackendJob.resolve(result.success);
            }
        } catch { }
        _pollBackendJob = null;
        return success;
    }

    export let llmPipelines: IService[] = [
        {
            name: "Ollama",
            key: "Ollama",
            description: `
            Ollama server. You may need to consider CORS to enable access
        `.trim(),
        },
    ];
    export let audioPipelines: IService[] = [
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

    export function loopConfigedAiFunctions(): IAIFunction[] {
        return [_config.summaryAi, _config.summaryAi];
    }
}

function CleanSettings() {
    if (!_config.llmServers) _config.llmServers = []; // TODO: remove backwards compatability break
    if (!_config.summaryAi) _config.summaryAi = {};
    if (!_config.cleanAudioAi) _config.cleanAudioAi = {};

    // ignore invalid options
    _config.llmServers = _config.llmServers.filter(s => Config.llmPipelines.find(p => p.key === s.type));

    // force-create servers if something gets unlinked
    for (const aiFunc of Config.loopConfigedAiFunctions()) {
        if (aiFunc.serverKey && !_config.llmServers.find(s => s.id === aiFunc.serverKey)) {
            _config.llmServers.push({ id: aiFunc.serverKey, type: Config.llmPipelines[0].key ?? "", alias: "???" });
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