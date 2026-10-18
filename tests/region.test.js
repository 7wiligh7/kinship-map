// 区域几何校验测试：spanKmOf / polyAreaKm2 / regionInvalidReason
// app.js 依赖浏览器全局（L、document、CONFIG），无法直接 require，
// 所以按名字把纯函数抽出来 eval，并用最小 L.latLngBounds 桩替代 Leaflet。
// CONFIG 取自真实 config.js，测试阈值与运行时不脱节。

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

// 最小 Leaflet 桩：只需要 LatLngBounds 的四个取边方法
var L = {
    latLngBounds: function (arr) {
        var n = -Infinity, s = Infinity, e = -Infinity, w = Infinity;
        arr.forEach(function (p) {
            if (p[0] > n) n = p[0];
            if (p[0] < s) s = p[0];
            if (p[1] > e) e = p[1];
            if (p[1] < w) w = p[1];
        });
        return {
            getNorth: function () { return n; },
            getSouth: function () { return s; },
            getEast: function () { return e; },
            getWest: function () { return w; }
        };
    }
};

eval(cfgSrc + '\nglobalThis.__CONFIG = CONFIG;');
var CONFIG = globalThis.__CONFIG;

eval(
    extract(appSrc, 'spanKmOf') + '\n' +
    extract(appSrc, 'polyAreaKm2') + '\n' +
    extract(appSrc, 'regionInvalidReason') + '\n' +
    'globalThis.__geo = { spanKmOf: spanKmOf, polyAreaKm2: polyAreaKm2, regionInvalidReason: regionInvalidReason };'
);
var geo = globalThis.__geo;

var pass = 0, fail = 0;

function ok(cond, msg) {
    if (cond) { pass++; }
    else { fail++; console.log('FAIL: ' + msg); }
}

function near(got, want, tol, msg) {
    ok(Math.abs(got - want) <= tol, msg + ' | got=' + got + ' want≈' + want);
}

function reasonIs(reason, frag, msg) {
    ok(reason && reason.indexOf(frag) >= 0, msg + ' | got=' + JSON.stringify(reason) + ' 期望包含=' + frag);
}

// ---- 跨度换算：纬度 1° ≈ 111km，经度按 cos(纬度) 折算 ----
var square = [[31.000, 111.000], [31.000, 111.018], [31.018, 111.018], [31.018, 111.000]];
near(geo.spanKmOf(square), 2.00, 0.02, '2km 见方：跨度按纬度维取 2km');
near(geo.spanKmOf(square), 2.00, 0.02, '2km 见方：经度维不应超过纬度维');

// ---- 面积：2km×约1.7km 的方框 ≈ 3.4km² ----
near(geo.polyAreaKm2(square), 3.43, 0.1, '2km 见方面积约 3.4km²');
var twice = [[31.000, 111.000], [31.000, 111.036], [31.036, 111.036], [31.036, 111.000]];
near(geo.polyAreaKm2(twice) / geo.polyAreaKm2(square), 4, 0.05, '两倍边长 → 四倍面积');

// ---- 合规判定 ----
var courtyard = [[31.0000, 111.0000], [31.0000, 111.0027], [31.0027, 111.0027], [31.0027, 111.0000]];
ok(geo.regionInvalidReason(square) === null, '正常村庄方框应合规');
ok(geo.regionInvalidReason(courtyard) === null, '约 0.3km 的小院应合规（大于下限阈值）');

// ---- 不合规拦截 ----
reasonIs(geo.regionInvalidReason([[31.000, 111.000], [31.000, 111.270], [31.270, 111.270]]), '超过上限',
    '30km 超限应被拦截');
reasonIs(geo.regionInvalidReason([[31.000, 111.000], [31.010, 111.010], [31.020, 111.020]]), '一条线上',
    '三点共线应被拦截');
reasonIs(geo.regionInvalidReason([[31.000, 111.000], [31.0000, 111.0000], [31.0001, 111.0001]]), '重合',
    '顶点几乎重合应被拦截');
reasonIs(geo.regionInvalidReason([[31.000, 111.000], [31.010, 111.000], [31.000, 111.000]]), '一条线上',
    '闭合处重复点的退化多边形应被拦截');
reasonIs(geo.regionInvalidReason([[31.000, 111.000], [31.001, 111.001]]), '至少需要 3 个顶点',
    '少于 3 顶点应被拦截');

// ---- 阈值来自 config，改配置即改判定 ----
ok(CONFIG.REGION_MAX_SPAN_KM === 20, 'config 默认上限仍是 20km');
ok(CONFIG.REGION_MIN_SPAN_KM > 0 && CONFIG.REGION_MIN_AREA_KM2 > 0, '下限阈值已提到 config');

console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);