import express, { Request, Response } from 'express';

export async function apiGetConfig(req: Request, res:Response): Promise<void> {
    let type = process.env.ASR_TYPE;
    res.status(200).json({
        ASR: (type != ""),
    });
}