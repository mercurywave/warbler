const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 6464;

app.use(express.static(path.join(__dirname, 'dist')));

// fallback to index.html for SPA routing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/healthcheck', (req, res) => {
  res.status(200).end();
});

app.get('/v1/api', (req, res) => {
  res.send(`TODO: delete me`);
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});