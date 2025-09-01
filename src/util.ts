
export namespace util {
    
    export function ellipsize(text:string, maxLength: number) {
        if (text.length > maxLength) {
          return text.slice(0, maxLength - 3) + "...";
        }
        return text;
    }

    export function deepCopy(obj: any):any{
        return JSON.parse(JSON.stringify(obj));
    }
}

export class Deferred<T> implements Promise<T> {

    private _resolveSelf!: ((value: T | PromiseLike<T>) => void);
    private _rejectSelf!:((value: T | PromiseLike<T>) => void);
    private promise: Promise<T>

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this._resolveSelf = resolve
            this._rejectSelf = reject
        });
    }
    get [Symbol.toStringTag](): string{ return "Deferred"; }

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