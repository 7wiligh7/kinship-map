// 人物关系图布局（graphlayout.js）测试：族谱式分世、夫妻相邻、父母下垂线、
// 关系文字避让（不叠字、不压名框）、未连通单独成行。
var path = require('path');
require(path.join(__dirname, '..', 'kinship.js'));
var Kinship = globalThis.Kinship;
var GraphLayout = require(path.join(__dirname, '..', 'graphlayout.js'));

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + msg); } }

function person(id, name, gender, placeId) {
    return {
        id: id, name: name, gender: gender || '', age: null, titles: [],
        placeId: placeId === undefined ? 'pl1' : placeId
    };
}
function rel(from, to, type) { return { from: from, to: to, type: type }; }

function layoutOf(persons, relations, rootId) {
    var k = Kinship.compute(rootId, persons, relations);
    return GraphLayout.layout({
        persons: persons,
        relations: relations,
        labels: k.labels,
        rootId: rootId
    });
}
function nodeOf(g, id) {
    return g.nodes.filter(function (n) { return n.id === id; })[0];
}
function rowOf(g, id) {
    var n = nodeOf(g, id);
    return g.rows.filter(function (r) { return r.y === n.y; })[0];
}
function rowNodes(g, row) {
    return g.nodes.filter(function (n) { return n.y === row.y; })
        .sort(function (a, b) { return a.x - b.x; });
}
function overlaps(a, b) {
    return Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) + 0.01 &&
        Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y) + 0.01;
}

/* ---------- 1. 四世同堂：分世、夫妻相邻、父母下垂线 ---------- */
var persons = [
    person('gf', '爷爷', 'm'), person('gm', '奶奶', 'f'),
    person('fa', '爸爸', 'm'), person('mo', '妈妈', 'f'),
    person('me', '我', 'm'), person('wife', '媳妇', 'f'),
    person('son', '儿子', 'm'), person('dau', '女儿', 'f')
];
var relations = [
    rel('gf', 'fa', '父亲'), rel('gm', 'fa', '母亲'),
    rel('fa', 'me', '父亲'), rel('mo', 'me', '母亲'),
    rel('me', 'wife', '配偶'),
    rel('me', 'son', '父亲'), rel('me', 'dau', '父亲'),
    rel('gf', 'gm', '配偶'), rel('fa', 'mo', '配偶')
];
var g = layoutOf(persons, relations, 'me');

ok(g.nodes.length === 8, '8 个人都应排入图中（实际 ' + g.nodes.length + '）');
ok(g.rows.length === 4, '四世应分 4 行（实际 ' + g.rows.length + '）');
ok(g.rows[0].label === '一世' && g.rows[1].label === '二世' && g.rows[2].label === '三世',
    '世系编号从最上一世开始：' + g.rows.map(function (r) { return r.label; }).join(' '));
ok(g.rows[2].isRootRow === true, '「我」所在世应标记为 root 行');
ok(g.rows[0].y < g.rows[1].y && g.rows[1].y < g.rows[2].y && g.rows[2].y < g.rows[3].y,
    '祖先在上、后代在下（y 递增）');

// 夫妻同世、相邻、男左女右
[['gf', 'gm'], ['fa', 'mo'], ['me', 'wife']].forEach(function (pair) {
    var a = nodeOf(g, pair[0]), b = nodeOf(g, pair[1]);
    ok(a && b && a.y === b.y, pair.join('/') + ' 应为同一世');
    ok(a && b && a.x < b.x, pair.join('/') + ' 男左女右');
    var row = g.rows.filter(function (r) { return r.y === a.y; })[0];
    var ns = rowNodes(g, row);
    var ia = ns.indexOf(a), ib = ns.indexOf(b);
    ok(Math.abs(ia - ib) === 1, pair.join('/') + ' 在行内应严格相邻');
});

// 同一世名框不重叠
g.rows.forEach(function (row) {
    var ns = rowNodes(g, row);
    for (var i = 1; i < ns.length; i++) {
        var left = ns[i - 1], right = ns[i];
        ok(left.x + left.w / 2 <= right.x - right.w / 2 + 0.01,
            '同一世名框不重叠：' + left.name + ' / ' + right.name);
    }
});

