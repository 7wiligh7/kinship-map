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

    var BOX_H = 36;          // 名框高度
    var TITLE_DY = 52;       // 称谓文字基线（相对名框顶部）
    var ROW_H = 136;         // 世与世之间的行距
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
            var w = Math.max(MIN_W, textWidth(p.name, 13) + 26, textWidth(title, 11) + 24);
            w = Math.min(MAX_W, w);
            info[p.id] = {
                id: p.id,
                name: p.name || '',
                title: title,
                titleText: fitText(title, 11, w - 18),
                alias: l.alias || [],
                gen: l.gen,
                gender: p.gender || '',
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
                // 同辈有排行的按排行从小到大（23公 排在 24公 左边）
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
                // 排行优先于重心：同辈按 13、14… 从左到右排，没排行的再按重心/录入顺序
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

        // 未连通的人另起一行
        var unreachRow = null;
        var nodes = [];
        var unreachNodes = [];
        if (unreach.length) {
            // 未连通的也按排行排（没排行的保持录入顺序，Array.sort 稳定）
            unreach.sort(function (a, b) {
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
            unreach.forEach(function (p, i) {
                var w = Math.min(MAX_W, Math.max(MIN_W, textWidth(p.name, 13) + 26));
                unreachNodes.push({
                    id: p.id, name: p.name || '', title: '', titleText: '',
                    alias: [], gen: null, gender: p.gender || '', isRoot: false,
                    w: w, x: 0, y: unreachRow.y
                });
                total += w + (i ? ROW_GAP : 0);
            });
            var x = -total / 2;
            unreachNodes.forEach(function (n) {
                n.x = x + n.w / 2;
                x += n.w + ROW_GAP;
            });
        }

        // 归一化到正坐标
        var minX = Infinity, maxRight = -Infinity;
        function scan(n) {
            minX = Math.min(minX, n.x - n.w / 2);
            maxRight = Math.max(maxRight, n.x + n.w / 2);
        }
        connected.forEach(function (id) {
            var n = info[id];
            n.y = rows[rowOfGen[n.gen]].y;
            scan(n);
            nodes.push(n);
        });
        unreachNodes.forEach(scan);
        if (!nodes.length && !unreachNodes.length) {
            return { width: 0, height: 0, rows: [], nodes: [], edges: [], labels: [] };
        }
        var shift = LEFT_W + PAD_X - minX;
        nodes.concat(unreachNodes).forEach(function (n) { n.x += shift; });
        var width = maxRight + shift + PAD_X;
        var rowsAll = rows.slice();
        if (unreachRow) {
            unreachRow.y = PAD_TOP + rows.length * ROW_H;
            unreachNodes.forEach(function (n) { n.y = unreachRow.y; });
            rowsAll.push(unreachRow);
        }
        var height = PAD_TOP + rowsAll.length * ROW_H + PAD_BOTTOM - 26;

        // 世系标题
        rowsAll.forEach(function (row) {
            if (row.kind === 'unreach') {
                row.label = '未连通';
            } else {
                var n = row.gen - gens[0] + 1;
                row.label = cnNum(n) + '世';
            }
        });

        /* ---------- 4. 画图：只用归一化、归类后的关系生成线 ---------- */

        var edges = [];

        // 父母→子女：同一父母组合 + 同一世只画一条下垂线/一根横杆
        Object.keys(parentGroups).forEach(function (key) {
            var g = parentGroups[key];
            var parents = g.parentIds.map(function (id) { return info[id]; }).filter(Boolean);
            if (!parents.length) return;
            parents.sort(function (a, b) { return a.x - b.x; });
            var pBottom = Math.max.apply(null, parents.map(function (p) { return p.y + BOX_H; }));
            var childNodes = g.children.map(function (id) { return info[id]; }).filter(Boolean);
            if (!childNodes.length) return;
            var minChildY = Math.min.apply(null, childNodes.map(function (n) { return n.y; }));
            var railY = Math.max(parents[0].y + 74, (pBottom + minChildY) / 2 + 4);

            var anchorX = avg(parents.map(function (p) { return p.x; }));
            var d = [];
            if (parents.length >= 2) {
                parents.forEach(function (p) {
                    d.push('M' + r1(p.x) + ' ' + r1(p.y + BOX_H) + 'H' + r1(anchorX));
                });
            }
            d.push('M' + r1(anchorX) + ' ' + r1(pBottom) + 'V' + r1(railY));

            var xs = childNodes.map(function (n) { return n.x; });
            var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
            if (maxX - minX > 0.5) d.push('M' + r1(minX) + ' ' + r1(railY) + 'H' + r1(maxX));
            childNodes.forEach(function (n) {
                d.push('M' + r1(n.x) + ' ' + r1(railY) + 'V' + r1(n.y));
            });

            var text = sortTypes(g.parentTypes.length ? g.parentTypes : g.childTypes).join('·');
            edges.push({
                kind: 'descent',
                ris: g.ris.slice(),
                d: d.join(' '),
                title: text,
                label: {
                    text: text,
                    candidates: descentCandidates(anchorX, pBottom, railY),
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

        // 节点障碍：名框 + 框下称谓文字
        var obstacles = [];
        nodes.forEach(function (n) {
            obstacles.push({ x: n.x - n.w / 2 - 4, y: n.y - 4, w: n.w + 8, h: BOX_H + 8 });
            if (n.titleText) {
                var tw = textWidth(n.titleText, 11) + 8;
                obstacles.push({ x: n.x - tw / 2, y: n.y + BOX_H + 6, w: tw, h: 16 });
            }
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
            boxH: BOX_H
        };

        function r1(v) { return Math.round(v * 10) / 10; }
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
        textWidth: textWidth,
        fitText: fitText,
        BOX_H: BOX_H,
        ROW_H: ROW_H,
        LEFT_W: LEFT_W,
        normalize: normalizeRelations
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GraphLayout;
