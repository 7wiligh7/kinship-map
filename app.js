var WS_LIST_KEY = 'kinmap_workspaces';
var LEGACY_KEY = 'kinmap_data';
var DEMO_FLAG = 'kinmap_demo_done';

var map = null;
var addMode = false;
var pendingLatLng = null;
var pendingDraft = null;
var state = {
    workspace: null,
    data: null,
    isDemo: false,
    markers: {},
    markerLayer: null,
    regionLayer: null,
    selectedId: null,
    editingId: null
};

var draw = {
    active: false,
    vertices: [],
    preview: null,
    vertexMarkers: []
};

/* ===== utils ===== */

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(msg, ms) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, ms || 2200);
}

function showDialog(opts) {
    document.getElementById('dialogTitle').textContent = opts.title || '';
    document.getElementById('dialogBody').innerHTML = opts.body || '';
    var box = document.getElementById('dialogButtons');
    box.innerHTML = '';
    (opts.buttons || []).forEach(function (b) {
        var el = document.createElement('button');
        el.className = b.cls || '';
        el.textContent = b.label;
        el.onclick = function () {
            hideDialog();
            if (b.onClick) b.onClick();
        };
        box.appendChild(el);
    });
    document.getElementById('dialog').classList.add('show');
}

function hideDialog() {
    document.getElementById('dialog').classList.remove('show');
}

function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('show');
    document.querySelector('.sidebar-mask').classList.toggle('show');
}

function toggleSidebarIfOpen() {
    var sb = document.querySelector('.sidebar');
    if (sb.classList.contains('show')) toggleSidebar();
}

function openSidebar() {
    var sb = document.querySelector('.sidebar');
    if (!sb.classList.contains('show')) toggleSidebar();
}

function focusPlaceSearch() {
    openSidebar();
    var el = document.getElementById('placeInput');
    if (el) {
        el.focus();
        if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
    }
}

/* ===== geometry ===== */

function cross(o, a, b) {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function convexHull(pts) {
    var p = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (p.length < 3) return p;
    var lower = [], i;
    for (i = 0; i < p.length; i++) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p[i]) <= 0) lower.pop();
        lower.push(p[i]);
    }
    var upper = [];
    for (i = p.length - 1; i >= 0; i--) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p[i]) <= 0) upper.pop();
        upper.push(p[i]);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
}

function padPolygon(poly, factor, minDeg) {
    if (!poly.length) return poly;
    var clat = 0, clng = 0;
    poly.forEach(function (v) { clat += v[0]; clng += v[1]; });
    clat /= poly.length;
    clng /= poly.length;
    return poly.map(function (v) {
        var lat = clat + (v[0] - clat) * factor;
        var lng = clng + (v[1] - clng) * factor;
        var dlat = lat - clat, dlng = lng - clng;
        var dist = Math.sqrt(dlat * dlat + dlng * dlng);
        if (dist < minDeg && dist > 1e-12) {
            var k = minDeg / dist;
            lat = clat + dlat * k;
            lng = clng + dlng * k;
        }
        return [lat, lng];
    });
}

function pointInPolygon(pt, poly) {
    if (!poly || poly.length < 3) return false;
    var x = pt[0], y = pt[1];
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        var xi = poly[i][0], yi = poly[i][1];
        var xj = poly[j][0], yj = poly[j][1];
        var intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function boxAround(pts, pad) {
    var minLa = 90, maxLa = -90, minLn = 180, maxLn = -180;
    pts.forEach(function (p) {
        minLa = Math.min(minLa, p[0]); maxLa = Math.max(maxLa, p[0]);
        minLn = Math.min(minLn, p[1]); maxLn = Math.max(maxLn, p[1]);
    });
    return [
        [minLa - pad, minLn - pad],
        [minLa - pad, maxLn + pad],
        [maxLa + pad, maxLn + pad],
        [maxLa + pad, minLn - pad]
    ];
}

/* ===== workspace ===== */

function getWsList() {
    try {
        var l = JSON.parse(localStorage.getItem(WS_LIST_KEY));
        return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
}

function saveWsList(list) {
    localStorage.setItem(WS_LIST_KEY, JSON.stringify(list));
}

function wsKey(id) {
    return 'kinmap_data_' + id;
}

function freshV3() {
    return { version: 3, regions: [], activeRegionId: null, persons: [], relations: [], rootId: null };
}

function loadWs(id) {
    var raw = localStorage.getItem(wsKey(id));
    if (!raw) return null;
    try { return normalizeData(JSON.parse(raw)); } catch (e) { return null; }
}

function saveWsData(id, data) {
    try { localStorage.setItem(wsKey(id), JSON.stringify(data)); } catch (e) { toast('本地存储失败：' + e.message); }
}

function saveData() {
    if (state.workspace) saveWsData(state.workspace.id, state.data);
}

function updateWsMeta(patch) {
    var list = getWsList();
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === state.workspace.id) {
            Object.keys(patch).forEach(function (k) { list[i][k] = patch[k]; });
            break;
        }
    }
    saveWsList(list);
    state.workspace = list.filter(function (w) { return w.id === state.workspace.id; })[0] || state.workspace;
}

function migrateLegacy() {
    if (localStorage.getItem(WS_LIST_KEY)) return;
    var raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    var d = null;
    try { d = normalizeData(JSON.parse(raw)); } catch (e) { d = null; }
    if (!d) return;
    var ws = { id: 'ws_' + Date.now().toString(36), name: '我的档案', emoji: '🏡', createdAt: Date.now() };
    saveWsList([ws]);
    saveWsData(ws.id, d);
    localStorage.removeItem(LEGACY_KEY);
}

function renderStartup() {
    var list = getWsList();
    var box = document.getElementById('wsList');
    if (!list.length) {
        box.innerHTML = '<div class="ws-empty">还没有档案，点下方「新建档案」开始</div>';
    } else {
        box.innerHTML = list.map(function (w) {
            var d = loadWs(w.id);
            var n = d ? d.persons.length : 0;
            return '<div class="ws-card" onclick="enterWorkspace(\'' + esc(w.id) + '\')">' +
                '<span class="ws-card-emoji">' + esc(w.emoji || '🏡') + '</span>' +
                '<span class="ws-card-info"><div class="ws-card-name">' + esc(w.name) + '</div>' +
                '<div class="ws-card-meta">' + n + ' 人</div></span>' +
                '<button class="ws-card-del" title="删除档案" onclick="event.stopPropagation(); deleteWorkspace(\'' + esc(w.id) + '\')">✕</button>' +
                '</div>';
        }).join('');
    }
    document.getElementById('startup').classList.remove('hidden');
}

function showStartup() {
    toggleSidebarIfOpen();
    renderStartup();
}

function showCreateForm() {
    document.getElementById('wsCreateForm').style.display = 'block';
    document.getElementById('wsNewBtn').style.display = 'none';
    document.getElementById('wsNameInput').focus();
}

function pickEmoji(el) {
    Array.prototype.forEach.call(document.querySelectorAll('.ws-emoji'), function (s) {
        s.classList.toggle('picked', s === el);
    });
}

// 建档表单里搜主要居住地：选中的结果会在建档后自动建成第一个区域。
function searchNewWsPlace() {
    var input = document.getElementById('wsPlaceInput');
    var box = document.getElementById('wsPlaceResults');
    var q = input.value.trim();
    if (!q) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="place-empty">搜索中…</div>';
    geocode(q).then(function (list) {
        if (!list || !list.length) {
            box.innerHTML = '<div class="place-empty">没有找到「' + esc(q) + '」</div>';
            return;
        }
        state._newWsPlaces = list;
        box.innerHTML = list.map(function (r, i) {
            return '<div class="place-item" onclick="pickNewWsPlace(' + i + ')">' +
                '<span class="place-name">' + esc(r.name) + '</span>' +
                (r.address ? '<span class="place-addr">' + esc(r.address) + '</span>' : '') +
                '</div>';
        }).join('');
    }).catch(function () {
        box.innerHTML = '<div class="place-empty">搜索失败：网络不可达<br>可在 config.js 填高德 key，或直接输入「纬度,经度」</div>';
    });
}

function pickNewWsPlace(i) {
    var r = (state._newWsPlaces || [])[i];
    if (!r) return;
    state._newWsPlace = r;
    document.getElementById('wsPlaceResults').innerHTML = '';
    document.getElementById('wsPlaceHint').innerHTML = '已选：<b>' + esc(r.name) + '</b>';
}

