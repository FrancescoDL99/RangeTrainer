// Incrementa questo numero ogni volta che modifichi i file per forzare l'aggiornamento cache
const CACHE_VERSION = 'v9';
const CACHE_NAME = `rangetrainer-${CACHE_VERSION}`;

// Elenco dei file da salvare in cache per l'uso offline
const FILES_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/timer.js',
  './js/exercises.js',
  './js/stage-designer.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/db.js',
  './js/stats.js'
];

// Installazione: salva tutti i file in cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Attivazione: elimina le cache vecchie (versioni precedenti)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercetta le richieste: prova prima la cache, poi la rete
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // Risorsa non trovata (es. icona mancante): risposta vuota
        // invece di un errore in console
        return new Response('', { status: 404, statusText: 'Not found' });
      });
    })
  );
});
