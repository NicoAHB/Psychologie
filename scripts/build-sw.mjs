import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';

// A project Pages site lives below /Psychologie/, while local development uses /.
const base = process.env.VITE_BASE_PATH || '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('VITE_BASE_PATH must be an absolute directory path ending with /.');
const assets = (await readdir('dist/assets')).sort().map(name => `${base}assets/${name}`);
const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'));
Object.assign(manifest, { id: base, start_url: base, scope: base });
manifest.icons = manifest.icons.map(icon => ({ ...icon, src: `${base}${icon.src.split('/').pop()}` }));
await writeFile('dist/manifest.webmanifest', JSON.stringify(manifest, null, 2) + '\n');
const runtime = assets.filter(path => /\.ttf$/.test(path) && !/\/DejaVuSans-Base-/.test(path));
const paths = [base, `${base}index.html`, `${base}theme-init.js`, `${base}manifest.webmanifest`, `${base}icon.svg`, `${base}icon-192.png`, `${base}icon-512.png`, `${base}speech/pcm.worklet.js`, ...assets.filter(path => !runtime.includes(path))];
const hash = createHash('sha256').update(base);
for (const path of [...paths, ...runtime].filter(path => path !== base)) hash.update(await readFile(`dist/${path.slice(base.length)}`));
const prefix = `praxisraum:${base}:`;
const version = prefix + hash.digest('hex').slice(0, 20);
await writeFile('dist/sw.js', `const CACHE_PREFIX = ${JSON.stringify(prefix)};
const CACHE = ${JSON.stringify(version)};
const RUNTIME = CACHE + ':runtime';
const OPTIONAL = ${JSON.stringify(runtime)};
const NAVIGATION = ${JSON.stringify(`${base}index.html`)};
const FILES = ${JSON.stringify(paths)};
const SPEECH_CACHE = ${JSON.stringify(`praxisraum-speech:${base}:whisper-tiny-v1`)};
const SPEECH_PATH = ${JSON.stringify(`${base}speech/whisper-tiny-v1/`)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE && key !== RUNTIME).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate' && url.pathname.startsWith(${JSON.stringify(base)})) {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match(NAVIGATION))));
  } else if (FILES.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname, { ignoreVary: true }).then(cached => cached || fetch(event.request))));
  } else if (url.pathname.startsWith(SPEECH_PATH) && !url.search) {
    // Only an explicit download in the UI fills this independent public-model cache.
    // Keep it across app updates; it never contains microphone audio or transcripts.
    event.respondWith(caches.open(SPEECH_CACHE).then(cache => cache.match(event.request).then(cached => cached || fetch(event.request))));
  } else if (OPTIONAL.includes(url.pathname) && !url.search) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME); const cached = await cache.match(url.pathname);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok && response.type === 'basic') await cache.put(url.pathname, response.clone()).catch(() => {});
      return response;
    })());
  }
});\n`);