function hideCreateForm() {
    document.getElementById('wsCreateForm').style.display = 'none';
    document.getElementById('wsNewBtn').style.display = 'block';
    document.getElementById('wsNameInput').value = '';
    document.getElementById('wsPlaceInput').value = '';
    document.getElementById('wsPlaceResults').innerHTML = '';
    document.getElementById('wsPlaceHint').textContent = '选好后创建档案，会自动建成第一个区域';
    state._newWsPlace = null;
    state._newWsPlaces = null;
}

function createWorkspace() {
    var name = document.getElementById('wsNameInput').value.trim() || '我们的家';
    var picked = document.querySelector('.ws-emoji.picked');
    var emoji = picked ? picked.getAttribute('data-e') : '🏡';
    var list = getWsList();
    var isFirstEver = list.length === 0;
    var ws = { id: 'ws_' + Date.now().toString(36), name: name, emoji: emoji, createdAt: Date.now() };
    list.push(ws);
    saveWsList(list);
    var data = freshV3();
    if (isFirstEver && CONFIG.DEMO_ON_EMPTY && !localStorage.getItem(DEMO_FLAG)) {
        data = demoData();
        ws.demo = true;
        saveWsList(list);
    }
    saveWsData(ws.id, data);
    var pendingPlace = state._newWsPlace;
    hideCreateForm();
    enterWorkspace(ws.id);
    // 建档时选过居住地 → 自动建成第一个区域（演示数据自带区域，不覆盖）
    if (pendingPlace && state.data && !state.data.regions.length) {
        var poly = placePolygon(pendingPlace);
        if (poly) {
            var km = spanKmOf(poly);
            if (km <= CONFIG.REGION_MAX_SPAN_KM) {
                addRegionFromPlace(pendingPlace.name || name, poly);
            } else {
                var rName = pendingPlace.name || name;
                showDialog({
                    title: '区域跨度超出建议上限',
                    body: '<div class="dialog-note">「' + esc(rName) + '」的涵盖范围约 ' + Math.round(km) + ' km，超过建议上限 ' + CONFIG.REGION_MAX_SPAN_KM + ' km。<br/>' +
                        '建议搜索更具体的地名（如村/镇），或进档案后手绘框选。仍要创建吗？</div>',
                    buttons: [
                        { label: '不创建' },
                        { label: '仍创建', cls: 'primary', onClick: function () { addRegionFromPlace(rName, poly); } }
                    ]
                });
            }
        }
    }
}

function deleteWorkspace(id) {
    var list = getWsList();
    var ws = list.filter(function (w) { return w.id === id; })[0];
    if (!ws) return;
    if (!confirm('删除档案「' + ws.name + '」？其全部数据将被清除，不可恢复。')) return;
    saveWsList(list.filter(function (w) { return w.id !== id; }));
    localStorage.removeItem(wsKey(id));
    renderStartup();
    toast('已删除档案');
}

function enterWorkspace(id) {
    var list = getWsList();
    var ws = list.filter(function (w) { return w.id === id; })[0];
    if (!ws) return;
    state.workspace = ws;
    state.isDemo = !!ws.demo;
    state.data = loadWs(id) || freshV3();
    document.getElementById('startup').classList.add('hidden');
    document.getElementById('wsBarEmoji').textContent = ws.emoji || '🏡';
    document.getElementById('wsBarName').textContent = ws.name;
    if (!map) {
        initMap();
    } else {
        map.invalidateSize();
    }
    showDemoBanner();
    renderRegions();
    renderAll(false);
    fitActiveRegion();
}

/* ===== data layer (v1/v2/v3 normalize) ===== */