// 父母→子女：爸爸+妈妈 到「我」只画一条下垂线，关系字合并为「父亲·母亲」
var meEdges = g.edges.filter(function (e) {
    return e.kind === 'descent' && e.ris.indexOf(2) > -1 && e.ris.indexOf(3) > -1;
});
ok(meEdges.length === 1, '父亲/母亲到「我」应合并成一条下垂线（实际 ' + meEdges.length + '）');
if (meEdges.length) {
    ok(meEdges[0].label.text === '父亲·母亲', '合并后的关系字为「父亲·母亲」（实际 ' + meEdges[0].label.text + '）');
    ok(/V/.test(meEdges[0].d) && /H/.test(meEdges[0].d), '下垂线应是先垂直再水平再垂直的折线');
}

// 婚线：位于两框之间、同一高度，且不标字
var spouseEdge = g.edges.filter(function (e) { return e.kind === 'spouse' && e.ris.indexOf(4) > -1; })[0];
ok(!!spouseEdge, '应有夫妻婚线');
if (spouseEdge) {
    var meN = nodeOf(g, 'me'), wifeN = nodeOf(g, 'wife');
    ok(Math.abs(spouseEdge.y1 - spouseEdge.y2) < 0.01, '婚线应水平');
    ok(spouseEdge.x1 >= meN.x + meN.w / 2 - 0.01 && spouseEdge.x2 <= wifeN.x - wifeN.w / 2 + 0.01,
        '婚线连接两个名框的内侧边缘');
    ok(!spouseEdge.label, '婚线不标「配偶」字（节点称谓已有）');
}

/* ---------- 2. 关系文字：不叠字、不压名框、不出界 ---------- */
function assertLabels(g, tag) {
    for (var i = 0; i < g.labels.length; i++) {
        var l = g.labels[i];
        ok(l.box.x >= 0 && l.box.x + l.box.w <= g.width + 0.01, tag + '：关系字不出左右边界（' + l.text + '）');
        ok(l.box.y >= 0 && l.box.y + l.box.h <= g.height + 0.01, tag + '：关系字不出上下边界（' + l.text + '）');
        for (var j = i + 1; j < g.labels.length; j++) {
            ok(!overlaps(l.box, g.labels[j].box),
                tag + '：关系字不重叠（' + l.text + ' / ' + g.labels[j].text + '）');
        }
        g.nodes.forEach(function (n) {
            var box = { x: n.x - n.w / 2, y: n.y, w: n.w, h: GraphLayout.BOX_H };
            ok(!overlaps(l.box, box), tag + '：关系字不压名框（' + l.text + ' / ' + n.name + '）');
            if (n.titleText) {
                var tw = GraphLayout.textWidth(n.titleText, 11) + 4;
                var tbox = { x: n.x - tw / 2, y: n.y + GraphLayout.BOX_H + 5, w: tw, h: 14 };
                ok(!overlaps(l.box, tbox), tag + '：关系字不压称谓文字（' + l.text + ' / ' + n.titleText + '）');
            }
        });
    }
}
assertLabels(g, '四世同堂');

/* ---------- 3. 旁系（伯父、堂兄弟）与更宽的一行 ---------- */
var persons2 = persons.concat([
    person('uncle', '伯父', 'm'), person('aunt', '伯母', 'f'),
    person('cousin', '堂哥', 'm')
]);
var relations2 = relations.concat([
    rel('gf', 'uncle', '父亲'),
    rel('uncle', 'aunt', '配偶'),
    rel('uncle', 'cousin', '父亲'),
    rel('cousin', 'me', '堂兄弟')
]);
var g2 = layoutOf(persons2, relations2, 'me');
ok(g2.nodes.length === 11, '旁系扩展后 11 人都在图里（实际 ' + g2.nodes.length + '）');
var kinEdge = g2.edges.filter(function (e) {
    return e.kind === 'kin' && e.label && e.label.text === '堂兄弟';
})[0];
ok(!!kinEdge, '旁系关系（堂兄弟）应有单独连线与关系字');
ok(!!kinEdge && /V/.test(kinEdge.d || '') && /H/.test(kinEdge.d || ''),
    '同世且中间隔着别人时，旁系线应绕到名框上方（不穿过中间名框）');
assertLabels(g2, '旁系家族');

