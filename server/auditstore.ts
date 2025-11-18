import { DocStore } from "./docstore";


export class AuditStore<T> {
    _db: DocStore<T>;
    public constructor(name: string){
        this._db = new DocStore("data", name);
    }
    public log(baseId: string, logData: T): void{
        this._db.saveOverwriteSync(this.makeId(baseId), logData);
    }
    private makeId(baseId: string): string{
        return baseId + "~" + Date.now().toString();
    }
    private parseId(id: string): string{
        return id.split("~")[0] ?? '';
    }

    public async searchForHistory(baseId: string): Promise<T[]>{
        let arr: T[] = [];
        let ids = (await this._db.getAllIds())
            .filter(id => baseId === "" || this.parseId(id) === baseId);
        for(let id of ids){
            let obj = await this._db.loadAsync(id);
            if(obj) arr.push(obj);
        }
        return arr;
    }
}