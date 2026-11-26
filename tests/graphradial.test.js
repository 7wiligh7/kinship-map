// 蛛网/放射关系图（GraphLayout.radial）测试：
// 中心为「我」、圈层 = 关系步数、同圈不叠框、关系字不叠、缩放锚点正确。
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
function nodeOf(g, id) {
    return g.nodes.filter(function (n) { return n.id === id; })[0];
}
function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}
function overlaps(a, b) {
    return Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) + 0.01 &&
        Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y) + 0.01;
}
function nodeBox(n) {
    return { x: n.x - n.w / 2, y: n.y - n.h / 2, w: n.w, h: n.h };
}
function titleBox(n) {
    if (!n.titleText) return null;
    var tw = GraphLayout.textWidth(n.titleText, 10) + 8;
    return { x: n.x - tw / 2, y: n.y + n.h / 2 + 2, w: tw, h: 14 };
}
function radialOf(persons, relations, rootId) {
    var k = Kinship.compute(rootId, persons, relations);
    return GraphLayout.radial({
        persons: persons, relations: relations, labels: k.labels, rootId: rootId
    });
}

/* ---------- 1. 三代同堂 + 姻亲 + 未连通 ---------- */
var persons = [
    person('me', '我', 'm', null),
    person('fa', '爸爸', 'm'), person('mo', '妈妈', 'f'),
    person('gf', '爷爷', 'm'), person('gm', '奶奶', 'f'),
    person('uncle', '伯父', 'm'), person('aunt', '伯母', 'f'), person('cousin', '堂哥', 'm'),
    person('wife', '媳妇', 'f'), person('son', '儿子', 'm'), person('dau', '女儿', 'f'),
    person('bro', '哥哥', 'm'), person('nephew', '侄儿', 'm'),
    person('fil', '岳父', 'm'),
    person('lost', '远房亲戚', 'm')
];
var relations = [
    rel('gf', 'fa', '父亲'), rel('gm', 'fa', '母亲'),
    rel('fa', 'me', '父亲'), rel('mo', 'me', '母亲'),
    rel('gf', 'uncle', '父亲'), rel('uncle', 'aunt', '配偶'), rel('uncle', 'cousin', '父亲'),
    rel('me', 'wife', '配偶'), rel('me', 'son', '父亲'), rel('me', 'dau', '父亲'),
    rel('fa', 'bro', '父亲'), rel('bro', 'nephew', '父亲'),
    rel('fil', 'wife', '父亲')
];
var g = radialOf(persons, relations, 'me');

ok(g.nodes.length === persons.length, '所有人都进蛛网图（实际 ' + g.nodes.length + '）');
var me = nodeOf(g, 'me');
ok(!!me && me.depth === 0 && me.r === 0 && Math.abs(me.x - g.center.x) < 0.01 &&
    Math.abs(me.y - g.center.y) < 0.01, '「我」应在圆心');
ok(!!me && me.isRoot === true, '「我」节点应带 root 标记');

// 圈层按辈分：一世 = 祖父母（gen -2，辈分最高、最靠内），二世 = 父母辈，
// 三世 = 我与同辈，四世 = 子女辈；「我」固定在圆心，不占圈层。
['gf', 'gm'].forEach(function (id) {
    var n = nodeOf(g, id);
    ok(!!n && n.depth === 1 && n.gen === -2, id + ' 应在一世（辈分最高，实际 ' + (n ? n.depth : '无') + '）');
});
['fa', 'mo', 'uncle', 'aunt', 'fil'].forEach(function (id) {
    var n = nodeOf(g, id);
    ok(!!n && n.depth === 2 && n.gen === -1, id + ' 应在二世（实际 ' + (n ? n.depth : '无') + '）');
});
['wife', 'bro', 'cousin'].forEach(function (id) {
    var n = nodeOf(g, id);
    ok(!!n && n.depth === 3 && n.gen === 0, id + ' 应在三世（实际 ' + (n ? n.depth : '无') + '）');
});
['son', 'dau', 'nephew'].forEach(function (id) {
    var n = nodeOf(g, id);
    ok(!!n && n.depth === 4 && n.gen === 1, id + ' 应在四世（实际 ' + (n ? n.depth : '无') + '）');
});
var lost = nodeOf(g, 'lost');
ok(!!lost && lost.unreach === true, '没有任何关系的人进入「未连通」');
ok(!!lost && lost.depth === g.maxDepth, '未连通的人在最外圈');
ok(g.rings.length === 5, '应有 5 个圈层（实际 ' + g.rings.length + '）');
ok(g.rings[0].label === '一世' && g.rings[1].label === '二世' &&
    g.rings[3].label === '四世' && g.rings[4].label === '未连通',
    '圈层文字应为「一世/二世/…/未连通」（实际 ' + g.rings.map(function (r) { return r.label; }).join('/') + '）');
