const CACHE_NAME = 'warbler-sw-cache-v1';
const SCRIPTS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './app.bundle.js',
    './favicon.ico',
    './site.webmanifest',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(SCRIPTS_TO_CACHE);
            })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                console.log("No response:", event.request);
                return fetch(event.request);
            })
    );
});