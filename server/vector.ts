import path from "path";
import { DocStore } from "./docstore";
import fs from "fs";
import * as crypto from 'crypto';
import { AI } from "./AI";
import { Deferred } from "@shared/util";

type ICachFile = {
    checksum: string,
    vector: any,
};
type ICache = {
    version: number,
    model: string,
    keys: {
        [id: string]: ICachFile,
    }
};

export class VectorIndex<T> {
    _db: DocStore<T>;
    _cacheFile: string;
    _cache!: ICache;
    _getText: (obj: T) => string;
    _getHashStr: (obj: T) => string;
    _lastHash: { [id: string]: string } = {};
    public constructor(db: DocStore<T>, name: string, version: number, getEmbed: (obj: T) => string, getHashStr?: (obj: T) => string) {
        this._db = db
        this._getText = getEmbed;
        this._getHashStr = getHashStr ?? getEmbed;
        this._cacheFile = path.join('./data', `index.${name}.json`);

        this._clearCache();
        if (fs.existsSync(this._cacheFile)) {
            try {
                this._cache = JSON.parse(fs.readFileSync(this._cacheFile) as any);
                if (!this._cache) this._clearCache();
            } catch { this._clearCache(); }
        }

        this._db.registerIndex((id, obj) => this._updateCache(id, obj));
        setTimeout(() => this._bootCache(version));
    }

    private _clearCache(model?: string, version?: number) {
        model ??= '';
        version ??= 0;
        this._cache = { version, model: model, keys: {} };
    }

    private async _bootCache(version: number) {
        if (this._cache.model !== AI.embedModel) {
            this._clearCache(AI.embedModel ?? '', version);
        }
        let ids = await this._db.getAllIds();
        for (const id of ids) {
            let obj = this._db.load(id);
            if (obj) await this._updateCache(id, obj);
        }
    }

    private getHash(obj: T): string {
        let data = this._getHashStr(obj);
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    private async _updateCache(id: string, obj: T) {
        if (!AI.isEnabled) return;
        if (!AI.embedModel) return;
        let hash = this.getHash(obj);
        this._lastHash[id] = hash;
        let future = new Deferred();
        setTimeout(async () => {
            try {
                await this._calcCacheInner(id, obj, hash);
            } catch { future.reject(); }
            future.resolve();
        }, 1000);
        await future;
    }

    private async _calcCacheInner(id: string, obj: T, hash: string) {
        if ((this._lastHash[id] ?? '') !== hash) return;
        let cache = this._cache.keys[id];
        let match = cache?.checksum ?? '';
        if (match === hash) return;
        let input = this._getText(obj);
        let response = await AI.embed(AI.embedModel!, input);
        if ((this._lastHash[id] ?? '') !== hash) return;
        this._cache.keys[id] = {
            checksum: hash,
            vector: normalize(response),
        }
        await this._flushCache();
    }

    private async _flushCache() {
        let flat = JSON.stringify(this._cache);
        await fs.promises.writeFile(this._cacheFile, flat);
    }

    public async vectorSearch(input: string): Promise<string[]> {
        if (!AI.embedModel) throw 'No embedding model configured';
        let vector = await AI.embed(AI.embedModel, input);
        vector = normalize(vector);
        type IResult = {
            id: string,
            similarity: number,
        };
        let results: IResult[] = [];
        for (const id in this._cache.keys) {
            let cache = this._cache.keys[id];
            let similarity = calculateCosineSimilarity(cache.vector, vector);
            if (similarity > .5)
                results.push({ id, similarity });
        }
        results.sort((a, b) => b.similarity- a.similarity);
        return results.map(r => r.id);
    }
}

function normalize(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + Math.pow(value, 2), 0));

    if (norm === 0) return vector; // this seems basically impossible, but...

    return vector.map(value => value / norm);
}

function calculateCosineSimilarity(vector1: number[], vector2: number[]): number {
    let dotProduct = 0;
    let normVector1 = 0;
    let normVector2 = 0;

    for (let i = 0; i < vector1.length; i++) {
        dotProduct += vector1[i] * vector2[i];
        normVector1 += Math.pow(vector1[i], 2);
        normVector2 += Math.pow(vector2[i], 2);
    }

    normVector1 = Math.sqrt(normVector1);
    normVector2 = Math.sqrt(normVector2);

    if (normVector1 === 0 || normVector2 === 0) {
        return 0; // Vectors are zero vectors
    }

    return dotProduct / (normVector1 * normVector2);
};