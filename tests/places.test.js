// 地点/人物数据模型测试（places.js，纯函数）
// 重点验证：旧格式迁移不丢数据、人物挂在地点下、跨地点关系可用、删除级联正确。
var path = require('path');
var Places = require(path.join(__dirname, '..', 'places.js'));

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + msg); } }

/* ---------- 1. 旧格式迁移：人物自带坐标 → 同名地点 + 其下人物 ---------- */
var old = {
    persons: [
        { id: 'p1', name: '爷爷', gender: 'm', age: 78, titles: ['老太爷'], lat: 31.0016, lng: 111.0004, regionId: 'r1' },
        { id: 'p2', name: '奶奶', gender: 'f', age: 76, titles: [], lat: 31.0015, lng: 111.0011, regionId: 'r1' },
        { id: 'p3', name: '爸', gender: 'm', age: 50, titles: [], lat: 31.0003, lng: 111.0002, regionId: 'r1' }
    ],
    relations: [{ from: 'p1', to: 'p3', type: '父亲' }],
    rootId: 'p3',
    regions: [{ id: 'r1', name: '家', polygon: [[31.0, 111.0], [31.01, 111.0], [31.01, 111.01]] }]
};
var d = Places.normalize(JSON.parse(JSON.stringify(old)));
ok(!!d, '旧数据应能规范化');
ok(d.places.length === 3, '迁移后应有 3 个地点（实际 ' + d.places.length + '）');
ok(d.persons.length === 3, '迁移后人物数不变');
ok(d.persons.every(function (p) { return p.lat === null && p.lng === null; }), '迁移后人物不再自带坐标');
ok(d.persons.every(function (p) { return !!p.placeId; }), '迁移后人物都挂到地点下');
ok(d.relations.length === 1 && d.relations[0].type === '父亲', '迁移后关系保留');
ok(d.rootId === 'p3', '迁移后「我」保留');
var pl1 = Places.findPlace(d, d.persons[0].placeId);
ok(pl1 && pl1.name === '爷爷' && pl1.lat === 31.0016, '迁移后地点名/坐标来自原人物');
ok(pl1 && pl1.regionId === 'r1', '迁移后地点继承区域归属');

/* ---------- 1b. 迁移时按「称谓」更新人物信息 ---------- */
var withTitles = Places.normalize({
    persons: [
        { id: 'x1', name: '13', gender: 'm', age: 60, titles: ['13公', '13婆', '朋叔', '苗姑', '欠姑'], lat: 31.1, lng: 111.1 },
        { id: 'x2', name: '李四', gender: '', age: null, titles: [], lat: 31.2, lng: 111.2 }
    ],
    relations: []
});
ok(withTitles.persons[0].name === '13公', '迁移后条目名取第一个手填称谓（实际 ' + withTitles.persons[0].name + '）');
ok(withTitles.persons[0].titles.length === 5, '其余手填称谓原样保留（别人对同一个人的不同叫法）');
ok(withTitles.persons[1].name === '李四', '没有称谓时保留原姓名');
ok(withTitles.places[0].name === '13', '地点名用原数据的人物名');
ok(withTitles.migratedFrom && withTitles.migratedFrom.places === 2 && withTitles.migratedFrom.people === 2,
    '迁移统计写入 migratedFrom（给界面提示用）');

/* ---------- 2. 人物可挂同一地点（一个地点多个人） ---------- */
var d2 = Places.normalize({
    places: [{ id: 'pl1', name: '爷爷奶奶家', lat: 31, lng: 111 }],
    persons: [{ id: 'a', name: '爷爷', placeId: 'pl1' }, { id: 'b', name: '奶奶', placeId: 'pl1' }],
    relations: [{ from: 'a', to: 'b', type: '配偶' }],
    rootId: 'a'
});
var at = Places.peopleAt(d2, 'pl1');
ok(at.length === 2, '同一地点可有多个��物（实际 ' + at.length + '）');
ok(Places.peopleCount(d2, 'pl1') === 2, '人数统计正确');

