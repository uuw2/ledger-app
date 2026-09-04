/* 简洁记账 Service Worker - 离线缓存 */
const CACHE_NAME = 'ledger-cache-v10';
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-180.svg',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

// 安装：预缓存核心资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(() => {
        // 部分加载失败也无妨
        return Promise.all(PRECACHE_URLS.map(url =>
          cache.add(url).catch(() => {})
        ));
      }))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// 拦截请求：Network First 策略（优先网络，确保拿到最新文件，离线时回退缓存）
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 只缓存同域

  event.respondWith(
    fetch(req).then(resp => {
      // 网络成功：缓存最新版本并返回
      if (resp && resp.status === 200 && resp.type === 'basic') {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
      }
      return resp;
    }).catch(() => {
      // 网络失败：从缓存取
      return caches.match(req).then(cached => {
        if (cached) return cached;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