function newId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function newRegionId() {
    return 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function findPerson(id) {
    for (var i = 0; i < state.data.persons.length; i++) {
        if (state.data.persons[i].id === id) return state.data.persons[i];
    }
    return null;
}

function synthRegion(persons) {
    var pts = persons.filter(function (p) { return typeof p.lat === 'number' && typeof p.lng === 'number'; })
        .map(function (p) { return [p.lat, p.lng]; });
    var poly;
    if (pts.length >= 3) {
        poly = padPolygon(convexHull(pts), 1.15, 0.0008);
    } else if (pts.length) {
        poly = boxAround(pts, 0.005);
    } else {
        poly = boxAround([CONFIG.CENTER], 0.01);
    }
    return { id: newRegionId(), name: '默认区域', polygon: poly };
}

function normalizeData(d) {
    if (!d || typeof d !== 'object') return null;
    if (Array.isArray(d.buildings)) {
        d = {
            persons: d.buildings.map(function (b) {
                return { id: b.id, name: b.name || '', gender: b.gender || '', titles: b.titles || [], lat: b.lat, lng: b.lng };
            }),
            relations: [],
            rootId: d.rootId || null
        };
    }
    if (!Array.isArray(d.persons)) return null;
    if (!Array.isArray(d.relations)) d.relations = [];
    d.persons = d.persons.filter(function (p) {
        return p && p.id && typeof p.name === 'string';
    }).map(function (p) {
        return {
            id: String(p.id),
            name: p.name,
            gender: p.gender === 'm' || p.gender === 'f' ? p.gender : '',
            titles: Array.isArray(p.titles) ? p.titles.filter(function (t) { return typeof t === 'string' && t.trim(); }) : [],
            lat: typeof p.lat === 'number' ? p.lat : null,
            lng: typeof p.lng === 'number' ? p.lng : null,
            regionId: typeof p.regionId === 'string' ? p.regionId : null
        };
    });
    var ids = {};
    d.persons.forEach(function (p) { ids[p.id] = true; });
    d.relations = d.relations.filter(function (r) {
        return r && ids[String(r.from)] && ids[String(r.to)] && typeof r.type === 'string' && r.type;
    }).map(function (r) {
        return { from: String(r.from), to: String(r.to), type: r.type };
    });
    d.rootId = d.rootId && ids[String(d.rootId)] ? String(d.rootId) : null;

    if (!Array.isArray(d.regions)) d.regions = [];
    d.regions = d.regions.filter(function (r) {
        return r && r.id && Array.isArray(r.polygon) && r.polygon.length >= 3;
    }).map(function (r) {
        return { id: String(r.id), name: typeof r.name === 'string' && r.name ? r.name : '未命名区域', polygon: r.polygon };
    });
    if (!d.regions.length && d.persons.length) {
        d.regions = [synthRegion(d.persons)];
    }
    var rids = {};
    d.regions.forEach(function (r) { rids[r.id] = true; });
    var fallbackRid = d.activeRegionId && rids[d.activeRegionId] ? d.activeRegionId : (d.regions[0] ? d.regions[0].id : null);
    d.persons.forEach(function (p) {
        if (!p.regionId || !rids[p.regionId]) p.regionId = fallbackRid;
    });
    d.activeRegionId = fallbackRid;
    d.version = 3;
    return d;
}

function loadData() { return state.data; }

/* ===== map ===== */

function initMap() {
    map = L.map('map', {
        center: CONFIG.CENTER,
        zoom: CONFIG.ZOOM,
        minZoom: CONFIG.MIN_ZOOM,
        maxZoom: CONFIG.MAX_ZOOM,
        maxBoundsViscosity: 1.0 /* 平移硬墙：拖不出去 */
    });
    // 缩放控件挪到右上角，与定位键同列（否则和左上角菜单按钮重叠）
    if (map.zoomControl) map.zoomControl.setPosition('topright');
    state.tileDefs = [];
    if (CONFIG.TILE.LOCAL) {
        state.tileDefs.push({
            url: CONFIG.TILE.LOCAL,
            opts: { minZoom: CONFIG.MIN_ZOOM, maxZoom: CONFIG.MAX_ZOOM, zIndex: 0 }
        });
    }
    state.tileDefs.push({
        url: CONFIG.TILE.NETWORK,
        opts: { maxZoom: CONFIG.MAX_ZOOM, attribution: CONFIG.TILE.ATTRIBUTION }
    });
    state._tileKey = null;
    buildTiles();
    state.markerLayer = L.layerGroup().addTo(map);
    state.regionLayer = L.layerGroup().addTo(map);
    map.on('click', function (e) {
        if (draw.active) { addVertex(e.latlng); return; }
        if (!addMode) return;
        addMode = false;
        syncTileBounds(); /* 放置完成：恢复瓦片范围 + 平移硬墙 */
        openPersonModal(null, e.latlng);
    });
    map.on('dblclick', function () {
        if (draw.active) finishRegion();
    });
    map.on('contextmenu', function (e) {
        if (draw.active || !addMode) return;
        addMode = false;
        syncTileBounds(); /* 放置完成：恢复瓦片范围 + 平移硬墙 */
        openPersonModal(null, e.latlng);
    });
    window.addEventListener('resize', function () {
        if (!map) return;
        map.invalidateSize();
        syncMapPan(); // 视口尺寸变了，缩放下限要重算
    });
}

/* ===== tile bounds: 瓦片与平移范围锚定当前区域 ===== */

// 当前区域的瓦片边界：区域多边形外扩 VIEW.EXPAND。
// 不再缓存视口——Leaflet 的 TileLayer.bounds 会在每个缩放级别自动重新筛选，
// 平移/缩放后永远不会与实际视野脱节（此前“缩放反逻辑”的根因就是缓存了固定视口）。
function regionTileBounds() {
    if (!CONFIG.TILE_LIMIT_TO_REGION || !state.data || draw.active || addMode) return null;
    var r = activeRegion();
    if (!r || !r.polygon || r.polygon.length < 3) return null;
    return L.latLngBounds(r.polygon).pad(CONFIG.VIEW.EXPAND);
}

// 平移硬边界 + 缩放下限：与瓦片边界同一来源（区域外扩），
// 无区域 / 绘制模式 / 放置模式时都解锁。
function syncMapPan() {
    if (!map) return;
    var b = regionTileBounds();
    map.setMaxBounds(b); // 传 null/空边界时 Leaflet 自动解除限制
    if (b) {
        // 缩放下限 = 区域外扩范围恰好铺满视口的那一级：再缩小就看到区域外了。
        // 退化多边形（跨度为 0）会让 getBoundsZoom 返回异常值，这里兜底保护，
        // 否则 minZoom 可能被设成 maxZoom，缩放被锁死。
        var zMin = map.getBoundsZoom(b);
        if (isFinite(zMin)) map.setMinZoom(Math.min(zMin, CONFIG.MAX_ZOOM));
        if (!b.contains(map.getCenter())) {
            // 切到新区域时旧视野可能在新边界外：把中心拉回边界内
            map.panInsideBounds(b, { animate: false });
        }
    } else {
        map.setMinZoom(CONFIG.MIN_ZOOM);
    }
}

function buildTiles() {
    if (!map || !state.tileDefs) return;
    var b = regionTileBounds();
    state.tileDefs.forEach(function (d) {
        if (d.layer) {
            map.removeLayer(d.layer);
            d.layer = null;
        }
        var opts = {};
        Object.keys(d.opts).forEach(function (k) { opts[k] = d.opts[k]; });
        if (b) opts.bounds = b;
        d.layer = L.tileLayer(d.url, opts).addTo(map);
    });
}

function syncTileBounds() {
    if (!map || !state.tileDefs) return;
    var r = activeRegion();
    var key;
    if (!CONFIG.TILE_LIMIT_TO_REGION || draw.active || addMode || !r) {
        key = 'none';
    } else {
        key = r.id + '|' + r.polygon.length + '|' + r.polygon[0][0].toFixed(5) + ',' + r.polygon[0][1].toFixed(5);
    }
    if (key === state._tileKey) return;
    state._tileKey = key;
    buildTiles();
    syncMapPan();
}

function activeRegion() {
    if (!state.data) return null;
    return state.data.regions.filter(function (r) { return r.id === state.data.activeRegionId; })[0] || null;
}

function fitActiveRegion() {
    if (!map || !state.data) return;
    var r = activeRegion();
    if (r) {
        fitRegion(r);
        return;
    }
    fitData(true);
}

// 把视野适配到某个区域：区域边界外扩一截，装满视口。
// 与 syncMapPan 的缩放下限保持一致，所以这里不再设 maxZoom：
// 否则这里算出的远景会被后面的 minZoom 强制拉近，配置项形同虚设。
function fitRegion(r) {
    if (!map || !r || !r.polygon || r.polygon.length < 3) return;
    map.fitBounds(L.latLngBounds(r.polygon).pad(CONFIG.VIEW.EXPAND), {
        padding: CONFIG.VIEW.PADDING,
        animate: false
    });
    state._tileKey = null;
    syncTileBounds();
}

function fitData(force) {
    if (!map) return;
    var pts = [];
    state.data.persons.forEach(function (p) {
        if (p.lat != null && p.lng != null) pts.push([p.lat, p.lng]);
    });
    if (pts.length) {
        map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: CONFIG.VIEW.MAX_ZOOM });
    } else if (force) {
        map.setView(CONFIG.CENTER, CONFIG.VIEW.MAX_ZOOM);
    }
}

function renderAll(fit) {
    if (!state.markerLayer) return;
    state.markerLayer.clearLayers();
    state.markers = {};
    state.data.persons.forEach(function (p) {
        if (p.lat == null || p.lng == null) return;
        var isRoot = p.id === state.data.rootId;
        var icon = L.divIcon({
            className: 'bl-anchor',
            html: '<span class="bl-label' + (isRoot ? ' root' : '') + '">' + esc(p.name) + '</span>',
            iconSize: [0, 0],
            iconAnchor: [0, 0]
        });
        var m = L.marker([p.lat, p.lng], { icon: icon, keyboard: false }).addTo(state.markerLayer);
        m.on('click', function () {
            addMode = false;
            openInfoCard(p.id);
        });
        m.on('contextmenu', function (e) {
            addMode = false;
            showContextMenu(e.originalEvent, p.id);
        });
        state.markers[p.id] = m;
    });
    renderRegions();
    if (fit) fitData(false);
}

/* ===== regions ===== */

function renderRegions() {
    var cur = activeRegion();
    document.getElementById('regionCurrent').textContent = cur ? cur.name : (state.data && state.data.regions.length ? state.data.regions[0].name : '未划定');
    var list = document.getElementById('regionList');
    list.innerHTML = (state.data ? state.data.regions : []).map(function (r) {
        return '<div class="region-item' + (r.id === state.data.activeRegionId ? ' active' : '') + '" onclick="switchRegion(\'' + esc(r.id) + '\')">' +
            '<span class="region-item-name">' + esc(r.name) + '</span>' +
            (state.data.regions.length > 1 ? '<button class="region-item-del" title="删除区域" onclick="event.stopPropagation(); deleteRegion(\'' + esc(r.id) + '\')">✕</button>' : '') +
            '</div>';
    }).join('');
    if (state.regionLayer) {
        state.regionLayer.clearLayers();
        (state.data ? state.data.regions : []).forEach(function (r) {
            var isActive = r.id === state.data.activeRegionId;
            L.polygon(r.polygon, {
                color: isActive ? '#d32f2f' : '#666',
                weight: 2,
                dashArray: '6 5',
                fill: isActive,
                fillColor: '#d32f2f',
                fillOpacity: 0.04,
                interactive: false
            }).addTo(state.regionLayer);
        });
    }
    syncTileBounds();
}

function switchRegion(id) {
    if (!state.data) return;
    var r = state.data.regions.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    state.data.activeRegionId = id;
    saveData();
    renderRegions();
    fitRegion(r);
    toggleSidebarIfOpen();
    toast('已切换到「' + r.name + '」');
}

function deleteRegion(id) {
    if (state.data.regions.length <= 1) { toast('至少保留一个区域'); return; }
    var r = state.data.regions.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    if (!confirm('删除区域「' + r.name + '」？区域内的人物将归入其他区域。')) return;
    state.data.regions = state.data.regions.filter(function (x) { return x.id !== id; });
    var newActive = state.data.activeRegionId === id ? state.data.regions[0].id : state.data.activeRegionId;
    state.data.persons.forEach(function (p) {
        if (p.regionId === id) p.regionId = newActive;
    });
    state.data.activeRegionId = newActive;
    saveData();
    renderRegions();
    renderAll(false);
    fitActiveRegion();
    toast('已删除区域');
}

function startDrawRegion() {
    if (!state.workspace) return;
    if (draw.active) return;
    toggleSidebarIfOpen();
    draw.active = true;
    draw.vertices = [];
    draw.vertexMarkers = [];
    document.getElementById('drawHint').classList.add('show');
    if (map) map.doubleClickZoom.disable();
    syncTileBounds();
    toast('点击地图添加顶点，双击闭合（≥3 个顶点）', 3000);
}