ok(g.rings[0].gen < g.rings[1].gen && g.rings[1].gen < g.rings[2].gen &&
    g.rings[2].gen < g.rings[3].gen, '越靠内的圈层辈分越高（gen 越小）');

// 半径：越靠内越小；每个人都在自己的圈上
for (var ri = 1; ri < g.rings.length; ri++) {
    ok(g.rings[ri].r > g.rings[ri - 1].r + 0.01,
        '圈层半径向外递增（第 ' + (ri + 1) + ' 圈）');
}
g.nodes.forEach(function (n) {
    var d = dist(n, g.center);
    ok(Math.abs(d - n.r) < 0.01, n.name + ' 应在半径 ' + n.r + ' 的圈上（实际 ' + d.toFixed(2) + '）');
});

// 方位：父母在上、配偶在右、子女在下、兄弟姐妹在左
var fa = nodeOf(g, 'fa'), mo = nodeOf(g, 'mo'), wife = nodeOf(g, 'wife');
ok(fa.y < g.center.y && mo.y < g.center.y, '父母应在圆心上方的半圈');
ok(wife.x > g.center.x, '配偶应在圆心右侧');
ok(nodeOf(g, 'son').y > g.center.y && nodeOf(g, 'dau').y > g.center.y, '子女应在圆心下方');
ok(nodeOf(g, 'bro').x < g.center.x, '兄弟姐妹应在圆心左侧');

// 只有父母、没有其他直系时，两人也应并列在上方（不能一个左一个右）
var gp = radialOf([
    person('pme', '我', 'm', null), person('pfa', '爸爸', 'm'), person('pmo', '妈妈', 'f')
], [rel('pfa', 'pme', '父亲'), rel('pmo', 'pme', '母亲')], 'pme');
var pfa = nodeOf(gp, 'pfa'), pmo = nodeOf(gp, 'pmo');
ok(!!pfa && pfa.y < gp.center.y, '只有父母时：爸爸应在圆心上方');
ok(!!pmo && pmo.y < gp.center.y, '只有父母时：妈妈应在圆心上方');
ok(!!pfa && !!pmo && Math.abs(pfa.y - pmo.y) < 1, '只有父母时：两人同高并列在上方');

// 同圈名框不重叠
function assertNoNodeOverlap(layout, tag) {
    var bad = 0;
    for (var i = 0; i < layout.nodes.length; i++) {
        for (var j = i + 1; j < layout.nodes.length; j++) {
            if (overlaps(nodeBox(layout.nodes[i]), nodeBox(layout.nodes[j]))) {
                bad++;
                if (bad <= 3) {
                    console.log('  overlap: ' + layout.nodes[i].name + ' / ' + layout.nodes[j].name);
                }
            }
        }
    }
    ok(bad === 0, tag + '：名框不应重叠（实际 ' + bad + ' 对）');
}
assertNoNodeOverlap(g, '三代同堂');

// 关系线：每条关系都有线，父母子女各一条，配偶线可识别
ok(g.edges.length === relations.length, '每条原始关系都应有一条线（实际 ' + g.edges.length + '）');
var faEdge = g.edges.filter(function (e) { return e.kind === 'descent' && e.ris.indexOf(2) > -1; })[0];
var moEdge = g.edges.filter(function (e) { return e.kind === 'descent' && e.ris.indexOf(3) > -1; })[0];
ok(!!faEdge && faEdge.text === '父亲', '父亲 → 我 应是父母子女线，关系字「父亲」');
ok(!!moEdge && moEdge.text === '母亲', '母亲 → 我 应是父母子女线，关系字「母亲」');
var spouseEdge = g.edges.filter(function (e) { return e.kind === 'spouse' && e.ris.indexOf(7) > -1; })[0];
ok(!!spouseEdge && spouseEdge.text === '配偶', '夫妻关系应单独成线');
ok(!!spouseEdge && spouseEdge.ris.length === 1, '配偶线带上原始关系索引，供悬停高亮');

