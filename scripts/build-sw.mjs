import { readdir, writeFile } from 'node:fs/promises';
const assets = (await readdir('dist/assets')).map(name => '/assets/' + name);
const paths = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', ...assets];
const version = 'praxisraum-' + assets.join('|').replaceAll(/[^a-zA-Z0-9]/g, '').slice(-80);
await writeFile('dist/sw.js', `const CACHE = ${JSON.stringify(version)};
const FILES = ${JSON.stringify(paths)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('praxisraum-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match('/index.html'))));
  } else if (FILES.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname, { ignoreVary: true }).then(cached => cached || fetch(event.request))));
  }
});\n`);
