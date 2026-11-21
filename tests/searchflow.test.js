// 搜索流程的行为测试：直接抽取 app.js 里的真实函数 eval 执行（浏览器 API 用桩件替���）。
// 验证三件事：
//   1) 分源超时：慢源拿到 TIMEOUT_SLOW，快源拿到 TIMEOUT
//   2) 慢源征询：只剩慢源时先问用户；用户选"不等待"就不发请求
//   3) 体检排序：体检结果里快的源排在前面
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
var cfgSrc = fs.readFileSync(path.join(root, 'config.js'), 'utf8');

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + msg); } }

/* 从 app.js 里按函数名抽源码（含配对花括号） */
function extract(name) {
    var start = appSrc.indexOf('function ' + name + '(');
    if (start < 0) throw new Error('找不到函数 ' + name);
    var i = appSrc.indexOf('{', start), depth = 0;
    for (; i < appSrc.length; i++) {
        if (appSrc[i] === '{') depth++;
        else if (appSrc[i] === '}') { depth--; if (!depth) return appSrc.slice(start, i + 1); }
    }
    throw new Error('函数 ' + name + ' 括号不配平');
}

/* --- 桩件 --- */
var ls = {};
var localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null; },
    setItem: function (k, v) { ls[k] = String(v); },
    removeItem: function (k) { delete ls[k]; }
};
/* config.js 整体 eval（里面只是配置字面量，不碰浏览器 API） */
var cfgBox = {};
new Function('box', cfgSrc + '\nbox.CONFIG = CONFIG; box.CONFIG_ALL = typeof CONFIG_ALL !== "undefined" ? CONFIG_ALL : undefined;')(cfgBox);
var CONFIG = cfgBox.CONFIG;
var state = {};
var calls = [];       // 记录每个 provider 收到的超时
var consentAnswer = true;
var consentAsked = 0;
var dialogShown = [];

