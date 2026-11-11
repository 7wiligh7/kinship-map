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

eq(L(o, 'osg'), '曾孙', 'osg -> 曾孙（孙子的儿子，已能给出正名）');
eq(EX(o, 'osg'), true, 'osg exact：五服词表生效后不再退化为路径');
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

/* ===== mutual 双向称谓换算（同龄不同辈场景的核心） ===== */

// 基础家族：我 + 爸 + 伯父(爸的哥哥) + 堂哥(伯父的儿子)
var MP = [
    { id: 'me', gender: 'm' },
    { id: 'fa', gender: 'm' },
    { id: 'bo', gender: 'm' },
    { id: 'tg', gender: 'm' }
];
var MR = [
    { from: 'fa', to: 'me', type: '父亲' },
    { from: 'bo', to: 'fa', type: '哥哥' },
    { from: 'tg', to: 'bo', type: '儿子' }
];

// 直系：我 → 爸，爸 → 我（性别联动）
var x1 = K.mutual('me', 'fa', MP, MR);
eq(x1.iCall.label, '父亲', 'mutual 直系 我→爸');
eq(x1.iCall.exact, true, 'mutual 直系 exact');
eq(x1.theyCall.label, '儿子', 'mutual 直系 爸→我(男)');
eq(x1.genDiff, -1, 'mutual 直系 genDiff -1');

// 一级间接：伯父 ↔ 我
var x2 = K.mutual('me', 'bo', MP, MR);
eq(x2.iCall.label, '伯父', 'mutual 一级间接 我→伯父');
eq(x2.theyCall.label, '侄子', 'mutual 伯父→我(男)');
eq(x2.genDiff, -1, 'mutual 伯父 genDiff -1');

// 两级间接（间接链路的双向都精确）：堂哥 ↔ 我
var x3 = K.mutual('me', 'tg', MP, MR);
eq(x3.iCall.label, '堂兄弟', 'mutual 两级间接 我→堂哥');
eq(x3.theyCall.label, '堂兄弟', 'mutual 堂哥→我');
eq(x3.genDiff, 0, 'mutual 堂哥 同辈 genDiff 0');

// === 用户场景：老来得子的弟弟——我和小叔年龄相仿（差 2 岁），辈分差一辈 ===
var SP = [
    { id: 'me', gender: 'm', age: 30 },
    { id: 'fa', gender: 'm', age: 60 },
    { id: 'sh', gender: 'm', age: 28 } // fa 的幼弟，只比我大两岁
];
var SR = [
    { from: 'fa', to: 'me', type: '父亲' },
    { from: 'sh', to: 'fa', type: '弟弟' }
];
var x4 = K.mutual('me', 'sh', SP, SR);
eq(x4.iCall.label, '叔父', '同年龄段长辈 我→小叔 = 叔父');
eq(x4.iCall.exact, true, '同年龄段长辈 exact');
eq(x4.theyCall.label, '侄子', '小叔→我 = 侄子（不看年龄看辈分）');
eq(x4.theyCall.exact, true, '小叔→我 exact');
eq(x4.genDiff, -1, '小叔 genDiff -1（高我一辈）');

// === 反向：年长的晚辈——堂哥 55 岁才生子，堂侄 27 岁与我(30)只差 3 岁，但低我一辈 ===
// 家族：我 → 父亲 → 伯父(父亲的哥哥) → 堂哥(55) → 堂侄(27)
var CP = [
    { id: 'me', gender: 'm', age: 30 },
    { id: 'fa', gender: 'm', age: 78 },
    { id: 'bo', gender: 'm', age: 82 },
    { id: 'tg', gender: 'm', age: 55 },
    { id: 'tgs', gender: 'm', age: 27 } // 堂侄，只比我小 3 岁
];
var CR = [
    { from: 'fa', to: 'me', type: '父亲' },
    { from: 'bo', to: 'fa', type: '哥哥' },
    { from: 'tg', to: 'bo', type: '儿子' },
    { from: 'tgs', to: 'tg', type: '儿子' }
];
var x5 = K.mutual('me', 'tgs', CP, CR);
eq(x5.iCall.label, '堂侄', '年长晚辈 我→堂侄 精确');
eq(x5.iCall.exact, true, '年长晚辈 我→堂侄 exact');
eq(x5.genDiff, 1, '年长晚辈 genDiff +1（低我一辈）');
eq(x5.theyCall && x5.theyCall.exact, true, '年长晚辈 反向经祖辈链 exact');
eq(x5.theyCall && x5.theyCall.label, '堂叔', '年长晚辈 堂侄→我 = 堂叔（隔着一条祖辈链）');