/* ---------- 4. 反向关系写法（A 是 B 的儿子）也能识别为父母→子女 ---------- */
var rel3 = [rel('son2', 'me', '儿子')];
var persons3 = [person('me', '我', 'm'), person('son2', '小儿子', 'm')];
var g3 = layoutOf(persons3, rel3, 'me');
var e3 = g3.edges.filter(function (e) { return e.kind === 'descent'; })[0];
ok(!!e3, '「A 是 B 的儿子」应识别为父母→子女下垂线');
if (e3) {
    ok(e3.label.text === '儿子', '关系字保持用户填写的「儿子」（实际 ' + e3.label.text + '）');
    var me3 = nodeOf(g3, 'me'), son3 = nodeOf(g3, 'son2');
    ok(e3.anchorX === me3.x, '下垂线从父亲（B）名框下方出发');
    ok(son3.y > me3.y, '儿子排在下世');
}

/* ---------- 5. 未连通的人单独一行 ---------- */
var persons4 = persons.concat([person('solo', '远房亲戚', 'm')]);
var g4 = layoutOf(persons4, relations, 'me');
var solo = nodeOf(g4, 'solo');
var ur = g4.rows.filter(function (r) { return r.kind === 'unreach'; })[0];
ok(!!ur && ur.label === '未连通', '未连通的人应有「未连通」行');
ok(solo && ur && solo.y === ur.y, '未连通的人排在单独一行');
ok(g4.edges.every(function (e) { return e.ris.every(function (ri) { return ri < relations.length; }); }),
    '未连通的人不参与关系线');

/* ---------- 6. 结果稳定：同一份数据两次布局一致 ---------- */
var g5 = layoutOf(persons, relations, 'me');
ok(JSON.stringify(g.nodes) === JSON.stringify(g5.nodes), '同一份数据两次布局的节点坐标一致');
ok(JSON.stringify(g.labels) === JSON.stringify(g5.labels), '同一份数据两次布局的关系字位置一致');

/* ---------- 7. 关系字宽度估算与截断 ---------- */
ok(GraphLayout.textWidth('爷爷', 11) > GraphLayout.textWidth('ab', 11), '中文按整字宽估算，应宽于等长英文');
var longTitle = '父亲的哥哥的儿子的妻子的母亲';
var cut = GraphLayout.fitText(longTitle, 11, 60);
ok(cut.length < longTitle.length && /…$/.test(cut), '过长的称谓应截断并加省略号');

/* ---------- 8. 先归一化、再归类：正反/重复关系只画一次 ---------- */

// 8.1 归一化结构：同一对父子正反各记一次 → 一条父母链接、两个原始 ri
var norm1 = GraphLayout.normalize([
    rel('dad', 'kid', '父亲'),
    rel('kid', 'dad', '儿子')
], { dad: {}, kid: {} });
ok(norm1.parents.length === 1, '正反父子关系归一化后只剩一条父母链接（实际 ' + norm1.parents.length + '）');
if (norm1.parents.length) {
    ok(norm1.parents[0].parentId === 'dad' && norm1.parents[0].childId === 'kid',
        '归一化后的父母链接方向统一为「父辈 → 子女」');
    ok(norm1.parents[0].ris.length === 2, '两个原始关系索引都保留，悬停高亮不丢线');
    ok(norm1.parents[0].displayTypes.join('·') === '父亲',
        '正写「父亲」优先，不出现「父亲·儿子」（实际 ' + norm1.parents[0].displayTypes.join('·') + '）');
}

// 8.2 画图时只画一条父母下垂线，不再把反写关系画成旁系线
var personsDup = [person('dad', '爸爸', 'm'), person('kid', '小明', 'm')];
var gDup = layoutOf(personsDup, [
    rel('dad', 'kid', '父亲'),
    rel('kid', 'dad', '儿子')
], 'kid');
var descDup = gDup.edges.filter(function (e) { return e.kind === 'descent'; });
ok(descDup.length === 1, '正反父子只画一条父母下垂线（实际 ' + descDup.length + '）');
if (descDup.length) {
    ok(descDup[0].ris.slice().sort().join(',') === '0,1', '下垂线同时带上两个原始关系的索引');
    ok(descDup[0].label.text === '父亲', '关系字只标「父亲」');
}
ok(gDup.edges.filter(function (e) { return e.kind === 'kin'; }).length === 0,
    '反写的「儿子」不再额外画成一条旁系线');

// 8.3 配偶正反各记一次 → 只画一条婚线
var gSpDup = layoutOf([
    person('a', '阿甲', 'm'), person('b', '阿乙', 'f')
], [
    rel('a', 'b', '配偶'),
    rel('b', 'a', '配偶')
], 'a');
var spouseDup = gSpDup.edges.filter(function (e) { return e.kind === 'spouse'; });
ok(spouseDup.length === 1, '正反配偶关系只画一条婚线（实际 ' + spouseDup.length + '）');
if (spouseDup.length) ok(spouseDup[0].ris.length === 2, '婚线保留两个原始关系索引');