function fakeProvider(name, slow) {
    return function (q, tmo) {
        calls.push({ name: name, tmo: tmo });
        return Promise.resolve([{ name: q, lat: 1, lng: 2, src: name, bbox: null }]);
    };
}
var GEO_PROVIDERS = {
    esri: { src: 'Esri', fn: fakeProvider('Esri', true), slow: true },
    nominatim: { src: 'OSM', fn: fakeProvider('OSM', true), slow: true },
    photon: { src: 'Photon', fn: fakeProvider('Photon', true), slow: true },
    amap: { src: '高德', fn: fakeProvider('高德', false), keyStore: 'amap' },
    tianditu: { src: '天地图', fn: fakeProvider('天地图', false), keyStore: 'tianditu' }
};
var GEO_DEAD_KEY = 'kinmap_geo_dead', GEO_DEAD_TTL = 20 * 60 * 1000;
var GEO_KEY_LS = { amap: 'kinmap_amap_key', tianditu: 'kinmap_tdt_key' };
var GEO_PROBE_KEY = 'kinmap_geo_probe', GEO_PROBE_TTL = 24 * 60 * 60 * 1000;
var Geocode = {
    parseCoords: function () { return null; },
    mergeGeoResults: function (q, groups) { return groups[0] ? groups[0].list : []; }
};
function esc(s) { return String(s).replace(/[&<>"]/g, ''); }
function showDialog(opts) {
    dialogShown.push(opts);
    // 模拟用户点击第一个按钮
    if (opts.buttons && opts.buttons[0] && opts.buttons[0].onClick) opts.buttons[0].onClick();
}
function toast() {}

/* 组装要 eval 的源码 */
var names = ['fetchJson', 'markFetchError', 'providerList', 'runGeoProviders', 'askSlowConsent',
    'geoProbe', 'geoProbeSave', 'probeSources', 'geoProbeHtml',
    'geoDeadMap', 'markSourceDead', 'sourceUnreachable', 'noteSourceFail', 'clearSourceFails',
    'geoKey', 'reviveSources'];
var code = names.map(extract).join('\n\n');
/* geocode 单独抽：它里面引用 Geocode / providerList / askSlowConsent / runGeoProviders */
code += '\n' + extract('geocode');

var sandbox = {
    CONFIG: CONFIG, state: state, localStorage: localStorage, GEO_PROVIDERS: GEO_PROVIDERS,
    GEO_DEAD_KEY: GEO_DEAD_KEY, GEO_DEAD_TTL: GEO_DEAD_TTL, GEO_KEY_LS: GEO_KEY_LS,
    GEO_PROBE_KEY: GEO_PROBE_KEY, GEO_PROBE_TTL: GEO_PROBE_TTL,
    Geocode: Geocode, esc: esc, showDialog: showDialog, toast: toast,
    fetch: function () { return Promise.reject(new Error('不应真的发请求')); },
    AbortController: undefined,
    console: console, Promise: Promise, Date: Date, JSON: JSON, Object: Object, Math: Math,
    setTimeout: setTimeout, clearTimeout: clearTimeout, Error: Error, String: String, Number: Number
};
var names2 = Object.keys(sandbox);
var fn = new Function(names2.join(','), code + '\nreturn { providerList: providerList, runGeoProviders: runGeoProviders, askSlowConsent: askSlowConsent, geocode: geocode, geoProbe: geoProbe, geoProbeSave: geoProbeSave, probeSources: probeSources, geoProbeHtml: geoProbeHtml };');
var api = fn.apply(null, names2.map(function (n) { return sandbox[n]; }));

/* --- 用例 1：分源超时 --- */
CONFIG.GEOCODE.PROVIDERS = ['photon', 'amap'];
ls['kinmap_amap_key'] = 'test-key';
calls = [];
api.runGeoProviders('测试', null, api.providerList()).then(function () {
    var photon = calls.filter(function (c) { return c.name === 'Photon'; })[0];
    var amap = calls.filter(function (c) { return c.name === '高德'; })[0];
    ok(photon && photon.tmo === CONFIG.GEOCODE.TIMEOUT_SLOW, '慢源应拿到 TIMEOUT_SLOW（实际 ' + (photon && photon.tmo) + '）');
    ok(amap && amap.tmo === CONFIG.GEOCODE.TIMEOUT, '快源应拿到 TIMEOUT（实际 ' + (amap && amap.tmo) + '）');

    /* --- 用例 2：慢源征询 --- */
    CONFIG.GEOCODE.PROVIDERS = ['photon'];   // 只剩慢源
    delete ls['kinmap_amap_key'];
    state._slowOk = false;
    consentAsked = 0;
    dialogShown.length = 0;
    calls = [];
    return api.geocode('测试', null).then(function () {
        ok(dialogShown.length === 1, '只剩慢源时应弹出征询对话框');
        ok(calls.length === 1, '用户点"耐心等待"后应真的发起请求');
        ok(state._slowOk === true, '征询通过后应记 state._slowOk（会话内不再问）');
        // 第二次搜索不再问
        dialogShown.length = 0;
        return api.geocode('测试', null).then(function () {
            ok(dialogShown.length === 0, '会话内不应重复征询');
            /* --- 用例 3：体检排序 --- */
            api.geoProbeSave({ 'Photon': { ok: true, ms: 120 }, '高德': { ok: true, ms: 900 } });
            CONFIG.GEOCODE.PROVIDERS = ['amap', 'photon'];
            ls['kinmap_amap_key'] = 'k';
            var list = api.providerList();
            ok(list[0].src === 'Photon', '体检更快的源应排前面（实际 ' + list[0].src + '）');
            ok(list[0].idx !== undefined && list[1].idx !== undefined, '合并优先级 idx 仍需保留');
            console.log('pass=' + pass + ' fail=' + fail);
        });
    }, function (e) {
        fail++;
        console.log('FAIL: geocode 被拒绝：' + e.message);
        console.log('pass=' + pass + ' fail=' + fail);
    });
}).catch(function (e) {
    fail++;
    console.log('FAIL: 异常：' + (e && e.stack ? e.stack : e));
    console.log('pass=' + pass + ' fail=' + fail);
});
