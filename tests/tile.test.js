// 瓦片层选项测试：tileOpts 必须把 config.js 的 TILE 配置原样映射到 Leaflet 选项。
// 目的：防止以后改 config 却忘了在 app.js 里接上（例如 MAX_NATIVE_ZOOM 形同虚设）。
// app.js 依赖浏览器全局，这里只按名字抽出纯函数 tileOpts。

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
var cfgSrc = fs.readFileSync(path.join(root, 'config.js'), 'utf8');

function extract(src, name) {
    var i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('app.js 中找不到函数 ' + name);
    var depth = 0, started = false, j = i;
    for (; j < src.length; j++) {
        if (src[j] === '{') { depth++; started = true; }
        else if (src[j] === '}') { depth--; if (started && depth === 0) { j++; break; } }
    }
    return src.slice(i, j);
}

eval(cfgSrc + '\nglobalThis.__CONFIG = CONFIG;');
var CONFIG = globalThis.__CONFIG;

eval(
    extract(appSrc, 'tileOpts') + '\n' +
    'globalThis.__tileOpts = tileOpts;'
);
var tileOpts = globalThis.__tileOpts;

var pass = 0, fail = 0;

function ok(cond, msg) {
    if (cond) { pass++; }
    else { fail++; console.log('FAIL: ' + msg); }
}

function eq(got, want, msg) {
    ok(got === want, msg + ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
}

// ---- 默认选项来自 CONFIG ----
var o = tileOpts();

eq(o.maxZoom, CONFIG.MAX_ZOOM, 'maxZoom 应取 CONFIG.MAX_ZOOM');
eq(o.maxNativeZoom, CONFIG.TILE.MAX_NATIVE_ZOOM, 'maxNativeZoom 应取 CONFIG.TILE.MAX_NATIVE_ZOOM');
eq(o.keepBuffer, CONFIG.TILE.KEEP_BUFFER, 'keepBuffer 应取 CONFIG.TILE.KEEP_BUFFER');
eq(o.updateWhenIdle, CONFIG.TILE.UPDATE_WHEN_IDLE, 'updateWhenIdle 应取 CONFIG.TILE.UPDATE_WHEN_IDLE');
eq(o.errorTileUrl, CONFIG.TILE.ERROR_TILE, 'errorTileUrl 应取 CONFIG.TILE.ERROR_TILE');
eq(o.detectRetina, false, 'detectRetina 必须为 false（Esri 没有 @2x 瓦片）');

// ---- 统一 256px 原生瓦片：任何缩放级别都是同一套影像 ----
eq(o.tileSize, 256, '所有层级统一用 256px 原生瓦片');
eq(o.zoomOffset, undefined, '不应设置 zoomOffset（不做缩放偏移）');
eq(tileOpts({ tileSize: 512 }).tileSize, 512, '应允许显式覆盖 tileSize');

// ---- 数值合理性 ----
ok(o.maxNativeZoom <= o.maxZoom, 'maxNativeZoom 不能高于 maxZoom，否则永远不生效');
ok(o.keepBuffer >= 0 && o.keepBuffer <= 6, 'keepBuffer 不合理: ' + o.keepBuffer);
ok(o.errorTileUrl.indexOf('data:image/gif') === 0, 'errorTileUrl 应是内联透明图（避免额外请求）');
ok(CONFIG.TILE.CACHE_MAX > 0, 'CACHE_MAX 必须为正数');

// ---- 覆盖项（本地瓦片层用 zIndex / minZoom） ----
var local = tileOpts({ zIndex: 0, minZoom: CONFIG.MIN_ZOOM });
eq(local.zIndex, 0, '应允许覆盖 zIndex');
eq(local.minZoom, CONFIG.MIN_ZOOM, '应允许覆盖 minZoom');
eq(local.maxNativeZoom, o.maxNativeZoom, '覆盖项不应丢掉默认值');

// ---- 缓存开关与上限 ----
var cacheOn = CONFIG.TILE.CACHE !== false;
ok(typeof cacheOn === 'boolean', 'CACHE 应可判定为布尔语义');
if (!cacheOn) {
    console.log('提示：config.js 里 TILE.CACHE = false，落盘缓存已关闭');
}

console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);