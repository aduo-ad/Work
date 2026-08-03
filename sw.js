const CACHE_NAME = 'qiuzhao-v4';
const ASSETS = [
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// 安装：缓存核心资源
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 激活：清理旧缓存 + 立即接管
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 拦截请求：网络优先，失败时用缓存
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        // 网络成功 → 更新缓存（只缓存同源资源）
        if (resp.ok && e.request.url.startsWith(self.location.origin)) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => {
        // 网络失败 → 尝试缓存
        return caches.match(e.request);
      })
  );
});