// 关系字：不重叠、不出界、不压名框/称谓
function assertLabels(layout, tag) {
    for (var i = 0; i < layout.labels.length; i++) {
        var l = layout.labels[i];
        ok(l.box.x >= 0 && l.box.x + l.box.w <= layout.width + 0.01,
            tag + '：关系字不出左右边界（' + l.text + '）');
        ok(l.box.y >= 0 && l.box.y + l.box.h <= layout.height + 0.01,
            tag + '：关系字不出上下边界（' + l.text + '）');
        for (var j = i + 1; j < layout.labels.length; j++) {
            ok(!overlaps(l.box, layout.labels[j].box),
                tag + '：关系字不重叠（' + l.text + ' / ' + layout.labels[j].text + '）');
        }
        for (var k = 0; k < layout.nodes.length; k++) {
            ok(!overlaps(l.box, nodeBox(layout.nodes[k])),
                tag + '：关系字不压名框（' + l.text + ' / ' + layout.nodes[k].name + '）');
            var tb = titleBox(layout.nodes[k]);
            if (tb) {
                ok(!overlaps(l.box, tb),
                    tag + '：关系字不压称谓（' + l.text + ' / ' + layout.nodes[k].titleText + '）');
            }
        }
    }
    ok(layout.labels.length > 0, tag + '：至少应放出一些关系字');
}
assertLabels(g, '三代同堂');

/* ---------- 2. 确定性：同样输入两次布局完全一致 ---------- */
var g2 = radialOf(persons, relations, 'me');
var same = g.nodes.every(function (n) {
    var m = nodeOf(g2, n.id);
    return m && Math.abs(m.x - n.x) < 0.01 && Math.abs(m.y - n.y) < 0.01 && m.depth === n.depth;
});
ok(same, '两次布局结果一致（无随机）');

/* ---------- 3. 同圈拥挤：12 个哥哥 / 20 个子女 / 8 个堂亲 ---------- */
function ringCrowd(n, prefix) {
    var ps = [person('me', '我', 'm', null)];
    var rs = [];
    for (var i = 1; i <= n; i++) {
        ps.push(person(prefix + i, i + '哥', i % 2 ? 'm' : 'f'));
        rs.push(rel(prefix + i, 'me', '哥哥'));
    }
    return radialOf(ps, rs, 'me');
}

var gs = ringCrowd(12, 's');
ok(gs.nodes.length === 13, '12 个哥哥都应进图');
var depth1 = gs.nodes.filter(function (n) { return n.depth === 1; });
ok(depth1.length === 12 && depth1.every(function (n) { return Math.abs(n.r - 148) < 2.5; }),
    '12 个哥哥应在同一圈上（半径约为 148）');
ok(depth1.every(function (n) { return n.angle >= 0 && n.angle < Math.PI * 2 + 0.001; }),
    '角度应归一化到 0~2π');
assertNoNodeOverlap(gs, '12 个哥哥');
ok(gs.labels.length === 12, '12 条哥哥关系应尽量都放出关系字（实际 ' + gs.labels.length + '）');
assertLabels(gs, '12 个哥哥');

var gc = ringCrowd(20, 'c');
ok(gc.nodes.length === 21 && gc.nodes.filter(function (n) { return n.depth === 1; }).length === 20,
    '20 个子女都应排在第 1 圈');
ok(gc.rings[0].r > 200, '人太多时第 1 圈半径应自动变大（实际 ' + gc.rings[0].r.toFixed(1) + '）');
assertNoNodeOverlap(gc, '20 个子女');
assertLabels(gc, '20 个子女');

var pk = [person('me', '我', 'm', null)];
var rk = [];
for (var ki = 1; ki <= 8; ki++) {
    pk.push(person('k' + ki, '堂表亲' + ki, ki % 2 ? 'm' : 'f'));
    rk.push(rel('k' + ki, 'me', '堂兄弟'));
}
var gk = radialOf(pk, rk, 'me');
assertNoNodeOverlap(gk, '8 个堂亲');
assertLabels(gk, '8 个堂亲');

/* ---------- 4. 空图 / 只有「我」 ---------- */
var ge = radialOf([person('me', '我', 'm', null)], [], 'me');
ok(ge.nodes.length === 1 && ge.nodes[0].x === ge.center.x && ge.nodes[0].y === ge.center.y,
    '只有「我」时仍应居中返回');
ok(ge.width >= 400 && ge.height >= 400, '只有「我」时画布也要有基本尺寸（实际 ' + ge.width + '）');
ok(ge.rings.length === 0 && ge.edges.length === 0, '只有「我」时没有圈层和连线');

