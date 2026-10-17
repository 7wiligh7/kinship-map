require(require('path').join(__dirname, '..', 'kinship.js'));

var K = globalThis.Kinship;
var pass = 0, fail = 0;

function eq(got, want, msg) {
    if (got === want) { pass++; }
    else { fail++; console.log('FAIL: ' + msg + ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }
}

function L(out, id) { var l = out.labels[id]; return l ? l.label : null; }
function EX(out, id) { var l = out.labels[id]; return l ? !!l.exact : null; }
function GEN(out, id) { var l = out.labels[id]; return l ? l.gen : null; }

function fam(extraP, extraR) {
    var P = [
        { id: 'me', name: '我', gender: 'm' },
        { id: 'fa', name: '爸', gender: 'm' },
        { id: 'mo', name: '妈', gender: 'f' },
        { id: 'gf', gender: 'm' }, { id: 'gm', gender: 'f' },
        { id: 'mgf', gender: 'm' }, { id: 'mgm', gender: 'f' },
        { id: 'bo', gender: 'm' }, { id: 'shu', gender: 'm' }, { id: 'gu', gender: 'f' },
        { id: 'jiu', gender: 'm' }, { id: 'yi', gender: 'f' },
        { id: 'gb', gender: 'm' }, { id: 'di', gender: 'm' },
        { id: 'jie', gender: 'f' }, { id: 'mei', gender: 'f' },
        { id: 'qi', gender: 'f' },
        { id: 'ilf', gender: 'm' }, { id: 'ilm', gender: 'f' },
        { id: 'son', gender: 'm' }, { id: 'dau', gender: 'f' },
        { id: 'gs', gender: 'm' }, { id: 'gd', gender: 'f' },
        { id: 'ne', gender: 'm' }, { id: 'nd', gender: 'f' },
        { id: 'we', gender: 'm' }, { id: 'ws', gender: 'f' },
        { id: 'co', gender: 'm' }, { id: 'bg', gender: 'm' },
        { id: 'osg', gender: 'm' }, { id: 'wsg', gender: 'm' }
    ].concat(extraP || []);
    var R = [
        { from: 'gf', to: 'fa', type: '父亲' }, { from: 'gm', to: 'fa', type: '母亲' },
        { from: 'mgf', to: 'mo', type: '父亲' }, { from: 'mgm', to: 'mo', type: '母亲' },
        { from: 'fa', to: 'me', type: '父亲' }, { from: 'mo', to: 'me', type: '母亲' },
        { from: 'bo', to: 'fa', type: '哥哥' }, { from: 'shu', to: 'fa', type: '弟弟' },
        { from: 'gu', to: 'fa', type: '妹妹' },
        { from: 'jiu', to: 'mo', type: '哥哥' }, { from: 'yi', to: 'mo', type: '妹妹' },
        { from: 'gb', to: 'me', type: '哥哥' }, { from: 'di', to: 'me', type: '弟弟' },
        { from: 'jie', to: 'me', type: '姐姐' }, { from: 'mei', to: 'me', type: '妹妹' },
        { from: 'qi', to: 'me', type: '配偶' },
        { from: 'ilf', to: 'qi', type: '父亲' }, { from: 'ilm', to: 'qi', type: '母亲' },
        { from: 'son', to: 'me', type: '儿子' }, { from: 'dau', to: 'me', type: '女儿' },
        { from: 'gs', to: 'son', type: '儿子' }, { from: 'gd', to: 'son', type: '女儿' },
        { from: 'ne', to: 'gb', type: '儿子' }, { from: 'nd', to: 'gb', type: '女儿' },
        { from: 'we', to: 'jie', type: '儿子' }, { from: 'ws', to: 'jie', type: '女儿' },
        { from: 'co', to: 'bo', type: '儿子' }, { from: 'bg', to: 'gu', type: '儿子' },
        { from: 'osg', to: 'gs', type: '儿子' }, { from: 'wsg', to: 'dau', type: '儿子' }
    ].concat(extraR || []);
    return K.compute('me', P, R);
}

var o = fam();

eq(L(o, 'me'), '我', 'ego -> 我');
eq(EX(o, 'me'), true, 'ego exact');
eq(GEN(o, 'me'), 0, 'ego gen 0');

eq(L(o, 'fa'), '父亲', 'fa -> 父亲');
eq(L(o, 'mo'), '母亲', 'mo -> 母亲');
eq(L(o, 'gf'), '爷爷', 'gf -> 爷爷');
eq(L(o, 'gm'), '奶奶', 'gm -> 奶奶');
eq(L(o, 'mgf'), '外公', 'mgf -> 外公');
eq(L(o, 'mgm'), '外婆', 'mgm -> 外婆');
eq(GEN(o, 'gf'), -2, 'gf gen -2');

eq(L(o, 'bo'), '伯父', 'bo -> 伯父');
eq(L(o, 'shu'), '叔父', 'shu -> 叔父');
eq(L(o, 'gu'), '姑姑', 'gu -> 姑姑');
eq(L(o, 'jiu'), '舅舅', 'jiu -> 舅舅');
eq(L(o, 'yi'), '姨妈', 'yi -> 姨妈');

eq(L(o, 'gb'), '哥哥', 'gb -> 哥哥');
eq(L(o, 'di'), '弟弟', 'di -> 弟弟');
eq(L(o, 'jie'), '姐姐', 'jie -> 姐姐');
eq(L(o, 'mei'), '妹妹', 'mei -> 妹妹');

eq(L(o, 'qi'), '配偶', 'qi -> 配偶');
eq(L(o, 'ilf'), '岳父', 'ilf -> 岳父 (经妻)');
eq(L(o, 'ilm'), '岳母', 'ilm -> 岳母 (经妻)');

eq(L(o, 'son'), '儿子', 'son -> 儿子');
eq(L(o, 'dau'), '女儿', 'dau -> 女儿');
eq(L(o, 'gs'), '孙子', 'gs -> 孙子');
eq(L(o, 'gd'), '孙女', 'gd -> 孙女');
eq(GEN(o, 'gs'), 2, 'gs gen +2');

eq(L(o, 'ne'), '侄子', 'ne -> 侄子 (兄之子)');
eq(L(o, 'nd'), '侄女', 'nd -> 侄女');
eq(L(o, 'we'), '外甥', 'we -> 外甥 (姐之子)');
eq(L(o, 'ws'), '外甥女', 'ws -> 外甥女');

eq(L(o, 'co'), '堂兄弟', 'co -> 堂兄弟 (伯之子)');
eq(L(o, 'bg'), '表兄弟', 'bg -> 表兄弟 (姑之子)');
eq(L(o, 'wsg'), '外孙', 'wsg -> 外孙 (女之子)');

var inf = L(o, 'osg');
eq(EX(o, 'osg'), false, 'osg inexact');
eq(inf && inf.indexOf('儿子') > -1, true, 'osg path label contains 儿子');
eq(GEN(o, 'osg'), 3, 'osg gen +3');
eq(L(o, 'wsg'), '外孙', 'wsg still exact');

var o2 = fam([{ id: 'none', gender: 'm' }], [{ from: 'none', to: 'me', type: '舅舅' }]);
eq(L(o2, 'none'), '舅舅', 'unknown-target falls back to relation type');

var deep = fam([], [{ from: 'me', to: 'osg', type: '哥哥' }]);
eq(typeof deep.labels.me.label, 'string', 'cycle-ish graph does not hang');

var cyc = K.compute('me',
    [{ id: 'a', gender: 'm' }, { id: 'b', gender: 'm' }, { id: 'me', gender: 'm' }],
    [{ from: 'a', to: 'b', type: '哥哥' }, { from: 'b', to: 'a', type: '哥哥' }, { from: 'a', to: 'me', type: '父亲' }]);
eq(cyc.labels.a.label, '父亲', 'cycle: a -> 父亲');
eq(cyc.labels.b.label, '叔父', 'cycle: b -> 叔父');

var noRoot = K.compute('ghost', [{ id: 'me', gender: 'm' }], []);
eq(noRoot.egoId, null, 'unknown root -> egoId null');
eq(Object.keys(noRoot.labels).length, 0, 'unknown root -> no labels');

eq(K.typeGroup['伯父'], '父辈', 'typeGroup 伯父 -> 父辈');
eq(K.typeGroup['外婆'], '祖辈', 'typeGroup 外婆 -> 祖辈');
eq(Array.isArray(K.TYPE_GROUPS) && K.TYPE_GROUPS.length >= 5, true, 'TYPE_GROUPS has >=5 groups');

console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
