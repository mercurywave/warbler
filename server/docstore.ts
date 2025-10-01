import path, { basename } from "path";
import fs, { stat } from "fs";
import { Broadcaster, Deferred, util } from "@shared/util";

export class DocStore<T> {
    private _path: string;
    private _subFolder: string;
    private _evUpdater: Broadcaster<[string, T]> = new Broadcaster();
    public constructor(folder: string, subFolder: string) {
        this._path = path.join(folder, subFolder);
        this._subFolder = subFolder;

        if (!fs.existsSync(this._path)) {
            fs.mkdirSync(this._path);
        }
    }

    private _getFile(id: string) {
        return path.join(this._path, `${id}.json`);
    }

    public registerIndex(handler: (id: string, obj: T) => void) {
        this._evUpdater.hook(e => handler(e[0], e[1]));
    }

    public saveMerge<U>(id: string, handler: (curr?: T) => [toWrite: T, diff: U]): [T, U] {
        let file = this._getFile(id);
        let curr: T | undefined = undefined;
        // Technically there is still a race condition possible as the merge runs
        // That only matters if you use this for some sort of multi-user worfklow
        // So I'm calling this a rainy-day project and moving on.
        if (fs.existsSync(file)) {
            try {
                curr = JSON.parse(fs.readFileSync(file) as any);
            } catch (e) {
                console.log(id);
                console.error(e);
                curr = undefined;
            }
        }
        try {
            let [output, diff] = handler(curr);
            fs.writeFileSync(file, JSON.stringify(output));
            setTimeout(() => this._evUpdater.trigger([id, output]));
            return [output, diff];
        } catch (e) {
            console.log(id);
            console.error(e);
            throw e;
        }
    }

    public saveOverwriteSync(id: string, obj: T){
        let file = this._getFile(id);
        fs.writeFileSync(file, JSON.stringify(obj));
    }

    public load(id: string): T | null {
        let file = this._getFile(id);
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file) as any);
        }
        return null;
    }

    public async loadAsync(id: string): Promise<T | null> {
        let file = this._getFile(id);
        if (fs.existsSync(file)) {
            let found: Deferred<string> = new Deferred();
            fs.readFile(file, (err, data) => {
                if (err) throw err;
                found.resolve(data as any);
            })
            return JSON.parse(await found);
        }
        return null;
    }

    async getAllFileNames(): Promise<string[]> {
        let files = await fs.promises.readdir(this._path);
        return files.map(file => {
            let ext = path.extname(file);
            let id = path.basename(file, ext);
            if (ext === '.json' && util.isGUID(id))
                return file;
            return null;
        }).filter(s => s != null);
    }

    public async getAllIds(): Promise<string[]> {
        let files = await this.getAllFileNames();
        return files.map(file => {
            let ext = path.extname(file);
            return path.basename(file, ext);
        });
    }

    public async findRecentIds(since: Date): Promise<string[]> {
        let timestamp = since.getTime();
        let allFiles = await this.getAllFileNames();
        let futures = allFiles.map(async file => {
            let ext = path.extname(file);
            let id = path.basename(file, ext);

            let stats = await fs.promises.stat(path.join(this._path, file));
            if (stats.mtimeMs > timestamp)
                return id;
            return null;
        });
        let result = await Promise.all(futures);
        return result.filter(s => s !== null);
    }

    public async search(include: (obj: T) => boolean): Promise<T[]> {
        // brute-force search
        let allFiles = await this.getAllFileNames();
        let futures = allFiles.map(async file => {
            let ext = path.extname(file);
            let id = path.basename(file, ext);

            try {
                let contents = await fs.promises.readFile(path.join(this._path, file));
                let obj = JSON.parse(contents as any) as T;
                if (include(obj))
                    return obj;
            } catch { }
            return null;
        });
        let result = await Promise.all(futures);
        return result.filter(s => s !== null);
    }
}