/* ---------- 3. 跨地点关系 ---------- */
var d3 = Places.normalize({
    places: [{ id: 'pl1', name: 'A 家', lat: 31, lng: 111 }, { id: 'pl2', name: 'B 家', lat: 32, lng: 112 }],
    persons: [{ id: 'a', name: '我', placeId: 'pl1' }, { id: 'b', name: '爷爷', placeId: 'pl2' }],
    relations: [{ from: 'a', to: 'b', type: '祖父' }],
    rootId: 'a'
});
ok(d3.relations.length === 1, '跨地点关系保留');
ok(Places.relationsOfPlace(d3, 'pl2').length === 1, '关系在涉及的两个地点下都能看到');
ok(Places.relationsOfPlace(d3, 'pl1').length === 1, '关系在涉及的两个地点下都能看到（另一侧）');
ok(Places.placeOf(d3, 'b').name === 'B 家', '人物→地点反查正确');

/* ---------- 4. 删除级联 ---------- */
var d4 = Places.normalize({
    places: [{ id: 'pl1', name: 'A 家', lat: 31, lng: 111 }, { id: 'pl2', name: 'B 家', lat: 32, lng: 112 }],
    persons: [{ id: 'a', name: '我', placeId: 'pl1' }, { id: 'b', name: '爷爷', placeId: 'pl2' }],
    relations: [{ from: 'a', to: 'b', type: '祖父' }],
    rootId: 'a'
});
var removed = Places.removePlace(d4, 'pl2');
ok(removed === 1, '删除地点返回被删人物数');
ok(d4.places.length === 1 && d4.places[0].id === 'pl1', '地点已删除');
ok(d4.persons.length === 1 && d4.persons[0].id === 'a', '地点下的人物一并删除');
ok(d4.relations.length === 0, '涉及被删人物的关系一并删除');

/* ---------- 5. 删除人物不动地点 ---------- */
var d5 = Places.normalize({
    places: [{ id: 'pl1', name: 'A 家', lat: 31, lng: 111 }],
    persons: [{ id: 'a', name: '我', placeId: 'pl1' }, { id: 'b', name: '爸', placeId: 'pl1' }],
    relations: [{ from: 'a', to: 'b', type: '父亲' }],
    rootId: 'a'
});
Places.removePerson(d5, 'b');
ok(d5.places.length === 1, '删人物后地点还在');
ok(d5.persons.length === 1, '人物已删');
ok(d5.relations.length === 0, '人物相关关系已删');
ok(d5.rootId === 'a', '「我」不受影响');

/* ---------- 6. 标记为「我」 ---------- */
var d6 = Places.normalize({ places: [], persons: [], relations: [] });
var np = Places.addPerson(d6, { name: '我', placeId: null, isRoot: true });
ok(d6.rootId === np.id, 'isRoot 会设为 rootId');

/* ---------- 6b. 默认起点：未指定时取第一人，指定后以指定为准 ---------- */
var d6b = Places.normalize({
    places: [],
    persons: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }],
    relations: []
});
ok(d6b.rootId === null, '未指定 rootId 时为 null');
ok(Places.effectiveRootId(d6b) === 'a', '未指定 → 默认第一人');
d6b.rootId = 'b';
ok(Places.effectiveRootId(d6b) === 'b', '显式 rootId 优先于第一人');
d6b.rootId = '已删除的人';
ok(Places.effectiveRootId(d6b) === 'a', 'rootId 指向不存在的人 → 回落到第一人');
d6b.rootId = 'b';
Places.removePerson(d6b, 'b');
ok(d6b.rootId === null && Places.effectiveRootId(d6b) === 'a', '删除起点人物 → 回落到第一人');
Places.removePerson(d6b, 'a');
ok(Places.effectiveRootId(d6b) === null, '没有人物时起点为 null');
ok(Places.effectiveRootId(null) === null, '空档案不抛错');

/* ---------- 7. 归属校验：地点不存在的人物不算该地点的人 ---------- */
var d7 = Places.normalize({
    places: [{ id: 'pl1', name: 'A 家', lat: 31, lng: 111 }],
    persons: [{ id: 'a', name: '我', placeId: '不存在的地点' }],
    relations: []
});
ok(d7.persons[0].placeId === null, '指向不存在地点的 placeId 会被清空');
ok(Places.peopleAt(d7, 'pl1').length === 0, '不会算进不存在的地点');

/* ---------- 8. 重复规范化幂等 ---------- */
var again = Places.normalize(JSON.parse(JSON.stringify(d7)));
ok(again.places.length === d7.places.length && again.persons.length === d7.persons.length, '重复规范化结果稳定（不重复造地点）');

