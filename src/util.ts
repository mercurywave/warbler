

export type Nil = null | undefined;

export namespace util {

    export function ellipsize(text: string, maxLength: number) {
        if (text.length > maxLength) {
            return text.slice(0, maxLength - 3) + "...";
        }
        return text;
    }

    export function appendPiece(text:string, delim:string, append:string): string{
        if(text == "") return append;
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