// 8.4 兄弟姐妹已有共同父母时，不再重复画兄弟姐妹线
var personsSib = [
    person('f', '父亲', 'm'), person('m', '母亲', 'f'),
    person('s1', '大哥', 'm'), person('s2', '小弟', 'm')
];
var gSib = layoutOf(personsSib, [
    rel('f', 's1', '父亲'), rel('m', 's1', '母亲'),
    rel('f', 's2', '父亲'), rel('m', 's2', '母亲'),
    rel('f', 'm', '配偶'),
    rel('s1', 's2', '哥哥')
], 's1');
ok(gSib.edges.filter(function (e) { return e.kind === 'descent'; }).length === 1,
    '同一父母的兄弟姐妹共用一条父母下垂线');
ok(gSib.edges.filter(function (e) { return e.kind === 'kin'; }).length === 0,
    '已有父母线时不再重复画「哥哥/弟弟」旁系线');
var descSib = gSib.edges.filter(function (e) { return e.kind === 'descent'; })[0];
ok(!!descSib && descSib.ris.indexOf(5) > -1,
    '兄弟姐妹关系的原始索引并进父母线，悬停高亮仍能亮到父母线');

// 8.5 没有共同父母时，兄弟姐妹关系仍要画出来
var gSib2 = layoutOf([
    person('s1', '大哥', 'm'), person('s2', '小弟', 'm')
], [rel('s1', 's2', '哥哥')], 's1');
ok(gSib2.edges.some(function (e) { return e.kind === 'kin' && e.title === '哥哥'; }),
    '没有父母信息时，兄弟姐妹关系单独画线');

// 8.6 同一旁系关系正反各记一次 → 只画一条线，关系字不重复
var gKinDup = layoutOf([
    person('a', '甲', 'm'), person('b', '乙', 'm')
], [
    rel('a', 'b', '堂兄弟'),
    rel('b', 'a', '堂兄弟')
], 'a');
var kinDup = gKinDup.edges.filter(function (e) { return e.kind === 'kin'; });
ok(kinDup.length === 1, '正反旁系关系只画一条线（实际 ' + kinDup.length + '）');
if (kinDup.length) {
    ok(kinDup[0].ris.length === 2, '旁系线保留两个原始关系索引');
    ok(kinDup[0].title === '堂兄弟', '关系字不重复（实际 ' + kinDup[0].title + '）');
}

// 8.7 父母关系顺序打乱，关系字仍按「父亲·母亲」统一归类
var gOrder = layoutOf([
    person('dad', '爸爸', 'm'), person('mom', '妈妈', 'f'), person('kid', '孩子', 'm')
], [
    rel('mom', 'kid', '母亲'),
    rel('dad', 'kid', '父亲'),
    rel('dad', 'mom', '配偶')
], 'kid');
var descOrder = gOrder.edges.filter(function (e) { return e.kind === 'descent'; });
ok(descOrder.length === 1, '父亲/母亲/孩子三人只画一条父母下垂线');
if (descOrder.length) {
    ok(descOrder[0].label.text === '父亲·母亲',
        '关系字按父亲→母亲统一排序（实际 ' + descOrder[0].label.text + '）');
}

/* ---------- 9. 直接填祖辈/孙辈：孙辈必须排在下两世，不能和子女同一世 ---------- */
var gGrand = layoutOf([
    person('me', '我', 'm'), person('son', '儿子', 'm'),
    person('gs', '孙子', 'm'), person('co', '孙子的堂哥', 'm')
], [
    rel('son', 'me', '儿子'),
    rel('gs', 'me', '孙子'),
    rel('co', 'gs', '堂兄弟')
], 'me');
ok(rowOf(gGrand, 'me').label === '一世', '「我」在一世');
ok(rowOf(gGrand, 'son').label === '二世', '儿子在二世');
ok(rowOf(gGrand, 'gs').label === '三世', '直接填「孙子」应在三世（修复前误入二世）');
ok(rowOf(gGrand, 'co').label === '三世', '孙子的堂哥应与孙子同在三世（修复前误入二世）');