// 未连通：两个方向都 null，genDiff null
var x6 = K.mutual('me', 'tg', [
    { id: 'me', gender: 'm' }, { id: 'fa', gender: 'm' }, { id: 'tg', gender: 'm' }
], [{ from: 'fa', to: 'me', type: '父亲' }]);
eq(x6.iCall, null, 'mutual 未连通 iCall null');
eq(x6.theyCall, null, 'mutual 未连通 theyCall null');
eq(x6.genDiff, null, 'mutual 未连通 genDiff null');

// 自己和自己
var x7 = K.mutual('me', 'me', MP, MR);
eq(x7.iCall.label, '我', 'mutual 自己 iCall=我');
eq(x7.genDiff, 0, 'mutual 自己 genDiff 0');

// 无 root / 无 other：null 不抛错
eq(K.mutual(null, 'fa', MP, MR).iCall, null, 'mutual 无 root 不抛错');
eq(K.mutual('me', null, MP, MR).theyCall, null, 'mutual 无 other 不抛错');

/* ===== 本土称谓词表：五服直系 + 旁系 + 俗称（本功能的核心） ===== */

// 造一条从「我」出发的链：types 依次往上/往下，genders 是对应人物的性别
function chain(types, genders, egoGender) {
    var P = [{ id: 'me', gender: egoGender || 'm' }];
    var R = [];
    var prev = 'me';
    types.forEach(function (t, i) {
        var id = 'c' + i;
        P.push({ id: id, gender: genders[i] });
        R.push({ from: id, to: prev, type: t });
        prev = id;
    });
    return K.compute('me', P, R);
}

// --- 直系尊亲属：父 → 祖 → 曾祖 → 高祖 → 天祖 → 烈祖 → 太祖 → 远祖 → 鼻祖 ---
var up9 = chain(['父亲', '父亲', '父亲', '父亲', '父亲', '父亲', '父亲', '父亲', '父亲'],
                ['m', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 'm']);
eq(L(up9, 'c0'), '父亲', '第1代 = 父亲');
eq(L(up9, 'c1'), '爷爷', '第2代 = 爷爷');
eq(L(up9, 'c2'), '曾祖父', '爷爷的父亲 = 曾祖父（俗称太爷爷）');
eq(L(up9, 'c3'), '高祖父', '爷爷的爷爷 = 高祖父');
eq(L(up9, 'c4'), '天祖父', '第5代 = 天祖父');
eq(L(up9, 'c5'), '烈祖父', '第6代 = 烈祖父');
eq(L(up9, 'c6'), '太祖父', '第7代 = 太祖父');
eq(L(up9, 'c7'), '远祖父', '第8代 = 远祖父');
eq(L(up9, 'c8'), '鼻祖', '第9代 = 鼻祖');
eq(EX(up9, 'c8'), true, '鼻祖 exact：整条链都是正名');

// 用户点名的例子：爷爷的爷爷 → 高祖父 / 太爷爷
eq(up9.labels.c3.label, '高祖父', '示例：爷爷的爷爷 = 高祖父');
eq(up9.labels.c3.alias.indexOf('太爷爷') > -1, true, '示例：高祖父的俗称里含「太爷爷」');
eq(K.aliasOf('高祖父').indexOf('太爷爷') > -1, true, 'aliasOf(高祖父) 含太爷爷');
eq(K.aliasOf('曾祖父').indexOf('太爷爷') > -1, true, 'aliasOf(曾祖父) 也含太爷爷（各地叫法不同）');
eq(K.namesOf('高祖父').length >= 3, true, 'namesOf(高祖父) 返回正名 + 俗称');

