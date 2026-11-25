// 亲属关系地图 — 人物关系图布局（族谱式，纯函数，不依赖 DOM，可直接 require 测试）
//
// 画法参考中国族谱 / 世系图：
//   · 代际自上而下分「世」，同一世并列，左侧标「第几世」；
//   · 夫妻相邻，中间一条婚线（男左女右）；
//   · 父母到子女用「下垂线 + 兄弟横杆」：从父母名框下缘垂到横杆，
//     横杆横跨同父母的子女，再分别垂到每个子女名框上缘；
//   · 其他旁系关系（伯父、堂兄弟等）用连线 + 关系字单独标注。
//
// 关系文字避让：
//   · 父母→子女的关系字每个「父母组合」只标一次（不再每个子女重复一遍）；
//   · 婚线不标字（双方称谓里已经有「配偶」）；
//   · 标签沿线段取多个候选点，避开名框、称谓文字与其他标签，选第一个不冲突的位置。

var GraphLayout = (function () {
    'use strict';

    // 称谓前的排行数（"23公" = 这一辈排第 23）：同辈按排行从左到右排。
    // 实现与 kinship.js 共用一份（node 里按需 require，浏览器里脚本顺序保证已加载）。
    var K = (typeof globalThis !== 'undefined' && globalThis.Kinship) ? globalThis.Kinship : null;
    if (!K && typeof require === 'function') {
        try { require('./kinship.js'); K = globalThis.Kinship; } catch (e) { K = null; }
    }
    function rankOf(name) { return K && K.rankOf ? K.rankOf(name) : null; }
    function rankNum(info, id) { return info[id] && info[id].rank != null ? info[id].rank : 999; }

    // 名字定世与 kinship.js 共用一份，避免两处关键字集不一致（老公/姑娘/姑爷等）。
    function nameGenOffset(name, titles) {
        return K && K.genFromName ? K.genFromName(name, titles) : null;
    }

    // 数值保留一位小数，r1 / r1v 共用这一份
    function round1(v) { return Math.round(v * 10) / 10; }

    var BOX_H = 36;          // 名框高度
    var TITLE_DY = 52;       // 称谓文字基线（相对名框顶部）
    var ROW_H = 136;         // 世与世之间的行距
    var MIN_TARGET_W = 560;  // 折行时的最小目标宽度（避免单个家庭单位被切断）
    var PAD_TOP = 46;
    var PAD_BOTTOM = 44;
    var PAD_X = 44;
    var LEFT_W = 60;         // 左侧「第几世」栏宽度
    var ROW_GAP = 30;        // 同世不同家庭之间的间距
    var COUPLE_GAP = 26;     // 夫妻名框间距（婚线长度）
    var MIN_W = 78;
    var MAX_W = 196;
    var LABEL_SIZE = 11;
    var LABEL_PAD = 3;

    var SPOUSE_TYPES = { '配偶': 1, '丈夫': 1, '妻子': 1, '老公': 1, '老婆': 1 };
    var FATHER_TYPES = { '父亲': 1, '母亲': 1 };
    var CHILD_TYPES = { '儿子': 1, '女儿': 1 };
    var SIBLING_TYPES = { '哥哥': 1, '弟弟': 1, '姐姐': 1, '妹妹': 1 };
    // 直系：父母 / 祖父母 / 子女 / 孙子女（不含配偶与兄弟姐妹）
    var LINEAL_TYPES = {
        '父亲': 1, '母亲': 1, '爷爷': 1, '奶奶': 1, '外公': 1, '外婆': 1, '大婆': 1,
        '儿子': 1, '女儿': 1, '孙子': 1, '孙女': 1, '外孙': 1, '外孙女': 1
    };
    var TYPE_ORDER = { '父亲': 0, '母亲': 1, '儿子': 2, '女儿': 3 };

    function pairKey(a, b) {
        return a < b ? a + '|' + b : b + '|' + a;
    }

    function sortTypes(list) {
        return list.slice().sort(function (a, b) {
            var oa = TYPE_ORDER[a] === undefined ? 99 : TYPE_ORDER[a];
            var ob = TYPE_ORDER[b] === undefined ? 99 : TYPE_ORDER[b];
            if (oa !== ob) return oa - ob;
            return 0;
        });
    }

    function textWidth(s, size) {
        s = String(s == null ? '' : s);
        var w = 0;
        for (var i = 0; i < s.length; i++) {
            w += s.charCodeAt(i) > 255 ? size : size * 0.56;
        }
        return w;
    }

    function fitText(s, size, maxW) {
        s = String(s == null ? '' : s);
        if (textWidth(s, size) <= maxW) return s;
        var out = '';
        for (var i = 0; i < s.length; i++) {
            if (textWidth(out + s.charAt(i) + '…', size) > maxW) break;
            out += s.charAt(i);
        }
        return out + '…';
    }

    function avg(list) {
        if (!list.length) return 0;
        var s = 0;
        for (var i = 0; i < list.length; i++) s += list[i];
        return s / list.length;
    }

    function median(list) {
        if (!list.length) return 0;
        var a = list.slice().sort(function (x, y) { return x - y; });
        var m = Math.floor(a.length / 2);
        return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    }

    function cnNum(n) {
        var d = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
        if (n <= 0) return String(n);
        if (n < 10) return d[n];
        if (n === 10) return '十';
        if (n < 20) return '十' + d[n % 10];
        if (n < 100) return d[Math.floor(n / 10)] + '十' + (n % 10 ? d[n % 10] : '');
        return String(n);
    }

    // 关系归一化（先转化，后归类）：
    //   parents  : 父/母 → 子女（「父亲/母亲」正写和「儿子/女儿」反写都统一到这个方向）
    //   spouses  : 夫妻（无方向）
    //   siblings : 兄弟姐妹（无方向）
    //   kin      : 其他旁系（无方向）
    // 同一对人、同一类关系无论正反记几次，只留一条；原始 ri 全部收进 ris，供高亮使用。
    function normalizeRelations(relations, people) {
        var parents = [], parentMap = {};
        var spouses = [], spouseMap = {};
        var siblings = [], siblingMap = {};
        var kin = [], kinMap = {};

        function addItem(list, map, key, a, b) {
            var item = map[key];
            if (!item) {
                item = map[key] = { a: a, b: b, types: [], ris: [] };
                list.push(item);
            }
            return item;
        }

        function addType(item, type) {
            if (type && item.types.indexOf(type) < 0) item.types.push(type);
        }

        relations.forEach(function (r, ri) {
            if (!r || !people[r.from] || !people[r.to] || r.from === r.to) return;
            var type = String(r.type || '');
            var a = r.from, b = r.to;

            if (FATHER_TYPES[type]) {
                // 「A 是 B 的父亲/母亲」：A 是父辈
                var p = addItem(parents, parentMap, a + '>' + b, a, b);
                p.parentId = a;
                p.childId = b;
                if (!p.parentTypes) p.parentTypes = [];
                if (!p.childTypes) p.childTypes = [];
                if (p.parentTypes.indexOf(type) < 0) p.parentTypes.push(type);
                addType(p, type);
                if (p.ris.indexOf(ri) < 0) p.ris.push(ri);
            } else if (CHILD_TYPES[type]) {
                // 「A 是 B 的儿子/女儿」：B 是父辈
                var pc = addItem(parents, parentMap, b + '>' + a, b, a);
                pc.parentId = b;
                pc.childId = a;
                if (!pc.parentTypes) pc.parentTypes = [];
                if (!pc.childTypes) pc.childTypes = [];
                if (pc.childTypes.indexOf(type) < 0) pc.childTypes.push(type);
                addType(pc, type);
                if (pc.ris.indexOf(ri) < 0) pc.ris.push(ri);
            } else if (SPOUSE_TYPES[type]) {
                var sp = addItem(spouses, spouseMap, pairKey(a, b), a, b);
                addType(sp, type);
                if (sp.ris.indexOf(ri) < 0) sp.ris.push(ri);
            } else if (SIBLING_TYPES[type]) {
                var sb = addItem(siblings, siblingMap, pairKey(a, b), a, b);
                addType(sb, type);
                if (sb.ris.indexOf(ri) < 0) sb.ris.push(ri);
            } else {
                var kn = addItem(kin, kinMap, pairKey(a, b), a, b);
                addType(kn, type);
                if (kn.ris.indexOf(ri) < 0) kn.ris.push(ri);
            }
        });

        // 父母→子女这条线的关系字：有「父亲/母亲」正写时优先用正写，
        // 只有反写「儿子/女儿」时再用反写；同一对关系正反都记了也不会出现「父亲·儿子」。
        parents.forEach(function (p) {
            p.displayTypes = sortTypes(p.parentTypes && p.parentTypes.length ? p.parentTypes : p.childTypes);
        });

        return { parents: parents, spouses: spouses, siblings: siblings, kin: kin };
    }

    function layout(input) {
        input = input || {};
        var persons = input.persons || [];
        var relations = input.relations || [];
        var labels = input.labels || {};
        var rootId = input.rootId || null;

        // 地点顺序与名称：同辈按地点聚拢，同一地点圈进一个大框
        var placeOrder = {}, placeName = {};
        var pnext = 0;
        (input.places || []).forEach(function (pl) {
            if (pl && pl.id != null && placeOrder[pl.id] === undefined) {
                placeOrder[pl.id] = pnext++;
                placeName[pl.id] = pl.name || '';
            }
        });
        persons.forEach(function (p) {
            if (p && p.placeId != null && placeOrder[p.placeId] === undefined) {
                placeOrder[p.placeId] = pnext++;
            }
        });
        function placeOrd(pid) {
            return pid != null && placeOrder[pid] !== undefined ? placeOrder[pid] : Infinity;
        }

        /* ---------- 1. 收集：先把所有人物信息收进来 ---------- */

        var people = {};
        var info = {};
        var connected = [];
        var unreach = [];
        var order = 0;

        persons.forEach(function (p) {
            if (!p || !p.id) return;
            people[p.id] = p;
            var l = labels[p.id];
            if (!l) { unreach.push(p); return; }
            var title = l.label || '';
            // 称谓定世兜底：称谓（关系边推出的 label / 手填 titles / 名字）里若明确是祖辈词
            // （奶奶/爷爷…），用它覆盖关系边推出的世代，避免被连错辈分。
            var gen = l.gen;
            var titleWords = [l.label].concat(p.titles || [], [p.name]);
            for (var ti = 0; ti < titleWords.length; ti++) {
                var tw = String(titleWords[ti] == null ? '' : titleWords[ti]).trim();
                if (!tw) continue;
                var td = K && K.titleDelta ? K.titleDelta(tw) : null;
                if (td == null && K && K.baseTitle) {
                    var bt = K.baseTitle(tw);
                    if (bt !== tw) td = K.titleDelta(bt);
                }
                if (td != null) { gen = (labels[rootId] ? labels[rootId].gen : 0) + td; break; }
            }
            // 名字关键字定世：称谓是 name 原值（如 15公/三叔）算不出代数时，
            // 用名字里的关键字定世——公/婆=祖辈(-2)、爹/叔/姑/妈/娘=父辈(-1)。
            if (gen === (labels[rootId] ? labels[rootId].gen : 0) && p.id !== rootId) {
                var ng = nameGenOffset(p.name);
                if (ng != null) gen = (labels[rootId] ? labels[rootId].gen : 0) + ng;
            }
            var w = Math.max(MIN_W, textWidth(p.name, 13) + 26, textWidth(title, 11) + 24);
            w = Math.min(MAX_W, w);
            info[p.id] = {
                id: p.id,
                name: p.name || '',
                title: title,
                titleText: fitText(title, 11, w - 18),
                alias: l.alias || [],
                gen: gen,
                gender: p.gender || '',
                placeId: p.placeId != null ? p.placeId : null,
                rank: rankOf(p.name),
                isRoot: p.id === rootId,
                order: order++,
                w: w,
                x: 0,
                y: 0
            };
            connected.push(p.id);
        });

        /* ---------- 2. 转化：所有关系先归一化，再进入归类 ---------- */

        var norm = normalizeRelations(relations, people);
        var parentLinks = norm.parents;
        var spouseLinks = norm.spouses;
        var siblingLinks = norm.siblings;
        var kinLinks = norm.kin;

        // 每个子女直接登记过的父母（用于判断兄弟姐妹是否已由父母线相连）
        var parentSet = {};
        parentLinks.forEach(function (l) {
            if (!info[l.parentId] || !info[l.childId]) return;
            (parentSet[l.childId] = parentSet[l.childId] || {})[l.parentId] = true;
        });

        // 关系邻居：从归一化后的关系建，同一对人只算一次（用于按亲疏排序）
        var nbr = {};
        function addNbr(a, b) {
            if (!info[a] || !info[b] || a === b) return;
            (nbr[a] = nbr[a] || []);
            (nbr[b] = nbr[b] || []);
            if (nbr[a].indexOf(b) < 0) nbr[a].push(b);
            if (nbr[b].indexOf(a) < 0) nbr[b].push(a);
        }
        parentLinks.forEach(function (l) { addNbr(l.parentId, l.childId); });
        spouseLinks.forEach(function (l) { addNbr(l.a, l.b); });
        siblingLinks.forEach(function (l) { addNbr(l.a, l.b); });
        kinLinks.forEach(function (l) { addNbr(l.a, l.b); });

        /* ---------- 3. 统一归类：父母组合 / 夫妻 / 兄弟姐妹 ---------- */

        var spouseKeySet = {};
        spouseLinks.forEach(function (l) { spouseKeySet[pairKey(l.a, l.b)] = true; });

        // 父母组合：同一子女的父亲+母亲（且二人为夫妻）合成一组，只画一条下垂线
        var parentGroups = {};
        var childGroupKeys = {};

        Object.keys(parentSet).forEach(function (cid) {
            if (!info[cid]) return;
            var ps = parentLinks.filter(function (l) {
                return l.childId === cid && info[l.parentId];
            });
            var used = {};
            ps.forEach(function (p, i) {
                if (used[p.parentId]) return;
                var group = [p];
                used[p.parentId] = true;
                if (group.length < 2) {
                    for (var j = i + 1; j < ps.length; j++) {
                        var q = ps[j];
                        if (used[q.parentId]) continue;
                        if (spouseKeySet[pairKey(p.parentId, q.parentId)]) {
                            group.push(q);
                            used[q.parentId] = true;
                            break;
                        }
                    }
                }
                addParentGroup(group, cid);
            });
        });

        function addParentGroup(group, cid) {
            var ids = group.map(function (p) { return p.parentId; });
            var key = ids.slice().sort().join(',') + '|' + info[cid].gen;
            var g = parentGroups[key];
            if (!g) {
                g = parentGroups[key] = {
                    parentIds: ids,
                    parentTypes: [],
                    childTypes: [],
                    children: [],
                    ris: []
                };
            }
            if (g.children.indexOf(cid) < 0) g.children.push(cid);
            group.forEach(function (p) {
                p.parentTypes.forEach(function (t) {
                    if (g.parentTypes.indexOf(t) < 0) g.parentTypes.push(t);
                });
                p.childTypes.forEach(function (t) {
                    if (g.childTypes.indexOf(t) < 0) g.childTypes.push(t);
                });
                p.ris.forEach(function (ri) {
                    if (g.ris.indexOf(ri) < 0) g.ris.push(ri);
                });
            });
            (childGroupKeys[cid] = childGroupKeys[cid] || []).push(key);
        }

        // 兄弟姐妹：若共享父母，关系本身已经由父母下垂线表示；
        // 把原始 ri 并进父母组，悬停高亮走到兄弟姐妹关系时也能亮到正确的父母线。
        siblingLinks.forEach(function (l) {
            var keys = sharedParentGroups(l.a, l.b);
            if (!keys.length) return;
            keys.forEach(function (key) {
                var g = parentGroups[key];
                if (!g) return;
                l.ris.forEach(function (ri) {
                    if (g.ris.indexOf(ri) < 0) g.ris.push(ri);
                });
            });
        });

        function sharedParentGroups(aId, bId) {
            var ga = childGroupKeys[aId] || [], gb = childGroupKeys[bId] || [];
            var out = [];
            ga.forEach(function (key) {
                if (gb.indexOf(key) >= 0 && out.indexOf(key) < 0) out.push(key);
            });
            return out;
        }

        // 共同子女数：给配偶排序，有共同孩子的夫妻优先组成家庭单元
        var coupleKids = {};
        Object.keys(parentGroups).forEach(function (key) {
            var g = parentGroups[key];
            if (g.parentIds.length === 2 && spouseKeySet[pairKey(g.parentIds[0], g.parentIds[1])]) {
                var ck = pairKey(g.parentIds[0], g.parentIds[1]);
                coupleKids[ck] = (coupleKids[ck] || 0) + g.children.length;
            }
        });

        var spouseOf = {};
        var primaryPairs = {};
        var spouseCandidates = spouseLinks.filter(function (l) {
            return info[l.a] && info[l.b] && info[l.a].gen === info[l.b].gen;
        }).map(function (l) {
            return { link: l, score: coupleKids[pairKey(l.a, l.b)] || 0 };
        });
        spouseCandidates.sort(function (a, b) {
            if (a.score !== b.score) return b.score - a.score;
            return spouseLinks.indexOf(a.link) - spouseLinks.indexOf(b.link);
        });
        spouseCandidates.forEach(function (c) {
            var l = c.link;
            if (spouseOf[l.a] || spouseOf[l.b]) return;
            spouseOf[l.a] = l.b;
            spouseOf[l.b] = l.a;
            primaryPairs[pairKey(l.a, l.b)] = true;
        });

        // 分世
        var genSet = {};
        connected.forEach(function (id) { genSet[info[id].gen] = true; });
        var gens = Object.keys(genSet).map(Number).sort(function (a, b) { return a - b; });
        var rowOfGen = {};
        gens.forEach(function (g, i) { rowOfGen[g] = i; });

        var rows = gens.map(function (g, i) {
            return {
                kind: 'gen',
                gen: g,
                index: i,
                y: PAD_TOP + i * ROW_H,
                units: [],
                isRootRow: info[rootId] ? info[rootId].gen === g : false
            };
        });

        // 同世夫妻合成一个「家庭单元」，单元内男左女右（同性别时「我」在左）
        connected.forEach(function (id) {
            var n = info[id];
            if (!rows[rowOfGen[n.gen]]) return;
            var row = rows[rowOfGen[n.gen]];
            if (n._unit) return;
            var unit = { ids: [id], width: 0, center: 0, bary: 0 };
            n._unit = unit;
            var sp = spouseOf[id];
            if (sp && info[sp] && info[sp].gen === n.gen && !info[sp]._unit) {
                unit.ids.push(sp);
                info[sp]._unit = unit;
            }
            unit.ids.sort(function (a, b) {
                var pa = info[a], pb = info[b];
                if (pa.gender !== pb.gender) return pa.gender === 'm' ? -1 : 1;
                if (a === rootId) return -1;
                if (b === rootId) return 1;
                return pa.order - pb.order;
            });
            // 单元的地点：取男成员的地点（从夫居）；夫妻来自不同地点时标记 mixed，
            // 排到本地点组的末尾，避免把同地点的人从中间切开
            var uPlace = null, uMixed = false;
            unit.ids.forEach(function (uid) {
                var pid = info[uid].placeId;
                if (pid == null) return;
                if (uPlace == null) uPlace = pid;
                else if (uPlace !== pid) uMixed = true;
            });
            unit.placeOrd = placeOrd(uPlace);
            unit.mixed = uMixed;
            var w = 0;
            unit.ids.forEach(function (uid, i) {
                w += info[uid].w + (i ? COUPLE_GAP : 0);
            });
            unit.width = w;
            row.units.push(unit);
        });

        // 单元的排行：取单元内最小的（夫妻里一人有排行就按它排）
        function unitRank(u) {
            var r = null;
            u.ids.forEach(function (id) {
                var rr = info[id].rank;
                if (rr != null && (r === null || rr < r)) r = rr;
            });
            return r;
        }

        rows.forEach(function (row) {
            row.units.sort(function (a, b) {
                // 同辈先按地点聚拢（同一地点的人圈进一个大框），再按排行、录入顺序
                if (a.placeOrd !== b.placeOrd) return a.placeOrd - b.placeOrd;
                if (a.mixed !== b.mixed) return a.mixed ? 1 : -1;
                var ra = unitRank(a), rb = unitRank(b);
                if (ra != null && rb != null && ra !== rb) return ra - rb;
                return info[a.ids[0]].order - info[b.ids[0]].order;
            });
        });

        function packRow(row) {
            var total = 0;
            row.units.forEach(function (u, i) {
                total += u.width + (i ? ROW_GAP : 0);
            });
            var x = -total / 2;
            row.units.forEach(function (u) {
                var cx = x;
                u.ids.forEach(function (id) {
                    var n = info[id];
                    n.x = cx + n.w / 2;
                    cx += n.w + COUPLE_GAP;
                });
                u.center = avg(u.ids.map(function (id) { return info[id].x; }));
                x += u.width + ROW_GAP;
            });
        }

        function sortRow(row) {
            row.units.forEach(function (u) {
                var xs = [];
                u.ids.forEach(function (id) {
                    (nbr[id] || []).forEach(function (nid) {
                        if (info[nid] && info[nid].gen !== info[id].gen) xs.push(info[nid].x);
                    });
                });
                u.bary = xs.length ? avg(xs) : u.center;
            });
            row.units.sort(function (a, b) {
                // 排行/重心前先按地点聚拢：同一地点的人连续排，才圈得进一个大框
                if (a.placeOrd !== b.placeOrd) return a.placeOrd - b.placeOrd;
                if (a.mixed !== b.mixed) return a.mixed ? 1 : -1;
                var ra = unitRank(a), rb = unitRank(b);
                if (ra != null && rb != null && ra !== rb) return ra - rb;
                if (Math.abs(a.bary - b.bary) > 0.5) return a.bary - b.bary;
                return info[a.ids[0]].order - info[b.ids[0]].order;
            });
        }

        // 整行微调：尽量让上下世相邻的家庭对齐（中位数，避免被跨地支线带偏）
        function shiftRow(row, refRow) {
            var deltas = [];
            row.units.forEach(function (u) {
                var xs = [];
                u.ids.forEach(function (id) {
                    (nbr[id] || []).forEach(function (nid) {
                        if (info[nid] && info[nid].gen === refRow.gen) xs.push(info[nid].x);
                    });
                });
                if (xs.length) deltas.push(avg(xs) - u.center);
            });
            if (!deltas.length) return;
            var d = median(deltas);
            if (!isFinite(d)) return;
            row.units.forEach(function (u) {
                u.ids.forEach(function (id) { info[id].x += d; });
                u.center += d;
            });
        }

        for (var iter = 0; iter < 3; iter++) {
            rows.forEach(sortRow);
            rows.forEach(packRow);
            for (var t = 1; t < rows.length; t++) shiftRow(rows[t], rows[t - 1]);
            for (var b = rows.length - 2; b >= 0; b--) shiftRow(rows[b], rows[b + 1]);
        }

        /* ---------- 2.5 折行（opt-in）：人多时一个世/地点排成多行，整图尽量正方形 ----------
           默认不折行，保持原有「一出一世一行」的画法；仅当 input.wrap 为真时启用。
           折行后每世拆成若干子行，子行内重新居中排布，节点 y 记在 _wrapY。 */
        var wrap = !!input.wrap;
        var SUB_ROW_H = ROW_H;
        var wrapCols = 0, wrapBottom = 0;
        if (wrap) {
            var totalUnits = rows.reduce(function (s, r) { return s + r.units.length; }, 0) + unreach.length;
            // 每行容量：优先按面板宽度算（一行的数量适应屏幕，超出换行，字保持原大）；
            // 没有 panelWidth（如单测）时回退到面积开方。
            var avgUnitW = 0, unitCount = 0;
            rows.forEach(function (r) {
                r.units.forEach(function (u) { avgUnitW += u.width; unitCount++; });
            });
            if (unitCount) avgUnitW = avgUnitW / unitCount;
            else avgUnitW = 110;
            var slotW = avgUnitW + ROW_GAP;
            wrapCols = input.panelWidth > 0
                ? Math.max(1, Math.floor((input.panelWidth - LEFT_W - PAD_X * 2) / slotW))
                : Math.max(2, Math.round(Math.sqrt(totalUnits * ROW_H / 110)));
            var yc = PAD_TOP;
            rows.forEach(function (row) {
                // 按屏幕宽度连续装填：单元逐个放进当前行，放不下就换行。
                // 夫妻单元（unit）整体不拆；地点只用于分组框，不强制另起一行。
                var lines = [];
                var cur = [];
                row.units.forEach(function (u) {
                    if (cur.length && cur.length >= wrapCols) {
                        lines.push(cur); cur = [];
                    }
                    cur.push(u);
                });
                if (cur.length) lines.push(cur);
                if (!lines.length) lines.push([]);
                row.wrapLines = lines;
                row.y = yc;
                lines.forEach(function (line, li) {
                    var ly = yc + li * SUB_ROW_H;
                    var total = 0;
                    line.forEach(function (u, i) { total += u.width + (i ? ROW_GAP : 0); });
                    var x = -total / 2;
                    line.forEach(function (u) {
                        u.ids.forEach(function (id) {
                            var n = info[id];
                            n.x = x + n.w / 2;
                            n._wrapY = ly;
                            x += n.w + COUPLE_GAP;
                        });
                        u.center = avg(u.ids.map(function (id) { return info[id].x; }));
                        x += ROW_GAP;
                    });
                });
                yc += lines.length * SUB_ROW_H + (ROW_H - SUB_ROW_H);
            });
            wrapBottom = yc;
        }

        // 未连通的人另起一行
        var unreachRow = null;
        var nodes = [];
        var unreachNodes = [];
        if (unreach.length) {
            // 未连通的也按地点聚拢，再按排行排（没排行的保持录入顺序，Array.sort 稳定）
            unreach.sort(function (a, b) {
                var pa = placeOrd(a.placeId), pb = placeOrd(b.placeId);
                if (pa !== pb) return pa - pb;
                var ra = rankOf(a.name), rb = rankOf(b.name);
                if (ra != null && rb != null && ra !== rb) return ra - rb;
                return 0;
            });
            unreachRow = {
                kind: 'unreach',
                gen: null,
                index: rows.length,
                y: PAD_TOP + rows.length * ROW_H,
                isRootRow: false,
                units: []
            };
            var total = 0;
            unreach.forEach(function (p) {
                var w = Math.min(MAX_W, Math.max(MIN_W, textWidth(p.name, 13) + 26));
                unreachNodes.push({
                    id: p.id, name: p.name || '', title: '', titleText: '',
                    alias: [], gen: null, gender: p.gender || '', isRoot: false,
                    placeId: p.placeId != null ? p.placeId : null,
                    w: w, x: 0, y: unreachRow.y
                });
            });
            var totalUnitsU = rows.reduce(function (s, r) { return s + r.units.length; }, 0) + unreach.length;
            var cols = wrap ? wrapCols : totalUnitsU;
            var lines = [];
            for (var i = 0; i < unreachNodes.length; i += cols) lines.push(unreachNodes.slice(i, i + cols));
            if (!lines.length) lines.push([]);
            unreachRow.wrapLines = lines;
            var uy = wrap ? wrapBottom : (PAD_TOP + rows.length * ROW_H);
            unreachRow.y = uy;
            lines.forEach(function (line, li) {
                var ly = uy + li * SUB_ROW_H;
                var t = 0;
                line.forEach(function (n, i) { t += n.w + (i ? ROW_GAP : 0); });
                var xx = -t / 2;
                line.forEach(function (n) {
                    n.x = xx + n.w / 2;
                    n.y = ly;
                    n._wrapY = ly;
                    xx += n.w + ROW_GAP;
                });
            });
            if (wrap) wrapBottom = uy + lines.length * SUB_ROW_H + (ROW_H - SUB_ROW_H);
        }

        // 归一化到正坐标
        var minX = Infinity, maxRight = -Infinity;
        function scan(n) {
            minX = Math.min(minX, n.x - n.w / 2);
            maxRight = Math.max(maxRight, n.x + n.w / 2);
        }
        connected.forEach(function (id) {
            var n = info[id];
            n.y = wrap && n._wrapY != null ? n._wrapY : rows[rowOfGen[n.gen]].y;
            scan(n);
            nodes.push(n);
        });
        unreachNodes.forEach(scan);
        if (!nodes.length && !unreachNodes.length) {
            return { width: 0, height: 0, rows: [], nodes: [], edges: [], labels: [], groups: [] };
        }
        var shift = LEFT_W + PAD_X - minX;
        nodes.concat(unreachNodes).forEach(function (n) { n.x += shift; });
        var width = maxRight + shift + PAD_X;
        var rowsAll = rows.slice();
        if (unreachRow) {
            if (!wrap) unreachNodes.forEach(function (n) { n.y = unreachRow.y; });
            rowsAll.push(unreachRow);
        }
        var height = wrap ? (wrapBottom + PAD_BOTTOM - 26)
                          : (PAD_TOP + rowsAll.length * ROW_H + PAD_BOTTOM - 26);

        // 世系标题：折行时一个世占多物理行，每行都要有淡虚线
        rowsAll.forEach(function (row) {
            if (row.kind === 'unreach') {
                row.label = '未连通';
            } else {
                var n = row.gen - gens[0] + 1;
                row.label = cnNum(n) + '世';
            }
            row.ys = wrap && row.wrapLines && row.wrapLines.length
                ? row.wrapLines.map(function (_, i) { return row.y + i * SUB_ROW_H; })
                : [row.y];
        });

        /* ---------- 3.5 地点分组框：同一世、同一地点的人圈进一个大框 ---------- */
        var groups = [];
        var GROUP_PAD_X = 10, GROUP_TOP = 16, GROUP_BOTTOM = 30; // 上留白放地点名，下留白放称谓
        rowsAll.forEach(function (row) {
            var inRow = [];
            if (row.kind === 'unreach') {
                inRow = unreachNodes.slice();
            } else {
                nodes.forEach(function (n) { if (n.gen === row.gen) inRow.push(n); });
            }
            inRow.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
            var run = null;
            function flush() {
                if (!run) return;
                groups.push({
                    x: run.minX - GROUP_PAD_X,
                    y: run.y - GROUP_TOP,
                    w: run.maxX - run.minX + GROUP_PAD_X * 2,
                    h: BOX_H + GROUP_TOP + GROUP_BOTTOM,
                    label: placeName[run.pid] || ''
                });
                run = null;
            }
            inRow.forEach(function (n) {
                // 没挂地点的断开分组；夫妻来自不同地点时各归各的框（按连续同地点切分）；
                // 折行后不同子行 y 不同，也各自成框
                if (n.placeId == null) { flush(); return; }
                if (run && run.pid === n.placeId && run.y === n.y) {
                    run.minX = Math.min(run.minX, n.x - n.w / 2);
                    run.maxX = Math.max(run.maxX, n.x + n.w / 2);
                } else {
                    flush();
                    run = { pid: n.placeId, y: n.y, minX: n.x - n.w / 2, maxX: n.x + n.w / 2 };
                }
            });
            flush();
        });

        /* ---------- 4. 画图：只用归一化、归类后的关系生成线 ---------- */

        var edges = [];

        // 父母→子女：父母汇合后分叉到每个子女，不画贯穿整世的兄弟姐妹横杆
        Object.keys(parentGroups).forEach(function (key) {
            var g = parentGroups[key];
            var parents = g.parentIds.map(function (id) { return info[id]; }).filter(Boolean);
            if (!parents.length) return;
            parents.sort(function (a, b) { return a.x - b.x; });
            var pBottom = Math.max.apply(null, parents.map(function (p) { return p.y + BOX_H; }));
            var childNodes = g.children.map(function (id) { return info[id]; }).filter(Boolean);
            if (!childNodes.length) return;
            childNodes.sort(function (a, b) { return a.x - b.x; });
            // 不画贯穿整世的兄弟姐妹横杆：每个子女一条独立分叉线，水平段高度依次错开
            var railY = pBottom + 30;

            var anchorX = avg(parents.map(function (p) { return p.x; }));
            var d = [];
            if (parents.length >= 2) {
                parents.forEach(function (p) {
                    d.push('M' + r1(p.x) + ' ' + r1(p.y + BOX_H) + 'H' + r1(anchorX));
                });
            }
            // 主干：从父母中点垂到最后一条分支的高度
            d.push('M' + r1(anchorX) + ' ' + r1(pBottom) + 'V' + r1(railY + (childNodes.length - 1) * 10));
            // 每个子女一条独立分叉线，水平段高度依次错开 10px，不再画贯穿横杆
            childNodes.forEach(function (n, i) {
                var by = railY + i * 10;
                d.push('M' + r1(anchorX) + ' ' + r1(by) + 'H' + r1(n.x) + 'V' + r1(n.y));
            });

            var text = sortTypes(g.parentTypes.length ? g.parentTypes : g.childTypes).join('·');
            // 标签候选落在父母与最高子女之间，避开父母框下的称谓文字
            var minChildY = Math.min.apply(null, childNodes.map(function (n) { return n.y; }));
            edges.push({
                kind: 'descent',
                ris: g.ris.slice(),
                d: d.join(' '),
                title: text,
                label: {
                    text: text,
                    candidates: descentCandidates(anchorX, pBottom + 16, Math.max(pBottom + 40, minChildY - 10)),
                    priority: 0,
                    ris: g.ris.slice()
                },
                anchorX: anchorX,
                railY: railY,
                parentBottom: pBottom
            });
        });

        // 夫妻：同世且是主配偶 → 名框间婚线；跨世 / 次配偶 → 普通关系线
        spouseLinks.forEach(function (l) {
            var a = info[l.a], b = info[l.b];
            if (!a || !b) return;
            var labelText = l.types.join('·') || '配偶';
            if (a.gen === b.gen && primaryPairs[pairKey(l.a, l.b)]) {
                var left = a.x <= b.x ? a : b;
                var right = a.x <= b.x ? b : a;
                var y = a.y + BOX_H / 2;
                var x1 = left.x + left.w / 2;
                var x2 = right.x - right.w / 2;
                if (x2 < x1) { x1 = left.x; x2 = right.x; }
                edges.push({
                    kind: 'spouse', ris: l.ris.slice(), title: labelText,
                    x1: x1, y1: y, x2: x2, y2: y, label: null
                });
                return;
            }
            addKinEdge(l, labelText, 2);
        });

        // 兄弟姐妹：已经通过父母下垂线相连的不再重复画线；
        // 只有单独记了兄弟姐妹、却没有共同父母的人，才补一条关系线。
        siblingLinks.forEach(function (l) {
            var a = info[l.a], b = info[l.b];
            if (!a || !b) return;
            if (sharedParentGroups(l.a, l.b).length) return;
            addKinEdge(l, l.types.join('·'), 1);
        });

        // 其他旁系
        kinLinks.forEach(function (l) {
            var a = info[l.a], b = info[l.b];
            if (!a || !b) return;
            addKinEdge(l, l.types.join('·'), 1);
        });

        function addKinEdge(l, text, priority) {
            var a = info[l.a], b = info[l.b];
            if (!a || !b) return;
            var ris = l.ris.slice();
            if (a.gen === b.gen && hasBetween(a, b)) {
                var top = a.y;
                var lineY = top - 28;
                var dir = b.x >= a.x ? 1 : -1;
                var ax = a.x + dir * Math.max(0, a.w / 2 - 9);
                var bx = b.x - dir * Math.max(0, b.w / 2 - 9);
                edges.push({
                    kind: 'kin', ris: ris, title: text,
                    d: 'M' + r1(ax) + ' ' + r1(top) + 'V' + r1(lineY) +
                        'H' + r1(bx) + 'V' + r1(top),
                    label: {
                        text: text,
                        candidates: detourCandidates(Math.min(ax, bx), Math.max(ax, bx), lineY),
                        priority: priority,
                        ris: ris
                    }
                });
                return;
            }
            var y1 = a.y + BOX_H / 2, y2 = b.y + BOX_H / 2;
            edges.push({
                kind: 'kin', ris: ris, title: text,
                x1: a.x, y1: y1, x2: b.x, y2: y2,
                label: { text: text, candidates: kinCandidates(a.x, y1, b.x, y2), priority: priority, ris: ris }
            });
        }

        function hasBetween(a, b) {
            var lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                if (n.id === a.id || n.id === b.id) continue;
                if (n.gen === a.gen && n.x > lo + 0.5 && n.x < hi - 0.5) return true;
            }
            return false;
        }

        // 节点障碍：名框 + 框下称谓文字 + 地点名（关系字避开地点名）
        var obstacles = [];
        nodes.forEach(function (n) {
            obstacles.push({ x: n.x - n.w / 2 - 4, y: n.y - 4, w: n.w + 8, h: BOX_H + 8 });
            if (n.titleText) {
                var tw = textWidth(n.titleText, 11) + 8;
                obstacles.push({ x: n.x - tw / 2, y: n.y + BOX_H + 6, w: tw, h: 16 });
            }
        });
        groups.forEach(function (gp) {
            if (!gp.label) return;
            var tw = textWidth(gp.label, 10) + 8;
            obstacles.push({ x: gp.x + 6, y: gp.y + 2, w: tw, h: 14 });
        });

        var placed = [];
        var labelsOut = [];
        var pending = edges.filter(function (e) { return e.label; })
            .map(function (e) { return e.label; })
            .sort(function (a, b) {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return textWidth(b.text, LABEL_SIZE) - textWidth(a.text, LABEL_SIZE);
            });

        pending.forEach(function (lab) {
            var best = null, bestScore = Infinity;
            for (var i = 0; i < lab.candidates.length; i++) {
                var c = lab.candidates[i];
                var box = labelBox(c, lab.text);
                if (box.x < LEFT_W + 2 || box.x + box.w > width - 4) continue;
                if (box.y < 4 || box.y + box.h > height - 4) continue;
                var score = overlapScore(box, obstacles) * 4 + overlapScore(box, placed);
                if (score < bestScore) { bestScore = score; best = { c: c, box: box }; }
                if (score === 0) break;
            }
            if (!best) {
                var c0 = lab.candidates[0] || { x: width / 2, y: height / 2, anchor: 'middle' };
                best = { c: c0, box: labelBox(c0, lab.text) };
            }
            placed.push(best.box);
            labelsOut.push({
                text: lab.text,
                ris: lab.ris,
                x: best.c.x,
                y: best.c.y,
                anchor: best.c.anchor,
                dim: lab.priority > 0,   // 旁系/兄弟姐妹关系字默认变淡，悬停高亮时恢复
                box: best.box
            });
        });

        // 去掉临时引用，返回干净结构
        nodes.forEach(function (n) {
            delete n._unit;
            n.boxH = BOX_H;
        });

        return {
            width: Math.max(width, LEFT_W + PAD_X * 2),
            height: height,
            rows: rowsAll,
            nodes: nodes.concat(unreachNodes),
            edges: edges,
            labels: labelsOut,
            groups: groups,
            boxH: BOX_H
        };

        function r1(v) { return round1(v); }
    }

    /* ---------- 蛛网/放射布局（radial） ----------
       中心 = 「我」，每往外一圈 = 关系链多一步：
       第 1 圈：父母、配偶、子女、兄弟姐妹（只登记了共同父母时，兄弟姐妹也算 1 步）
       第 2 圈：祖父母、孙子女、伯叔姑舅姨、侄甥、姻亲父母
       第 3 圈起：堂表兄弟姐妹等更远关系；没有任何关系边的放最外圈「未连通」。
       角度先按 BFS 家族分支分配，再按圈内名框宽度做间距修正，保证不叠字。 */

    var R_NODE_H = 30;
    var R_MIN_W = 56;
    var R_MAX_W = 176;
    var R_NODE_GAP = 16;
    var R_RING_GAP = 118;
    var R_FIRST_RING = 148;
    var R_CANVAS_PAD = 56;
    var R_TAU = Math.PI * 2;
    var R_START = Math.PI * 1.5; // 从正上方开始，顺时针排家族分支

    function normAngle(a) {
        a = a % R_TAU;
        return a < 0 ? a + R_TAU : a;
    }

    function radial(input) {
        input = input || {};
        var persons = input.persons || [];
        var relations = input.relations || [];
        var labels = input.labels || {};
        var rootId = input.rootId || null;
        var groupByPlace = !!input.groupByPlace; // 按地点分树：每地点一棵、根连我、各占一扇区
        var placeRoots = [];  // 按地点分树时各地点树的根（供"根连我"连线用）
        var placeTreeParent = {}; // 按地点分树时每人对应的父节点（供画"根→子→孙"树线用）

        /* ---------- 1. 收集：所有人先进 info（没连通的人也要画在最外圈） ---------- */
        var people = {};
        var info = {};
        var order = 0;

        persons.forEach(function (p) {
            if (!p || !p.id) return;
            people[p.id] = p;
            var l = labels[p.id];
            var title = l ? (l.label || '') : '';
            // 框下黄色称谓已不再显示，宽度只按名框算——不可见的长路径称谓
            // （如「9叔的父亲的儿女」）不应撑大半径/扇区/推开间距。
            var w = Math.min(R_MAX_W, Math.max(R_MIN_W, textWidth(p.name, 12) + 24));
            info[p.id] = {
                id: p.id,
                name: p.name || '',
                nameText: fitText(p.name || '', 12, w - 12),
                title: title,
                titleText: '',
                titleW: w,
                alias: l && l.alias ? l.alias : [],
                titles: p.titles || [],
                labelGen: l && typeof l.gen === 'number' ? l.gen : null,
                gender: p.gender || '',
                placeId: p.placeId != null ? p.placeId : null,
                rank: rankOf(p.name),
                isRoot: p.id === rootId,
                order: order++,
                w: w,
                h: R_NODE_H,
                depth: null,
                gen: null,
                angle: 0,
                angled: false,
                r: 0,
                x: 0,
                y: 0,
                unreach: false
            };
        });

        if (!rootId || !info[rootId]) {
            var firstId = null;
            persons.forEach(function (p) {
                if (firstId === null && p && info[p.id]) firstId = p.id;
            });
            rootId = firstId;
        }
        if (!rootId) {
            return {
                width: 0, height: 0, center: { x: 0, y: 0 }, rings: [],
                nodes: [], edges: [], labels: [], maxDepth: 0, boxH: R_NODE_H
            };
        }
        info[rootId].isRoot = true;

        /* ---------- 2. 转化：关系归一化后建邻接表（兄弟姐妹按共同父母补边） ---------- */
        var norm = normalizeRelations(relations, people);
        var adj = {};
        var linealPair = {};
        relations.forEach(function (r) {
            if (r && LINEAL_TYPES[r.type]) linealPair[pairKey(r.from, r.to)] = true;
        });

        function addAdj(a, b, prio, kind) {
            if (!info[a] || !info[b] || a === b) return;
            var list = adj[a] || (adj[a] = []);
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === b) {
                    if (prio < list[i].prio) { list[i].prio = prio; list[i].kind = kind; }
                    return;
                }
            }
            list.push({ id: b, prio: prio, kind: kind });
        }

        norm.parents.forEach(function (l) {
            addAdj(l.parentId, l.childId, 0, 'parent');
            addAdj(l.childId, l.parentId, 0, 'parent');
        });
        norm.spouses.forEach(function (l) {
            addAdj(l.a, l.b, 1, 'spouse');
            addAdj(l.b, l.a, 1, 'spouse');
        });
        norm.siblings.forEach(function (l) {
            addAdj(l.a, l.b, 3, 'sibling');
            addAdj(l.b, l.a, 3, 'sibling');
        });
        norm.kin.forEach(function (l) {
            addAdj(l.a, l.b, 4, 'kin');
            addAdj(l.b, l.a, 4, 'kin');
        });

        // 只登记了「父亲/母亲」的兄弟姐妹：补一条 1 步边，避免哥哥被算成第 2 圈
        var kidsByParent = {};
        norm.parents.forEach(function (l) {
            (kidsByParent[l.parentId] = kidsByParent[l.parentId] || []).push(l.childId);
        });
        Object.keys(kidsByParent).forEach(function (pid) {
            var kids = kidsByParent[pid];
            for (var i = 0; i < kids.length; i++) {
                for (var j = i + 1; j < kids.length; j++) {
                    addAdj(kids[i], kids[j], 3, 'sibling');
                    addAdj(kids[j], kids[i], 3, 'sibling');
                }
            }
        });

        // 「我」的直系分类：用于决定蛛网朝向（父母在上、配偶在右、子女在下、兄弟姐妹在左）
        var rootKind = {};
        norm.parents.forEach(function (l) {
            if (l.childId === rootId) rootKind[l.parentId] = 'parent';
            if (l.parentId === rootId) rootKind[l.childId] = 'child';
        });
        norm.spouses.forEach(function (l) {
            if (l.a === rootId) rootKind[l.b] = rootKind[l.b] || 'spouse';
            if (l.b === rootId) rootKind[l.a] = rootKind[l.a] || 'spouse';
        });
        norm.siblings.forEach(function (l) {
            if (l.a === rootId) rootKind[l.b] = rootKind[l.b] || 'sibling';
            if (l.b === rootId) rootKind[l.a] = rootKind[l.a] || 'sibling';
        });
        Object.keys(kidsByParent).forEach(function (pid) {
            var kids = kidsByParent[pid];
            for (var i = 0; i < kids.length; i++) {
                for (var j = i + 1; j < kids.length; j++) {
                    if (kids[i] === rootId) rootKind[kids[j]] = rootKind[kids[j]] || 'sibling';
                    if (kids[j] === rootId) rootKind[kids[i]] = rootKind[kids[i]] || 'sibling';
                }
            }
        });

        function rootNbrPrio(entry) {
            var k = rootKind[entry.id];
            if (k === 'parent') return 0;
            if (k === 'spouse') return 1;
            if (k === 'child') return 2;
            if (k === 'sibling') return 3;
            return 4;
        }

        /* ---------- 3. 角度用的 BFS 树 + 圈层改按「辈分」排 ----------
           圆心仍是「我」，但其他人的圈层不再按关系步数，而是按辈分：
           辈分越高（gen 越小，如爷爷 -2）越靠近圆心；一世 = 最高辈。
           BFS 树只用来决定同一家族分支的角度，不再决定半径。 */

        var bfs = {};
        var treeParent = {};
        var treeChildren = {};
        var queue = [rootId];
        var head = 0;
        bfs[rootId] = 0;
        treeParent[rootId] = null;

        while (head < queue.length) {
            var cur = queue[head++];
            var nbrs = (adj[cur] || []).slice().sort(function (a, b) {
                // 「我」的邻居按直系优先级排：父母 → 配偶 → 子女 → 兄弟姐妹 → 其他
                var pa = cur === rootId ? rootNbrPrio(a) : a.prio;
                var pb = cur === rootId ? rootNbrPrio(b) : b.prio;
                if (pa !== pb) return pa - pb;
                return info[a.id].order - info[b.id].order;
            });
            for (var ni = 0; ni < nbrs.length; ni++) {
                var nid = nbrs[ni].id;
                if (bfs[nid] !== undefined) continue;
                bfs[nid] = bfs[cur] + 1;
                treeParent[nid] = cur;
                (treeChildren[cur] = treeChildren[cur] || []).push(nid);
                queue.push(nid);
            }
        }

        // 称谓推算没覆盖到的人（包括未连通的），用手填称谓 / 名字关键字兜底估辈分
        function estimateGen(n) {
            var srcs = (n.titles || []).concat([n.name]);
            for (var i = 0; i < srcs.length; i++) {
                var s = String(srcs[i] == null ? '' : srcs[i]).trim();
                if (!s) continue;
                if (K && typeof K.titleDelta === 'function') {
                    var d = K.titleDelta(s);
                    if (typeof d === 'number' && !isNaN(d) && d !== 0) return d;
                }
                var off = nameGenOffset(s);
                if (off !== null) return off;
            }
            return null;
        }

        var genValues = [];
        // 只根据称呼（名字/称谓关键字）定辈分，不看关系边算出的 gen（关系 type 是名字原值时算不准）。
        // 一世(公/婆/祖辈)=gen-2 最靠近我，二世(爹/叔/姑/妈/娘)=gen-1，依次向外。
        Object.keys(info).forEach(function (id) {
            var n = info[id];
            var nameGen = estimateGen(n);   // 名字关键字定世
            n.gen = nameGen != null ? nameGen : n.labelGen; // 名字优先，关系 gen 兜底
            if (id !== rootId && n.gen != null && genValues.indexOf(n.gen) < 0) genValues.push(n.gen);
        });
        genValues.sort(function (a, b) { return a - b; }); // 最小 = 最高辈（一世）
        var genRing = {};
        genValues.forEach(function (g, i) { genRing[g] = i + 1; });
        var unknownRing = genValues.length + 1;
        var unknownIds = [];

        Object.keys(info).forEach(function (id) {
            var n = info[id];
            if (id === rootId) {
                n.gen = 0;
                n.depth = 0;
            } else if (n.gen == null) {
                n.depth = unknownRing;
                n.unreach = true;
                unknownIds.push(id);
            } else {
                n.depth = genRing[n.gen];
                n.unreach = bfs[id] === undefined;
            }
        });
        var unreachIds = Object.keys(info).filter(function (id) { return info[id].unreach; });

        // 按地点分树时，自动推断配偶：同地点 + 同排行 + 同辈 + 一男一女 → 配成夫妻。
        // 即使 relations 里没有配偶边，也让夫妻相邻并画出婚线。
        var placeSpouses = [];   // [aId, bId] 对
        var spouseOfLocal = {};
        if (groupByPlace) {
            var pairMap = {};
            Object.keys(info).forEach(function (id) {
                if (id === rootId) return;
                var n = info[id];
                if (!n.gender) return;
                var rk = n.rank == null ? 'x' : String(n.rank);
                var key = (n.placeId || 'none') + '|' + rk + '|' + (n.gen == null ? 'x' : n.gen);
                (pairMap[key] = pairMap[key] || { m: [], f: [] })[n.gender === 'm' ? 'm' : 'f'].push(id);
            });
            Object.keys(pairMap).forEach(function (key) {
                var g = pairMap[key];
                var max = Math.min(g.m.length, g.f.length);
                for (var i = 0; i < max; i++) {
                    var a = g.m[i], b = g.f[i];
                    if (spouseOfLocal[a] || spouseOfLocal[b]) continue;
                    spouseOfLocal[a] = b; spouseOfLocal[b] = a;
                    placeSpouses.push([a, b]);
                }
            });
        }

        // 摆位用的父节点：同地址时仍优先挂同址长辈；非同址时默认挂到直系亲属
        // （父母/祖父母/子女/孙子女）分支下。只改角度树，不写回关系数据。
        // 按辈分从高到低确定父节点，保证不会成环。
        var placed = {};
        placed[rootId] = true;
        var orderIds = Object.keys(bfs).filter(function (id) { return id !== rootId; });
        orderIds.sort(function (a, b) {
            var ga = info[a].gen == null ? 99 : info[a].gen;
            var gb = info[b].gen == null ? 99 : info[b].gen;
            return ga - gb || bfs[a] - bfs[b] || info[a].order - info[b].order;
        });
        var parentScore = {};
        // 「我」的直系邻居（父母/配偶/子女/兄弟姐妹）仍直接挂在圆心，
        // 保证父母在上、配偶在右、子女在下、兄弟姐妹在左的朝向不变。
        Object.keys(bfs).forEach(function (id) {
            if (id !== rootId && bfs[id] === 1) {
                parentScore[id] = rootId;
                placed[id] = true;
            }
        });
        orderIds.forEach(function (id) {
            if (placed[id]) return; // 已在上面固定在圆心
            var self = info[id];
            var best = null;
            (adj[id] || []).forEach(function (entry) {
                var nb = entry.id;
                if (!placed[nb] && nb !== rootId) return; // 父节点必须先确定，避免成环
                var n = info[nb];
                var lineal = !!(linealPair[pairKey(id, nb)] || linealPair[pairKey(nb, id)]);
                var elder = n.gen != null && self.gen != null && n.gen < self.gen;
                var samePlaceElder = n.placeId != null && n.placeId === self.placeId && elder;
                // 非同址时默认挂靠直系亲属，不限制长辈/晚辈（布局需要）
                var score = samePlaceElder ? 0 : (lineal ? 1 : 2);
                var cand = {
                    id: nb, score: score,
                    gen: n.gen == null ? 99 : n.gen,
                    bfs: bfs[nb] == null ? 99 : bfs[nb],
                    order: n.order
                };
                if (!best || cand.score < best.score ||
                    (cand.score === best.score && (cand.gen < best.gen ||
                        (cand.gen === best.gen && cand.bfs < best.bfs)))) best = cand;
            });
            parentScore[id] = best ? best.id : rootId;
            placed[id] = true;
        });
        treeChildren = {};
        Object.keys(parentScore).forEach(function (id) {
            treeParent[id] = parentScore[id];
            (treeChildren[parentScore[id]] = treeChildren[parentScore[id]] || []).push(id);
        });

        /* ---------- 4. 角度：按家族分支分扇区，再按圈内宽度推开 ---------- */
        var weight = {};
        function calcWeight(id) {
            if (weight[id] !== undefined) return weight[id];
            var total = 1;
            (treeChildren[id] || []).forEach(function (cid) { total += calcWeight(cid); });
            weight[id] = total;
            return total;
        }
        calcWeight(rootId);

        // 第 1 圈按「直系分类」定向：父母在上、配偶在右、子女在下、兄弟姐妹在左。
        // 每一组围绕自己的方向均匀铺开，组内人越多扇区越大；其余直系关系
        // （例如直接登记成「堂兄弟」的人）填进剩下的空档，没空档就绕整圈均分。
        var ROOT_DIR = {
            parent: Math.PI * 1.5,
            spouse: 0,
            child: Math.PI * 0.5,
            sibling: Math.PI
        };
        var ROOT_MIN_STEP = 0.62; // 第 1 圈相邻两人的最小角度，约 36°

        function subtreeSpan(id) {
            return Math.max(0.5, Math.min(1.7, (weight[id] - 1) * 0.42 + 0.5));
        }

        // 把某个分支的后代铺在它自己的角度附近，子女人数/子树越大分到的角度越宽
        function assignDescendants(id, center, span) {
            var kids = treeChildren[id] || [];
            if (!kids.length) return;
            var total = 0;
            kids.forEach(function (k) { total += weight[k]; });
            var cursor = center - span / 2;
            kids.forEach(function (k) {
                var share = total ? span * (weight[k] / total) : 0;
                info[k].angle = cursor + share / 2;
                info[k].angled = true;
                assignDescendants(k, info[k].angle, Math.max(0.45, share * 0.92));
                cursor += share;
            });
        }

        function freeArcs(blocked) {
            var list = [];
            blocked.forEach(function (o) {
                var s = o.center - o.half;
                var e = o.center + o.half;
                while (s < 0) { s += R_TAU; e += R_TAU; }
                s = s % R_TAU;
                e = e % R_TAU;
                if (e < s) {
                    list.push([s, R_TAU]);
                    list.push([0, e]);
                } else {
                    list.push([s, e]);
                }
            });
            list.sort(function (a, b) { return a[0] - b[0]; });
            var out = [];
            var cursor = 0;
            list.forEach(function (b) {
                if (b[0] > cursor + 1e-6) out.push([cursor, b[0]]);
                if (b[1] > cursor) cursor = b[1];
            });
            if (cursor < R_TAU - 1e-6) out.push([cursor, R_TAU]);
            return out;
        }

        function angleInFreeArcs(arcs, pos) {
            for (var i = 0; i < arcs.length; i++) {
                var len = arcs[i][1] - arcs[i][0];
                if (pos <= len || i === arcs.length - 1) return arcs[i][0] + Math.min(pos, len);
                pos -= len;
            }
            return R_START;
        }

        function assignRootAngles() {
            var kids = treeChildren[rootId] || [];
            if (!kids.length) return;
            var groups = { parent: [], spouse: [], child: [], sibling: [], other: [] };
            kids.forEach(function (id) {
                var kind = rootKind[id] || 'other';
                (groups[kind] || groups.other).push(id);
            });

            var occupied = [];
            ['parent', 'spouse', 'child', 'sibling'].forEach(function (kind) {
                var list = groups[kind];
                if (!list.length) return;
                var center = ROOT_DIR[kind];
                var spread = list.length <= 1 ? 0 : Math.min(Math.PI * 0.8, list.length * ROOT_MIN_STEP);
                list.forEach(function (id, i) {
                    info[id].angle = spread
                        ? center - spread / 2 + spread * ((i + 0.5) / list.length)
                        : center;
                    info[id].angled = true;
                    assignDescendants(id, info[id].angle, subtreeSpan(id));
                });
                occupied.push({ center: center, half: spread / 2 + 0.1 });
            });

            if (groups.other.length) {
                var arcs = occupied.length ? freeArcs(occupied) : [[0, R_TAU]];
                var totalFree = 0;
                arcs.forEach(function (a) { totalFree += a[1] - a[0]; });
                groups.other.forEach(function (id, i) {
                    var angle = totalFree > 1e-6
                        ? angleInFreeArcs(arcs, totalFree * ((i + 0.5) / groups.other.length))
                        : R_START + R_TAU * (i / groups.other.length);
                    info[id].angle = angle;
                    info[id].angled = true;
                    assignDescendants(id, angle, subtreeSpan(id));
                });
            }
        }

        // 按地点分树的角度分配：每个地点一棵树、各占一个扇区。
        function assignPlaceTreeAngles() {
            // 1) 按地点分组（无地点的人单独一组）
            var groups = {};
            Object.keys(info).forEach(function (id) {
                if (id === rootId) return;
                var pid = info[id].placeId == null ? '__nolocation__' : info[id].placeId;
                (groups[pid] = groups[pid] || []).push(id);
            });
            var groupKeys = Object.keys(groups).sort(function (a, b) {
                if (a === '__nolocation__') return 1;
                if (b === '__nolocation__') return -1;
                return groups[a][0] - groups[b][0]; // 按首次出现顺序
            });
            if (!groupKeys.length) return;

            // 2) 每组选根：最高辈男性 → 最高辈女性 → 往下推排行最大男性
            function genOf(id) {
                var g = info[id].gen;
                return g == null ? 99 : g;
            }
            function pickRoot(ids) {
                var minGen = Math.min.apply(null, ids.map(genOf));
                var top = ids.filter(function (id) { return genOf(id) === minGen; });
                var male = top.filter(function (id) { return info[id].gender === 'm'; });
                if (male.length) return male.sort(function (a, b) { return rankNum(info, a) - rankNum(info, b) || info[a].order - info[b].order; })[0];
                var female = top.filter(function (id) { return info[id].gender === 'f'; });
                if (female.length) return female.sort(function (a, b) { return rankNum(info, a) - rankNum(info, b) || info[a].order - info[b].order; })[0];
                // 最高辈没有男女标注：往下推，选排行最大的男性（rank 最小，null 排最后）
                var males = ids.filter(function (id) { return info[id].gender === 'm'; });
                males.sort(function (a, b) {
                    var ra = info[a].rank == null ? 999 : info[a].rank;
                    var rb = info[b].rank == null ? 999 : info[b].rank;
                    return ra - rb || genOf(a) - genOf(b) || info[a].order - info[b].order;
                });
                return males[0] || ids.slice().sort(function (a, b) { return genOf(a) - genOf(b) || info[a].order - info[b].order; })[0];
            }

            // 3) 每组内按「辈分」建父子链（不依赖跨地点关系）：
            //    最高辈为根；其他人挂到同地点里 gen 比自己高一层的长辈（排行靠前者优先），
            //    没有恰好高一辈的就往上找最近的长辈，都没有挂到根。这样树状结构只由地点内辈分决定。
            var groupRoots = {};
            var pTreeParent = {};
            var pTreeChildren = {};
            var pWeight = {};
            function pCalcW(id) {
                if (pWeight[id] !== undefined) return pWeight[id];
                var total = 1;
                (pTreeChildren[id] || []).forEach(function (c) { total += pCalcW(c); });
                pWeight[id] = total;
                return total;
            }
            groupKeys.forEach(function (key) {
                var ids = groups[key];
                var root = pickRoot(ids);
                groupRoots[key] = root;
                placeRoots.push(root);
                // 其余人按 gen 从小到大（长辈先挂）排序
                var rest = ids.filter(function (id) { return id !== root; }).sort(function (a, b) {
                    return genOf(a) - genOf(b) || rankNum(info, a) - rankNum(info, b) || info[a].order - info[b].order;
                });
                var attached = {};
                attached[root] = true;
                rest.forEach(function (id) {
                    var myGen = genOf(id);
                    var cand = null;
                    // 先找同地点里 gen 恰好比我小一辈、且已挂好的长辈
                    var elders = ids.filter(function (e) {
                        return attached[e] && genOf(e) < myGen;
                    }).sort(function (a, b) {
                        var da = myGen - genOf(a), db = myGen - genOf(b);
                        if (da !== db) return da - db; // 优先恰好高一辈
                        return rankNum(info, a) - rankNum(info, b) || info[a].order - info[b].order;
                    });
                    cand = elders[0] || root;
                    pTreeParent[id] = cand;
                    placeTreeParent[id] = cand; // 保存供画树线用
                    (pTreeChildren[cand] = pTreeChildren[cand] || []).push(id);
                    attached[id] = true;
                });
                pCalcW(root);
            });

            // 4) 扇区分配：按各地点人数加权（人多的扇区宽），而不是简单均分
            //    先算每组在各圈的最大人数，决定该组需要的角度宽度
            function placeSubtree(id, center, span) {
                info[id].angle = center;
                info[id].angled = true;
                var kids = pTreeChildren[id] || [];
                if (!kids.length) return;
                var total = 0;
                kids.forEach(function (k) { total += pWeight[k]; });
                var cursor = center - span / 2;
                kids.forEach(function (k) {
                    var share = total ? span * (pWeight[k] / total) : 0;
                    // 不再给最小扇区设下限：子节点极多时下限之和会超过父 span，
                    // 导致跨组角度重叠。packRing 会负责把同圈名框推开。
                    placeSubtree(k, cursor + share / 2, Math.max(0, share));
                    cursor += share;
                });
            }
            // 每组需求 = 该组"人数最多的那一圈"的名框总宽 / 平均半径；再换算成角度份额
            var groupDemand = {};
            groupKeys.forEach(function (key) {
                var ids = groups[key];
                var byGen = {};
                ids.forEach(function (id) {
                    var g = info[id].gen == null ? 99 : info[id].gen;
                    (byGen[g] = byGen[g] || []).push(info[id]);
                });
                var maxNeed = 1;
                Object.keys(byGen).forEach(function (g) {
                    var sum = 0;
                    byGen[g].forEach(function (n) { sum += n.titleW + R_NODE_GAP; });
                    if (sum > maxNeed) maxNeed = sum;
                });
                groupDemand[key] = maxNeed;
            });
            var totalDemand = 0;
            groupKeys.forEach(function (key) { totalDemand += groupDemand[key]; });
            var angleCursor = R_START;
            groupKeys.forEach(function (key) {
                var share = totalDemand ? R_TAU * (groupDemand[key] / totalDemand) : R_TAU / groupKeys.length;
                var center = angleCursor + share / 2;
                placeSubtree(groupRoots[key], center, share * 0.96);
                angleCursor += share;
            });
        }

        if (groupByPlace) assignPlaceTreeAngles();
        else assignRootAngles();

        var ringMap = {};
        Object.keys(info).forEach(function (id) {
            var d = info[id].depth;
            (ringMap[d] = ringMap[d] || []).push(id);
        });
        var depths = Object.keys(ringMap).map(Number).sort(function (a, b) { return a - b; });
        var radius = {};
        var prevR = 0;

        depths.forEach(function (d) {
            var ids = ringMap[d];
            var sumW = 0;
            ids.forEach(function (id) { sumW += info[id].titleW + R_NODE_GAP; });
            // 预留足够周长为 packRing 推开名框：地点分树时同圈人更多，系数要更宽松
            var need = (sumW * (groupByPlace ? 1.5 : 1.08)) / R_TAU;
            var r;
            if (d === 0) {
                r = 0;
            } else if (prevR <= 0) {
                r = Math.max(R_FIRST_RING, need);
            } else {
                r = Math.max(prevR + (unknownIds.length && d === unknownRing ? R_RING_GAP + 26 : R_RING_GAP), need);
            }
            radius[d] = r;
            if (d > 0) prevR = r;
        });

        // 没有角度的人（未连通 / 辈分未知）：在各圈内均匀铺开，不占家族分支的角度
        var noAngleIds = Object.keys(info).filter(function (id) {
            return id !== rootId && !info[id].angled;
        });
        if (noAngleIds.length) {
            var byRing = {};
            noAngleIds.forEach(function (id) {
                (byRing[info[id].depth] = byRing[info[id].depth] || []).push(id);
            });
            Object.keys(byRing).forEach(function (d) {
                var list = byRing[d];
                list.forEach(function (id, i) {
                    info[id].angle = R_START + (i / Math.max(1, list.length)) * R_TAU;
                });
            });
        }

        // 同一圈内按角序排好，再把间距不足的相邻名框推开。
        // 不能成对互推——那样会互相穿过、顺序打乱（12 个哥哥时曾叠框）。
        // 做法：从当前最大的空档处剪开圆环，沿角序只向后扩，再把整段平移回原来的中心。
        function packRing(ids, r) {
            if (!ids.length || r <= 0) return;
            ids.forEach(function (id) { info[id].angle = normAngle(info[id].angle); });
            ids.sort(function (a, b) { return info[a].angle - info[b].angle; });
            if (ids.length < 2) return;
            var n = ids.length;
            var cut = 0;
            var maxGap = -1;
            for (var i = 0; i < n; i++) {
                var a0 = info[ids[i]].angle;
                var b0 = info[ids[(i + 1) % n]].angle;
                var g0 = b0 - a0;
                if (i === n - 1) g0 += R_TAU;
                if (g0 < 0) g0 += R_TAU;
                if (g0 > maxGap) {
                    maxGap = g0;
                    cut = i;
                }
            }
            var seq = ids.slice(cut + 1).concat(ids.slice(0, cut + 1));
            var angles = [];
            seq.forEach(function (id) { angles.push(normAngle(info[id].angle)); });
            for (var ui = 1; ui < n; ui++) {
                while (angles[ui] < angles[ui - 1]) angles[ui] += R_TAU;
            }
            var oldCenter = (angles[0] + angles[n - 1]) / 2;
            for (var pi = 1; pi < n; pi++) {
                var prev = info[seq[pi - 1]];
                var cur = info[seq[pi]];
                var req = ((prev.titleW + cur.titleW) / 2 + R_NODE_GAP) / r;
                angles[pi] = Math.max(angles[pi], angles[pi - 1] + req);
            }
            var shift = oldCenter - (angles[0] + angles[n - 1]) / 2;
            seq.forEach(function (id, idx) {
                info[id].angle = normAngle(angles[idx] + shift);
            });
        }

        depths.forEach(function (d) {
            if (d > 0) packRing(ringMap[d], radius[d]);
        });

        // 外圈整体旋转，尽量让子女/配偶正对内侧的家人（第 1 圈保持从正上方开始的固定朝向）
        function rotateRing(ids, d) {
            if (!ids.length || d <= 1) return;
            var bestOff = 0;
            var bestScore = Infinity;
            for (var step = 0; step < 72; step++) {
                var off = -Math.PI + step * (R_TAU / 72);
                var score = 0;
                ids.forEach(function (id) {
                    var a = info[id];
                    (adj[id] || []).forEach(function (nb) {
                        var b = info[nb.id];
                        if (!b || b.depth == null || b.depth >= d) return;
                        var w = nb.kind === 'spouse' ? 2.2 : (nb.kind === 'parent' ? 1.4 : 0.7);
                        score += (1 - Math.cos(a.angle + off - b.angle)) * w;
                    });
                });
                if (score < bestScore - 1e-9) {
                    bestScore = score;
                    bestOff = off;
                }
            }
            ids.forEach(function (id) { info[id].angle += bestOff; });
        }
        depths.forEach(function (d) {
            if (d > 0 && !groupByPlace) rotateRing(ringMap[d], d);
        });

        // 配偶摆一起：把每对夫妻的角度调成相邻（同 gen 同半径），然后重新 pack 保证不重叠
        if (groupByPlace && placeSpouses.length) {
            placeSpouses.forEach(function (pair) {
                var a = info[pair[0]], b = info[pair[1]];
                if (!a || !b || a.gen !== b.gen) return;
                // 以男方角度为基准，女方放到紧邻（角度差 = 两人名框半宽和 / 半径）
                var r = radius[a.depth] || R_FIRST_RING;
                var delta = ((a.titleW + b.titleW) / 2 + R_NODE_GAP * 0.5) / r;
                b.angle = a.angle + delta;
                b.angled = true;
            });
            // 重新 pack 各圈，消除因对齐产生的重叠（保序推开、平移回中心）
            depths.forEach(function (d) {
                if (d > 0 && ringMap[d] && ringMap[d].length) packRing(ringMap[d], radius[d]);
            });
        }

        /* ---------- 5. 落坐标：方形画布，中心固定为「我」 ---------- */
        var maxR = 0;
        depths.forEach(function (d) { if (radius[d] > maxR) maxR = radius[d]; });
        var half = maxR + R_CANVAS_PAD;
        Object.keys(info).forEach(function (id) {
            var n = info[id];
            var halfW = Math.max(n.w, n.titleW) / 2;
            half = Math.max(half, radius[n.depth] + halfW + 34, n.h / 2 + 54);
        });
        var size = Math.max(400, Math.ceil(half * 2));
        var width = size;
        var height = size;
        var cx = width / 2;
        var cy = height / 2;

        Object.keys(info).forEach(function (id) {
            var n = info[id];
            n.angle = normAngle(n.angle);
            n.r = radius[n.depth] || 0;
            n.x = cx + Math.cos(n.angle) * n.r;
            n.y = cy + Math.sin(n.angle) * n.r;
        });

        var rings = [];
        depths.forEach(function (d) {
            if (d === 0) return;
            var isUnknown = d === unknownRing;
            rings.push({
                depth: d,
                r: radius[d],
                unreach: isUnknown,
                gen: genValues[d - 1] != null ? genValues[d - 1] : null,
                label: isUnknown ? '未连通' : (chineseNum(d) + '世')
            });
        });

        /* ---------- 6. 连线：同圈关系走外弧，父母子女走径向直连 ---------- */
        var edges = [];

        function addEdge(aId, bId, kind, types, ris) {
            var a = info[aId];
            var b = info[bId];
            if (!a || !b || aId === bId) return;
            var text = types && types.length ? sortTypes(types).join('·') : '';
            var sameRing = a.depth === b.depth;
            var curved = sameRing && kind !== 'descent';
            var d;
            var ctrl = null;
            // 父子线画成"树线"：从父框外缘沿径向出一段 → 横向拐到子的角度 → 再沿径向进子框，
            // 像二叉树/族谱的分叉连接，而不是从圆心拉一条放射直线。
            if (kind === 'descent' && !sameRing && a.r != null && b.r != null) {
                var aAng = a.angle, bAng = b.angle;
                var midR = (a.r + b.r) / 2;
                var p1x = cx + Math.cos(aAng) * (a.r + a.h / 2 + 6);
                var p1y = cy + Math.sin(aAng) * (a.r + a.h / 2 + 6);
                var p2x = cx + Math.cos(aAng) * midR;
                var p2y = cy + Math.sin(aAng) * midR;
                var p3x = cx + Math.cos(bAng) * midR;
                var p3y = cy + Math.sin(bAng) * midR;
                var p4x = cx + Math.cos(bAng) * (b.r - b.h / 2 - 6);
                var p4y = cy + Math.sin(bAng) * (b.r - b.h / 2 - 6);
                d = 'M' + r1v(p1x) + ' ' + r1v(p1y) +
                    'L' + r1v(p2x) + ' ' + r1v(p2y) +
                    'L' + r1v(p3x) + ' ' + r1v(p3y) +
                    'L' + r1v(p4x) + ' ' + r1v(p4y);
            } else if (curved) {
                var dx = b.x - a.x;
                var dy = b.y - a.y;
                var len = Math.sqrt(dx * dx + dy * dy) || 1;
                var mx = (a.x + b.x) / 2;
                var my = (a.y + b.y) / 2;
                var nx = -dy / len;
                var ny = dx / len;
                if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
                var bend = Math.min(90, Math.max(26, len * 0.18));
                ctrl = { x: mx + nx * bend, y: my + ny * bend };
                d = 'M' + r1v(a.x) + ' ' + r1v(a.y) + 'Q' + r1v(ctrl.x) + ' ' + r1v(ctrl.y) +
                    ' ' + r1v(b.x) + ' ' + r1v(b.y);
            } else {
                d = 'M' + r1v(a.x) + ' ' + r1v(a.y) + 'L' + r1v(b.x) + ' ' + r1v(b.y);
            }
            edges.push({
                kind: kind,
                ris: (ris || []).slice(),
                title: text || '关系',
                text: text,
                d: d,
                x1: a.x, y1: a.y, x2: b.x, y2: b.y,
                ctrl: ctrl,
                curved: curved,
                priority: kind === 'descent' ? 0 : (kind === 'spouse' ? 1 : 2)
            });
        }

        // 按地点分树时，父子线由布局的辈分树（placeTreeParent）决定，而不是数据里的关系边
        if (!groupByPlace) {
            norm.parents.forEach(function (l) {
                addEdge(l.parentId, l.childId, 'descent',
                    l.displayTypes && l.displayTypes.length ? l.displayTypes : l.parentTypes, l.ris);
            });
        }
        norm.spouses.forEach(function (l) {
            addEdge(l.a, l.b, 'spouse', l.types, l.ris);
        });
        norm.siblings.forEach(function (l) {
            addEdge(l.a, l.b, 'sibling', l.types, l.ris);
        });
        norm.kin.forEach(function (l) {
            addEdge(l.a, l.b, 'kin', l.types, l.ris);
        });
        // 按地点分树：画每棵树的"根→子→孙"父子线 + 每个根连到我 + 推断的配偶线
        if (groupByPlace) {
            // 父子线：用布局按辈分算出的树关系
            Object.keys(placeTreeParent).forEach(function (cid) {
                var pid = placeTreeParent[cid];
                if (!pid || !info[cid] || !info[pid]) return;
                // 同辈（同 gen）不算父子，不画线；只有跨辈才画"根→子→孙"线
                if (info[cid].gen === info[pid].gen) return;
                addEdge(pid, cid, 'descent', [], []);
            });
            // 推断的配偶线（数据里没 spouse 边时补画）
            placeSpouses.forEach(function (pair) {
                // 已有配偶边则不重复画
                var exists = norm.spouses.some(function (l) {
                    return (l.a === pair[0] && l.b === pair[1]) || (l.a === pair[1] && l.b === pair[0]);
                });
                if (!exists) addEdge(pair[0], pair[1], 'spouse', ['配偶'], []);
            });
            // 每个地点树的根连一条线到中心的「我」
            placeRoots.forEach(function (rid) {
                if (rid === rootId) return;
                addEdge(rootId, rid, 'kin', [info[rid].name || '']);
            });
        }

        /* ---------- 7. 关系字：只放在完全无遮挡的位置，宁缺勿叠 ---------- */
        var obstacles = [];
        Object.keys(info).forEach(function (id) {
            var n = info[id];
            obstacles.push({ x: n.x - n.w / 2 - 4, y: n.y - n.h / 2 - 4, w: n.w + 8, h: n.h + 8 });
            if (n.titleText) {
                var tw = textWidth(n.titleText, 10) + 8;
                obstacles.push({ x: n.x - tw / 2, y: n.y + n.h / 2 + 2, w: tw, h: 14 });
            }
        });

        function edgeCandidates(e) {
            var out = [];
            var ts = [0.5, 0.38, 0.62, 0.3, 0.7, 0.46, 0.54];
            var dx = e.x2 - e.x1;
            var dy = e.y2 - e.y1;
            var len = Math.sqrt(dx * dx + dy * dy) || 1;
            var nx = -dy / len;
            var ny = dx / len;
            ts.forEach(function (t) {
                var x, y;
                if (e.ctrl) {
                    var mt = 1 - t;
                    x = mt * mt * e.x1 + 2 * mt * t * e.ctrl.x + t * t * e.x2;
                    y = mt * mt * e.y1 + 2 * mt * t * e.ctrl.y + t * t * e.y2;
                } else {
                    x = e.x1 + dx * t;
                    y = e.y1 + dy * t;
                }
                [0, 14, -14, 24, -24].forEach(function (off) {
                    out.push({ x: x + nx * off, y: y + ny * off, anchor: 'middle' });
                });
            });
            return out;
        }

        var placed = [];
        var labelsOut = [];
        var pending = edges.filter(function (e) { return !!e.text; })
            .sort(function (a, b) {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return textWidth(b.text, LABEL_SIZE) - textWidth(a.text, LABEL_SIZE);
            });

        pending.forEach(function (e) {
            var candidates = edgeCandidates(e);
            for (var i = 0; i < candidates.length; i++) {
                var c = candidates[i];
                var box = labelBox(c, e.text);
                if (box.x < 2 || box.x + box.w > width - 2) continue;
                if (box.y < 2 || box.y + box.h > height - 2) continue;
                if (overlapScore(box, obstacles) > 0) continue;
                if (overlapScore(box, placed) > 0) continue;
                placed.push(box);
                labelsOut.push({
                    text: e.text,
                    ris: e.ris.slice(),
                    x: c.x,
                    y: c.y,
                    anchor: c.anchor,
                    dim: e.priority > 1,
                    box: box
                });
                break;
            }
        });

        var nodes = Object.keys(info).map(function (id) {
            var n = info[id];
            return {
                id: n.id,
                name: n.name,
                nameText: n.nameText,
                title: n.title,
                titleText: n.titleText,
                alias: n.alias,
                gen: n.gen,
                gender: n.gender,
                placeId: n.placeId,
                rank: n.rank,
                isRoot: n.isRoot,
                gen: n.gen,
                unreach: n.unreach,
                order: n.order,
                w: n.w,
                h: n.h,
                boxH: n.h,
                depth: n.depth,
                angle: n.angle,
                r: n.r,
                x: n.x,
                y: n.y
            };
        }).sort(function (a, b) {
            return a.depth - b.depth || a.angle - b.angle || a.order - b.order;
        });

        return {
            width: width,
            height: height,
            center: { x: cx, y: cy },
            rings: rings,
            nodes: nodes,
            edges: edges,
            labels: labelsOut,
            maxDepth: depths.length ? depths[depths.length - 1] : 0,
            boxH: R_NODE_H
        };
    }

    function r1v(v) { return round1(v); }

    var CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    function chineseNum(n) {
        if (n < 11) return CN_NUM[n] || String(n);
        if (n < 20) return '十' + CN_NUM[n - 10];
        var t = Math.floor(n / 10);
        var o = n % 10;
        return (t < 11 ? CN_NUM[t] : String(t)) + '十' + (o ? CN_NUM[o] : '');
    }

    function clampNum(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    // 自适应缩放：把 content 完整放进 view，并在 view 里居中。
    function fitTransform(contentW, contentH, viewW, viewH, pad, minScale, maxScale) {
        contentW = contentW || 0;
        contentH = contentH || 0;
        viewW = viewW || 0;
        viewH = viewH || 0;
        pad = pad == null ? 32 : pad;
        minScale = minScale == null ? 0.1 : minScale;
        maxScale = maxScale == null ? 4 : maxScale;
        if (contentW <= 0 || contentH <= 0 || viewW <= 0 || viewH <= 0) {
            return { scale: 1, tx: 0, ty: 0 };
        }
        var s = Math.min((viewW - pad * 2) / contentW, (viewH - pad * 2) / contentH);
        s = clampNum(s, minScale, maxScale);
        return {
            scale: s,
            tx: (viewW - contentW * s) / 2,
            ty: (viewH - contentH * s) / 2
        };
    }

    // 以视口内 (px, py) 为锚点缩放：锚点下的图形坐标保持不动。
    function zoomTransform(view, px, py, factor, minScale, maxScale) {
        view = view || {};
        var s0 = view.scale > 0 ? view.scale : 1;
        var tx0 = view.tx || 0;
        var ty0 = view.ty || 0;
        minScale = minScale == null ? 0.1 : minScale;
        maxScale = maxScale == null ? 4 : maxScale;
        var s1 = clampNum(s0 * (factor || 1), minScale, maxScale);
        var ratio = s1 / s0;
        return {
            scale: s1,
            tx: px - (px - tx0) * ratio,
            ty: py - (py - ty0) * ratio
        };
    }

    /* ---------- 关系字候选位置 ---------- */

    function descentCandidates(x, yTop, yBottom) {
        var out = [];
        var span = yBottom - yTop;
        [0.5, 0.3, 0.7, 0.15, 0.85].forEach(function (t) {
            var y = yTop + span * t;
            out.push({ x: x + 7, y: y, anchor: 'start' });
            out.push({ x: x - 7, y: y, anchor: 'end' });
            out.push({ x: x + 15, y: y, anchor: 'start' });
            out.push({ x: x - 15, y: y, anchor: 'end' });
        });
        return out;
    }

    // 同世绕行线的关系字：放在横杆上方/下方，避免压到横杆
    function detourCandidates(x1, x2, lineY) {
        var out = [];
        [0.5, 0.32, 0.68].forEach(function (t) {
            var x = x1 + (x2 - x1) * t;
            out.push({ x: x, y: lineY - 10, anchor: 'middle' });
            out.push({ x: x, y: lineY + 17, anchor: 'middle' });
        });
        return out;
    }

    function kinCandidates(x1, y1, x2, y2) {        var dx = x2 - x1, dy = y2 - y1;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var nx = -dy / len, ny = dx / len;
        var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        var out = [];
        [[0.5, 0], [0.5, 13], [0.5, -13], [0.38, 0], [0.62, 0],
         [0.5, 26], [0.5, -26], [0.38, 15], [0.62, -15],
         [0.26, 0], [0.74, 0], [0.5, 38], [0.5, -38],
         [0.26, 24], [0.74, -24]].forEach(function (p) {
            var t = p[0], off = p[1];
            out.push({
                x: mx + dx * (t - 0.5) + nx * off,
                y: my + dy * (t - 0.5) + ny * off,
                anchor: 'middle'
            });
        });
        return out;
    }

    function labelBox(c, text) {
        var w = textWidth(text, LABEL_SIZE) + LABEL_PAD * 2;
        var h = LABEL_SIZE + 5;
        var x = c.anchor === 'end' ? c.x - w : (c.anchor === 'middle' ? c.x - w / 2 : c.x);
        return { x: x, y: c.y - LABEL_SIZE, w: w, h: h };
    }

    function overlap(a, b) {
        var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        var h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (w <= 0 || h <= 0) return 0;
        return w * h;
    }

    function overlapScore(box, list) {
        var s = 0;
        for (var i = 0; i < list.length; i++) s += overlap(box, list[i]);
        return s;
    }

    return {
        layout: layout,
        radial: radial,
        fitTransform: fitTransform,
        zoomTransform: zoomTransform,
        textWidth: textWidth,
        fitText: fitText,
        BOX_H: BOX_H,
        ROW_H: ROW_H,
        LEFT_W: LEFT_W,
        normalize: normalizeRelations
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GraphLayout;