/* ---------- 排行排序：同辈按名字前的排行从左到右 ---------- */
var rp = [
    person('r23', '23哥', 'm'), person('r21', '21哥', 'm'), person('me', '我', 'm')
];
var rr = [
    rel('r23', 'me', '哥哥'), rel('r21', 'me', '哥哥')
];
var gr = layoutOf(rp, rr, 'me');
var n21 = nodeOf(gr, 'r21'), n23 = nodeOf(gr, 'r23');
ok(!!n21 && !!n23 && n21.x < n23.x,
    '同辈按排行排：21哥 应在 23哥 左边（' + (n21 ? n21.x : '?') + ' vs ' + (n23 ? n23.x : '?') + '）');

// 未连通行也按排行排
var ur = layoutOf([person('u1', '24公'), person('u2', '23公'), person('me', '我')], [], 'me');
var nu1 = nodeOf(ur, 'u1'), nu2 = nodeOf(ur, 'u2');
ok(!!nu1 && !!nu2 && nu2.x < nu1.x,
    '未连通的也按排行排：23公 应在 24公 左边（' + (nu2 ? nu2.x : '?') + ' vs ' + (nu1 ? nu1.x : '?') + '）');

/* ---------- 地点分组大框：同一世、同一地点的人圈进一个框 ---------- */
function layoutWithPlaces(persons, relations, rootId, places) {
    var k = Kinship.compute(rootId, persons, relations);
    return GraphLayout.layout({
        persons: persons, relations: relations, labels: k.labels,
        places: places || [], rootId: rootId
    });
}
function groupOf(g, id) {
    var n = nodeOf(g, id);
    if (!n) return null;
    // 节点 x 是名框中心，比较时换算成左右边界
    return (g.groups || []).filter(function (gp) {
        return n.x - n.w / 2 >= gp.x - 0.01 && n.x + n.w / 2 <= gp.x + gp.w + 0.01 &&
            n.y >= gp.y - 0.01 && n.y + g.boxH <= gp.y + gp.h + 0.01;
    })[0] || null;
}
function sameGroup(g, a, b) {
    var ga = groupOf(g, a), gb = groupOf(g, b);
    return !!ga && ga === gb;
}

var gpA = person('ga', '甲哥', 'm', 'pA'), gpB = person('gb', '乙弟', 'm', 'pA');
var gpC = person('gc', '丙哥', 'm', 'pB');
var ggMe = person('gme', '我', 'm', 'pA');
var gg = layoutWithPlaces([
    gpA, gpB, gpC, ggMe
], [
    rel('ga', 'gme', '哥哥'), rel('gb', 'gme', '弟弟'), rel('gc', 'gme', '哥哥')
], 'gme', [{ id: 'pA', name: '甲村' }, { id: 'pB', name: '乙村' }]);

ok(!!g.groups, '布局应返回 groups 分组框');
ok(sameGroup(gg, 'ga', 'gb'), '同一世 + 同一地点（甲村）应圈进同一个大框');
ok(!sameGroup(gg, 'ga', 'gc'), '同一世但不同地点（甲村/乙村）不应同框');
var gGa = groupOf(gg, 'ga'), gGc = groupOf(gg, 'gc');
ok(!!gGa && gGa.label === '甲村', '甲村的框应带「甲村」标签（实际 ' + (gGa ? gGa.label : '无框') + '）');
ok(!!gGc && gGc.label === '乙村', '乙村的框应带「乙村」标签（实际 ' + (gGc ? gGc.label : '无框') + '）');
ok(!!gGa && !!gGc && gGa.x + gGa.w <= gGc.x + 0.01,
    '同辈按地点聚拢：甲村的框整体在乙村左边（' + (gGa ? gGa.x + gGa.w : '?') + ' vs ' + (gGc ? gGc.x : '?') + '）');
ok(!!gGa && gg.nodes.filter(function (n) { return n.placeId === 'pA' && n.gen != null; })
    .every(function (n) { return n.x - n.w / 2 >= gGa.x && n.x + n.w / 2 <= gGa.x + gGa.w; }),
    '甲村框应完整包住甲村同世的人');

