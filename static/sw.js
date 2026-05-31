/**
 * DriveLegal Service Worker
 * Provides offline caching for static assets and API responses.
 */

const CACHE_NAME = "drivelegal-cache-v1";
const STATIC_ASSETS = [
    "/",
    "/static/index.html",
    "/static/css/styles.css",
    "/static/js/app.js",
];

const API_CACHE_NAME = "drivelegal-api-cache-v1";

// Install event: pre-cache static shell
self.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            console.log("[SW] Pre-caching static assets");
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate event: clean up old caches
self.addEventListener("activate", function (event) {
    event.waitUntil(
        caches.keys().then(function (cacheNames) {
            return Promise.all(
                cacheNames
                    .filter(function (name) {
                        return name !== CACHE_NAME && name !== API_CACHE_NAME;
                    })
                    .map(function (name) {
                        console.log("[SW] Deleting old cache:", name);
                        return caches.delete(name);
                    })
            );
        })
    );
    self.clients.claim();
});

// Fetch event: network-first for API, cache-first for static
self.addEventListener("fetch", function (event) {
    var url = new URL(event.request.url);

    // API requests: network-first with cache fallback
    if (url.pathname.startsWith("/api/")) {
        event.respondWith(
            fetch(event.request)
                .then(function (response) {
                    var cloned = response.clone();
                    caches.open(API_CACHE_NAME).then(function (cache) {
                        cache.put(event.request, cloned);
                    });
                    return response;
                })
                .catch(function () {
                    return caches.match(event.request);
                })
        );
        return;
    }

    // Static assets: cache-first with network fallback
    event.respondWith(
        caches.match(event.request).then(function (cachedResponse) {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then(function (response) {
                if (response && response.status === 200) {
                    var cloned = response.clone();
                    caches.open(CACHE_NAME).then(function (cache) {
                        cache.put(event.request, cloned);
                    });
                }
                return response;
            });
        })
    );
});
