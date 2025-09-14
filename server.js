const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 6464;

app.use(express.static(path.join(__dirname, 'dist')));

// fallback to index.html for SPA routing
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/config', (req, res) => {
    let type = process.env.ASR_TYPE;
    res.status(200).json({
        ASR: (type != ""),
    });
});

app.post('/v1/asr', async (req, res) => {
    let type = process.env.ASR_TYPE;
    let baseUrl = process.env.ASR_URL;
    if (type == '') {
        res.status(501).json({ error: 'ASR_TYPE not configured' });
        return;
    }
    if (baseUrl == '') {
        res.status(502).json({ error: 'ASR_URL not configured' });
        return;
    }

    if (type.toUpperCase() == 'WHISPER-ASR') {
        let url = appendPathToUrl(baseUrl, 'asr');
        url.search = 'output=json';
        try {
            const { userInput } = req.body;

            const response = await axios.post(url, {
                data: userInput
            });

            res.status(200).json(response.data);

        } catch (error) {
            console.error('Error making external call:', error.message);
            res.status(500).json({ error: error.message });
        }
        checkCors(res);
    }
    else {
        res.status(501).json({ error: 'Invalid ASR_TYPE' });
    }
});

function checkCors(res) {
    if (process.env.ADD_CORS) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }
}


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});


function appendPathToUrl(base, segment) {
    const url = new URL(base);
    if (segment.startsWith('/')) segment = segment.substring(1);
    // Ensure no double slashes or missing slashes
    url.pathname = `${url.pathname.replace(/\/$/, '')}/${segment}`;
    return url;
}