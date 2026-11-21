// 亲缘称谓换算主引擎：mumuy/relationship（MIT，见 vendor/relationship/）
// kinship.js 的 BFS 负责沿人物关系图找出「我 → 对方」的完整关系链，
// 真正的称谓换算交给 relationship.js；本地规则只用于直接关系、候选集里的
// 家族叫法，以及 relationship.js 不认识的词（如表亲）的兜底。
var KinshipExternal = (function (global) {
    'use strict';

    var installed = false;
    var titleCache = {};
    var chainCache = {};

    function hasOwn(obj, key) {
        return Object.prototype.hasOwnProperty.call(obj, key);
    }

    function rel() {
        return typeof global.relationship === 'function' ? global.relationship : null;
    }

    // relationship.js 有时会把「孙子的堂兄弟」整段截成「孙子」：完整链和
    // 去掉最后一个词的前缀链完全相同，等于最后一步被丢掉。
    // 正常的同义简化（哥哥的哥哥→哥哥）也会让两条链相同，但此时最后一个词
    // 自己的链和前缀链也相同，说明它本来就等价，可以放行。
    function sameChain(a, b) {
        return JSON.stringify(a || []) === JSON.stringify(b || []);
    }

    function cacheFor(text) {
        var info = chainCache[text];
        if (!info) {
            info = { full: null, last: {} };
            chainCache[text] = info;
        }
        return info;
    }

    function chainOf(text) {
        var info = cacheFor(text);
        if (info.full === null) {
            var R = rel();
            try { info.full = (R && R({ text: text, type: 'chain' })) || []; }
            catch (e) { info.full = []; }
        }
        return info.full;
    }

    function lastChain(text, lastWord) {
        var info = cacheFor(text);
        if (!hasOwn(info.last, lastWord)) {
            var R = rel();
            try { info.last[lastWord] = (R && R({ text: lastWord, type: 'chain' })) || []; }
            catch (e) { info.last[lastWord] = []; }
        }
        return info.last[lastWord];
    }

    function chainNotTruncated(text, lastWord) {
        var full = chainOf(text);
        var parts = String(text).split('的');
        if (parts.length < 2) return true;
        var prefix = chainOf(parts.slice(0, parts.length - 1).join('的'));
        if (!sameChain(full, prefix)) return true;
        return sameChain(lastChain(text, lastWord), prefix);
    }

    // 「伯父/叔父」这类长幼未知的词拆成单条链分别问，再合并结果。
    // 最多展开 16 种，防止异常数据把组合数放大。
    function expandPath(path) {
        var out = [[]];
        path.forEach(function (word) {
            var parts = String(word).indexOf('/') < 0
                ? [String(word)]
                : [String(word)].concat(String(word).split('/'));
            parts = parts.filter(function (p) { return p && p.indexOf('/') < 0; });
            if (!parts.length) return;
            var next = [];
            out.forEach(function (prefix) {
                parts.forEach(function (part) { next.push(prefix.concat([part])); });
            });
            out = next.slice(0, 16);
        });
        return out;
    }

    // 单条链的称谓结果缓存：同一条链在首次渲染、互称、再次渲染时会反复用到。
    function titlesFor(text, sex) {
        var key = text + '|' + sex;
        if (hasOwn(titleCache, key)) return titleCache[key].slice();
        var R = rel();
        var out = [];
        if (R) {
            try {
                var titles = R({ text: text, sex: sex }) || [];
                titles.forEach(function (t) {
                    t = String(t == null ? '' : t).trim();
                    if (!t || t === '自己' || t === '我') return;
                    if (t.indexOf('的') >= 0) return; // 不要路径串
                    if (out.indexOf(t) < 0) out.push(t);
                });
            } catch (e) {
                out = [];
            }
        }
        titleCache[key] = out.slice();
        return out;
    }

    // path 是本项目 BFS 得到的关系词数组，如 ['父亲','堂兄弟']。
    // needGuard 缺省为 true；kinship.js 对已有正名的节点会传 false 省一次链式查询。
    function resolve(path, speakerGender, needGuard) {
        if (!rel() || !path || !path.length) return [];
        var sex = speakerGender === 'm' ? 1 : (speakerGender === 'f' ? 0 : -1);
        var guard = needGuard !== false;
        var out = [];
        expandPath(path).forEach(function (variant) {
            if (!variant.length) return;
            var text = variant.join('的');
            if (guard && !chainNotTruncated(text, variant[variant.length - 1])) return;
            titlesFor(text, sex).forEach(function (t) {
                if (out.indexOf(t) < 0) out.push(t);
            });
        });
        return out;
    }

    function install() {
        if (installed) return true;
        var K = global.Kinship;
        if (!K || typeof K.setExternalResolver !== 'function' || !rel()) return false;
        K.setExternalResolver(function (path, person, ego, needGuard) {
            return resolve(path, ego && ego.gender, needGuard);
        });
        installed = true;
        return true;
    }

    function reset() {
        var K = global.Kinship;
        if (K && typeof K.setExternalResolver === 'function') K.setExternalResolver(null);
        installed = false;
    }

    function clearCache() {
        titleCache = {};
        chainCache = {};
    }

    return {
        available: function () { return !!rel(); },
        resolve: resolve,
        install: install,
        reset: reset,
        clearCache: clearCache,
        chainNotTruncated: chainNotTruncated
    };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) module.exports = KinshipExternal;
