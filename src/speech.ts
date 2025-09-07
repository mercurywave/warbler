import { Flow } from "./flow";
import { Config } from "./index_settings";
import { Note } from "./note";
import { Deferred, Nil } from "./util";

export namespace Speech {
    export function mkRecordButton(flow: Flow, span: HTMLElement, note: Note) {
        let btAdd = flow.elem<HTMLButtonElement>(span, "button", {
            type: "button",
            innerText: "🎙️",
            className: "btRecord",
        });
        let listen: Listener = new Listener();
        listen.then(b => tryProcessAudio(b, flow, note));
        listen.begin(() => btAdd.classList.add("recording"));
        listen.finally(() => btAdd.classList.remove("recording"));
        btAdd.addEventListener("click", () => {
            if (listen.isRecording) {
                listen.stop();
            }
            else {
                listen.record();
            }
        });
        flow.unwind(() => listen.cancel());
        flow.conditionalStyle(btAdd, "noDisp", () => !audioType());
    }

    async function tryProcessAudio(blob: Blob, flow: Flow, note: Note) {
        console.log("audio recorded");
        let addition = '';
        switch (audioType()) {
            case 'WhisperDock':
                addition = await runWhisperDock(blob);
                break;
            default: throw 'audio type not implemented'
        }

    }

    export function audioType(): string | Nil {
        let type = Config().transcriptType;
        if (!type) return null;
        return type;
    }
    export function audioUrl(): string | Nil {
        let url = Config().transcriptUrl;
        if (!url) return null;
        return url;
    }
}

async function runWhisperDock(blob: Blob): Promise<string> {
    console.log("audio recorded");
    let baseUrl = Speech.audioUrl();
    if (!baseUrl) throw 'URL is required for WhisperDock';
    let url = new URL(baseUrl);
    url.pathname += '/transcribe';
    try {
        const formData = new FormData();
        formData.append('file', blob, 'recorded_audio.wav');

        const response = await fetch(url, {
            method: 'POST',
            body: formData,
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Response from backend:', result);
            return result;
        } else {
            console.error('Failed to send audio:', response.status, response.statusText);
            return '';
        }
    } catch (error) {
        console.error('Error sending audio:', error);
        return '';
    }
}

// there can only be one listener active at a time
let _listener: Listener | Nil = null;

class Listener {
    private _mediaRecorder: MediaRecorder | Nil = null;
    private _audioChunks: Blob[] = [];
    private _stream: MediaStream | Nil = null;
    public _recording = false;
    public _canceled = false;
    public _onBegin: (() => void) | Nil = null;
    public _onFinal: (() => void) | Nil = null;
    public _onComplete: ((blob: Blob) => void) | Nil = null;

    async initAudio() {
        this._stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 16000, // Set sample rate to 16kHz for ASR
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
            }
        });
        if (this._canceled) return;
        this._mediaRecorder = new MediaRecorder(this._stream);

        this._mediaRecorder.onstart = (event) => {
            if (this._onBegin) this._onBegin();
        };
        this._mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this._audioChunks.push(event.data);
            }
        };
        this._mediaRecorder.onstop = () => {
            const audioBlob = new Blob(this._audioChunks, { type: 'audio/wav' });
            this._audioChunks = [];
            this.resolve(audioBlob);
            _listener = null;
            this._mediaRecorder = null;
            this._stream = null;
        };
    }
    public record() {
        _listener?.cancel();
        _listener = this;
        this._recording = true;
        this.initAudio().then(() => {
            if (!this._canceled) {
                this._mediaRecorder?.start();
            }
        });
    }
    public stop() {
        this._recording = false;
        if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
            this._mediaRecorder.stop();
            this._stream?.getTracks().forEach(track => track.stop());
        }
    }
    public cancel() {
        if (!this._recording) return;
        this._canceled = true;
        this.stop();
        if (this._onFinal)
            this._onFinal();
    }
    public begin(handler: (() => void)) { this._onBegin = handler; }
    public then(handler: ((blob: Blob) => void)) { this._onComplete = handler; }
    public finally(handler: (() => void)) { this._onFinal = handler; }
    public resolve(blob: Blob) {
        if (!this._canceled)
            this._onComplete?.(blob);
        if (this._onFinal)
            this._onFinal();
    }
    public get isRecording(): boolean { return this._recording; }
}

