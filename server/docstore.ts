import path, { basename } from "path";
import fs, { stat } from "fs";
import { Deferred, util } from "@shared/util";

export class DocStore<T> {
    private _path: string;
    private _subFolder: string;
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
            return [output, diff];
        } catch (e) {
            console.log(id);
            console.error(e);
            throw e;
        }
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
            if (ext.toUpperCase() === '.JSON' && util.isGUID(id))
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
        let allIds = await this.getAllFileNames();
        let futures = allIds.map(async file => {
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
}