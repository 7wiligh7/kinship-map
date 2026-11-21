// 亲属关系地图 — 瓦片落盘缓存（IndexedDB）
// 独立模块：只依赖 CONFIG（config.js），不碰地图与 DOM，node 可 require 测试。
// 键 = 瓦片 URL，值 = { blob, used }；超过 CACHE_MAX 片时按最久未用淘汰。
// 取不到/不可用（隐私模式、file:// 受限）时静默降级为纯网络加载。
var TileCache = (function () {
    var DB_NAME = 'kinmap_tiles';
    var STORE = 'tiles';
    var MAX = CONFIG.TILE.CACHE_MAX || 6000;
    var enabled = CONFIG.TILE.CACHE !== false &&
        typeof indexedDB !== 'undefined' && !!window.indexedDB;
    var dbPromise = null;
    var writes = 0;

    function openDb() {
        if (!enabled) return Promise.reject(new Error('cache disabled'));
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            var req;
            try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    var os = db.createObjectStore(STORE);
                    os.createIndex('used', 'used');
                }
            };
            req.onsuccess = function () {
                var db = req.result;
                var pending = null;
                // 缓存换代：CACHE_EPOCH 变了就整库清空。
                // 瓦片按 URL 永久缓存，而 Esri 会不定期更新影像——
                // 旧缓存里的过时图和新拉的网络图混在一起，画面会变成"拼花"。
                // 以后再遇到拼花，把 config.js 里的 CACHE_EPOCH +1 即可强制全部刷新。
                try {
                    var ep = String(CONFIG.TILE.CACHE_EPOCH || 1);
                    if (localStorage.getItem('kinmap_tiles_epoch') !== ep) {
                        var tx = db.transaction(STORE, 'readwrite');
                        tx.objectStore(STORE).clear();
                        pending = new Promise(function (res) {
                            tx.oncomplete = res; tx.onerror = res; tx.onabort = res;
                        });
                        try { localStorage.setItem('kinmap_tiles_epoch', ep); } catch (e2) {}
                    }
                } catch (e) {}
                (pending || Promise.resolve()).then(function () { resolve(db); });
            };
            req.onerror = function () { reject(req.error || new Error('idb error')); };
            req.onblocked = function () { reject(new Error('idb blocked')); };
        });
        return dbPromise;
    }

    function store(mode) {
        return openDb().then(function (db) {
            return db.transaction(STORE, mode).objectStore(STORE);
        });
    }

    function get(url) {
        if (!enabled) return Promise.resolve(null);
        return store('readonly').then(function (os) {
            return new Promise(function (resolve) {
                var req = os.get(url);
                req.onsuccess = function () { resolve(req.result || null); };
                req.onerror = function () { resolve(null); };
            });
        }).catch(function () { return null; });
    }

    function put(url, blob) {
        if (!enabled) return;
        store('readwrite').then(function (os) {
            os.put({ blob: blob, used: Date.now() }, url);
        }).catch(function () {});
        if (++writes % 200 === 0) prune();
    }

    // 预热：已缓存就跳过，否则后台下载并落盘（用于预取放大后要用的瓦片）
    function warm(url) {
        if (!enabled) return;
        get(url).then(function (rec) {
            if (rec && rec.blob) return;
            fetch(url, { mode: 'cors', credentials: 'omit' })
                .then(function (res) { return res.ok ? res.blob() : null; })
                .then(function (blob) { if (blob) put(url, blob); })
                .catch(function () {});
        });
    }

    // 粗粒度清理：保留最近使用的约 70%
    function prune() {
        store('readwrite').then(function (os) {
            var countReq = os.count();
            countReq.onsuccess = function () {
                var total = countReq.result;
                if (total <= MAX) return;
                var drop = total - Math.floor(MAX * 0.7);
                var cursorReq = os.index('used').openCursor();
                cursorReq.onsuccess = function () {
                    var cur = cursorReq.result;
                    if (!cur || drop <= 0) return;
                    cur.delete();
                    drop--;
                    cur.continue();
                };
            };
        }).catch(function () {});
    }

    return { available: enabled, get: get, put: put, warm: warm };
})();

(typeof module !== 'undefined' && module.exports) && (module.exports = TileCache);