/* ---------- 5. 缩放/自适应数学 ---------- */
var fit = GraphLayout.fitTransform(400, 400, 1000, 600, 40, 0.1, 2);
ok(Math.abs(fit.scale - 1.3) < 1e-9, '自适应缩放取宽高较小值（实际 ' + fit.scale + '）');
ok(Math.abs(fit.tx - 240) < 1e-9 && Math.abs(fit.ty - 40) < 1e-9,
    '自适应后内容在视口居中（实际 ' + fit.tx + ',' + fit.ty + '）');
var fitMax = GraphLayout.fitTransform(100, 100, 1000, 600, 40, 0.1, 1.25);
ok(Math.abs(fitMax.scale - 1.25) < 1e-9, '内容很小时缩放不超过上限');

var view = { scale: 1, tx: 100, ty: 50 };
var z = GraphLayout.zoomTransform(view, 300, 200, 1.5, 0.2, 4);
ok(Math.abs(z.scale - 1.5) < 1e-9, '以鼠标为锚点放大：scale 1 → 1.5');
ok(Math.abs((300 - z.tx) / z.scale - (300 - view.tx) / view.scale) < 1e-9,
    '放大后鼠标下的图形坐标不移动（x）');
ok(Math.abs((200 - z.ty) / z.scale - (200 - view.ty) / view.scale) < 1e-9,
    '放大后鼠标下的图形坐标不移动（y）');
ok(GraphLayout.zoomTransform(view, 0, 0, 100, 0.2, 4).scale === 4, '放大有上限 4×');
ok(GraphLayout.zoomTransform(view, 0, 0, 0.0001, 0.2, 4).scale === 0.2, '缩小有下限 0.2×');