// --- 直系卑亲属：子 → 孙 → 曾孙 → 玄孙 → 来孙 → 晜孙 → 仍孙 → 云孙 → 耳孙 ---
var down6 = chain(['儿子', '儿子', '儿子', '儿子', '儿子', '儿子'],
                  ['m', 'm', 'm', 'm', 'm', 'm']);
eq(L(down6, 'c1'), '孙子', '孙辈 = 孙子');
eq(L(down6, 'c2'), '曾孙', '孙子的儿子 = 曾孙（俗称重孙）');
eq(L(down6, 'c3'), '玄孙', '第4代孙 = 玄孙');
eq(L(down6, 'c4'), '来孙', '第5代孙 = 来孙');
eq(L(down6, 'c5'), '晜孙', '第6代孙 = 晜孙');
eq(K.aliasOf('曾孙').indexOf('重孙') > -1, true, 'aliasOf(曾孙) 含重孙');
eq(K.aliasOf('晜孙').indexOf('昆孙') > -1, true, 'aliasOf(晜孙) 含昆孙');

// --- 母系与外家：外公这支加「外」，奶奶娘家在中间插入「外」 ---
var mat = chain(['母亲', '父亲', '父亲', '父亲'], ['m', 'm', 'm', 'm']);
eq(L(mat, 'c1'), '外公', '母之父 = 外公');
eq(L(mat, 'c2'), '外曾祖父', '外公的父亲 = 外曾祖父');
eq(L(mat, 'c3'), '外高祖父', '外公的爷爷 = 外高祖父');

var nai = chain(['父亲', '母亲', '父亲', '父亲'], ['m', 'f', 'm', 'm']);
eq(L(nai, 'c2'), '曾外祖父', '奶奶的父亲 = 曾外祖父');
eq(L(nai, 'c3'), '高外祖父', '奶奶的爷爷 = 高外祖父');

// --- 旁系：祖辈的兄弟姐妹及其后代，不再退化成「伯祖的父亲」 ---
var bozu = chain(['父亲', '父亲', '哥哥', '父亲', '父亲'], ['m', 'm', 'm', 'm', 'm']);
eq(L(bozu, 'c2'), '伯祖', '爷爷的哥哥 = 伯祖');
eq(L(bozu, 'c3'), '曾祖父', '伯祖的父亲 = 曾祖父（与爷爷同父）');
eq(bozu.labels.c2.alias.indexOf('伯公') > -1, true, '伯祖的俗称含伯公');

var guzu = chain(['父亲', '父亲', '姐姐'], ['m', 'm', 'f']);
eq(L(guzu, 'c2'), '姑祖母', '爷爷的姐姐 = 姑祖母（姑奶奶）');
eq(K.aliasOf('姑祖母').indexOf('姑奶奶') > -1, true, 'aliasOf(姑祖母) 含姑奶奶');

var jiu = chain(['父亲', '母亲', '哥哥'], ['m', 'f', 'm']);
eq(L(jiu, 'c2'), '舅祖父', '奶奶的哥哥 = 舅祖父（舅公）');

var tang = chain(['父亲', '父亲', '哥哥', '儿子', '儿子'], ['m', 'm', 'm', 'm', 'm']);
eq(L(tang, 'c2'), '伯祖', '祖辈旁系：伯祖');
eq(L(tang, 'c3'), '堂叔', '伯祖的儿子 = 堂叔');
eq(L(tang, 'c4'), '从堂兄弟', '堂叔的儿子 = 从堂兄弟');

var biao = chain(['父亲', '哥哥', '儿子', '儿子'], ['m', 'm', 'm', 'm']);
eq(L(biao, 'c2'), '堂兄弟', '伯父的儿子 = 堂兄弟');
eq(L(biao, 'c3'), '堂侄', '堂兄弟的儿子 = 堂侄');

