/* 健身打卡 Service Worker — 离线缓存应用外壳 */
var CACHE = "fitness-checkin-v40";
var SHELL = [
  "index.html",
  "css/style.css",
  "js/cloud-config.js",
  "js/cloud.js",
  "js/social.js",
  "js/calc.js",
  "js/app.js",
  "manifest.json",
  "icon.svg"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  var isHtml = e.request.mode === "navigate" || url.pathname.endsWith("index.html") || url.pathname.endsWith("/");
  // 配置走网络优先：用户填完 CloudBase 环境 ID 后刷新即生效（离线回退缓存），
  // 否则「改了配置却一直读到旧值」会让人查半天。
  var isConfig = url.pathname.endsWith("js/cloud-config.js");
  // 首页走网络优先：刷新即拿最新版（离线时回退缓存）
  if (isHtml || isConfig) {
    var fallbackKey = isHtml ? "index.html" : "js/cloud-config.js";
    e.respondWith(
      fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () { return caches.match(e.request).then(function (r) { return r || caches.match(fallbackKey); }); })
    );
    return;
  }
  // 静态资源：缓存优先（已加 ?v 版本参数，版本变更即拉新）
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () { return cached; });
    })
  );
});
