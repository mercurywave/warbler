import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import path from "path";
import https from "https";
import fs from "fs";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import { apiGetConfig } from "./config";
import { NoteApis } from "./notes";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 6464;
const upload = multer();

if (!process.env.ENABLE_CORS) app.use(cors());

app.use(express.static(path.join(__dirname, '../dist')));
app.use(express.json());

if(!fs.existsSync("./data")){
    fs.mkdirSync("./data");
    console.log("data directory created");
}

// fallback to index.html for SPA routing
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

app.get('/v1/config', apiGetConfig);

app.get('/v1/recentNoteEdits', NoteApis.getRecentNoteEdits);

app.post('/v1/updateNotes', NoteApis.postUpdateNotes);

app.post('/v1/asr', upload.single('audio_file'), async (req, res) => {
    let type = process.env.ASR_TYPE;
    let baseUrl = process.env.ASR_URL;
    if (!type) {
        res.status(501).json({ error: 'ASR_TYPE not configured' });
        return;
    }
    if (!baseUrl) {
        res.status(502).json({ error: 'ASR_URL not configured' });
        return;
    }

    if (type.toUpperCase() == 'WHISPER-ASR') {
        let url = appendPathToUrl(baseUrl, 'asr');
        url.search = 'output=json';
        try {
            const audioBuffer = req.file!.buffer;
            const originalName = req.file!.originalname;
            const formData = new FormData();
            formData.append('audio_file', audioBuffer, originalName);

            const response = await axios.post(url.toString(), formData, {
                headers: formData.getHeaders(),
            });

            res.status(200).json(response.data);

        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('Error making external call:', error.message);
                res.status(500).json({ error: error.message });
            }
            else {
                console.error('Error making external call:', error);
                res.status(500).json({ error: error });
            }
        }
    }
    else {
        res.status(501).json({ error: 'Invalid ASR_TYPE' });
    }
});

if (process.env.ENABLE_HTTPS) {
    const serverOptions = {
        cert: fs.readFileSync('/certs/cert.pem'),
        key: fs.readFileSync('/certs/key.pem'),
    };
    https.createServer(serverOptions, app).listen(PORT, () => {
        console.log(`Server running on https://localhost:${PORT}`);
    });
}
else {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

function appendPathToUrl(base: string, segment: string): URL {
    const url = new URL(base);
    if (segment.startsWith('/')) segment = segment.substring(1);
    // Ensure no double slashes or missing slashes
    url.pathname = `${url.pathname.replace(/\/$/, '')}/${segment}`;
    return url;
}