

export type Nil = null | undefined;

export namespace util {

    export function ellipsize(text: string, maxLength: number) {
        if (text.length > maxLength) {
            return text.slice(0, maxLength - 3) + "...";
        }
        return text;
    }

    export function appendPiece(text: string, delim: string, append: string): string {
        if (text == "") return append;
        return text + delim + append;
    }

    export function deepCopy(obj: any): any {
        return JSON.parse(JSON.stringify(obj));
    }
    export function getRelativeTime(date: Date): string {
        const now = new Date();
        const diffMs = date.getTime() - now.getTime();

        const units: Intl.RelativeTimeFormatUnit[] = [
            'year',    // 0
            'month',   // 1
            'day',     // 2
            'hour',    // 3
            'minute',  // 4
            'second'   // 5
        ];

        const divisors = [
            1000 * 60 * 60 * 24 * 365, // year
            1000 * 60 * 60 * 24 * 30,  // month
            1000 * 60 * 60 * 24,       // day
            1000 * 60 * 60,            // hour
            1000 * 60,                 // minute
            1000                      // second
        ];

        const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

        for (let i = 0; i < units.length; i++) {
            const diff = diffMs / divisors[i];
            if (Math.abs(diff) >= 1) {
                return rtf.format(Math.round(diff), units[i]);
            }
        }
        return rtf.format(0, 'second');
    }

    export function UUID(): string {
        // only available in HTTPS
        if (typeof crypto?.randomUUID === 'function')
            return crypto.randomUUID();

        // you're not banking with this - it's fine
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    export function appendPathToUrl(base: string, segment: string): URL {
        const url = new URL(base);
        if(segment.startsWith('/')) segment = segment.substring(1);
        // Ensure no double slashes or missing slashes
        url.pathname = `${url.pathname.replace(/\/$/, '')}/${segment}`;
        return url;
    }

}

export namespace Rest{
    export async function get<T>(baseUrl: string, path: string): Promise<OResult<T>> {
        if(!baseUrl) return new OResult(false, 'URL is required');
        let url = util.appendPathToUrl(baseUrl, path);
        try {
            const response = await fetch(url, {
                method: 'GET',
            });

            if (response.ok) {
                const result = await response.json();
                return new OResult(true, undefined, result as any);
            } else {
                console.error('Failed:', response.status, response.statusText);
                return new OResult(false, `Error: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error:', error);
            return new OResult(false, `Error: ${error}`);
        }
        
    }
}
export class OResult<T>{
    success: boolean;
    error?: string;
    response?: T;
    public constructor(success: boolean, error?:string, response?: T){
        this.success = success;
        this.error = error;
        this.response = response;
    }
}

export class Deferred<T> implements Promise<T> {

    private _resolveSelf!: ((value: T | PromiseLike<T>) => void);
    private _rejectSelf!: ((value: T | PromiseLike<T>) => void);
    private promise: Promise<T>

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this._resolveSelf = resolve
            this._rejectSelf = reject
        });
    }
    get [Symbol.toStringTag](): string { return "Deferred"; }

    public then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) =>
            TResult1 | PromiseLike<TResult1>) | undefined | null,
        onrejected?: ((reason: any) =>
            TResult2 | PromiseLike<TResult2>) | undefined | null
    ): Promise<TResult1 | TResult2> {
        return this.promise.then(onfulfilled, onrejected);
    }

    public catch<TResult = never>(
        onrejected?: ((reason: any) =>
            TResult | PromiseLike<TResult>) | undefined | null
    ): Promise<T | TResult> {
        return this.promise.catch(onrejected);
    }

    public async finally(onfinally?: () => void): Promise<T> {
        return this.promise.finally(onfinally);
    }


    public resolve(val?: T) { this._resolveSelf(val as any); }
    public reject(reason?: any) { this._rejectSelf(reason); }

}


export class Broadcaster<T> {
    private _listeners: ((e: T) => void)[] = [];

    public hook(callback: (e: T) => void) {
        this._listeners.push(callback);
    }

    public trigger(ev: T) {
        for (const callback of [...this._listeners]) {
            callback(ev);
        }
    }
}