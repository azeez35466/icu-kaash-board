const CACHE='kaash-shell38';
const ASSETS=['/','/index.html','/production.js','/offline38.js','/backup-tools.js','/clinical-ui34.js','/concurrency30.js','/employee-login.js','/workflow26.js','/kardex-layout36.js','/kardex-layout36.css','/kardex-print35.css','/theme34.css','/manifest.webmanifest','/taif-logo.jpg'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS.map(path=>new Request(path,{cache:'reload'})));})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('kaash-shell')&&name!==CACHE)await caches.delete(name);await self.clients.claim();})()));
// No API responses, tokens, clinical records or third-party requests are cached.
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!ASSETS.includes(url.pathname)||url.search)return;event.respondWith(fetch(event.request).catch(async()=>{const cached=await caches.match(url.pathname);return cached||Response.error();}));});