function addVertex(latlng) {
    var last = draw.vertices[draw.vertices.length - 1];
    if (last && Math.abs(last[0] - latlng.lat) < 1e-7 && Math.abs(last[1] - latlng.lng) < 1e-7) return;
    draw.vertices.push([latlng.lat, latlng.lng]);
    var mk = L.circleMarker(latlng, { radius: 5, color: '#d32f2f', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(map);
    draw.vertexMarkers.push(mk);
    if (draw.preview) map.removeLayer(draw.preview);
    draw.preview = L.polyline(draw.vertices, { color: '#d32f2f', weight: 2, dashArray: '5 4' }).addTo(map);
    updateDrawSpan();
}

function undoVertex() {
    if (!draw.vertices.length) return;
    draw.vertices.pop();
    var mk = draw.vertexMarkers.pop();
    if (mk) map.removeLayer(mk);
    if (draw.preview) { map.removeLayer(draw.preview); draw.preview = null; }
    if (draw.vertices.length) draw.preview = L.polyline(draw.vertices, { color: '#d32f2f', weight: 2, dashArray: '5 4' }).addTo(map);
    updateDrawSpan();
}

function cleanupDraw() {
    draw.active = false;
    if (draw.preview) { map.removeLayer(draw.preview); draw.preview = null; }
    draw.vertexMarkers.forEach(function (m) { map.removeLayer(m); });
    draw.vertexMarkers = [];
    draw.vertices = [];
    document.getElementById('drawHint').classList.remove('show');
    if (map) map.doubleClickZoom.enable();
    updateDrawSpan();
    syncTileBounds();
}

function cancelDraw() {
    if (pendingDraft) {
        var draft = pendingDraft;
        pendingDraft = null;
        cleanupDraw();
        openPersonModal(null, L.latLng(draft.lat, draft.lng));
        document.getElementById('inputName').value = draft.name;
        document.getElementById('inputGender').value = draft.gender;
        document.getElementById('titleList').innerHTML = '';
        (draft.titles.length ? draft.titles : ['']).forEach(function (t) { addTitleRow(t); });
        document.getElementById('inputRoot').checked = !!draft.isRoot;
        return;
    }
    cleanupDraw();
}

function finishRegion() {
    // 少于 3 个顶点：保留绘制状态，让用户继续补点（这里不撤销）
    if (draw.vertices.length < 3) { toast('至少需要 3 个顶点'); return; }
    // 闭合瞬间就校验：不合规直接撤销本次绘制，提示重新划定（不打断命名流程）
    var bad = regionInvalidReason(draw.vertices);
    if (bad) {
        cleanupDraw(); /* 用 cleanupDraw 而非 cancelDraw：保留待放置的人物草稿 */
        toast(bad + '，已撤销本次框选，请重新划定', 4000);
        return;
    }
    showDialog({
        title: '区域命名',
        body: '<input class="input" id="regionNameInput" placeholder="如：老家、岳父家" maxlength="20" />',
        buttons: [
            { label: '取消', onClick: function () { cancelDraw(); } },
            {
                label: '创建', cls: 'primary', onClick: function () {
                    var name = (document.getElementById('regionNameInput') && document.getElementById('regionNameInput').value || '').trim() || '未命名区域';
                    // 跨度/面积已由上面的 regionInvalidReason 校验过，直接建区
                    createRegion(name, draw.vertices.slice());
                }
            }
        ]
    });
    setTimeout(function () {
        var el = document.getElementById('regionNameInput');
        if (el) el.focus();
    }, 60);
}

// 由顶点数组正式建区（含保存、渲染、视野适配），finishRegion 与地名搜索共用。
function createRegion(name, verts) {
    var region = { id: newRegionId(), name: name, polygon: verts };
    cleanupDraw();
    state.data.regions.push(region);
    state.data.activeRegionId = region.id;
    saveData();
    renderRegions();
    fitRegion(region);
    toast('已创建区域「' + name + '」');
    if (pendingDraft) {
        var draft = pendingDraft;
        pendingDraft = null;
        savePersonDraft(draft, region.id);
    }
}

// 两线段是否真交叉（严格相交，端点接触不算）
function segCross(p1, p2, p3, p4) {
    function d(a, b, c) {
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    }
    var d1 = d(p3, p4, p1), d2 = d(p3, p4, p2);
    var d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
    function opp(x, y) { return (x > 0 && y < 0) || (x < 0 && y > 0); }
    return opp(d1, d2) && opp(d3, d4);
}

// 多边形是否自相交（"8 字形"这类边穿过边）。返回交叉描述或 null。
// 相邻边共享端点不算；首尾两条边在闭合意义下相邻，也跳过。
function selfIntersectReason(poly) {
    var n = poly.length;
    if (n < 4) return null;
    for (var i = 0; i < n; i++) {
        for (var j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue;
            if (segCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) {
                return '边框自相交（第 ' + (i + 1) + ' 与第 ' + (j + 1) + ' 条边交叉）';
            }
        }
    }
    return null;
}

// 顶点跨度的最大维度（km）：纬度 1°≈111km，经度乘以 cos(纬度) 修正。
function spanKmOf(poly) {
    var b = L.latLngBounds(poly);
    var kmLat = Math.abs(b.getNorth() - b.getSouth()) * 111;
    var kmLng = Math.abs(b.getEast() - b.getWest()) * 111 * Math.cos((b.getNorth() + b.getSouth()) / 2 * Math.PI / 180);
    return Math.max(kmLat, kmLng);
}

// 多边形面积（km²，鞋带公式，按平均纬度做等距近似）——用来识别"共线没围出面积"
function polyAreaKm2(poly) {
    if (!poly || poly.length < 3) return 0;
    var clat = 0;
    poly.forEach(function (v) { clat += v[0]; });
    clat /= poly.length;
    var rad = Math.PI / 180, R = 6371;
    var pts = poly.map(function (v) {
        return [v[1] * rad * R * Math.cos(clat * rad), v[0] * rad * R];
    });
    var s = 0;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        s += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
    }
    return Math.abs(s / 2);
}

// 区域合规校验：返回 null 表示合规，否则返回不合规原因
// 阈值都在 config.js（REGION_MIN_SPAN_KM / REGION_MIN_AREA_KM2 / REGION_MAX_SPAN_KM）
function regionInvalidReason(poly) {
    if (!poly || poly.length < 3) return '至少需要 3 个顶点';
    // 先查结构性问题：自相交（"8 字形"）的净面积常为 0，放到面积判定之后会误报成"共线"
    var selfX = selfIntersectReason(poly);
    if (selfX) return selfX + '，请把交叉处的顶点删掉重画';
    var km = spanKmOf(poly);
    if (km < CONFIG.REGION_MIN_SPAN_KM) return '范围过小（顶点几乎重合）';
    if (polyAreaKm2(poly) < CONFIG.REGION_MIN_AREA_KM2) {
        return '顶点几乎在一条线上，没有围出面积（跨度约 ' + Math.round(km) + ' km）';
    }
    if (km > CONFIG.REGION_MAX_SPAN_KM) return '跨度约 ' + Math.round(km) + ' km，超过上限 ' + CONFIG.REGION_MAX_SPAN_KM + ' km';
    return null;
}

// 绘制过程中实时显示当前跨度，提前知道有没有超限
function updateDrawSpan() {
    var el = document.getElementById('drawSpan');
    if (!el) return;
    if (!draw.active || draw.vertices.length < 2) { el.textContent = ''; return; }
    var km = spanKmOf(draw.vertices);
    el.textContent = '当前跨度约 ' + (km < 10 ? km.toFixed(1) : Math.round(km)) + ' km / 上限 ' + CONFIG.REGION_MAX_SPAN_KM + ' km';
    el.classList.toggle('over', km > CONFIG.REGION_MAX_SPAN_KM);
}

/* ===== place search (geocode) ===== */

function searchPlaces() {
    var q = document.getElementById('placeInput').value.trim();
    var box = document.getElementById('placeResults');
    if (!q) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="place-empty">搜索中…</div>';
    geocode(q).then(function (list) {
        if (!list || !list.length) {
            box.innerHTML = '<div class="place-empty">没有找到「' + esc(q) + '」</div>';
            return;
        }
        state._placeResults = list;
        box.innerHTML = list.map(function (r, i) {
            return '<div class="place-item" onclick="createRegionFromPlace(' + i + ')">' +
                '<span class="place-name">' + esc(r.name) + '</span>' +
                (r.address ? '<span class="place-addr">' + esc(r.address) + '</span>' : '') +
                '<button class="place-loc" onclick="event.stopPropagation(); flyToPlace(' + i + ')" title="只把地图定位过去，不建区域">定位</button>' +
                '</div>';
        }).join('');
    }).catch(function () {
        box.innerHTML = '<div class="place-empty">搜索失败：网络不可达<br>可在 config.js 填高德 key，或直接输入「纬度,经度」</div>';
    });
}

function geocode(q) {
    var coords = parseCoords(q);
    if (coords) {
        return Promise.resolve([{
            name: coords[0].toFixed(5) + ', ' + coords[1].toFixed(5),
            address: '坐标点（免网络）',
            bbox: null,
            lat: coords[0],
            lng: coords[1]
        }]);
    }
    var list = providerList();
    if (!list.length) return Promise.reject(new Error('no provider configured'));
    var i = 0;
    function next() {
        if (i >= list.length) throw new Error('all providers failed');
        var fn = list[i++];
        return fn(q).then(function (res) {
            return res && res.length ? res : next();
        }, next);
    }
    return next();
}

function providerList() {
    var impls = { esri: geocodeEsri, nominatim: geocodeNominatim, amap: geocodeAmap };
    var names = (CONFIG.GEOCODE.PROVIDERS || ['esri']).slice();
    if (CONFIG.GEOCODE.AMAP_KEY && names.indexOf('amap') < 0) names.push('amap');
    return names.map(function (n) { return impls[n]; }).filter(Boolean);
}

function parseCoords(q) {
    var m = String(q).match(/^\s*(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) return null;
    var a = parseFloat(m[1]), b = parseFloat(m[2]);
    if (isNaN(a) || isNaN(b)) return null;
    if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
    return [a, b];
}

function fetchJson(url) {
    var ms = CONFIG.GEOCODE.TIMEOUT || 10000;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    var done = function () { if (timer) clearTimeout(timer); };
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined).then(function (res) {
        done();
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    }, function (e) {
        done();
        throw e;
    });
}

function geocodeEsri(q) {
    var c = map ? map.getCenter() : L.latLng(CONFIG.CENTER[0], CONFIG.CENTER[1]);
    var url = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates' +
        '?f=json&singleLine=' + encodeURIComponent(q) +
        '&maxLocations=' + (CONFIG.GEOCODE.LIMIT || 6) +
        '&outFields=LongLabel,Match_addr&outSR=4326' +
        '&langCode=' + encodeURIComponent(CONFIG.GEOCODE.LANGUAGE || 'zh-CN') +
        '&location=' + c.lng.toFixed(5) + ',' + c.lat.toFixed(5);
    return fetchJson(url).then(function (j) {
        return (j.candidates || []).filter(function (cd) {
            return cd.extent || cd.location;
        }).map(function (cd) {
            var e = cd.extent;
            var attrs = cd.attributes || {};
            return {
                name: attrs.Match_addr || cd.address || q,
                address: attrs.LongLabel || cd.address || '',
                bbox: e ? { south: e.ymin, west: e.xmin, north: e.ymax, east: e.xmax } : null,
                lat: cd.location ? cd.location.y : null,
                lng: cd.location ? cd.location.x : null
            };
        });
    });
}

function geocodeNominatim(q) {
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2' +
        '&limit=' + (CONFIG.GEOCODE.LIMIT || 6) +
        '&accept-language=' + encodeURIComponent(CONFIG.GEOCODE.LANGUAGE || 'zh-CN') +
        (CONFIG.GEOCODE.EMAIL ? '&email=' + encodeURIComponent(CONFIG.GEOCODE.EMAIL) : '') +
        '&q=' + encodeURIComponent(q);
    return fetchJson(url).then(function (arr) {
        return (arr || []).map(function (it) {
            var bb = it.boundingbox;
            var parts = String(it.display_name || '').split(',');
            return {
                name: parts[0] || q,
                address: it.display_name || it.type || '',
                bbox: bb ? { south: +bb[0], north: +bb[1], west: +bb[2], east: +bb[3] } : null,
                lat: +it.lat,
                lng: +it.lon
            };
        }).filter(function (r) {
            return r.bbox || (typeof r.lat === 'number' && typeof r.lng === 'number');
        });
    });
}

function geocodeAmap(q) {
    var url = 'https://restapi.amap.com/v3/place/text?key=' + encodeURIComponent(CONFIG.GEOCODE.AMAP_KEY) +
        '&keywords=' + encodeURIComponent(q) +
        '&offset=' + (CONFIG.GEOCODE.LIMIT || 6) + '&page=1&extensions=base';
    return fetchJson(url).then(function (j) {
        return (j.pois || []).map(function (p) {
            var loc = String(p.location || '').split(',');
            if (loc.length !== 2) return null;
            var wgs = gcj02ToWgs84(parseFloat(loc[0]), parseFloat(loc[1]));
            return {
                name: p.name || q,
                address: (p.pname || '') + (p.cityname || '') + (p.adname || '') + (p.address || ''),
                bbox: null,
                lat: wgs[1],
                lng: wgs[0]
            };
        }).filter(Boolean);
    });
}

/* GCJ-02（高德/腾讯）↔ WGS-84（Esri 底图），迭代反算 */

var GCJ_A = 6378245.0;
var GCJ_EE = 0.00669342162296594323;

function gcjOutOfChina(lng, lat) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function gcjTransformLat(x, y) {
    var r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    r += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    r += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return r;
}

function gcjTransformLng(x, y) {
    var r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    r += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    r += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return r;
}

function wgs84ToGcj02(lng, lat) {
    if (gcjOutOfChina(lng, lat)) return [lng, lat];
    var dLat = gcjTransformLat(lng - 105.0, lat - 35.0);
    var dLng = gcjTransformLng(lng - 105.0, lat - 35.0);
    var radLat = lat / 180.0 * Math.PI;
    var magic = Math.sin(radLat);
    magic = 1 - GCJ_EE * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (GCJ_A / sqrtMagic * Math.cos(radLat) * Math.PI);
    return [lng + dLng, lat + dLat];
}

function gcj02ToWgs84(lng, lat) {
    if (gcjOutOfChina(lng, lat)) return [lng, lat];
    var w = [lng, lat];
    for (var i = 0; i < 5; i++) {
        var g = wgs84ToGcj02(w[0], w[1]);
        w[0] += lng - g[0];
        w[1] += lat - g[1];
    }
    return w;
}

function bboxPolygon(b) {
    return [
        [b.south, b.west],
        [b.south, b.east],
        [b.north, b.east],
        [b.north, b.west]
    ];
}

// 从一条地理编码结果取出多边形：优先用 bbox，否则用坐标点画小方框
function placePolygon(r) {
    if (r.bbox) return bboxPolygon(r.bbox);
    if (typeof r.lat === 'number' && typeof r.lng === 'number') return boxAround([[r.lat, r.lng]], 0.004);
    return null;
}

function createRegionFromPlace(i) {
    if (!state.data) return;
    var r = (state._placeResults || [])[i];
    if (!r) return;
    var poly = placePolygon(r);
    if (!poly) { toast('该结果没有可用范围'); return; }
    var name = r.name || '新区域';
    var km = spanKmOf(poly);
    if (km <= CONFIG.REGION_MAX_SPAN_KM) {
        addRegionFromPlace(name, poly);
        return;
    }
    showDialog({
        title: '区域跨度超出建议上限',
        body: '<div class="dialog-note">「' + esc(name) + '」的涵盖范围约 ' + Math.round(km) + ' km，超过建议上限 ' + CONFIG.REGION_MAX_SPAN_KM + ' km。<br/>' +
            '相邻但分开的居住地请各建一个区域、切换查看。仍要创建吗？</div>',
        buttons: [
            { label: '取消' },
            { label: '仍创建', cls: 'primary', onClick: function () { addRegionFromPlace(name, poly); } }
        ]
    });
}

// 地名搜索建区（过跨度检查后调用）。
function addRegionFromPlace(name, poly) {
    var region = { id: newRegionId(), name: name, polygon: poly };
    state.data.regions.push(region);
    state.data.activeRegionId = region.id;
    saveData();
    renderRegions();
    state._placeResults = null;
    document.getElementById('placeResults').innerHTML = '';
    document.getElementById('placeInput').value = '';
    fitRegion(region);
    toggleSidebarIfOpen();
    toast('已按「' + region.name + '」添加区域');
    if (pendingDraft) {
        var draft = pendingDraft;
        pendingDraft = null;
        savePersonDraft(draft, region.id);
    }
}

// 只把地图定位过去，不建区域（摆放人物前先找到位置；bbox 有范围则落到中心）。
function flyToPlace(i) {
    if (!map) return;
    var r = (state._placeResults || [])[i];
    if (!r) return;
    var b = r.bbox ? L.latLngBounds([[r.bbox.south, r.bbox.west], [r.bbox.north, r.bbox.east]]) : null;
    if (b) {
        // 大范围（如市级）用 fitBounds 保留参照，小范围用上限 17 拉近；
        // 若被缩放下限拦住，Leaflet 会自动钳到允许的级别，不会越界
        map.fitBounds(b, { maxZoom: 17, animate: true });
    } else {
        map.setView([r.lat, r.lng], 17, { animate: true });
    }
    var anchor = b ? b.getCenter() : L.latLng(r.lat, r.lng);
    if (addMode) { toast('已定位：点击地图放置人物', 3000); return; }
    var panB = map.options.maxBounds;
    if (panB && !panB.contains(anchor)) {
        toast('目的地在区域外，地图停在边界可及处；要标注那里 → 菜单「添加人物」（放置时解锁）', 4200);
    }
}

/* ===== demo ===== */

function demoData() {
    function d(id, name, gender, lat, lng) {
        return { id: id, name: name, gender: gender, titles: [], lat: lat, lng: lng, regionId: 'r_demo' };
    }
    var persons = [
        d('d_gf', '爷爷', 'm', 31.0016, 111.0004),
        d('d_gm', '奶奶', 'f', 31.0015, 111.0011),
        d('d_bo', '伯父', 'm', 31.0010, 110.9996),
        d('d_co', '堂哥', 'm', 31.0005, 110.9991),
        d('d_fa', '爸', 'm', 31.0003, 111.0002),
        d('d_mo', '妈', 'f', 30.9999, 111.0010),
        d('d_yi', '小姨', 'f', 30.9995, 111.0015),
        d('d_me', '我', 'm', 30.9992, 111.0000)
    ];
    return {
        version: 3,
        regions: [{ id: 'r_demo', name: '演示区域', polygon: padPolygon(convexHull(persons.map(function (p) { return [p.lat, p.lng]; })), 1.1, 0.0005) }],
        activeRegionId: 'r_demo',
        persons: persons,
        relations: [
            { from: 'd_gf', to: 'd_fa', type: '父亲' },
            { from: 'd_gm', to: 'd_fa', type: '母亲' },
            { from: 'd_fa', to: 'd_me', type: '父亲' },
            { from: 'd_mo', to: 'd_me', type: '母亲' },
            { from: 'd_bo', to: 'd_fa', type: '哥哥' },
            { from: 'd_co', to: 'd_bo', type: '儿子' },
            { from: 'd_yi', to: 'd_mo', type: '妹妹' }
        ],
        rootId: 'd_me'
    };
}

function showDemoBanner() {
    document.getElementById('demoBanner').classList.toggle('show', !!state.isDemo);
}

function markUserModified() {
    if (state.isDemo) {
        state.isDemo = false;
        updateWsMeta({ demo: false });
        showDemoBanner();
    }
}

function clearDemo() {
    if (!confirm('清空演示数据，开始记录你自己的家族？')) return;
    state.data = freshV3();
    state.isDemo = false;
    localStorage.setItem(DEMO_FLAG, '1');
    updateWsMeta({ demo: false });
    saveData();
    renderAll(false);
    showDemoBanner();
    toast('已清空，先「新建区域」再添加人物');
}

/* ===== person modal ===== */

function openAddPerson() {
    if (!state.data) return;
    if (!state.data.regions.length) {
        showDialog({
            title: '还没有区域',
            body: '先加一块区域：搜索地名，或在地图上框选。标注都归入区域管理。',
            buttons: [
                { label: '取消' },
                { label: '搜索地名', onClick: function () { focusPlaceSearch(); } },
                { label: '地图框选', cls: 'primary', onClick: function () { startDrawRegion(); } }
            ]
        });
        return;
    }
    toggleSidebarIfOpen();
    if (addMode) {
        addMode = false;
        syncTileBounds(); /* 恢复瓦片范围 + 平移硬墙 */
        toast('已退出放置模式');
        return;
    }
    addMode = true;
    state._tileKey = null;
    syncTileBounds(); /* 放置模式：瓦片与平移同时解锁 */
    toast('点击地图空白处放置人物（可先在侧栏搜索点「定位」跳过去）', 3500);
}

function openPersonModal(id, latlng) {
    state.editingId = id || null;
    pendingLatLng = latlng || null;
    var p = id ? findPerson(id) : null;
    document.getElementById('modalTitle').textContent = p ? '编辑人物' : '添加人物';
    document.getElementById('inputName').value = p ? p.name : '';
    document.getElementById('inputGender').value = p ? p.gender : '';
    document.getElementById('inputRoot').checked = p ? p.id === state.data.rootId : false;
    var tl = document.getElementById('titleList');
    tl.innerHTML = '';
    var titles = p ? p.titles.slice() : [];
    if (!titles.length) titles = [''];
    titles.forEach(function (t) { addTitleRow(t); });
    document.getElementById('btnDelete').style.display = p ? '' : 'none';
    document.getElementById('modal').classList.add('show');
    setTimeout(function () { document.getElementById('inputName').focus(); }, 50);
}

function addTitleRow(val) {
    var tl = document.getElementById('titleList');
    var row = document.createElement('div');
    row.className = 'title-row';
    row.innerHTML = '<input class="input title-input" placeholder="输入称谓" /><span class="btn-remove" onclick="removeTitleRow(this)">×</span>';
    row.querySelector('input').value = val || '';
    tl.appendChild(row);
}

function removeTitleRow(el) {
    el.parentElement.remove();
}

function collectTitles() {
    return Array.prototype.map.call(document.querySelectorAll('#titleList .title-input'), function (i) {
        return i.value.trim();
    }).filter(Boolean);
}

function closeModal() {
    document.getElementById('modal').classList.remove('show');
    state.editingId = null;
    pendingLatLng = null;
}

function confirmPerson() {
    var name = document.getElementById('inputName').value.trim();
    if (!name) { toast('请输入姓名'); return; }
    var draft = {
        name: name,
        gender: document.getElementById('inputGender').value,
        titles: collectTitles(),
        isRoot: document.getElementById('inputRoot').checked,
        lat: null,
        lng: null
    };

    if (state.editingId) {
        var p = findPerson(state.editingId);
        if (!p) { closeModal(); return; }
        p.name = draft.name;
        p.gender = draft.gender;
        p.titles = draft.titles;
        if (draft.isRoot) state.data.rootId = p.id;
        else if (state.data.rootId === p.id) state.data.rootId = null;
        saveData();
        renderAll(false);
        markUserModified();
        closeModal();
        toast('已保存 ' + draft.name);
        return;
    }

    if (!pendingLatLng) { toast('请先在地图上选点'); return; }
    draft.lat = pendingLatLng.lat;
    draft.lng = pendingLatLng.lng;

    if (!state.data.regions.length) {
        pendingDraft = draft;
        closeModal();
        startDrawRegion();
        toast('先划定区域，人物随后归入', 3000);
        return;
    }

    var active = activeRegion();
    if (active && pointInPolygon([draft.lat, draft.lng], active.polygon)) {
        savePersonDraft(draft, active.id);
        closeModal();
        return;
    }

    var others = state.data.regions.filter(function (r) { return active && r.id !== active.id; });
    var body = '落点在区域<b>「' + esc(active ? active.name : '') + '」</b>范围之外。';
    body += '<div style="margin-top:10px">怎么处理？</div>';
    if (others.length) {
        body += '<select id="oobTarget">' + others.map(function (r) {
            return '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>';
        }).join('') + '</select>';
    }
    var buttons = [];
    if (active) {
        buttons.push({
            label: '拓展「' + active.name + '」范围', cls: 'primary',
            onClick: function () {
                var poly = convexHull(active.polygon.concat([[draft.lat, draft.lng]]));
                active.polygon = padPolygon(poly, 1.03, 0.0003);
                saveData();
                renderRegions();
                savePersonDraft(draft, active.id);
                closeModal();
                toast('已拓展区域范围');
            }
        });
    }
    if (others.length) {
        buttons.push({
            label: '归入所选区域',
            onClick: function () {
                var sel = document.getElementById('oobTarget');
                var rid = sel ? sel.value : others[0].id;
                savePersonDraft(draft, rid);
                closeModal();
            }
        });
    }
    buttons.push({ label: '取消' });
    showDialog({ title: '落点超出区域', body: body, buttons: buttons });
}

function savePersonDraft(draft, regionId) {
    var p = {
        id: newId(),
        name: draft.name,
        gender: draft.gender,
        titles: draft.titles,
        lat: draft.lat,
        lng: draft.lng,
        regionId: regionId
    };
    state.data.persons.push(p);
    if (draft.isRoot) state.data.rootId = p.id;
    saveData();
    renderAll(false);
    markUserModified();
    toast('已保存 ' + p.name);
}

function removePerson(id) {
    state.data.persons = state.data.persons.filter(function (p) { return p.id !== id; });
    state.data.relations = state.data.relations.filter(function (r) { return r.from !== id && r.to !== id; });
    if (state.data.rootId === id) state.data.rootId = null;
}

function deletePerson() {
    if (!state.editingId) return;
    var p = findPerson(state.editingId);
    if (!p) return;
    if (!confirm('删除「' + p.name + '」及其全部关系？')) return;
    removePerson(p.id);
    saveData();
    renderAll(false);
    closeModal();
    closeInfoCard();
    toast('已删除 ' + p.name);
}

/* ===== context menu ===== */

function showContextMenu(ev, id) {
    state.selectedId = id;
    var m = document.getElementById('contextMenu');
    m.classList.add('show');
    var x = Math.min(ev.clientX, window.innerWidth - 140);
    var y = Math.min(ev.clientY, window.innerHeight - 90);
    m.style.left = x + 'px';
    m.style.top = y + 'px';
    if (ev.preventDefault) ev.preventDefault();
}

function hideContextMenu() {
    document.getElementById('contextMenu').classList.remove('show');
}

function editFromMenu() {
    hideContextMenu();
    openPersonModal(state.selectedId);
}

function deleteFromMenu() {
    hideContextMenu();
    var p = findPerson(state.selectedId);
    if (!p) return;
    if (!confirm('删除「' + p.name + '」及其全部关系？')) return;
    removePerson(p.id);
    saveData();
    renderAll(false);
    closeInfoCard();
    toast('已删除 ' + p.name);
}

/* ===== kinship ===== */

function computeKinship() {
    if (!state.data || !state.data.rootId || !state.data.persons.length) return null;
    try { return Kinship.compute(state.data.rootId, state.data.persons, state.data.relations); } catch (e) { return null; }
}

function personName(id) {
    var p = findPerson(id);
    return p ? p.name : '?';
}

function openInfoCard(id) {
    var p = findPerson(id);
    if (!p) return;
    toggleSidebarIfOpen();
    state.selectedId = id;
    document.getElementById('infoName').textContent = p.name;
    var kin = document.getElementById('infoKin');
    var pathEl = document.getElementById('infoPath');
    var k = computeKinship();
    var lab = k ? k.labels[id] : null;
    if (id === state.data.rootId) {
        kin.textContent = '我';
        kin.className = 'kin-badge';
        kin.style.display = '';
        pathEl.classList.remove('show');
    } else if (lab) {
        kin.textContent = lab.label;
        kin.className = 'kin-badge' + (lab.exact ? '' : ' inexact');
        kin.style.display = '';
        if (!lab.exact && lab.path && lab.path.length) {
            pathEl.textContent = lab.path.join(' → ');
            pathEl.classList.add('show');
        } else {
            pathEl.classList.remove('show');
        }
    } else {
        kin.style.display = 'none';
        pathEl.classList.remove('show');
    }
    document.getElementById('infoTitles').textContent = p.titles.length ? '手填称谓：' + p.titles.join('、') : '';
    renderRelList(id);
    document.getElementById('relForm').classList.remove('show');
    document.getElementById('infoCard').classList.add('show');
}

function closeInfoCard() {
    document.getElementById('infoCard').classList.remove('show');
}

function editFromCard() {
    openPersonModal(state.selectedId);
}

function renderRelList(id) {
    var box = document.getElementById('relList');
    var rels = state.data.relations.filter(function (r) { return r.from === id || r.to === id; });
    if (!rels.length) {
        box.innerHTML = '<div class="rel-empty">暂无关系，点下方「+ 关系」添加</div>';
        return;
    }
    box.innerHTML = rels.map(function (r) {
        var idx = state.data.relations.indexOf(r);
        return '<div class="rel-item"><span class="rel-sentence">' +
            esc(personName(r.from)) + ' 是 ' + esc(personName(r.to)) + ' 的 ' + esc(r.type) +
            '</span><span class="rel-actions">' +
            '<button class="rel-btn" onclick="jumpToPerson(\'' + esc(r.from) + '\')">定位</button>' +
            '<button class="rel-btn del" onclick="deleteRelation(' + idx + ')">删除</button>' +
            '</span></div>';
    }).join('');
}

function jumpToPerson(id) {
    var p = findPerson(id);
    if (!p || p.lat == null) { toast('该人物没有点位'); return; }
    hideSearch();
    openInfoCard(id);
    map.setView([p.lat, p.lng], Math.max(map.getZoom(), 17));
}

function deleteRelation(idx) {
    var r = state.data.relations[idx];
    if (!r) return;
    if (!confirm('删除关系：' + personName(r.from) + ' 是 ' + personName(r.to) + ' 的 ' + r.type + '？')) return;
    state.data.relations.splice(idx, 1);
    saveData();
    renderAll(false);
    if (state.selectedId && findPerson(state.selectedId)) openInfoCard(state.selectedId);
}

function showRelForm() {
    var id = state.selectedId;
    if (!id) return;
    var fromSel = document.getElementById('relFrom');
    var toSel = document.getElementById('relTo');
    var typeSel = document.getElementById('relType');
    var opts = state.data.persons.map(function (p) {
        return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
    }).join('');
    fromSel.innerHTML = opts;
    toSel.innerHTML = opts;
    fromSel.value = id;
    var other = null;
    state.data.persons.forEach(function (p) { if (!other && p.id !== id) other = p; });
    if (other) toSel.value = other.id;
    typeSel.innerHTML = Kinship.TYPE_GROUPS.map(function (g) {
        return '<optgroup label="' + esc(g.group) + '">' +
            g.types.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('') +
            '</optgroup>';
    }).join('');
    document.getElementById('relForm').classList.add('show');
}

function hideRelForm() {
    document.getElementById('relForm').classList.remove('show');
}

function saveRelation() {
    var from = document.getElementById('relFrom').value;
    var to = document.getElementById('relTo').value;
    var type = document.getElementById('relType').value;
    if (!from || !to) { toast('请选择人物'); return; }
    if (from === to) { toast('不能和自己建立关系'); return; }
    var dup = state.data.relations.some(function (r) {
        return r.from === from && r.to === to && r.type === type;
    });
    if (dup) { toast('该关系已存在'); return; }
    state.data.relations.push({ from: from, to: to, type: type });
    saveData();
    renderAll(false);
    markUserModified();
    hideRelForm();
    if (state.selectedId) openInfoCard(state.selectedId);
    toast('已添加关系');
}

/* ===== import / export / clear ===== */

function exportData() {
    if (!state.data) return;
    var payload = { version: 3, regions: state.data.regions, activeRegionId: state.data.activeRegionId, persons: state.data.persons, relations: state.data.relations, rootId: state.data.rootId };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    a.download = 'family_data_' + ts + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('已导出 family_data_*.json');
}

function importData() {
    document.getElementById('importFile').click();
}

function handleImport(input) {
    var f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
        var d;
        try { d = normalizeData(JSON.parse(reader.result)); } catch (e) { toast('文件不是有效的 JSON'); return; }
        if (!d) { toast('文件格式不正确'); return; }
        if (!d.persons.length) { toast('文件中没有人物数据'); return; }
        var n = state.data.persons.length;
        if (n && !confirm('导入将【覆盖】当前档案的全部数据（' + n + ' 人 / ' + state.data.relations.length + ' 条关系）。\n确定覆盖吗？')) return;
        state.data = d;
        saveData();
        renderRegions();
        renderAll(false);
        fitActiveRegion();
        markUserModified();
        toast('导入成功：' + d.persons.length + ' 人 / ' + d.regions.length + ' 区域');
    };
    reader.onerror = function () { toast('读取文件失败'); };
    reader.readAsText(f, 'utf-8');
}