// --- 姻亲：本土叫法（伯母/婶婶/姑父/舅妈/姨父/嫂子/弟媳/姐夫/妹夫/亲家） ---
eq(L(chain(['父亲', '配偶'], ['m', 'f']), 'c1'), '母亲', '父亲的配偶 = 母亲');
eq(L(chain(['父亲', '哥哥', '配偶'], ['m', 'm', 'f']), 'c2'), '伯母', '伯父的妻子 = 伯母');
eq(L(chain(['父亲', '弟弟', '配偶'], ['m', 'm', 'f']), 'c2'), '婶婶', '叔父的妻子 = 婶婶');
eq(L(chain(['父亲', '姐姐', '配偶'], ['m', 'f', 'm']), 'c2'), '姑父', '姑姑的丈夫 = 姑父');
eq(L(chain(['母亲', '哥哥', '配偶'], ['m', 'm', 'f']), 'c2'), '舅妈', '舅舅的妻子 = 舅妈');
eq(L(chain(['母亲', '姐姐', '配偶'], ['m', 'f', 'm']), 'c2'), '姨父', '姨妈的丈夫 = 姨父');
eq(L(chain(['哥哥', '配偶'], ['m', 'f']), 'c1'), '嫂子', '哥哥的妻子 = 嫂子');
eq(L(chain(['弟弟', '配偶'], ['m', 'f']), 'c1'), '弟媳', '弟弟的妻子 = 弟媳');
eq(L(chain(['姐姐', '配偶'], ['f', 'm']), 'c1'), '姐夫', '姐姐的丈夫 = 姐夫');
eq(L(chain(['妹妹', '配偶'], ['f', 'm']), 'c1'), '妹夫', '妹妹的丈夫 = 妹夫');
eq(L(chain(['儿子', '配偶'], ['m', 'f']), 'c1'), '儿媳', '儿子的妻子 = 儿媳');
eq(L(chain(['女儿', '配偶'], ['f', 'm']), 'c1'), '女婿', '女儿的丈夫 = 女婿');
eq(L(chain(['儿子', '配偶', '父亲'], ['m', 'f', 'm']), 'c2'), '亲家公', '儿媳的父亲 = 亲家公');
eq(L(chain(['女儿', '配偶', '母亲'], ['f', 'm', 'f']), 'c2'), '亲家母', '女婿的母亲 = 亲家母');

// 配偶的兄弟姐妹看「我」的性别：妻家是内兄，夫家是大伯子
eq(L(chain(['配偶', '哥哥'], ['m', 'm'], 'm'), 'c1'), '内兄', '妻之兄 = 内兄（大舅子）');
eq(L(chain(['配偶', '哥哥'], ['m', 'm'], 'f'), 'c1'), '大伯子', '夫之兄 = 大伯子（夫兄）');
eq(K.aliasOf('内兄').indexOf('大舅子') > -1, true, 'aliasOf(内兄) 含大舅子');

// 姻亲长辈的子女与血亲一支对齐：伯母的儿子也是堂兄弟；伯母看我 = 侄子
eq(L(chain(['父亲', '哥哥', '配偶', '儿子'], ['m', 'm', 'f', 'm']), 'c3'), '堂兄弟', '伯母的儿子 = 堂兄弟');
var fh = chain(['配偶', '哥哥', '儿子'], ['m', 'm', 'm'], 'f');
eq(L(fh, 'c1'), '大伯子', '丈夫的哥哥 = 大伯子');
eq(L(fh, 'c2'), '侄子', '大伯子的儿子 = 侄子（夫家这一支）');
var wf = chain(['配偶', '哥哥', '儿子'], ['m', 'm', 'm'], 'm');
eq(L(wf, 'c1'), '内兄', '妻子的哥哥 = 内兄');
eq(L(wf, 'c2'), '内侄', '内兄的儿子 = 内侄');

