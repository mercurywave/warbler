import { Request, Response } from 'express';
import jsonfile from 'jsonfile';
import { util } from './util';

interface IStaticCache{
    version: number;
    uniqueId: string;
}

const CACHE_FILE_PATH = "./data/static";
let __cache: IStaticCache | null = null;

try{
    __cache = jsonfile.readFileSync(CACHE_FILE_PATH);
} catch {
    __cache = {
        version: 1,
        uniqueId: util.UUID(),
    }
    jsonfile.writeFileSync(CACHE_FILE_PATH, __cache);
}

if(!__cache!.uniqueId) throw `${CACHE_FILE_PATH} has become corrupted, or failed to save`;

export async function apiGetConfig(req: Request, res:Response): Promise<void> {
    let type = process.env.ASR_TYPE;
    res.status(200).json({
        version: __cache!.version,
        uniqueId: __cache!.uniqueId,
        ASR: (type != ""),
    });
}