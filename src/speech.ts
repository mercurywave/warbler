import { Flow } from "./flow";
import { Config } from "./index_settings";
import { Note, PendingTranscription } from "./note";
import { Deferred, Nil, util } from "./util";

export namespace Speech {
    export function mkRecordWidget(flow: Flow, trans: PendingTranscription) {
        let span = flow.root("div", { className: "pendRec" });
        let record = trans._recording;
        let btStop = flow.elem<HTMLButtonElement>(span, "button", {
            type: "button",
            innerText: "⏹",
            className: "btStop",
        });
        btStop.addEventListener("click", () => {
            MicInterface.stop();
        });
        let lblStatus = flow.child("span", { className: "lblRecStatus" });
        let lblDurr = flow.child("span", { innerText: "0:00" });
        record.onBegin().then(() => {
            lblStatus.innerText = "Recording";

            // start updating clock
            let recordingStartTime = Date.now();
            let durationInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
                lblDurr.textContent = formatDuration(elapsed);
            }, 1000);

            record.onCaptured().then(blob => {
                lblStatus.innerText = "Transcribing";
                clearInterval(durationInterval);

                // Get final duration from the WAV blob
                getWavDuration(blob).then(duration => {
                    lblDurr.textContent = formatDuration(duration);
                });
            });
        });
        let lblError = flow.child("span", { className: "lblError" });
        flow.bind(() => lblError.innerText = trans.errorMsg);

        let btRetry = flow.elem<HTMLButtonElement>(span, "button", {
            type: "button",
            innerText: "Retry",
        });
        btRetry.addEventListener("click", () => {
            trans.Retry();
            record.onCaptured().then(b => tryProcessAudio(b, trans));
        });
        flow.conditionalStyle(btRetry, "noDisp", () => !trans.hasErrored || trans.isDone || trans.isCancelled);

        let btDiscard = flow.elem<HTMLButtonElement>(span, "button", {
            type: "button",
            innerText: "Discard",
        });
        btDiscard.addEventListener("click", () => {
            trans.Cancel();
        });
        flow.conditionalStyle(btDiscard, "noDisp", () => !trans.hasErrored || trans.isDone || trans.isCancelled);

        record.onCaptured().then(() => btStop.disabled = true);
    }

    export function mkRecordButton(flow: Flow, span: HTMLElement, note: Note) {
        let btAdd = flow.elem<HTMLButtonElement>(span, "button", {
            type: "button",
            innerText: "🎙️",
            className: "btRecord",
        });
        let manager = new RecordManager();
        let startRecLambda = function () {
            let record = manager.makeRecording();
            let pend = note.StartNewRecording(record);
            record.onBegin().then(() => btAdd.classList.add("recording"));
            record.onCaptured().then(b => {
                tryProcessAudio(b, pend);
            });
            record.onCancel().then(() => pend.Cancel());
            record.onFinally().then(() => btAdd.classList.remove("recording"));
            MicInterface.record(record);
        }
        btAdd.addEventListener("click", () => {
            if (MicInterface.isRecording()) {
                MicInterface.stop();
            }
            else startRecLambda();
        });
        flow.unwind(() => manager.cancelInFlight());
        flow.conditionalStyle(btAdd, "noDisp", () => !isEnabled());

        flow.bindMail('autoRecord', m => m.data === note, () => startRecLambda());
    }

    async function tryProcessAudio(blob: Blob, trans: PendingTranscription) {
        console.log("audio recorded");
        try {
            let addition = '';
            switch (audioType()) {
                case 'WhisperAsr':
                    addition = await runWhisperAsr(blob);
                    break;
                default: throw 'audio type not implemented'
            }
            trans.Complete(addition);
        } catch (e) {
            trans.Fail(`Transcription Error: ${e}`);
        }
    }

    export function isEnabled(): boolean { return !!audioType(); }

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

async function runWhisperAsr(blob: Blob): Promise<string> {
    let baseUrl = Speech.audioUrl();
    if (!baseUrl) throw 'URL is required for WhisperAsr';
    let url = new URL(baseUrl);
    url.pathname += '/asr';
    url.search = 'output=json';
    try {
        const formData = new FormData();
        formData.append('audio_file', blob, 'recorded_audio.wav');

        const response = await fetch(url, {
            method: 'POST',
            body: formData,
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Response from backend:', result);
            return result.segments.map((s: any) => s.text.trim()).join('\n');
        } else {
            console.error('Failed to send audio:', response.status, response.statusText);
            throw 'Error sending audio';
        }
    } catch (error) {
        console.error('Error sending audio:', error);
        throw 'Error sending audio';
    }
}

class RecordManager {
    private _job: RecordJob | Nil = null;
    public makeRecording(): RecordJob {
        let job = new RecordJob();
        this._job = job;
        this._job.onFinally().then(() => {
            if (this._job === job)
                this._job = null;
        });
        return job;
    }
    public cancelInFlight() {
        this._job?.triggerCancel();
    }
}

export class RecordJob {
    private _beginTask: Deferred<void> = new Deferred();
    private _cancelTask: Deferred<void> = new Deferred();
    private _finally: Deferred<void> = new Deferred();
    private _mainTask: Deferred<Blob> = new Deferred();
    private _isCancelled: boolean = false;

    public onBegin(): Promise<void> { return this._beginTask; }
    public onCancel(): Promise<void> { return this._cancelTask; }
    public onFinally(): Promise<void> { return this._finally; }
    public onCaptured(): Promise<Blob> { return this._mainTask; }
    public get isCancelled(): boolean { return this._isCancelled; }

    public triggerBegin() {
        this._beginTask.resolve();
    }
    public triggerCancel() {
        this._isCancelled = true;
        this._cancelTask.resolve();
        this._finally.resolve();
    }
    public triggerResolve(blob: Blob) {
        this._mainTask.resolve(blob);
        this._finally.resolve();
    }
}

export namespace MicInterface {
    let _mediaRecorder: MediaRecorder | Nil = null;
    let _audioChunks: Blob[] = [];
    let _stream: MediaStream | Nil = null;
    let _job: RecordJob | Nil = null; // only one job active at a time

    async function initAudio(job: RecordJob) {
        _stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 16000, // Set sample rate to 16kHz for ASR
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
            }
        });
        if (job.isCancelled) {
            _stream = null;
            return;
        }
        _mediaRecorder = new MediaRecorder(_stream);

        _mediaRecorder.onstart = () => {
            job.triggerBegin();
        };
        _mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                _audioChunks.push(event.data);
            }
        };
        _mediaRecorder.onstop = () => {
            const audioBlob = new Blob(_audioChunks, { type: 'audio/wav' });
            _audioChunks = [];
            _job?.triggerResolve(audioBlob);
            _job = null;
            _mediaRecorder = null;
            _stream = null;
        };
    }
    export async function record(job: RecordJob) {
        _job?.triggerCancel();
        _job = job;
        await initAudio(job);
        if (!job.isCancelled)
            _mediaRecorder?.start();
    }
    export function stop() {
        if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
            _mediaRecorder.stop();
            _stream?.getTracks().forEach(track => track.stop());
        }
    }
    export function isRecording(): boolean { return !!_job && !_job.isCancelled; }
}

function formatDuration(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds) % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Utility to get WAV duration from blob
function getWavDuration(blob: Blob): Promise<number> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            if (!e.target?.result) { reject(); return; }
            const audioContext = new window.AudioContext();
            audioContext.decodeAudioData(e.target.result as ArrayBuffer, (buffer) => {
                resolve(buffer.duration);
            }, reject);
        };
        reader.readAsArrayBuffer(blob);
    });
}