function clearAll() {
    if (!state.data) return;
    var n = state.data.persons.length;
    if (!n) { toast('没有数据'); return; }
    if (!confirm('清除当前档案全部 ' + n + ' 人及全部关系？区域设置保留。')) return;
    state.data.persons = [];
    state.data.relations = [];
    state.data.rootId = null;
    if (state.isDemo) localStorage.setItem(DEMO_FLAG, '1');
    state.isDemo = false;
    updateWsMeta({ demo: false });
    saveData();
    renderAll(false);
    showDemoBanner();
    toast('已清除全部数据');
}

function flyToMe() {
    if (!navigator.geolocation) { toast('当前浏览器不支持定位'); return; }
    toast('正在定位…', 8000);
    navigator.geolocation.getCurrentPosition(function (pos) {
        var ll = [pos.coords.latitude, pos.coords.longitude];
        var b = map && map.options.maxBounds;
        if (b && !b.contains(ll)) {
            toast('定位成功，但你的位置在当前区域外，地图未移动');
            return;
        }
        map.setView(ll, Math.max(map.getZoom(), 16));
    }, function () {
        toast('无法获取定位，请检查浏览器权限');
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
}

/* ===== graph ===== */

function openGraph() {
    toggleSidebarIfOpen();
    document.getElementById('graphPanel').classList.add('show');
    renderGraph();
}

function closeGraph() {
    document.getElementById('graphPanel').classList.remove('show');
}

function renderGraph() {
    var body = document.getElementById('graphBody');
    var rootLabel = document.getElementById('graphRoot');
    if (!state.data.persons.length) {
        body.innerHTML = '<div class="graph-empty">还没有人物数据，先在地图上添加人物</div>';
        rootLabel.textContent = '';
        return;
    }
    var k = computeKinship();
    if (!k) {
        body.innerHTML = '<div class="graph-empty">请先标记「我」：编辑某人物 → 勾选「标记为“我”」</div>';
        rootLabel.textContent = '';
        return;
    }
    rootLabel.textContent = '我：' + personName(state.data.rootId);
    var layers = {};
    var unreach = [];
    state.data.persons.forEach(function (p) {
        var l = k.labels[p.id];
        if (l) { (layers[l.gen] = layers[l.gen] || []).push({ p: p, l: l }); }
        else { unreach.push(p); }
    });
    var gens = Object.keys(layers).map(Number).sort(function (a, b) { return a - b; });
    var COLW = 130, ROWH = 100, PAD = 50;
    var maxN = 1;
    gens.forEach(function (g) { maxN = Math.max(maxN, layers[g].length); });
    if (unreach.length) maxN = Math.max(maxN, unreach.length);
    var W = PAD * 2 + maxN * COLW;
    var H = PAD * 2 + (gens.length + (unreach.length ? 1 : 0)) * ROWH;
    var pos = {};
    gens.forEach(function (g, gi) {
        var arr = layers[g];
        var x0 = (W - arr.length * COLW) / 2 + COLW / 2;
        arr.forEach(function (item, i) {
            pos[item.p.id] = { x: x0 + i * COLW, y: PAD + gi * ROWH, label: item.l.label };
        });
    });
    if (unreach.length) {
        var x0u = (W - unreach.length * COLW) / 2 + COLW / 2;
        var yu = PAD + gens.length * ROWH;
        unreach.forEach(function (p, i) {
            pos[p.id] = { x: x0u + i * COLW, y: yu, label: p.titles[0] || '' };
        });
    }
    var edgesHtml = '';
    state.data.relations.forEach(function (r, ri) {
        var a = pos[r.from], b = pos[r.to];
        if (!a || !b) return;
        var dx = b.x - a.x, dy = b.y - a.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var ox = -dy / len * 12, oy = dx / len * 12;
        edgesHtml += '<line class="g-edge" data-ri="' + ri + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"></line>' +
            '<text class="g-edge-label" data-ri="' + ri + '" x="' + ((a.x + b.x) / 2 + ox) + '" y="' + ((a.y + b.y) / 2 + oy) + '" text-anchor="middle">' + esc(r.type) + '</text>';
    });
    var nodesHtml = '';
    state.data.persons.forEach(function (p) {
        var pt = pos[p.id];
        if (!pt) return;
        var isRoot = p.id === state.data.rootId;
        nodesHtml += '<g class="g-node' + (isRoot ? ' root' : '') + '" data-id="' + esc(p.id) + '" transform="translate(' + pt.x + ',' + pt.y + ')">' +
            '<circle r="18"></circle>' +
            '<text class="g-node-name" y="5">' + esc(p.name) + '</text>' +
            '<text class="g-node-title" y="34">' + esc(pt.label) + '</text>' +
            '</g>';
    });
    body.innerHTML = '<svg class="graph-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' + edgesHtml + nodesHtml + '</svg>';
    var svg = body.querySelector('svg');
    Array.prototype.forEach.call(svg.querySelectorAll('.g-node'), function (gEl) {
        var id = gEl.getAttribute('data-id');
        gEl.addEventListener('click', function () {
            closeGraph();
            jumpToPerson(id);
        });
        gEl.addEventListener('mouseenter', function () { highlightPath(id, k); });
        gEl.addEventListener('mouseleave', clearHighlight);
    });
}

function highlightPath(id, k) {
    clearHighlight();
    var ce = Kinship.computePathEdges(k, state.data.relations, id);
    if (!ce) return;
    ce.edges.forEach(function (ri) {
        Array.prototype.forEach.call(document.querySelectorAll('[data-ri="' + ri + '"]'), function (el) {
            el.classList.add('hl');
        });
    });
    Object.keys(ce.nodes).forEach(function (nid) {
        var el = document.querySelector('.g-node[data-id="' + nid + '"]');
        if (el) el.classList.add('hl');
    });
}

function clearHighlight() {
    Array.prototype.forEach.call(document.querySelectorAll('.hl'), function (el) {
        el.classList.remove('hl');
    });
}

/* ===== search ===== */

function onSearch(q) {
    q = (q || '').trim();
    var box = document.getElementById('searchResults');
    if (!q) {
        box.classList.remove('show');
        box.innerHTML = '';
        return;
    }
    var k = computeKinship();
    var results = [];
    state.data.persons.forEach(function (p) {
        var lab = k && k.labels[p.id] ? k.labels[p.id].label : '';
        var hit = p.name.indexOf(q) > -1 ||
            (lab && lab.indexOf(q) > -1) ||
            p.titles.some(function (t) { return t.indexOf(q) > -1; });
        if (hit) results.push({ p: p, lab: lab });
    });
    if (!results.length) {
        box.innerHTML = '<div class="search-empty">没有匹配「' + esc(q) + '」的人</div>';
        box.classList.add('show');
        return;
    }
    box.innerHTML = results.slice(0, 20).map(function (r) {
        var sub = r.lab || r.p.titles.join(' / ');
        return '<div class="search-item" onclick="jumpToPerson(\'' + esc(r.p.id) + '\')">' +
            '<span class="search-item-name">' + esc(r.p.name) + '</span>' +
            '<span class="search-item-title">' + esc(sub) + '</span></div>';
    }).join('');
    box.classList.add('show');
}

function hideSearch() {
    var box = document.getElementById('searchResults');
    box.classList.remove('show');
    box.innerHTML = '';
    document.getElementById('searchInput').value = '';
}

/* ===== boot ===== */

function boot() {
    migrateLegacy();
    renderStartup();
}

document.addEventListener('click', function (e) {
    var m = document.getElementById('contextMenu');
    if (m && m.classList.contains('show') && !m.contains(e.target)) hideContextMenu();
    var sb = document.querySelector('.search-bar');
    var sr = document.getElementById('searchResults');
    if (sr && sr.classList.contains('show') && !sb.contains(e.target) && !sr.contains(e.target)) hideSearch();
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        if (draw.active) cancelDraw();
        hideDialog();
    }
});

document.addEventListener('DOMContentLoaded', boot);