// 夫妻来自不同地点：各归各的框，婚线跨框
var swMe = person('sme', '我', 'm', 'pA'), swW = person('sw', '媳妇', 'f', 'pB');
var swSon = person('sson', '儿子', 'm', 'pA');
var gw = layoutWithPlaces([swMe, swW, swSon], [
    rel('sme', 'sw', '配偶'), rel('sme', 'sson', '父亲')
], 'sme', [{ id: 'pA', name: '甲村' }, { id: 'pB', name: '乙村' }]);
var gMe = groupOf(gw, 'sme'), gW = groupOf(gw, 'sw');
ok(!!gMe && !!gW && gMe !== gW,
    '夫妻跨地点应各归各的地点框（实际 ' + (gMe ? gMe.label : '无') + ' / ' + (gW ? gW.label : '无') + '）');
ok(!!gMe && gMe.label === '甲村' && !!gW && gW.label === '乙村',
    '我（甲村）与媳妇（乙村）应分别进甲村/乙村框');

// 没挂地点的人不进任何框
var npMe = person('nme', '我', 'm', null), npU = person('nu', '表叔', 'm', null);
var gn = layoutWithPlaces([npMe, npU], [rel('npU', 'nme', '表叔')], 'nme', []);
ok((gn.groups || []).length === 0, '没挂地点的人不应产生分组框（实际 ' + (gn.groups || []).length + '）');

/* ---------- 折行（wrap）：人多时一个世排成多行，整图尽量正方形 ---------- */
var many = [person('wme', '我', 'm')];
var manyR = [];
for (var wi = 1; wi <= 12; wi++) {
    many.push(person('wb' + wi, '兄弟' + wi, 'm', 'pA'));
    manyR.push(rel('wb' + wi, 'wme', '哥哥'));
}
function layoutWrap(ps, rs, rootId, wrap) {
    var kk = Kinship.compute(rootId, ps, rs);
    return GraphLayout.layout({
        persons: ps, relations: rs, labels: kk.labels, rootId: rootId, wrap: wrap
    });
}
var gwOff = layoutWrap(many, manyR, 'wme', false);
var gwOn = layoutWrap(many, manyR, 'wme', true);
var rowNodesOn = gwOn.nodes.filter(function (n) { return n.id !== 'wme'; });
var distinctY = {};
rowNodesOn.forEach(function (n) { distinctY[n.y] = true; });
ok(Object.keys(distinctY).length > 1,
    '折行开启后，同世 12 兄弟应分到多个物理行（实际 ' + Object.keys(distinctY).length + ' 行）');
ok(gwOn.height > gwOff.height, '折行让图变高（' + gwOff.height + ' → ' + gwOn.height + '）');
ok(gwOn.width < gwOff.width, '折行让图变窄（' + gwOff.width + ' → ' + gwOn.width + '）');
// 尽量正方形：折行后宽高比应比折行前更接近 1
var ratioOff = Math.max(gwOff.width / gwOff.height, gwOff.height / gwOff.width);
var ratioOn = Math.max(gwOn.width / gwOn.height, gwOn.height / gwOn.width);
ok(ratioOn < ratioOff, '折行后整图更接近正方形（比例 ' + ratioOff.toFixed(2) + ' → ' + ratioOn.toFixed(2) + '）');
ok(gwOn.nodes.length === gwOff.nodes.length, '折行不应丢人');
ok(gwOn.rows.every(function (r) { return Array.isArray(r.ys) && r.ys.length >= 1; }),
    '折行后每世带 ys 物理行列表');

// 去横杆：父母分叉到每个子女，水平段各自独立、高度错开（不叠成一根贯穿横杆）
var forkP = [person('fme', '我', 'm'), person('ffa', '父亲', 'm'),
    person('fb1', '大伯', 'm'), person('fb2', '二伯', 'm'), person('fgf', '爷爷', 'm')];
var forkR = [rel('ffa', 'fme', '父亲'), rel('fb1', 'fme', '伯父'), rel('fb2', 'fme', '伯父'),
    rel('fgf', 'fb1', '父亲'), rel('fgf', 'fb2', '父亲')];
var gfK = Kinship.compute('fme', forkP, forkR);
var gfG = GraphLayout.layout({ persons: forkP, relations: forkR, labels: gfK.labels, rootId: 'fme' });
var forkEdge = gfG.edges.filter(function (e) {
    return e.kind === 'descent' && e.ris.length >= 2;
})[0];
ok(!!forkEdge, '有两个子女的父母组合应有一条下垂边');
if (forkEdge) {
    var hYs = [];
    var hRe = /H(-?\d+(?:\.\d+)?)/g, hm;
    // H 段前的 V 值即该分叉的水平段高度：从 "M x y H x V" 里取 y
    var segRe = /M(-?[\d.]+) (-?[\d.]+)H(-?[\d.]+)V/g, sm;
    while ((sm = segRe.exec(forkEdge.d))) hYs.push(Number(sm[2]));
    ok(hYs.length >= 2 && hYs[0] !== hYs[1],
        '每个子女一条分叉线，水平段高度错开、不叠成一根横杆（实际 ' + JSON.stringify(hYs) + '）');
}

