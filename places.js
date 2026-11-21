// 亲属关系地图 — 地点/人物数据模型（纯函数，不依赖 DOM，可直接 require 测试）
//
// 模型要点（v1.56 起）：
//   地图上标注的主体是「地点」（places[]，带坐标），人物（persons[]）挂在地点下（placeId）。
//   人物关系（relations[]）引用人物 id，可跨地点；称谓推算引擎（kinship.js）仍以人物为中心，不用改。
//
//   places[] : { id, name, note, lat, lng, regionId }
//   persons[]: { id, name, gender, age, titles[], placeId }
//   relations[]: { from, to, type }   —— from 是 to 的 type
//   rootId   : 「我」对应的人物 id
//
// 旧格式（v1.55 及以前）人物自带坐标，迁移规则：每个人物 → 一个同名地点，其下挂该人物。
var Places = (function () {
    var SCHEMA_VERSION = 4;

    function newId(prefix) {
        return (prefix || 'p') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function normAge(v) {
        if (v === null || v === undefined || v === '' || v === true || v === false) return null;
        var n = typeof v === 'number' ? v : Number(String(v).trim());
        if (!isFinite(n) || n < 0 || n > 150) return null;
        return Math.floor(n);
    }

    function cleanTitles(list) {
        if (!Array.isArray(list)) return [];
        return list.filter(function (t) { return typeof t === 'string' && t.trim(); })
            .map(function (t) { return t.trim(); });
    }

    /* ---------- 查询 ---------- */

    function findPlace(d, id) {
        if (!d || !id) return null;
        var list = d.places || [];
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    }

    function findPerson(d, id) {
        if (!d || !id) return null;
        var list = d.persons || [];
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    }

    // 某地点下的人物
    function peopleAt(d, placeId) {
        if (!d) return [];
        return (d.persons || []).filter(function (p) { return p.placeId === placeId; });
    }

    // 某人物所属地点
    function placeOf(d, personId) {
        var p = findPerson(d, personId);
        return p ? findPlace(d, p.placeId) : null;
    }

    // 「地点 · 姓名」标签（同名人物多时避免歧义）
    function personLabel(d, id) {
        var p = findPerson(d, id);
        if (!p) return '（已删除）';
        var pl = findPlace(d, p.placeId);
        var dup = peopleAt(d, p.placeId).filter(function (x) { return x.name === p.name; }).length > 1;
        if (!pl) return p.name;
        return dup ? pl.name + ' · ' + p.name : pl.name + ' · ' + p.name;
    }

    // 地点下有多少人
    function peopleCount(d, placeId) {
        return peopleAt(d, placeId).length;
    }

    /* ---------- 变更 ---------- */

    function addPlace(d, o) {
        var pl = {
            id: o.id || newId('pl_'),
            name: String(o.name || '').trim() || '未命名地点',
            note: String(o.note || '').trim(),
            lat: typeof o.lat === 'number' ? o.lat : null,
            lng: typeof o.lng === 'number' ? o.lng : null,
            regionId: typeof o.regionId === 'string' ? o.regionId : null
        };
        d.places = d.places || [];
        d.places.push(pl);
        return pl;
    }

    function addPerson(d, o) {
        var p = {
            id: o.id || newId('pe_'),
            name: String(o.name || '').trim(),
            gender: o.gender === 'm' || o.gender === 'f' ? o.gender : '',
            age: normAge(o.age),
            titles: cleanTitles(o.titles),
            placeId: typeof o.placeId === 'string' ? o.placeId : null
        };
        d.persons = d.persons || [];
        d.persons.push(p);
        if (o.isRoot) d.rootId = p.id;
        return p;
    }

    function removePerson(d, id) {
        d.persons = (d.persons || []).filter(function (p) { return p.id !== id; });
        d.relations = (d.relations || []).filter(function (r) { return r.from !== id && r.to !== id; });
        if (d.rootId === id) d.rootId = null;
    }

    // 称谓推算的实际起点：显式 rootId 有效时优先用它（用户手动指定），
    // 否则默认取第一个人。删除起点人物 / 旧数据没存 rootId 时都会自动回到第一人，
    // 因此「我」永远有起点，不再要求用户先手动标记。
    function effectiveRootId(d) {
        if (!d) return null;
        if (d.rootId) {
            var marked = findPerson(d, d.rootId);
            if (marked) return marked.id;
        }
        var persons = d.persons || [];
        return persons.length ? persons[0].id : null;
    }

    // 删除地点：连带删除其下人物（及涉及这些人物的关系）
    function removePlace(d, id) {
        var people = peopleAt(d, id);
        people.forEach(function (p) { removePerson(d, p.id); });
        d.places = (d.places || []).filter(function (pl) { return pl.id !== id; });
        return people.length;
    }

    function movePerson(d, personId, placeId) {
        var p = findPerson(d, personId);
        if (!p) return false;
        p.placeId = placeId || null;
        return true;
    }

    // 某地点涉及的全部关系（关系两端任一在该地点）
    function relationsOfPlace(d, placeId) {
        var ids = {};
        peopleAt(d, placeId).forEach(function (p) { ids[p.id] = true; });
        return (d.relations || []).filter(function (r) { return ids[r.from] || ids[r.to]; });
    }

    /* ---------- 手填称谓 → 独立称谓条目（逐个填入，一个条目 = 一个称谓） ---------- */

    // 第一步（首次执行）：同地点内没有同名条目时，为每个手填称谓新建一条独立条目
    // （性别/年龄留空待补，新条目可各自参与称谓推算；原条目与已有关系不动）。
    // 第二步（v1.68 起）：条目各就各位后，原条目不再保留"其他称谓"（titles 清空）。
    // d.titlesSplit 记进度（1 = 已拆条目，2 = 已清其他称谓；v1.67 存的 true 视为已拆）：
    // 之后删掉拆出的条目不会被"复活"，用户后续新填的 titles 也不再自动拆。
    function splitHandFilledTitles(d) {
        if (!d || !Array.isArray(d.persons)) return 0;
        if (d.titlesSplit >= 2) return 0;
        var placeSet = {};
        (d.places || []).forEach(function (pl) { placeSet[pl.id] = true; });
        var added = 0;
        if (!d.titlesSplit) {
            var names = {}; // placeId → 该地点已有的条目名
            d.persons.forEach(function (p) {
                if (!p.placeId || !placeSet[p.placeId]) return;
                names[p.placeId] = names[p.placeId] || {};
                names[p.placeId][p.name] = true;
            });
            d.persons.slice().forEach(function (p) { // 快照遍历：新建的条目不再参与本轮
                if (!p.placeId || !names[p.placeId]) return;
                cleanTitles(p.titles).forEach(function (t) {
                    if (names[p.placeId][t]) return;
                    addPerson(d, { name: t, gender: '', age: null, titles: [], placeId: p.placeId });
                    names[p.placeId][t] = true;
                    added++;
                });
            });
        }
        // 一个条目 = 一个称谓：只清挂在地点下的人物（未挂的没有条目可承载，保留数据）
        d.persons.forEach(function (p) {
            if (p.placeId && placeSet[p.placeId] && p.titles && p.titles.length) p.titles = [];
        });
        d.titlesSplit = 2;
        return added;
    }

    /* ---------- 规范化 + 迁移 ---------- */

    function normalize(d, opts) {
        opts = opts || {};
        if (!d || typeof d !== 'object') return null;

        // 超旧格式：只有 buildings 数组
        if (Array.isArray(d)) d = { buildings: d };
        if (Array.isArray(d.buildings)) {
            d = {
                persons: d.buildings.map(function (b) {
                    return {
                        id: b.id || newId('pe_'), name: b.name || '', gender: b.gender || '',
                        age: normAge(b.age), titles: b.titles || [], lat: b.lat, lng: b.lng
                    };
                }),
                relations: d.relations || [],
                rootId: d.rootId || null
            };
        }
        if (!Array.isArray(d.persons)) return null;
        if (!Array.isArray(d.relations)) d.relations = [];

        var isNewFormat = Array.isArray(d.places);
        var migrated = { places: 0, people: 0 };
        if (!isNewFormat) {
            // 旧格式迁移：人物自带坐标 → 每人一个同名地点，其下挂该人物
            // 人物信息按「称谓」更新：条目名取第一个手填称谓（没有则用原姓名），
            // 其余手填称谓原样保留（别人对同一个人的不同叫法）。
            d.places = [];
            d.persons.forEach(function (p) {
                var titles = cleanTitles(p.titles);
                var entryName = titles.length ? titles[0] : String(p.name || '');
                if (typeof p.lat === 'number' && typeof p.lng === 'number') {
                    var pl = addPlace(d, {
                        id: 'pl_' + p.id,
                        name: String(p.name || '') || entryName,
                        lat: p.lat,
                        lng: p.lng,
                        regionId: p.regionId
                    });
                    p.placeId = pl.id;
                    migrated.places++;
                } else {
                    p.placeId = null;
                }
                p.name = entryName;
                p.titles = titles;
                p.lat = null;
                p.lng = null;
                migrated.people++;
            });
        }

        // 地点规范化
        d.places = (d.places || []).filter(function (pl) { return pl && pl.id; }).map(function (pl) {
            return {
                id: String(pl.id),
                name: typeof pl.name === 'string' && pl.name ? pl.name : '未命名地点',
                note: typeof pl.note === 'string' ? pl.note : '',
                lat: typeof pl.lat === 'number' ? pl.lat : null,
                lng: typeof pl.lng === 'number' ? pl.lng : null,
                regionId: typeof pl.regionId === 'string' ? pl.regionId : null
            };
        });
        var placeIds = {};
        d.places.forEach(function (pl) { placeIds[pl.id] = true; });

        // 人物规范化（人物不再自带坐标，坐标归地点）
        d.persons = d.persons.filter(function (p) { return p && p.id && typeof p.name === 'string'; }).map(function (p) {
            return {
                id: String(p.id),
                name: p.name,
                gender: p.gender === 'm' || p.gender === 'f' ? p.gender : '',
                age: normAge(p.age),
                titles: cleanTitles(p.titles),
                placeId: typeof p.placeId === 'string' && placeIds[p.placeId] ? p.placeId : null,
                // 兼容旧数据残留的坐标（迁移后应为空）
                lat: typeof p.lat === 'number' ? p.lat : null,
                lng: typeof p.lng === 'number' ? p.lng : null
            };
        });
        // 迁移来的地点人物坐标已归地点；清掉人物坐标避免两处打架
        d.persons.forEach(function (p) { p.lat = null; p.lng = null; });

        var ids = {};
        d.persons.forEach(function (p) { ids[p.id] = true; });
        d.relations = d.relations.filter(function (r) {
            return r && ids[String(r.from)] && ids[String(r.to)] && typeof r.type === 'string' && r.type;
        }).map(function (r) {
            return { from: String(r.from), to: String(r.to), type: r.type };
        });
        d.rootId = d.rootId && ids[String(d.rootId)] ? String(d.rootId) : null;

        d.version = SCHEMA_VERSION;
        if (migrated.people) d.migratedFrom = migrated; // 给界面提示用（旧数据 → 新模型）
        return d;
    }

    return {
        SCHEMA_VERSION: SCHEMA_VERSION,
        newId: newId,
        normAge: normAge,
        findPlace: findPlace,
        findPerson: findPerson,
        peopleAt: peopleAt,
        placeOf: placeOf,
        peopleCount: peopleCount,
        personLabel: personLabel,
        addPlace: addPlace,
        addPerson: addPerson,
        removePerson: removePerson,
        removePlace: removePlace,
        effectiveRootId: effectiveRootId,
        movePerson: movePerson,
        relationsOfPlace: relationsOfPlace,
        splitHandFilledTitles: splitHandFilledTitles,
        normalize: normalize
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Places;