// 配偶本身按性别给别名：丈夫 / 妻子
var sp = chain(['配偶'], ['f']);
eq(L(sp, 'c0'), '配偶', '配偶仍标为配偶');
eq(sp.labels.c0.alias.indexOf('妻子') > -1, true, '配偶（女）的别名含妻子');
eq(chain(['配偶'], ['m']).labels.c0.alias.indexOf('丈夫') > -1, true, '配偶（男）的别名含丈夫');

// 词表对外暴露，其他端（小程序等）可直接复用
eq(!!K.TERMS['高祖父'], true, 'Kinship.TERMS 对外暴露');
eq(K.TERMS['曾祖父'].alias.length >= 2, true, '曾祖父有多个俗称');

/* ===== 双向对称：无论关系从哪一头录入，两个方向都要能推 ===== */

// 1) 反着录入：「我 是 爷爷 的 孙子」——正向（我怎么叫他）以前直接推不出来
var revP = [
    { id: 'me', gender: 'm' },
    { id: 'gf', gender: 'm' },
    { id: 'ggf', gender: 'm' }
];
var revR = [
    { from: 'me', to: 'gf', type: '孙子' },
    { from: 'ggf', to: 'gf', type: '父亲' }
];
var rev = K.compute('me', revP, revR);
eq(L(rev, 'gf'), '爷爷', '反着录入（我是爷爷的孙子）：我叫他 = 爷爷');
eq(EX(rev, 'gf'), true, '反着录入也给出正名，而不是推不出来');
eq(L(rev, 'ggf'), '曾祖父', '反着录入的链继续往上接 = 曾祖父');
eq(K.mutual('me', 'gf', revP, revR).theyCall.label, '孙子', '反着录入：他叫我 = 孙子');

// 2) 关系表单里每一种类型都要有逆称，否则那一头就会断
var invOK = 0, invBad = [];
K.TYPE_GROUPS.forEach(function (g) {
    g.types.forEach(function (t) {
        var P = [{ id: 'me', gender: 'm' }, { id: 'x', gender: 'f' }];
        var R = [{ from: 'x', to: 'me', type: t }];
        var fwd = K.compute('me', P, R);
        var bwd = K.compute('x', P, R);
        var ok = !!(fwd.labels.x && fwd.labels.x.exact) && !!(bwd.labels.me && bwd.labels.me.exact);
        if (ok) invOK++; else invBad.push(t);
    });
});
eq(invOK, 32, '关系表单 32 种类型，正反两个方向都能推');
eq(invBad.length, 0, '没有缺逆称的类型：' + JSON.stringify(invBad));

// 3) 旁系长辈看我：奶奶的哥哥（舅祖父）看我 = 外甥孙
var JP = [
    { id: 'me', gender: 'm' }, { id: 'fa', gender: 'm' },
    { id: 'gm', gender: 'f' }, { id: 'jmzu', gender: 'm' }
];
var JR = [
    { from: 'fa', to: 'me', type: '父亲' },
    { from: 'gm', to: 'fa', type: '母亲' },
    { from: 'jmzu', to: 'gm', type: '哥哥' }
];
eq(K.mutual('me', 'jmzu', JP, JR).iCall.label, '舅祖父', '奶奶的哥哥：我叫他 = 舅祖父');
eq(K.mutual('me', 'jmzu', JP, JR).theyCall.label, '外甥孙', '奶奶的哥哥：他叫我 = 外甥孙');

// 4) 只知道「侄子」不知道是伯还是叔：给出「伯父/叔父」，再往上照样能接
var CP2 = [
    { id: 'me', gender: 'm' }, { id: 'bo', gender: 'm' }, { id: 'gf', gender: 'm' }
];
var CR2 = [
    { from: 'me', to: 'bo', type: '侄子' },
    { from: 'gf', to: 'bo', type: '父亲' }
];
var comp = K.compute('me', CP2, CR2);
eq(L(comp, 'bo'), '伯父/叔父', '只记了侄子：我叫他 = 伯父/叔父（长幼未知）');
eq(L(comp, 'gf'), '爷爷', '复合称谓继续往上推 = 爷爷，不断链');
eq(EX(comp, 'gf'), true, '复合称谓后面的链仍是正名');

console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
