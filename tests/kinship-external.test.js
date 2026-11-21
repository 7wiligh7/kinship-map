// relationship.js 主换算引擎测试：
// 1) 直接关系保留用户选的类型；2) 多跳称谓交给 relationship.js；
// 3) 本地正名只在关系库候选集内优先；4) 拦住「孙子的堂兄弟→孙子」这类截断。
var path = require('path');
require(path.join(__dirname, '..', 'kinship.js'));
var K = globalThis.Kinship;
global.relationship = require(path.join(__dirname, '..', 'vendor', 'relationship', 'relationship.min.js'));
var Bridge = require(path.join(__dirname, '..', 'kinship-external.js'));

var pass = 0, fail = 0;
function ok(cond, msg) {
    if (cond) { pass++; }
    else { fail++; console.log('FAIL: ' + msg); }
}
function eq(got, want, msg) {
    if (JSON.stringify(got) === JSON.stringify(want)) { pass++; }
    else { fail++; console.log('FAIL: ' + msg + ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }
}

var FEMALE = {
    '母亲': 1, '姐姐': 1, '妹妹': 1, '女儿': 1, '孙女': 1, '外孙女': 1,
    '侄女': 1, '外甥女': 1, '姑姑': 1, '姨妈': 1, '奶奶': 1, '外婆': 1,
    '妻子': 1, '岳母': 1, '婆婆': 1, '儿媳': 1
};

// 造一条从 root 出发的关系链：types = ['父亲','哥哥'] 表示「父亲的哥哥」
function chain(types, rootGender) {
    var rootG = rootGender || 'm';
    var persons = [{ id: 'root', gender: rootG }];
    var relations = [];
    var prev = 'root';
    var prevGender = rootG;
    types.forEach(function (t, i) {
        var id = 'c' + i;
        var g = FEMALE[t] ? 'f' : 'm';
        if (t === '配偶') g = prevGender === 'f' ? 'm' : 'f';
        persons.push({ id: id, gender: g });
        relations.push({ from: id, to: prev, type: t });
        prev = id;
        prevGender = g;
    });
    return { persons: persons, relations: relations, lastId: prev };
}
function labelOf(types, rootGender) {
    var c = chain(types, rootGender);
    var k = K.compute('root', c.persons, c.relations);
    return k.labels[c.lastId];
}

/* ---------- 1. relationship.js 口语词 → 本项目正名 ---------- */
eq(K.canonicalTitle('爸爸'), '父亲', '爸爸 → 父亲');
eq(K.canonicalTitle('叔叔'), '叔父', '叔叔 → 叔父');
eq(K.canonicalTitle('姑妈'), '姑姑', '姑妈 → 姑姑');
eq(K.canonicalTitle('堂哥'), '堂兄弟', '堂哥 → 堂兄弟');
eq(K.canonicalTitle('伯公'), '伯祖', '伯公 → 伯祖');
eq(K.canonicalTitle('姑奶奶'), '姑祖母', '姑奶奶 → 姑祖母');
eq(K.canonicalTitle('大舅爷'), '舅祖父', '大舅爷 → 舅祖父');
eq(K.canonicalTitle('姑表哥'), '表兄弟', '姑表哥 → 表兄弟');
eq(K.canonicalTitle('姨姨母'), '表姨', '姨姨母 → 表姨');

/* ---------- 2. 截断保护 ---------- */
ok(Bridge.chainNotTruncated('爸爸的爸爸的兄弟的儿子', '儿子'),
    '「父亲的堂兄弟」最后一步有变化，放行');
ok(!Bridge.chainNotTruncated('孙子的堂兄弟', '堂兄弟'),
    '「孙子的堂兄弟」最后一步被丢掉，拒绝');
ok(Bridge.chainNotTruncated('哥哥的哥哥', '哥哥'),
    '同义简化（哥哥的哥哥→哥哥）放行');
ok(Bridge.chainNotTruncated('儿子', '儿子'), '单步关系不做截断校验');
ok(Bridge.chainNotTruncated('爸爸的爸爸的儿子', '儿子'),
    '「爷爷的儿子」关系库有完整链，放行');

/* ---------- 3. 原始解析 ---------- */
eq(Bridge.resolve(['哥哥', '哥哥'], 'm'), ['哥哥'], '哥哥的哥哥 → 哥哥');
eq(Bridge.resolve(['姐姐', '姐姐'], 'f'), ['姐姐'], '姐姐的姐姐 → 姐姐');
eq(Bridge.resolve(['父亲', '堂兄弟'], 'm'), ['堂伯', '堂叔'], '父亲的堂兄弟 → 堂伯/堂叔');
eq(Bridge.resolve(['堂兄弟', '儿子'], 'm'), ['堂侄'], '堂兄弟的儿子 → 堂侄');
eq(Bridge.resolve(['儿子', '堂兄弟'], 'm'), ['侄子'], '儿子的堂兄弟 → 侄子（不误判为截断）');
eq(Bridge.resolve(['孙子', '堂兄弟'], 'm'), [], '孙子的堂兄弟不采用截断结果');
eq(Bridge.resolve(['父亲', '父亲', '儿子'], 'm'), ['伯父', '叔叔', '爸爸'],
    '父亲的父亲的儿子 → 伯父/叔叔/爸爸（由 kinship 再按链选正名）');
eq(Bridge.resolve(['配偶', '父亲'], 'm'), ['岳父'], '男根：配偶的父亲 → 岳父');
eq(Bridge.resolve(['配偶', '父亲'], 'f'), ['公公'], '女根：配偶的父亲 → 公公');

/* ---------- 4. 接入 kinship.js：关系库是主换算 ---------- */
ok(Bridge.install() === true, 'relationship.js 可安装为主换算引擎');

var a = labelOf(['哥哥', '哥哥']);
eq(a.label, '哥哥', '哥哥的哥哥 → 哥哥');
ok(a.exact === true && a.external === true, '多跳称谓由关系库给出并标为 exact/external');

var b = labelOf(['父亲', '堂兄弟']);
eq(b.label, '堂伯/堂叔', '父亲的堂兄弟 → 堂伯/堂叔（候选合并）');
ok(b.exact === true && b.external === true, '候选合并后仍标为 exact/external');
ok(b.alias.indexOf('堂伯父') >= 0 && b.alias.indexOf('堂叔父') >= 0,
    '候选的书面叫法进别名，搜索可命中');

// 本地正名在关系库候选集内：保留家族叫法，并继续作为下一跳的 key
var d = labelOf(['父亲', '哥哥']);
eq(d.label, '伯父', '本地正名「伯父」在候选集内，保持伯父');
ok(d.exact === true && d.external === true, '伯父也经过关系库换算，但显示本地正名');
eq(d.key, '伯父', '本地正名继续作为下一跳的 key');

var e = labelOf(['父亲', '父亲', '父亲']);
eq(e.label, '爷爷', '本项目「曾祖辈降为爷爷」的显示规范保持不变');
ok(e.external === true, '曾祖称谓仍走关系库换算后归一到爷爷');

var f = labelOf(['儿子', '儿子', '儿子']);
eq(f.label, '曾孙', '已有正名「曾孙」保持不变');

// 关系库把平辈候选成对给出时合并
var g = labelOf(['父亲', '儿子']);
eq(g.label, '兄弟', '父亲的儿子 → 兄弟（哥哥/弟弟合并）');
ok(g.external === true, '合并结果来自关系库');
ok(g.alias.indexOf('哥哥') >= 0 && g.alias.indexOf('弟弟') >= 0,
    '哥哥/弟弟保留在别名里');

var h = labelOf(['父亲', '女儿']);
eq(h.label, '姐妹', '父亲的女儿 → 姐妹（姐姐/妹妹合并）');
var i = labelOf(['哥哥', '弟弟']);
eq(i.label, '兄弟', '哥哥的弟弟 → 兄弟');
var j = labelOf(['姐姐', '妹妹']);
eq(j.label, '姐妹', '姐姐的妹妹 → 姐妹');

// 「父亲的儿子」是兄弟，不是自己：下一辈应显示侄子/侄女，而不是「侄子/儿子」
var k = labelOf(['父亲', '儿子', '儿子']);
eq(k.label, '侄子', '父亲的儿子的儿子 → 侄子');
ok(k.alias.indexOf('儿子') < 0, '侄子不把过宽的「儿子」当别名');
var l = labelOf(['父亲', '女儿', '儿子']);
eq(l.label, '外甥', '父亲的女儿的儿子 → 外甥');
var w = labelOf(['父亲', '儿子', '配偶'], 'm');
eq(w.label, '嫂子/弟媳', '父亲的儿子的配偶 → 嫂子/弟媳');

// 祖辈旁系、姻亲：全部交给关系库
var m = labelOf(['奶奶', '哥哥']);
eq(m.label, '舅祖父', '奶奶的哥哥 → 舅祖父');
var n = labelOf(['配偶', '父亲'], 'm');
eq(n.label, '岳父', '男根：配偶的父亲 → 岳父');
var o = labelOf(['配偶', '父亲'], 'f');
eq(o.label, '公公', '女根：配偶的父亲 → 公公');
var p = labelOf(['配偶', '哥哥'], 'm');
eq(p.label, '内兄', '男根：配偶的哥哥 → 内兄');
var q = labelOf(['配偶', '哥哥'], 'f');
eq(q.label, '大伯子', '女根：配偶的哥哥 → 大伯子');

// 多跳堂亲
var r = labelOf(['父亲', '堂兄弟', '儿子']);
eq(r.label, '从堂兄弟', '父亲的堂兄弟的儿子 → 从堂兄弟');
var s = labelOf(['父亲', '父亲', '姐姐', '儿子']);
eq(s.label, '表叔', '爷爷的姐姐的儿子 → 表叔');

// 直接关系不换算；关系库不认识的词回退路径
var u = labelOf(['表亲']);
eq(u.label, '表亲', '直接关系保留用户选的类型');
ok(u.exact === true && u.external !== true, '直接关系不调用关系库');
var v = labelOf(['表亲', '儿子']);
eq(v.label, '表亲的儿子', '关系库不认识「表亲」，回退路径称谓');
ok(v.exact === false && v.external !== true, '回退后 exact=false');

// 截断保护：仍显示完整路径，不采用错误简称
var c = labelOf(['孙子', '堂兄弟']);
eq(c.label, '孙子的堂兄弟', '孙子的堂兄弟仍保留路径，不被截断结果覆盖');
ok(c.exact === false && c.external !== true, '截断保护后按路径显示');

// 反向互称也走同一套换算
var c2 = chain(['哥哥', '哥哥']);
var mm = K.mutual('root', 'c1', c2.persons, c2.relations);
eq(mm.iCall.label, '哥哥', 'mutual：我叫哥哥的哥哥 = 哥哥');
eq(mm.theyCall.label, '弟弟', 'mutual：哥哥的哥哥叫我 = 弟弟');
var c3 = chain(['姐姐', '姐姐'], 'f');
var mm2 = K.mutual('root', 'c1', c3.persons, c3.relations);
eq(mm2.iCall.label, '姐姐', 'mutual：我叫姐姐的姐姐 = 姐姐');
eq(mm2.theyCall.label, '妹妹', 'mutual：姐姐的姐姐叫我 = 妹妹');
var c4 = chain(['父亲', '儿子', '儿子']);
var mm3 = K.mutual('root', 'c2', c4.persons, c4.relations);
eq(mm3.iCall.label, '侄子', 'mutual：我兄弟的儿子 = 侄子');
eq(mm3.theyCall.label, '伯父/叔父', 'mutual：侄子叫我 = 伯父/叔父');
ok(!mm3.theyCall.alias || mm3.theyCall.alias.indexOf('父亲') < 0,
    '反向互称不把「父亲」当别名（链里父母已出现过）');

/* ---------- 5. 卸载后回到原行为 ---------- */
Bridge.reset();
var g2 = labelOf(['哥哥', '哥哥']);
eq(g2.label, '哥哥的哥哥', '卸载关系库后恢复路径称谓');
ok(g2.exact === false && g2.external !== true, '卸载后 exact=false、external=false');

console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