// 同父母的一大排同辈人：不应因「一家人同行」被锁死在一行，同一地点人多就折行
var famP = [person('fme', '我', 'm'), person('fgf2', '爷爷', 'm')], famR = [rel('fgf2', 'fme', '父亲')];
for (var fi = 1; fi <= 12; fi++) {
    famP.push(person('fs' + fi, '兄弟' + fi, 'm', 'pA'));
    famR.push(rel('fgf2', 'fs' + fi, '父亲'));
}
var famK = Kinship.compute('fme', famP, famR);
var famG = GraphLayout.layout({ persons: famP, relations: famR, labels: famK.labels, rootId: 'fme', wrap: true });
var sibYs = {};
famG.nodes.filter(function (n) { return n.id.indexOf('fs') === 0; }).forEach(function (n) { sibYs[n.y] = 1; });
ok(Object.keys(sibYs).length >= 2,
    '同一地点 12 个同父母兄弟应折成多行（实际 ' + Object.keys(sibYs).length + ' 行）');
ok(famG.groups.length >= 2, '折行后同一地点应有多行分组框（实际 ' + famG.groups.length + ' 个）');

// 宽度适应屏幕：给 panelWidth 时每行数量按宽度算，图宽不超过面板
var scrP = [person('sme', '我', 'm')], scrR = [];
for (var si = 1; si <= 16; si++) {
    scrP.push(person('ss' + si, '同辈' + si, 'm', 'pA'));
    scrR.push(rel('ss' + si, 'sme', '哥哥'));
}
var scrK = Kinship.compute('sme', scrP, scrR);
var scrG = GraphLayout.layout({ persons: scrP, relations: scrR, labels: scrK.labels,
    rootId: 'sme', wrap: true, panelWidth: 800 });
var scrSib = scrG.nodes.filter(function (n) { return n.id.indexOf('ss') === 0; });
var scrYs = {};
scrSib.forEach(function (n) { scrYs[n.y] = 1; });
ok(Object.keys(scrYs).length > 1, 'panelWidth=800 时 16 同辈应折成多行（实际 ' + Object.keys(scrYs).length + '）');
// 每行内节点的横向跨度应小于面板宽度（留边）
var maxSpan = 0;
Object.keys(scrYs).forEach(function (y) {
    var row = scrSib.filter(function (n) { return n.y === Number(y); });
    if (!row.length) return;
    var lo = Math.min.apply(null, row.map(function (n) { return n.x - n.w / 2; }));
    var hi = Math.max.apply(null, row.map(function (n) { return n.x + n.w / 2; }));
    maxSpan = Math.max(maxSpan, hi - lo);
});
ok(maxSpan <= 800, '每行节点跨度不超过面板宽度（实际 ' + maxSpan.toFixed(0) + '）');

// 名字关键字定世：称谓是 name 原值（15公/三叔）算不出代数时，用关键字定世
var ngP = [person('nme', '我', 'm'), person('ng1', '15公', 'm'), person('ng2', '三叔', 'm'), person('ng3', '外婆', 'f')];
var ngR = [rel('ng1', 'nme', '15公'), rel('ng2', 'nme', '三叔'), rel('ng3', 'nme', '外婆')];
var ngK = Kinship.compute('nme', ngP, ngR);
var ngG = GraphLayout.layout({ persons: ngP, relations: ngR, labels: ngK.labels, rootId: 'nme' });
ok(rowOf(ngG, 'ng1').label === '一世', '名字含「公」定世为一世（实际 ' + rowOf(ngG, 'ng1').label + '）');
ok(rowOf(ngG, 'ng2').label === '二世', '名字含「叔」定世为二世（实际 ' + rowOf(ngG, 'ng2').label + '）');
ok(rowOf(ngG, 'ng3').label === '一世', '名字含「婆」定世为一世（实际 ' + rowOf(ngG, 'ng3').label + '）');
ok(rowOf(ngG, 'nme').label === '三世', '我仍是三世');

console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
