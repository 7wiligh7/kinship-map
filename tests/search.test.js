// 搜索源体检 / 分源超时 / 慢源征询 的一致性检查（静态断言，防回归）
// 背景：免 key 境外源在境内极慢（实测 Photon 首字节约 48 秒），
//       旧版 5 秒超时会把它直接掐掉，表现为"联网搜索用不了"。
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
var cfgSrc = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + msg); } }

/* 1) config：慢源超时要单独配，且明显大于普通超时 */
var tSlow = /TIMEOUT_SLOW:\s*(\d+)/.exec(cfgSrc);
var tFast = /TIMEOUT:\s*(\d+)/.exec(cfgSrc);
ok(!!tSlow, 'config.js 缺少 GEOCODE.TIMEOUT_SLOW');
ok(!!tFast, 'config.js 缺少 GEOCODE.TIMEOUT');
if (tSlow && tFast) {
    ok(+tSlow[1] > +tFast[1], 'TIMEOUT_SLOW 应大于 TIMEOUT（当前 ' + tSlow[1] + ' vs ' + tFast[1] + '）');
    ok(+tSlow[1] >= 30000, 'TIMEOUT_SLOW 至少 30 秒（境外慢源实测 ~48 秒）');
}

/* 2) 境外免 key 源必须标成 slow（走长超时 + 触发征询） */
['esri', 'nominatim', 'photon'].forEach(function (n) {
    var re = new RegExp('\\b' + n + ':\\s*\\{[^}]*slow:\\s*true');
    ok(re.test(appSrc), n + ' 应标记 slow: true');
});
['amap', 'tianditu'].forEach(function (n) {
    var m = new RegExp('\\b' + n + ':\\s*\\{([^}]*)\\}').exec(appSrc);
    ok(m && !/slow:\s*true/.test(m[1]), n + ' 是国内源，不应标 slow');
});

/* 3) 关键函数齐备 */
['askSlowConsent', 'runGeoProviders', 'probeSources', 'geoProbe', 'geoProbeSave',
 'runSourceCheck', 'geoProbeHtml'].forEach(function (fn) {
    ok(new RegExp('function\\s+' + fn + '\\s*\\(').test(appSrc), '缺少函数 ' + fn);
});

/* 4) fetchJson 支持传入超时；各 provider 接受 tmo 并透传 */
ok(/function fetchJson\(url,\s*ms\)/.test(appSrc), 'fetchJson 应支持传入超时 ms');
['geocodeEsri', 'geocodeNominatim', 'geocodeAmap', 'geocodePhoton', 'geocodeTianditu'].forEach(function (fn) {
    ok(new RegExp('function\\s+' + fn + '\\(q,\\s*tmo\\)').test(appSrc), fn + ' 应接受 tmo 参数');
});
var fetchCalls = (appSrc.match(/fetchJson\(url,\s*tmo\)/g) || []).length;
ok(fetchCalls >= 5, '慢源超时需透传给各 provider（当前透传 ' + fetchCalls + ' 处）');

/* 5) 慢源征询：只在"只剩慢源"时问，且会话内只问一次 */
ok(/onlySlow/.test(appSrc), '缺少 onlySlow 判断');
ok(/state\._slowOk/.test(appSrc), '缺少会话内不再重复询问的标记 state._slowOk');

/* 6) 失败提示按原因分流 */
ok(/kind\s*=\s*'timeout'/.test(appSrc), '缺少 timeout 类型归类');
ok(/kind\s*=\s*'network'/.test(appSrc), '缺少 network 类型归类');
ok(/搜索源响应超时/.test(appSrc), '错误提示缺少"超时"分类文案');
ok(/连不上搜索源/.test(appSrc), '错误提示缺少"连不上"分类文案');

/* 7) 版本同步：index.html 的 ?v= 必须与 config.js 的 BUILD 一致
 *    （geocode.js 未改动，指纹保持旧值，单独放行） */
var build = /BUILD:\s*'([\d.]+)'/.exec(cfgSrc);
ok(!!build, 'config.js 缺少 BUILD');
if (build) {
    var ver = build[1];
    var tags = html.match(/<(script|link)[^>]*\?v=[\d.]+/g) || [];
    tags.forEach(function (tag) {
        if (/geocode\.js/.test(tag)) return; // 未改动，指纹故意保持旧值
        var v = /v=([\d.]+)/.exec(tag);
        ok(v && v[1] === ver, '版本不一致：' + tag + '（应为 v=' + ver + '）');
    });
    ok(new RegExp('构建\\s*' + ver.replace(/\./g, '\\.')).test(html), '页脚构建号与 BUILD 不一致');
}

console.log('pass=' + pass + ' fail=' + fail);