/* ---------- 9. 标签 ---------- */
var d9 = Places.normalize({
    places: [{ id: 'pl1', name: 'A 家', lat: 31, lng: 111 }],
    persons: [{ id: 'a', name: '爷爷', placeId: 'pl1' }],
    relations: []
});
ok(Places.personLabel(d9, 'a') === 'A 家 · 爷爷', '人物标签带地点名');

/* ---------- 10. 手填称谓自动拆条目 + 清空其他称谓（一个条目 = 一个称谓） ---------- */
var d10 = Places.normalize({
    places: [{ id: 'pl1', name: '爷爷家', lat: 31, lng: 111 }],
    persons: [
        { id: 'x1', name: '13公', gender: 'm', age: 60, titles: ['13公', '13婆', '朋叔'], placeId: 'pl1' },
        { id: 'x2', name: '苗姑', placeId: 'pl1' },
        { id: 'x3', name: '老太爷', titles: ['太爷爷'] } // 未挂地点：没有条目可承载，保留数据
    ],
    relations: [{ from: 'x2', to: 'x1', type: '姑姑' }]
});
var added10 = Places.splitHandFilledTitles(d10);
ok(added10 === 2, '每个手填称谓各建一条、同名已存在不重建（期望 2 实际 ' + added10 + '）');
ok(Places.peopleCount(d10, 'pl1') === 4, '地点条目 2 → 4（实际 ' + Places.peopleCount(d10, 'pl1') + '）');
ok(d10.titlesSplit === 2, 'titlesSplit 进度标记已写入 2（实际 ' + d10.titlesSplit + '）');
var np13 = d10.persons.filter(function (p) { return p.name === '13婆'; })[0];
ok(!!np13 && np13.placeId === 'pl1', '新条目挂在同一地点');
ok(np13 && np13.gender === '' && np13.age === null && np13.titles.length === 0, '新条目性别/年龄留空、不带 titles');
ok(d10.persons.filter(function (p) { return p.id === 'x1'; })[0].titles.length === 0, '原条目拆完清空其他称谓（一个条目一个称谓）');
ok(d10.persons.filter(function (p) { return p.id === 'x3'; })[0].titles.length === 1, '未挂地点的人物 titles 保留（没有条目可承载）');
ok(d10.relations.length === 1, '已有关系不动');
ok(Places.splitHandFilledTitles(d10) === 0, '再次调用不再拆（标记生效）');
Places.removePerson(d10, np13.id);
ok(Places.splitHandFilledTitles(d10) === 0 && !d10.persons.some(function (p) { return p.name === '13婆'; }),
    '删掉拆出的条目不会被复活');
var d10b = Places.normalize(JSON.parse(JSON.stringify(d10)));
ok(d10b.titlesSplit === 2, 'titlesSplit 经存盘/规范化往返仍在');

/* v1.67 存的旧标记 true：视为已拆条目，但仍会补做"清空其他称谓"并升级为 2 */
var d10c = Places.normalize({
    places: [{ id: 'pl1', name: '爷爷家', lat: 31, lng: 111 }],
    persons: [
        { id: 'y1', name: '13公', titles: ['13婆', '朋叔'], placeId: 'pl1' },
        { id: 'y2', name: '13婆', placeId: 'pl1' } // v1.67 已拆出的条目
    ],
    relations: [],
    titlesSplit: true
});
ok(Places.splitHandFilledTitles(d10c) === 0, '旧标记 true 不再重复建条目');
ok(d10c.titlesSplit === 2, '旧标记升级为 2（实际 ' + d10c.titlesSplit + '）');
ok(d10c.persons.filter(function (p) { return p.id === 'y1'; })[0].titles.length === 0,
    '旧标记数据仍会补清其他称谓');

/* ---------- 11. 导出/导入往返：places 必须一起走，否则地点名与坐标丢失 ---------- */
var fs = require('fs');
var appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
ok(/places:\s*state\.data\.places/.test(appSrc), '导出数据必须带 places（地点名/坐标）');
var d11 = Places.normalize({
    places: [{ id: 'pl1', name: '爷爷奶奶家', note: '村东头', lat: 31, lng: 111 }],
    persons: [{ id: 'a', name: '我', placeId: 'pl1' }],
    relations: [],
    rootId: null
});
ok(d11.places.length === 1 && d11.places[0].name === '爷爷奶奶家' && d11.places[0].lat === 31,
    'places 经导入规范化后保留名称与坐标');
ok(d11.persons[0].placeId === 'pl1', '人物仍挂回原地点');

console.log('pass=' + pass + ' fail=' + fail);