/* ---------- 6. 页面接线：默认用蛛网布局，并支持拖动/滚轮/双指缩放 ---------- */
var fs = require('fs');
var appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
ok(/GraphLayout\.radial\(/.test(appSrc), '关系图应使用蛛网布局 GraphLayout.radial');
ok(/data-gzoom=/.test(appSrc), '关系图应提供放大/缩小/适应按钮');
ok(/addEventListener\('wheel'/.test(appSrc), '关系图应支持滚轮缩放');
ok(/pointerdown/.test(appSrc) && /pointermove/.test(appSrc), '关系图应支持拖动平移/双指缩放');
ok(/pointerup/.test(appSrc), '拖动结束应处理 pointerup（含惯性）');
ok(/addEventListener\('dblclick'/.test(appSrc), '关系图应支持双击放大/还原');
ok(!/attachPlaceGenerations/.test(appSrc), '「同址辈分挂靠」按钮已移除，功能并入「补齐关系网」');
ok(/function showRelForm\(idx, fromId\)/.test(appSrc), 'showRelForm 应支持预填关系主体 fromId');
ok(/jumpToPerson\(id\);[\s\S]{0,120}showRelForm\(null, id\)/.test(appSrc), '点击节点应同时定位地图并打开添加关系表单');

// 父子线画成树状折线（径向出→横向拐→径向进），不是一条放射直线
var treeLineG = (function () {
    var ps = [
        { id: 'tme', name: '我', gender: 'm', age: null, titles: [], placeId: null },
        { id: 'tg', name: '爷爷', gender: 'm', age: null, titles: [], placeId: 'pT' },
        { id: 'tf', name: '爸爸', gender: 'm', age: null, titles: [], placeId: 'pT' }
    ];
    var kk = Kinship.compute('tme', ps, []);
    return GraphLayout.radial({ persons: ps, relations: [], labels: kk.labels, rootId: 'tme', groupByPlace: true });
})();
var td = treeLineG.edges.filter(function (e) { return e.kind === 'descent'; })[0];
ok(td && (td.d.match(/L/g) || []).length >= 2, '父子线应为多段折线（树线），不是单段直线');

/* ---------- 7. 同址辈分挂靠：逐级挂高一辈，写真实关系 ---------- */
var apPersons = [
    person('me', '我', 'm', null),
    person('gm', '奶奶', 'f', 'pl1'),          // 未连通，名字兜底 gen -2
    person('fa', '爸爸', 'm', 'pl1'),          // 由关系算出 gen -1
    person('bro', '哥哥', 'm', 'pl1'),         // 由关系算出 gen 0
    person('son', '儿子', 'm', 'pl1'),         // 由关系算出 gen +1
    person('gs', '孙子', 'm', 'pl1'),          // 未连通，名字兜底 gen +2
    person('lonely', '张三', 'm', 'pl2')       // 单点地点，辈分未知
];
var apRelations = [rel('fa', 'me', '父亲'), rel('bro', 'me', '哥哥'), rel('me', 'son', '父亲')];
var apBefore = apRelations.length;
var adds = Kinship.attachSamePlaceGenerations(apPersons, apRelations, [{ id: 'pl1' }, { id: 'pl2' }], 'me');
ok(adds.length === 4, '同地点五代人应新增 4 条挂靠关系（实际 ' + adds.length + '）');
function addedEdge(from, to) {
    return adds.filter(function (a) { return a.from === from && a.to === to; })[0];
}
var addGmFa = addedEdge('gm', 'fa');
var addFaBro = addedEdge('fa', 'bro');
var addBroSon = addedEdge('bro', 'son');
var addSonGs = addedEdge('son', 'gs');
ok(!!addGmFa && addGmFa.type === '母亲', '爸爸挂到同地点最高辈奶奶，类型为母亲');
ok(!!addFaBro && addFaBro.type === '父亲', '哥哥挂到刚好高一辈的爸爸');
ok(!!addBroSon && addBroSon.type === '父亲', '儿子挂到刚好高一辈的哥哥');
ok(!!addSonGs && addSonGs.type === '父亲', '孙子挂到刚好高一辈的儿子');
ok(apRelations.length === apBefore, '挂靠结果不修改传入的关系数组（由调用方决定是否保存）');
var apAgain = Kinship.attachSamePlaceGenerations(
    apPersons, apRelations.concat(adds), [{ id: 'pl1' }, { id: 'pl2' }], 'me'
);
ok(apAgain.length === 0, '已经挂靠过就不再重复新增');

/* ---------- 8. 非同址默认挂在直系亲属分支下（只影响布局，不写数据） ---------- */
var lp = [
    person('me', '我', 'm', null),
    person('sib', '哥哥', 'm', 'pl2'),
    person('kid', '堂兄弟', 'm', 'pl3'),
    person('dad', '爸爸', 'm', 'pl1')
];
var lr = [rel('sib', 'me', '哥哥'), rel('kid', 'sib', '堂兄弟'), rel('dad', 'kid', '父亲')];
var lg = radialOf(lp, lr, 'me');
var kid = nodeOf(lg, 'kid'), dad = nodeOf(lg, 'dad'), sib = nodeOf(lg, 'sib');
function angDist(a, b) {
    var t = Math.PI * 2;
    var d = Math.abs(a.angle - b.angle) % t;
    return Math.min(d, t - d);
}
ok(!!kid && !!dad && !!sib && angDist(kid, dad) < angDist(kid, sib),
    '堂兄弟与爸爸不同地点：布局上应挂在直系父亲分支，而不是旁系兄弟分支');
ok(lr.length === 3, '布局用的挂靠不应改写原始关系数组');

/* ---------- 地点分树（groupByPlace）：每地点一棵、最高辈为根、根连我、同辈同环 ---------- */
function radialPlaced(persons, relations, rootId) {
    var kk = Kinship.compute(rootId, persons, relations);
    return GraphLayout.radial({
        persons: persons, relations: relations, labels: kk.labels, rootId: rootId, groupByPlace: true
    });
}
var gpP = [
    { id: 'me', name: '我', gender: 'm', age: null, titles: [], placeId: null },
    { id: 'a1', name: '15公', gender: 'm', age: null, titles: [], placeId: 'pA' },
    { id: 'a2', name: '4爹', gender: 'm', age: null, titles: [], placeId: 'pA' },
    { id: 'a3', name: '2婆', gender: 'f', age: null, titles: [], placeId: 'pA' },
    { id: 'b1', name: '三叔', gender: 'm', age: null, titles: [], placeId: 'pB' },
    { id: 'b2', name: '9叔', gender: 'm', age: null, titles: [], placeId: 'pB' },
    { id: 'c1', name: '三婆', gender: 'f', age: null, titles: [], placeId: 'pC' }
];
var gpR = [
    { from: 'a1', to: 'a2', type: '父亲' }, { from: 'a1', to: 'a3', type: '配偶' },
    { from: 'b1', to: 'b2', type: '弟弟' }
];
var gpG = radialPlaced(gpP, gpR, 'me');
function nodeOfG(g, id) { return g.nodes.filter(function (n) { return n.id === id; })[0]; }
function angDeg(n) { return n.angle * 180 / Math.PI; }
// 最高辈男性为根：地点A最高辈是15公(m)→根；地点B三叔(m)→根；地点C只有三婆(f)→根
var a1 = nodeOfG(gpG, 'a1'), b1 = nodeOfG(gpG, 'b1'), c1 = nodeOfG(gpG, 'c1');
ok(gpG.nodes.length === 7, '地点分树不应丢人（实际 ' + gpG.nodes.length + '）');
// 根连我：每个地点根都有一条到中心的 kin 线
var rootEdgeTargets = gpG.edges.filter(function (e) {
    return e.kind === 'kin' && (e.x1 === gpG.center.x || e.title === '15公' || e.title === '三叔' || e.title === '三婆');
}).map(function (e) { return e.title; });
ok(rootEdgeTargets.indexOf('15公') >= 0 || gpG.edges.some(function (e) { return e.kind === 'kin' && e.title === '15公'; }),
    '地点A的根（15公）应连一条线到「我」');
ok(gpG.edges.some(function (e) { return e.kind === 'kin' && (e.title === '三叔' || e.title === '9叔'); }),
    '地点B的根应连到「我」（三叔无排行数字，null→999 后由 9叔 当根）');
ok(gpG.edges.some(function (e) { return e.kind === 'kin' && e.title === '三婆'; }), '地点C无男性，退而由最高辈女性三婆连到「我」');

// 连「我」的人选该地点辈分最大的男性，即使有辈分更高的女性；树根仍保持最高辈（父子线不倒挂）
var maleP = [
    { id: 'me', name: '我', gender: 'm', age: null, titles: [], placeId: null },
    { id: 'f6', name: '6婆', gender: 'f', age: null, titles: [], placeId: 'pM' },
    { id: 'u8', name: '8叔', gender: 'm', age: null, titles: [], placeId: 'pM' }
];
var maleG = radialPlaced(maleP, [], 'me');
var maleKin = maleG.edges.filter(function (e) {
    return e.kind === 'kin' && (e.x1 === maleG.center.x || e.x2 === maleG.center.x);
});
ok(maleKin.length === 1 && maleKin[0].title === '8叔',
    '连我的是辈分最大的男性 8叔，而不是辈分更高的女性 6婆（实际 ' + maleKin.map(function (e) { return e.title; }).join('、') + '）');
var f6n = nodeOfG(maleG, 'f6'), u8n = nodeOfG(maleG, 'u8');
ok(maleG.edges.some(function (e) {
    return e.kind === 'descent' && f6n && u8n &&
        Math.abs(e.x1 - f6n.x) < 1 && Math.abs(e.x2 - u8n.x) < 1;
}), '树内父子线仍是 6婆→8叔（方向不倒挂）');
// 同辈同环：同为最高辈的 15公/三婆 半径相同
ok(a1 && c1 && Math.abs(a1.r - c1.r) < 1, '同辈（15公/三婆）应在同一环（半径相同）');
// 不同地点分占不同扇区：三叔(b) 与 15公(a) 角度差明显
ok(b1 && a1 && Math.abs(angDeg(b1) - angDeg(a1)) > 30,
    '不同地点应分占不同扇区（实际角度差 ' + Math.abs(angDeg(b1) - angDeg(a1)).toFixed(0) + '°）');

// 没有同地点关系边时，树仍按地点内辈分显现（不依赖跨地点关系）
var treeP = [
    { id: 'me', name: '我', gender: 'm', age: null, titles: [], placeId: null },
    { id: 'tgf', name: '爷爷', gender: 'm', age: null, titles: [], placeId: 'pT' },
    { id: 'tfa', name: '爸爸', gender: 'm', age: null, titles: [], placeId: 'pT' },
    { id: 'tu', name: '叔叔', gender: 'm', age: null, titles: [], placeId: 'pT' }
];
var treeG = radialPlaced(treeP, [], 'me'); // 无任何关系边
var tgf = nodeOfG(treeG, 'tgf'), tfa = nodeOfG(treeG, 'tfa'), tfa2 = nodeOfG(treeG, 'tu');
ok(tgf && tfa && tgf.r < tfa.r, '无关系边时树仍按辈分分层：爷爷(根)在内圈、爸爸在外圈');
ok(tfa && tfa2 && Math.abs(tfa.r - tfa2.r) < 1, '同辈（爸爸/叔叔）在同一环');
ok(treeG.edges.some(function (e) { return e.kind === 'kin' && e.title === '爷爷'; }), '地点根（爷爷）仍连到「我」');

// 多个地点时，同地点的人角度应聚在一起（不被旋转打乱），且整图不重叠
var multiP = [
    { id: 'me', name: '我', gender: 'm', age: null, titles: [], placeId: null },
    { id: 'm0', name: '15公', gender: 'm', age: null, titles: [], placeId: 'pA' },
    { id: 'm1', name: '4爹', gender: 'm', age: null, titles: [], placeId: 'pA' },
    { id: 'm2', name: '5爹', gender: 'm', age: null, titles: [], placeId: 'pA' },
    { id: 'n0', name: '三公', gender: 'm', age: null, titles: [], placeId: 'pB' },
    { id: 'n1', name: '9叔', gender: 'm', age: null, titles: [], placeId: 'pB' },
    { id: 'n2', name: '10叔', gender: 'm', age: null, titles: [], placeId: 'pB' }
];
var multiG = radialPlaced(multiP, [], 'me');
function angDist2(a, b) { var d = Math.abs(a - b) % (Math.PI * 2); return Math.min(d, Math.PI * 2 - d); }
var mA = multiG.nodes.filter(function (n) { return n.placeId === 'pA' && n.name !== '15公'; });
function groupSpan(arr) {
    if (arr.length < 2) return 0;
    var angs = arr.map(function (n) { return n.angle; }).sort(function (a, b) { return a - b; });
    var maxGap = 0, prev = angs[0];
    for (var i = 1; i < angs.length; i++) { maxGap = Math.max(maxGap, angs[i] - prev); prev = angs[i]; }
    maxGap = Math.max(maxGap, angs[0] + Math.PI * 2 - prev); // 跨 0° 的间隔
    return Math.PI * 2 - maxGap; // 跨度 = 整圈 - 最大空档
}
var spreadA = groupSpan(mA);
ok(spreadA < Math.PI, '同地点(pA)的人应聚在一个扇区内（跨度 ' + (spreadA * 180 / Math.PI).toFixed(0) + '°）');
function boxOf(n) { return { x: n.x - n.w / 2, y: n.y - n.h / 2, w: n.w, h: n.h }; }
var ov = 0;
for (var mi = 0; mi < multiG.nodes.length; mi++) for (var mj = mi + 1; mj < multiG.nodes.length; mj++) {
    var ba = boxOf(multiG.nodes[mi]), bb = boxOf(multiG.nodes[mj]);
    if (Math.min(ba.x + ba.w, bb.x + bb.w) > Math.max(ba.x, bb.x) + 0.01 &&
        Math.min(ba.y + ba.h, bb.y + bb.h) > Math.max(ba.y, bb.y) + 0.01) ov++;
}
ok(ov === 0, '多地点树状图不应有名框重叠（实际 ' + ov + '）');

// 即使 relations 没有父子边，地点树也画出跨辈的 descent 线，且同辈不连父子线
var lineP = [
    { id: 'me', name: '我', gender: 'm', age: null, titles: [], placeId: null },
    { id: 'lg', name: '爷爷', gender: 'm', age: null, titles: [], placeId: 'pL' },
    { id: 'lf', name: '爸爸', gender: 'm', age: null, titles: [], placeId: 'pL' },
    { id: 'lf2', name: '叔叔', gender: 'm', age: null, titles: [], placeId: 'pL' }
];
var lineG = radialPlaced(lineP, [], 'me');
var desc = lineG.edges.filter(function (e) { return e.kind === 'descent'; });
ok(desc.length >= 2, '无父子关系边时，仍按辈分画出树的父子线（实际 ' + desc.length + ' 条）');
ok(lineG.edges.some(function (e) { return e.kind === 'kin' && e.title === '爷爷'; }), '树根（爷爷）连到「我」');

// 只按称呼定世：即使关系 type 用名字原值算出 gen=0，公/婆仍归一世最靠近我
var gnP = [
    { id: 'me', name: '我', gender: 'm', age: null, titles: [], placeId: null },
    { id: 'gg', name: '15公', gender: 'm', age: null, titles: [], placeId: 'pG' },
    { id: 'dd', name: '大爹', gender: 'm', age: null, titles: [], placeId: 'pD' }
];
var gnR = [
    { from: 'gg', to: 'me', type: '15公' },
    { from: 'dd', to: 'me', type: '大爹' }
];
var gnK = Kinship.compute('me', gnP, gnR);
var gnG = radialPlaced(gnP, gnR, 'me');
var gnGong = nodeOfG(gnG, 'gg'), gnDie = nodeOfG(gnG, 'dd');
ok(gnGong && gnGong.r < gnDie.r, '15公(一世/公)应比大爹(二世/爹)更靠近我（r ' + gnGong.r.toFixed(0) + ' < ' + gnDie.r.toFixed(0) + '）');
ok(gnGong && gnGong.gen === -2 && gnDie && gnDie.gen === -1, '按称呼定世：公=一世(-2)、爹=二世(-1)');

// 同地点同排行的一男一女自动配成夫妻：画配偶线且摆相邻（地点分树时也保留）
var spP = [
    { id: 'me', name: '我', gender: 'm', age: null, titles: [], placeId: null },
    { id: 's1', name: '7公', gender: 'm', age: null, titles: [], placeId: 'pS' },
    { id: 's2', name: '7婆', gender: 'f', age: null, titles: [], placeId: 'pS' }
];
var spG = radialPlaced(spP, [], 'me'); // 无配偶关系边
var spEdges = spG.edges.filter(function (e) { return e.kind === 'spouse'; });
ok(spEdges.length === 1, '地点分树时仍画配偶线（实际 ' + spEdges.length + '）');
var s1 = nodeOfG(spG, 's1'), s2 = nodeOfG(spG, 's2');
ok(s1 && s2 && dist(s1, s2) < 120, '夫妻应摆相邻（实际距离 ' + dist(s1, s2).toFixed(0) + '）');

// 地点分树时，数据里多人连到「我」的关系线不画：每地点只保留辈分最大的根→我一条
var egoP = [
    { id: 'me', name: '我', gender: 'm', age: null, titles: [], placeId: null },
    { id: 'e1', name: '15公', gender: 'm', age: null, titles: [], placeId: 'pE' },
    { id: 'e2', name: '4爹', gender: 'm', age: null, titles: [], placeId: 'pE' }
];
var egoR = [
    { from: 'e1', to: 'me', type: '15公' }, { from: 'e2', to: 'me', type: '15公' }
];
var egoG = radialPlaced(egoP, egoR, 'me');
var egoLines = egoG.edges.filter(function (e) {
    return e.kind === 'kin' && (e.x1 === egoG.center.x || e.x2 === egoG.center.x);
});
ok(egoLines.length === 1 && egoLines[0].title === '15公',
    '每地点只有辈分最大的根连我一条线（实际 ' + egoLines.length + ' 条）');

// M2：框下黄色称谓已删除，不可见的长路径称谓不应撑大画布
var m2p = [
    { id: 'me', name: '我', gender: 'm', age: null, titles: [], placeId: null },
    { id: 'g', name: '9叔', gender: 'm', age: null, titles: [], placeId: 'pM2' }
];
var m2short = GraphLayout.radial({
    persons: m2p, relations: [], labels: { g: { label: '9叔', gen: -1 } },
    rootId: 'me', groupByPlace: true
});
var m2long = GraphLayout.radial({
    persons: m2p, relations: [], labels: { g: { label: '9叔的父亲的儿女的孙子', gen: -1 } },
    rootId: 'me', groupByPlace: true
});
ok(m2short.width === m2long.width && m2short.height === m2long.height,
    '不可见的长路径称谓不影响画布尺寸（' + m2short.width + ' vs ' + m2long.width + '）');

// L1：布局层与推算层共用同一份定世，老公/姑娘不再被误判
var l1p = [
    { id: 'me', name: '我', gender: 'm', age: null, titles: [], placeId: null },
    { id: 'h', name: '老公', gender: 'm', age: null, titles: [], placeId: 'pL1' },
    { id: 'd', name: '姑娘', gender: 'f', age: null, titles: [], placeId: 'pL1' }
];
var kL1 = Kinship.compute('me', l1p, []);
var l1g = GraphLayout.radial({
    persons: l1p, relations: [], labels: kL1.labels, rootId: 'me', groupByPlace: true
});
var l1h = nodeOfG(l1g, 'h'), l1d = nodeOfG(l1g, 'd');
ok(l1h && l1h.gen === 0 && l1d && l1d.gen === 1,
    '布局层：老公=同辈、姑娘=晚辈（与 kinship 定世一致）');

console.log('graphradial.test: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
