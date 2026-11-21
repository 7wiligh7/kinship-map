var WS_LIST_KEY = 'kinmap_workspaces';
var LEGACY_KEY = 'kinmap_data';
var DEMO_FLAG = 'kinmap_demo_done';

var map = null;
var addMode = false;
var pendingLatLng = null;   // 待落地的坐标（地点用）
var pendingPlaceDraft = null; // "先划区域再放地点"时的待落地地点
var state = {
    workspace: null,
    data: null,
    isDemo: false,
    markers: {},
    markerLayer: null,
    regionLayer: null,
    selectedId: null,          // 选中的地点 id
    openPlaceId: null,         // 地点卡当前打开的地点 id（卡片上的动作只认它）
    selectedPersonId: null,    // 选中的地点下的人物 id（高亮用）
    editingId: null,           // 正在编辑的人物 id
    editingPlaceId: null,      // 正在编辑的地点 id
    // 首屏视野就位前不建瓦片层：否则会先按默认中心下一屏无用的瓦片
    tilesReady: false,
    // 搜索定位到当前区域外时临时解锁平移硬墙（回到区域内自动恢复）。
    // 状态变化统一走 setPreview：同步顶部"预览中"提示条。
    previewOutside: false
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

var dlgReturnFocus = null; // 打开对话框前的焦点元素，关闭时还给它们

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
    // 键盘可达：焦点移进对话框第一个按钮
    dlgReturnFocus = document.activeElement;
    var firstBtn = box.querySelector('button');
    if (firstBtn) setTimeout(function () { firstBtn.focus(); }, 0);
}

function hideDialog() {
    document.getElementById('dialog').classList.remove('show');
    if (dlgReturnFocus && dlgReturnFocus.focus) { try { dlgReturnFocus.focus(); } catch (e) {} }
    dlgReturnFocus = null;
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

// 多边形中心（顶点平均），用于在区域框里放名字标签
function polyCenter(poly) {
    var la = 0, ln = 0;
    poly.forEach(function (v) { la += v[0]; ln += v[1]; });
    return [la / poly.length, ln / poly.length];
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
    return { version: Places.SCHEMA_VERSION, regions: [], activeRegionId: null, places: [], persons: [], relations: [], rootId: null };
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
            return '<div class="ws-card" role="button" tabindex="0" data-act="enterWorkspace" data-id="' + esc(w.id) + '">' +
                '<span class="ws-card-emoji">' + esc(w.emoji || '🏡') + '</span>' +
                '<span class="ws-card-info"><div class="ws-card-name">' + esc(w.name) + '</div>' +
                '<div class="ws-card-meta">' + n + ' 人</div></span>' +
                '<button type="button" class="ws-card-del" title="删除档案" aria-label="删除档案 ' + esc(w.name) + '" data-act="deleteWorkspace" data-id="' + esc(w.id) + '">✕</button>' +
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
    geocode(q, showNewWsResults).then(function (list) {
        if (!list || !list.length) {
            box.innerHTML = '<div class="place-empty">没有找到「' + esc(q) + '」</div>';
            return;
        }
        showNewWsResults(list);
    }).catch(function () {
        box.innerHTML = '<div class="place-empty">联网搜不到（地名服务连不上）。<br>' +
            '可直接输入「纬度,经度」；或先创建档案，进地图后点选位置。</div>';
    });
}

function showNewWsResults(list) {
    state._newWsPlaces = list;
    document.getElementById('wsPlaceResults').innerHTML = list.map(function (r, i) {
        return '<div class="place-item" role="button" tabindex="0" data-act="pickNewWsPlace" data-i="' + i + '">' +
            (r.src ? '<span class="place-src">' + esc(r.src) + '</span>' : '') +
            '<span class="place-name">' + esc(r.name) + '</span>' +
            (r.address ? '<span class="place-addr">' + esc(r.address) + '</span>' : '') +
            '</div>';
    }).join('');
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
    document.getElementById('wsPlaceHint').textContent = '选好后进地图会定位到那里，不会自动建区';
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
    // 建档时选过居住地：只把地图定位过去，不自动建区（建区仍由用户框选/点选决定）
    if (pendingPlace && state.data && !state.data.regions.length) {
        // 延后一拍：等地图首次布局/尺寸就绪，避免被初始视野覆盖
        setTimeout(function () { focusWsPlace(pendingPlace); }, 60);
    }
}

// 新建档案后把地图移到"主要居住地"，仅定位、不建区域
function focusWsPlace(place) {
    if (!map || !place) return;
    var lat = Number(place.lat), lng = Number(place.lng);
    if (!isFinite(lat) || !isFinite(lng)) return;
    map.setView([lat, lng], 16, { animate: false });
    toast('已定位到「' + (place.name || '所选位置') + '」。要建区域：侧栏「＋ 地图上框选新区域」', 5000);
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

// 切换档案：把上一个档案的瞬时状态清干净，避免痕迹带进新档案
function resetWorkspaceUI() {
    // 区域外预览：跨档案不留状态（提示条一并隐藏）
    setPreview(false);
    // 人名搜索：输入框 + 下拉结果
    var box = document.getElementById('searchResults');
    if (box) { box.classList.remove('show'); box.innerHTML = ''; }
    var si = document.getElementById('searchInput');
    if (si) si.value = '';
    // 地名搜索：输入框 + 结果 + 结果缓存（否则点旧结果会飞到上一个档案的位置）
    var pi = document.getElementById('placeInput');
    if (pi) pi.value = '';
    var pr = document.getElementById('placeResults');
    if (pr) pr.innerHTML = '';
    state._placeResults = null;
    // 上一个档案的人物信息卡 / 选中态 / 关系表单
    closeInfoCard();
    hideRelForm();
    state.selectedId = null;
    state.editingId = null;
    hideContextMenu();
    // 上一个档案没走完的交互（添加人物、框选区域、待放置的人物草稿）
    addMode = false;
    pendingLatLng = null;
    if (draw.active) cleanupDraw();
}

function enterWorkspace(id) {
    var list = getWsList();
    var ws = list.filter(function (w) { return w.id === id; })[0];
    if (!ws) return;
    state.tilesReady = false; /* 等视野适配到当前区域后再建瓦片 */
    state.workspace = ws;
    state.isDemo = !!ws.demo;
    state.data = loadWs(id) || freshV3();
    // 打开档案：把手填称谓逐个拆成独立称谓条目（一次性，data.titlesSplit 标记）
    var splitN = Places.splitHandFilledTitles(state.data);
    if (splitN) saveData();
    resetWorkspaceUI();
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
    state.tilesReady = true;
    syncTileBounds(); /* 视野就位后再建瓦片层：首屏不浪费一屏瓦片 */
    if (splitN) toast('已把手填称谓拆成 ' + splitN + ' 个独立称谓条目（性别/年龄请在「编辑地点」补填）', 4500);
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

function normAge(v) {
    if (v === null || v === undefined || v === '' || v === true || v === false) return null;
    var n = typeof v === 'number' ? v : Number(String(v).trim());
    if (!isFinite(n) || n < 0 || n > 150) return null;
    return Math.floor(n);
}

function normalizeData(d) {
    // 人物/地点/关系交给 Places 模块（含旧格式迁移：人物自带坐标 → 同名地点 + 其下人物）
    d = Places.normalize(d);
    if (!d) return null;

    if (!Array.isArray(d.regions)) d.regions = [];
    d.regions = d.regions.filter(function (r) {
        return r && r.id && Array.isArray(r.polygon) && r.polygon.length >= 3;
    }).map(function (r) {
        return { id: String(r.id), name: typeof r.name === 'string' && r.name ? r.name : '未命名区域', polygon: r.polygon };
    });
    if (!d.regions.length && d.places.length && d.regionsCleared !== true) {
        // 旧格式（v1/v2 导入）没有区域字段，按地点位置补一个默认区域；
        // v3 里用户手动删光区域时会置 regionsCleared=true，这里不能再"长"回去。
        d.regions = [synthRegion(d.places)];
    }
    d.regionsCleared = d.regions.length === 0 && d.regionsCleared === true;
    var rids = {};
    d.regions.forEach(function (r) { rids[r.id] = true; });
    var fallbackRid = d.activeRegionId && rids[d.activeRegionId] ? d.activeRegionId : (d.regions[0] ? d.regions[0].id : null);
    d.places.forEach(function (pl) {
        if (!pl.regionId || !rids[pl.regionId]) pl.regionId = fallbackRid;
    });
    d.activeRegionId = fallbackRid;
    return d;
}

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
            // 这里只存「附加项」，真正的瓦片尺寸/层级在 buildTiles() 时按当前缩放决定
            opts: { minZoom: CONFIG.MIN_ZOOM, zIndex: 0 }
        });
    }
    state.tileDefs.push({
        url: CONFIG.TILE.NETWORK,
        opts: { attribution: CONFIG.TILE.ATTRIBUTION }
    });
    // 瓦片层不在这里创建：等 enterWorkspace() 把视野适配到当前区域后再建，
    // 否则会先按 CONFIG.CENTER 下一屏无用的瓦片，随后又被丢弃。
    state._tileKey = null;
    state.markerLayer = L.layerGroup().addTo(map);
    state.regionLayer = L.layerGroup().addTo(map);
    map.on('click', function (e) {
        if (draw.active) { addVertex(e.latlng); return; }
        if (!addMode) return;
        addMode = false;
        syncTileBounds(); /* 放置完成：恢复瓦片范围 + 平移硬墙 */
        openPlaceModal(null, e.latlng); /* 标注主体是地点：先填地点名，再往里加人物 */
    });
    map.on('dblclick', function () {
        if (draw.active) finishRegion();
    });
    // 缩放/平移停下后，空闲预取下一级瓦片
    map.on('zoomend', function () {
        if (!state.tilesReady) return;
        schedulePrefetch();
    });
    map.on('moveend', function () {
        schedulePrefetch();
        // 定位过程中会先触发 stop() 的 moveend（此时仍在旧位置），要忽略它；
        // 只有地图真正到达定位目标后的那次 moveend 才继续往下判断
        if (state._locating) {
            var t = state._locateTarget;
            var c = map.getCenter();
            var atTarget = !!(t && Math.abs(c.lat - t.lat) < 1e-6 && Math.abs(c.lng - t.lng) < 1e-6);
            if (!atTarget) return;
            state._locating = false;
            state._locateTarget = null;
        }
        // 搜索定位到区域外后，一旦把地图拖回区域范围，就恢复平移硬墙与缩放下限
        if (state.previewOutside) {
            var rb = regionBounds();
            if (rb && rb.contains(map.getCenter())) {
                setPreview(false);
                syncMapPan();
            }
        }
    });
    map.on('contextmenu', function (e) {
        if (draw.active || !addMode) return;
        addMode = false;
        syncTileBounds(); /* 放置完成：恢复瓦片范围 + 平移硬墙 */
        openPlaceModal(null, e.latlng); /* 右键同左键：增加/编辑称谓统一进「编辑地点」 */
    });
    function onViewportChange() {
        if (!map) return;
        map.invalidateSize();
        syncMapPan(); // 视口尺寸变了，缩放下限要重算
        if (document.getElementById('graphPanel') && document.getElementById('graphPanel').classList.contains('show')) {
            renderGraph(); // 屏幕宽度变了，一行能放几人重算
        }
    }
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange); // 手机转屏
}

/* ===== tile bounds: 瓦片与平移范围锚定当前区域 ===== */

// 区域多边形按比例外扩（四周各外扩 EXPAND_RATIO，总显示范围 ≈ 区域×1.5）。
// 边界不随当前缩放比例尺变化：框定后只能操作此范围内的地图，到达边界后停止。
// 超小区域（跨度 < 1km）再按固定 MARGIN_KM 公里外扩，避免边界过小无法拖动。
function padRegionPolygon(poly) {
    var b = L.latLngBounds(poly);
    var c = b.getCenter();
    var ratio = CONFIG.VIEW.EXPAND_RATIO != null ? CONFIG.VIEW.EXPAND_RATIO : 0.25;
    var minSpanLat = (CONFIG.VIEW.MARGIN_KM != null ? CONFIG.VIEW.MARGIN_KM : 1) / 110.574;
    var minSpanLng = minSpanLat / Math.max(1e-6, Math.cos(c.lat * Math.PI / 180));
    var spanLat = b.getNorth() - b.getSouth();
    var spanLng = b.getEast() - b.getWest();
    if (spanLat < minSpanLat && spanLng < minSpanLng) {
        var km = CONFIG.VIEW.MARGIN_KM != null ? CONFIG.VIEW.MARGIN_KM : 1;
        var mLat = km / 110.574;
        var mLng = km / (111.32 * Math.cos(c.lat * Math.PI / 180));
        return L.latLngBounds(
            [b.getSouth() - mLat, b.getWest() - mLng],
            [b.getNorth() + mLat, b.getEast() + mLng]
        );
    }
    return b.pad(ratio);
}

// 当前区域的外扩边界：区域多边形按比例外扩（总视野 ≈ 区域×1.5）。
// 用于：默认视野 / 缩放下限 / 平移硬墙 / 瓦片范围。
// 无区域 / 绘制模式 / 放置模式时 regionBounds() 返回 null，平移与缩放均解锁。
function regionBounds() {
    if (!state.data || draw.active || addMode) return null;
    var r = activeRegion();
    if (!r || !r.polygon || r.polygon.length < 3) return null;
    return padRegionPolygon(r.polygon);
}

// 瓦片加载边界：默认不限制（跟随视口，缩小时不会留白）。
// 仅当开启 TILE_LIMIT_TO_REGION 时按区域范围加载（边界即 areaBounds，不再额外放大）。
function regionTileBounds() {
    if (!CONFIG.TILE_LIMIT_TO_REGION) return null;
    var b = regionBounds();
    return b ? b : null;
}

// 平移硬边界 + 缩放下限：与区域边界同一来源（区域外扩）。
// 无区域 / 绘制模式 / 放置模式时都解锁。
// 区域外预览状态：统一入口。previewOutside 置位的同时同步顶部提示条，
// 让"现在看得比硬墙远"这个状态在界面上可见、可一键退出。
function setPreview(on) {
    state.previewOutside = on;
    updatePreviewChip();
}

function updatePreviewChip() {
    var chip = document.getElementById('previewChip');
    if (!chip) return;
    if (state.previewOutside) {
        var r = activeRegion();
        chip.textContent = '正在预览当前区域外 · 点击返回「' + (r ? r.name : '区域') + '」';
        chip.hidden = false;
    } else {
        chip.hidden = true;
    }
}

// 提示条点击：从区域外预览一键回到当前区域视野（区域+10km）
function backToRegion() {
    var r = activeRegion();
    if (r) fitRegion(r);
}

// 视口两轴都不超过给定边界所需的最低缩放级（再缩小就会看到边界外）。
// 与 fitRegion 的 zFor 同一套墨卡托局部近似，保持口径一致。
function capZoomFor(b) {
    var c = b.getCenter();
    var size = map.getSize();
    var kmW = (b.getEast() - b.getWest()) * 111.32 * Math.cos(c.lat * Math.PI / 180);
    var kmH = (b.getNorth() - b.getSouth()) * 110.574;
    function zFor(px, km) {
        var mpp = km * 1000 / Math.max(1, px);
        return Math.log(156543.03392 * Math.cos(c.lat * Math.PI / 180) / mpp) / Math.LN2;
    }
    return Math.max(zFor(size.x, kmW), zFor(size.y, kmH));
}

// 平移硬边界 + 缩放下限：与区域边界同一来源（区域按比例外扩后的边界，总视野 ≈ 区域×1.5）。
// 无区域 / 绘制模式 / 放置模式时都解锁。
// 边界 = 区域外扩后的范围，不再额外放大，保证“不论比例尺，框定后只能操作 1.5 倍区域”：
//   - 平移到边界处停止（maxBoundsViscosity: 1.0，硬墙）
//   - 缩到最小级时视野恰好 = 外扩边界，再缩小就会超出边界，因此被锁在该级
function syncMapPan() {
    if (!map) return;
    var b = regionBounds();
    if (b && !state.previewOutside) {
        var panB = b; // b 已是外扩边界，直接作为平移硬墙
        map.setMaxBounds(panB);
        // 缩放下限 = 两轴视野都不超过外扩范围的那一级（与 fitRegion 同一套口径），
        // 再缩小就会看到区域外，因此 minZoom 被锁在此级以上。
        // 退化多边形（跨度为 0）会让计算返回异常值，这里兜底保护，
        // 否则 minZoom 可能被设成 maxZoom，缩放被锁死。
        var zMin = capZoomFor(b);
        if (isFinite(zMin)) map.setMinZoom(Math.max(CONFIG.MIN_ZOOM, Math.min(zMin, CONFIG.MAX_ZOOM)));
        if (!panB.contains(map.getCenter())) {
            // 切到新区域时旧视野可能在新边界外：把中心拉回边界内
            map.panInsideBounds(panB, { animate: false });
        }
    } else {
        map.setMaxBounds(null); // 空边界 = 解除限制
        map.setMinZoom(CONFIG.MIN_ZOOM);
    }
}

/* ===== tile loading: 选项 / 本地缓存 / 图层 ===== */

// 瓦片层选项（网络层与本地层共用，单个图层可再覆盖）
// 统一使用 256px 原生瓦片：所有缩放级别都是同一套影像，不会出现"换级换图"。
function tileOpts(extra) {
    var o = {
        maxZoom: CONFIG.MAX_ZOOM,
        // 超过该级就放大低一级的瓦片，不再向服务器要图
        maxNativeZoom: CONFIG.TILE.MAX_NATIVE_ZOOM || CONFIG.MAX_ZOOM,
        // 视口外多留几圈瓦片：拖动时更少空白
        keepBuffer: CONFIG.TILE.KEEP_BUFFER != null ? CONFIG.TILE.KEEP_BUFFER : 2,
        // 停下后再请求，拖拽途中不狂发请求
        updateWhenIdle: CONFIG.TILE.UPDATE_WHEN_IDLE !== false,
        // 失败时用 1×1 透明图占位，避免破图标
        errorTileUrl: CONFIG.TILE.ERROR_TILE,
        // Esri 没有 @2x 瓦片，开启只会拿 404
        detectRetina: false,
        tileSize: 256
    };
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
}

// 瓦片落盘缓存已拆到 tilecache.js（var TileCache，在本文件之前加载）。


// 带缓存的瓦片层：先查 IndexedDB，未命中再 fetch 网络并回写。
// 同一区域第二次打开、反复拖动都不再走网络；断网也能显示看过的范围。
var CachedTileLayer = L.TileLayer.extend({
    createTile: function (coords, done) {
        var tile = document.createElement('img');
        var self = this;
        var url = this.getTileUrl(coords);
        var settled = false;

        function finish() {
            if (settled) return;
            settled = true;
            done(null, tile);
        }

        function showBlob(blob) {
            var objUrl = URL.createObjectURL(blob);
            tile.onload = function () {
                URL.revokeObjectURL(objUrl);
                finish();
            };
            tile.onerror = function () {
                URL.revokeObjectURL(objUrl);
                directImg(); /* 缓存图解码失败，退回直连 */
            };
            tile.src = objUrl;
        }

        // 兜底：直接用 <img> 加载（不受 CORS 限制，file:// 打开也能用）。
        // 缓存不可用、fetch 被拦、blob 解码失败时都走这里。
        function directImg() {
            tile.onload = function () { finish(); };
            tile.onerror = function () {
                if (self.options.errorTileUrl) tile.src = self.options.errorTileUrl;
                finish();
            };
            tile.src = url;
        }

        function fromNetwork() {
            fetch(url, { mode: 'cors', credentials: 'omit' })
                .then(function (res) {
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    return res.blob();
                })
                .then(function (blob) {
                    TileCache.put(url, blob);
                    showBlob(blob);
                })
                .catch(directImg);
        }

        tile.alt = '';
        tile.setAttribute('role', 'presentation');
        if (!TileCache.available) {
            fromNetwork();
            return tile;
        }
        TileCache.get(url).then(function (rec) {
            if (rec && rec.blob) showBlob(rec.blob);
            else fromNetwork();
        });
        return tile;
    }
});

function buildTiles() {
    if (!map || !state.tileDefs) return;
    var b = regionTileBounds();
    state.tileDefs.forEach(function (d) {
        var old = d.layer;
        var opts = tileOpts(d.opts);
        if (b) opts.bounds = b;
        var layer = new CachedTileLayer(d.url, opts);
        d.layer = layer;
        layer.addTo(map);
        // 平滑换层：新层先叠上去，等它出图后再移除旧层，避免缩放/切区时白屏
        if (old) {
            var dropped = false;
            var drop = function () {
                if (dropped) return;
                dropped = true;
                map.removeLayer(old);
            };
            layer.once('load', drop);
            layer.once('tileload', function () { setTimeout(drop, 600); });
            setTimeout(drop, 3000); /* 兜底：网络再慢也不能一直挂着 */
        }
    });
}

/* ===== 区域离线包：把当前区域的瓦片一次性下到本地 ===== */

function tileRangeForBounds(bounds, z) {
    var nw = map.project(bounds.getNorthWest(), z);
    var se = map.project(bounds.getSouthEast(), z);
    var max = Math.pow(2, z) - 1;
    var x0 = Math.max(0, Math.floor(nw.x / 256));
    var x1 = Math.min(max, Math.floor(se.x / 256));
    var y0 = Math.max(0, Math.floor(nw.y / 256));
    var y1 = Math.min(max, Math.floor(se.y / 256));
    return {
        x0: x0, x1: x1, y0: y0, y1: y1,
        count: Math.max(0, x1 - x0 + 1) * Math.max(0, y1 - y0 + 1)
    };
}

function offlineBaseBounds() {
    var r = activeRegion();
    if (!r || !r.polygon || r.polygon.length < 3) return null;
    return padRegionPolygon(r.polygon);
}

// 估算：从当前最小缩放级开始逐级累加，超过预算就停
function offlinePlan() {
    var b = offlineBaseBounds();
    if (!b || !map) return null;
    var cfg = CONFIG.TILE.OFFLINE || {};
    var budget = cfg.MAX_TILES || 2500;
    var z0 = Math.max(0, Math.floor(map.getMinZoom()));
    var z1 = CONFIG.MAX_ZOOM;
    var levels = [], total = 0;
    for (var z = z0; z <= z1; z++) {
        var t = tileRangeForBounds(b, z);
        if (!t.count) continue;
        if (total + t.count > budget && levels.length) break;
        levels.push({ z: z, count: t.count });
        total += t.count;
    }
    if (!levels.length) return null;
    return {
        levels: levels,
        total: total,
        firstZ: levels[0].z,
        lastZ: levels[levels.length - 1].z,
        mb: total * (cfg.AVG_TILE_KB || 12) / 1024
    };
}

function offlineRegionDialog() {
    if (!state.data) return;
    var plan = offlinePlan();
    if (!plan) { toast('先划定一个区域，再缓存离线图'); return; }
    var r = activeRegion();
    showDialog({
        title: '缓存本区离线图',
        body: '<div class="dialog-note">区域：<b>' + esc(r.name) + '</b><br>' +
            '范围：' + plan.firstZ + ' ~ ' + plan.lastZ + ' 级，共 <b>' + plan.total + '</b> 片，约 <b>' + plan.mb.toFixed(1) + ' MB</b><br>' +
            (plan.lastZ < CONFIG.MAX_ZOOM
                ? '更高层级（' + (plan.lastZ + 1) + ' ~ ' + CONFIG.MAX_ZOOM + '）仍会联网加载。<br>'
                : '整区在你的缩放范围内都能离线看。<br>') +
            '下载后进入这个区域 0 次网络请求，断网也能用。</div>',
        buttons: [
            { label: '取消' },
            { label: '开始下载', cls: 'primary', onClick: function () { downloadOfflinePlan(plan); } }
        ]
    });
}

function cancelOffline() {
    state._offlineCancel = true;
    hideDialog();
    toast('已停止，已下载的部分仍然可用');
}

function downloadOfflinePlan(plan) {
    var d = state.tileDefs && state.tileDefs[state.tileDefs.length - 1];
    var b = offlineBaseBounds();
    if (!d || !d.url || !b) return;
    var cfg = CONFIG.TILE.OFFLINE || {};
    var conc = Math.max(1, cfg.CONCURRENCY || 4);

    var urls = [];
    plan.levels.forEach(function (lv) {
        var t = tileRangeForBounds(b, lv.z);
        for (var x = t.x0; x <= t.x1; x++) {
            for (var y = t.y0; y <= t.y1; y++) urls.push(tileUrlFor(d.url, lv.z, x, y));
        }
    });
    if (!urls.length) { toast('这个区域没有可缓存的瓦片'); return; }

    showDialog({
        title: '正在缓存离线图',
        body: '<div class="offline-prog" id="offlineProg">准备中…</div>' +
            '<div class="offline-bar"><i id="offlineBar"></i></div>' +
            '<div class="dialog-note" style="margin-top:8px">可以关掉这个窗口去别处，下载会继续。</div>',
        buttons: [{ label: '停止', onClick: cancelOffline }]
    });

    var total = urls.length, done = 0, failed = 0, bytes = 0, i = 0, finished = false;
    state._offlineCancel = false;

    function render() {
        var prog = document.getElementById('offlineProg');
        var bar = document.getElementById('offlineBar');
        if (prog) {
            prog.textContent = '已下载 ' + done + ' / ' + total +
                '（约 ' + (bytes / 1048576).toFixed(1) + ' MB）' +
                (failed ? '　失败 ' + failed : '');
        }
        if (bar) bar.style.width = Math.round(done / total * 100) + '%';
    }
    render();

    function finish() {
        if (finished) return;
        finished = true;
        if (state._offlineCancel) return; /* 取消时已经提示过 */
        hideDialog();
        var ok = done - failed;
        toast('离线图已缓存：' + ok + ' 片，约 ' + (bytes / 1048576).toFixed(1) + ' MB' +
            (failed ? '（' + failed + ' 片失败，可再点一次补齐）' : ''), 5000);
    }

    function next() {
        if (finished || state._offlineCancel) return;
        if (i >= urls.length) return; /* 全部发出去了，等最后一个完成再收尾 */
        var url = urls[i++];

        function step() {
            done++;
            render();
            if (done >= total) finish();
            else next();
        }

        TileCache.get(url).then(function (rec) {
            if (rec && rec.blob) {
                bytes += rec.blob.size || 0;
                step();
                return;
            }
            var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
            fetch(url, { mode: 'cors', credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
                .then(function (res) { return res.ok ? res.blob() : null; })
                .then(function (blob) {
                    if (blob) { TileCache.put(url, blob); bytes += blob.size || 0; }
                    else failed++;
                })
                .catch(function () { failed++; })
                .then(function () {
                    if (timer) clearTimeout(timer);
                    step();
                });
        }).catch(function () {
            failed++;
            step();
        });
    }

    for (var k = 0; k < conc; k++) next();
}

/* ===== 区域离线包 end ===== */

/* 空闲预取：把"放大一级要用的大瓦片"提前下到本地缓存，下次缩放直接出图 */

var prefetchTimer = null;

function schedulePrefetch() {
    if (CONFIG.TILE.PREFETCH === false) return;
    if (prefetchTimer) clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(prefetchNextLevel, 800);
}

function tileUrlFor(tpl, z, x, y) {
    return String(tpl).replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

function prefetchNextLevel() {
    if (!map || !state.tileDefs || !state.tileDefs.length) return;
    if (!TileCache.available) return;
    var d = state.tileDefs[state.tileDefs.length - 1];
    if (!d || !d.url) return;
    var nextZ = map.getZoom() + 1;
    if (nextZ > CONFIG.MAX_ZOOM) return;
    // 统一 256px 瓦片：下一级就是 nativeZ
    var nativeZ = nextZ;
    if (nativeZ < 0) return;
    var nw, se;
    try {
        var bounds = map.getBounds();
        nw = map.project(bounds.getNorthWest(), nativeZ);
        se = map.project(bounds.getSouthEast(), nativeZ);
    } catch (e) { return; }
    var max = Math.pow(2, nativeZ) - 1;
    var x0 = Math.max(0, Math.floor(nw.x / 256));
    var x1 = Math.min(max, Math.floor(se.x / 256));
    var y0 = Math.max(0, Math.floor(nw.y / 256));
    var y1 = Math.min(max, Math.floor(se.y / 256));
    var n = 0;
    for (var x = x0; x <= x1 && n < 24; x++) {
        for (var y = y0; y <= y1 && n < 24; y++) {
            TileCache.warm(tileUrlFor(d.url, nativeZ, x, y));
            n++;
        }
    }
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
    if (key !== state._tileKey && state.tilesReady !== false) {
        state._tileKey = key;
        buildTiles();
    }
    syncMapPan(); // 与瓦片重建解耦：平移/缩放限制每次都要按当前区域重算
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

// 把视野适配到某个区域：目标 = 区域四周各预留 VIEW.MARGIN_KM 公里。
// 两条硬约束：
//   1) 区域本身永远完整可见（缩放不得超过"区域恰好铺满视口"那一级）；
//   2) 任一轴的视野 ≤ 区域跨度 + 2×预留（宽屏下 fitBounds 会把另一轴溢出一倍，
//      一个 20km 区域会看到 60~80km 宽，一次拉几十上百张瓦片，加载慢——就是这里修的）。
// 两条冲突时（接近正方形的区域 + 宽屏）优先保证区域完整，此时允许小数缩放级，
// 把视野正好卡在 10km 预留上。
function fitRegion(r) {
    if (!map || !r || !r.polygon || r.polygon.length < 3) return;
    setPreview(false); /* 换了/新建了区域：恢复该区域的平移与缩放限制（总视野 ≈ 区域×1.5）*/
    var poly = L.latLngBounds(r.polygon);
    var c = poly.getCenter();
    var size = map.getSize();
    var ratio = CONFIG.VIEW.EXPAND_RATIO != null ? CONFIG.VIEW.EXPAND_RATIO : 0.25;
    // 让视口某一轴恰好显示 spanKm 公里所需的缩放级（墨卡托局部近似，1° 纬 ≈ 110.574km）
    function zFor(px, kmSpan) {
        var mpp = kmSpan * 1000 / Math.max(1, px);
        return Math.log(156543.03392 * Math.cos(c.lat * Math.PI / 180) / mpp) / Math.LN2;
    }
    var spanW = (poly.getEast() - poly.getWest()) * 111.32 * Math.cos(c.lat * Math.PI / 180);
    var spanH = (poly.getNorth() - poly.getSouth()) * 110.574;
    // 总显示跨度 = 区域跨度 × (1 + 2×ratio)（四周各外扩 ratio，总 ≈ 区域×1.5）
    var capW = spanW * (1 + 2 * ratio);
    var capH = spanH * (1 + 2 * ratio);
    // 两约束都取连续值，最后用小数缩放级落点：
    //   zoom ≤ 区域恰好铺满视口的那一级（约束1）
    //   zoom ≥ 预留边界不超 total 1.5× 的那一级（约束2）
    var zoom = Math.min(
        Math.min(zFor(size.x, spanW), zFor(size.y, spanH)),
        Math.max(zFor(size.x, capW), zFor(size.y, capH))
    );
    zoom = Math.max(zoom, CONFIG.MIN_ZOOM);
    zoom = Math.min(zoom, CONFIG.MAX_ZOOM);
    // 小数缩放：整数级会跳过"正好 1.5× 区域"的那一级。
    // 期间把 minZoom 暂时放开到全局下限：否则上一次 syncMapPan 留下的
    // 动态 minZoom（旧口径）会把这里的小数级顶回整数。
    var snap = map.options.zoomSnap;
    var oldMin = map.options.minZoom;
    map.options.zoomSnap = 0;
    map.options.minZoom = CONFIG.MIN_ZOOM;
    try { map.setView(poly.getCenter(), zoom, { animate: false }); }
    finally { map.options.zoomSnap = snap; map.options.minZoom = oldMin; }
    state._tileKey = null;
    syncTileBounds();
}

function fitData(force) {
    if (!map) return;
    var pts = [];
    // 视野按「地点」算：人物不再自带坐标
    (state.data.places || []).forEach(function (pl) {
        if (pl.lat != null && pl.lng != null) pts.push([pl.lat, pl.lng]);
    });
    if (pts.length) {
        // 不用动画：初始视野要立刻到位，否则后续 setView 会被动画回调覆盖
        map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: CONFIG.VIEW.MAX_ZOOM, animate: false });
    } else if (force) {
        map.setView(CONFIG.CENTER, CONFIG.VIEW.MAX_ZOOM, { animate: false });
    }
}

function renderAll(fit) {
    if (!state.markerLayer) return;
    state.markerLayer.clearLayers();
    state.markers = {};
    // 地图上标注的是「地点」：一个地点一个标记，名字是地点名，人数角标是地点下的人数
    var rootId = effectiveRootId();
    (state.data.places || []).forEach(function (pl) {
        if (pl.lat == null || pl.lng == null) return;
        var people = Places.peopleAt(state.data, pl.id);
        var isRoot = people.some(function (p) { return p.id === rootId; });
        var html = '<span class="bl-label' + (isRoot ? ' root' : '') + '">' + esc(pl.name) +
            (people.length ? '<i class="bl-count">' + people.length + '</i>' : '') + '</span>';
        var icon = L.divIcon({
            className: 'bl-anchor',
            html: html,
            iconSize: [0, 0],
            iconAnchor: [0, 0]
        });
        var m = L.marker([pl.lat, pl.lng], { icon: icon, keyboard: false }).addTo(state.markerLayer);
        m.on('click', function () {
            addMode = false;
            openPlaceCard(pl.id);
        });
        m.on('contextmenu', function (e) {
            addMode = false;
            showContextMenu(e.originalEvent, pl.id);
        });
        state.markers[pl.id] = m;
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
        return '<div class="region-item' + (r.id === state.data.activeRegionId ? ' active' : '') + '" role="button" tabindex="0" data-act="switchRegion" data-id="' + esc(r.id) + '">' +
            '<span class="region-item-name">' + esc(r.name) + '</span>' +
            '<button type="button" class="region-item-del" title="删除区域" aria-label="删除区域 ' + esc(r.name) + '" data-act="deleteRegion" data-id="' + esc(r.id) + '">✕</button>' +
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
            // 区域名标签：让人一眼看出这个红框是"已有区域"，不是搜索结果
            L.marker(polyCenter(r.polygon), {
                interactive: false,
                keyboard: false,
                icon: L.divIcon({
                    className: 'region-label-anchor',
                    html: '<span class="map-region-label' + (isActive ? ' active' : '') + '">' +
                        esc(r.name) + '</span>',
                    iconSize: [0, 0]
                })
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
    var r = state.data.regions.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    var isLast = state.data.regions.length === 1;
    if (!confirm(isLast
        ? '删除区域「' + r.name + '」？这是最后一个区域：删除后地图上不再显示区域框，人物仍保留在档案里，随时可以重新框选。'
        : '删除区域「' + r.name + '」？区域内的人物将归入其他区域。')) return;
    state.data.regions = state.data.regions.filter(function (x) { return x.id !== id; });
    var newActive = state.data.activeRegionId === id
        ? (state.data.regions[0] ? state.data.regions[0].id : null)
        : state.data.activeRegionId;
    state.data.persons.forEach(function (p) {
        if (p.regionId === id) p.regionId = newActive;
    });
    state.data.activeRegionId = newActive;
    // 最后一个区域删完要留痕：否则重开页面时 normalizeData 会按人物位置自动"长"回一个区域
    state.data.regionsCleared = state.data.regions.length === 0;
    saveData();
    renderRegions();
    renderAll(false);
    fitActiveRegion();
    toast(isLast ? '已删除区域（地图上已无区域框）' : '已删除区域');
}

function startDrawRegion() {
    if (!state.workspace) return;
    if (draw.active) return;
    toggleSidebarIfOpen();
    setPreview(false); /* 进入绘制：预览态结束（绘制模式本就无硬墙，提示条会误导） */
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
    if (pendingPlaceDraft) {
        // 「先划区域再放地点」被取消：把地点草稿拿回来继续填
        var pd = pendingPlaceDraft;
        pendingPlaceDraft = null;
        cleanupDraw();
        openPlaceModal(null, L.latLng(pd.lat, pd.lng));
        document.getElementById('inputPlaceName').value = pd.name;
        document.getElementById('inputPlaceNote').value = pd.note || '';
        // 回填待落地的称谓条目
        var rows0 = document.getElementById('placeTitleRows');
        if (rows0) {
            rows0.innerHTML = '';
            (pd.entries || []).forEach(function (e) {
                addPlaceTitleRow(e.name, e.gender, e.age, e.name === pd.rootName, null);
            });
        }
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
    state.data.regionsCleared = false; /* 重新框了区域，撤销"已删光区域"标记 */
    saveData();
    renderRegions();
    fitRegion(region);
    toast('已创建区域「' + name + '」');
    if (pendingPlaceDraft) {
        var pd = pendingPlaceDraft;
        pendingPlaceDraft = null;
        savePlaceDraft(pd, region.id);
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
    geocode(q, showPlaceResults).then(function (list) {
        if (!list || !list.length) {
            box.innerHTML = '<div class="place-empty">没有找到「' + esc(q) + '」<br>' +
                '可以写全一点（如「星子镇 连州」），或直接在地图上点选位置。</div>';
            return;
        }
        showPlaceResults(list);
    }).catch(function (e) {
        showPlaceError(e);
    });
}

// 搜索失败时给"能立刻用"的出口，而不是甩一堆超时信息给用户。
// 按失败原因分流：超时（源太慢）/ 连不上（被拦或没网）/ 缺 key / 无结果，各给各的建议。
function showPlaceError(e) {
    var msg = String((e && e.message) || '');
    var details = (e && e.details) || [];
    var kinds = details.map(function (d) { return d.kind; });
    var hasTimeout = kinds.indexOf('timeout') >= 0;
    var hasNetwork = kinds.indexOf('network') >= 0;
    var cancelled = !!(e && e.cancelled);
    var noSource = !!(e && e.noSource);
    var noResult = !details.length && /无结果/.test(msg);

    var title, detail, retryLabel = '重试';
    if (cancelled) {
        title = '已取消等待';
        detail = '免 key 的境外搜索源在境内要 30~60 秒才有响应。不想等的话：配置高德 key（秒回）、开代理，或直接手动定位。';
    } else if (noSource) {
        title = '搜索源暂时不可用';
        detail = '所有搜索源刚失败过（20 分钟内不再自动尝试）。点「重试」可立即再试；也可以先「检测搜索源」看看到底是哪些源不通。';
    } else if (hasTimeout && !hasNetwork) {
        title = '搜索源响应超时';
        detail = '免 key 的境外搜索源在境内很慢（实测 Photon 约 48 秒才返回），按 5 秒超时判定为失败。点「耐心重试」会用长超时等它；配置高德 key 则是 0.3 秒。';
        retryLabel = '耐心重试';
    } else if (hasNetwork) {
        title = '连不上搜索源';
        detail = '免 key 的地名服务在你这里 TCP 不通（通常需要代理）。可开启代理，或配置高德/天地图 key（国内直连）。';
    } else if (noResult) {
        title = '没有找到这个地名';
        detail = '换个写法试试（如「星子镇 连州」），或直接用下面的方式定位：';
    } else {
        title = '搜索没有成功';
        detail = esc(msg);
    }

    var box = document.getElementById('placeResults');
    box.innerHTML =
        '<div class="place-error">' +
        '<div class="place-error-title">' + title +
        '</div>' +
        '<div class="place-error-detail">' + detail +
        '</div>' +
        '<div class="place-error-actions">' +
        '<button type="button" class="place-act primary" data-act="startDrawRegion">在地图上框选区域</button>' +
        '<button type="button" class="place-act" data-act="hintCoords">粘贴坐标</button>' +
        '<button type="button" class="place-act" data-act="openKeySettings">填 key</button>' +
        '<button type="button" class="place-act" data-act="checkSources">检测搜索源</button>' +
        '<button type="button" class="place-act" data-act="retryPlaceSearch">' + retryLabel + '</button>' +
        '</div>' +
        '<div class="place-error-foot">也可以直接用「＋ 地图上框选新区域」手动划定。</div>' +
        '</div>';
}

function retryPlaceSearch() {
    reviveSources(); /* 清掉"这些源暂时不可用"的记忆，再试一次 */
    searchPlaces();
}

function hintCoords() {
    var input = document.getElementById('placeInput');
    input.focus();
    input.select();
    toast('输入「经度,纬度」如 112.56,24.99；高德拾取器复制的加 g: 前缀会自动纠偏', 5000);
}

function showPlaceResults(list) {
    state._placeResults = list;
    document.getElementById('placeResults').innerHTML = list.map(function (r, i) {
        return '<div class="place-item" role="button" tabindex="0" data-act="flyToPlace" data-i="' + i + '" title="跳转到该位置并适配比例尺，不建区域">' +
            (r.src ? '<span class="place-src">' + esc(r.src) + '</span>' : '') +
            '<span class="place-name">' + esc(r.name) + '</span>' +
            (r.address ? '<span class="place-addr">' + esc(r.address) + '</span>' : '') +
            '</div>';
    }).join('') +
    '<div class="place-empty">点结果跳转并按结果范围适配缩放，不建区域；要建区域请用「地图上框选新区域」。</div>';
}

/* 地名搜索：
 * 1. 「纬度,经度」直输免网络；
 * 2. 其余并行请求 CONFIG.GEOCODE.PROVIDERS 里的所有已配置源（填了 key 才算配置），
 *    每个源出结果就合并渲染一次（快的源先显示），全部结束后 resolve 最终列表；
 * 3. 串行 failover 的问题在于：国内 Esri 搜村名常「搜得出但不准」，会把后面更准的源挡住，
 *    并行合并 + 相关度排序可以解决；总耗时约等于最慢的一个源。
 */
function geocode(q, onUpdate) {
    var pc = Geocode.parseCoords(q);
    if (pc) {
        var lat = pc.lat, lng = pc.lng, addr = '';
        if (pc.datum === 'gcj') {
            var w = Geocode.gcj02ToWgs84(lng, lat);
            lng = w[0]; lat = w[1];
            addr = '高德/腾讯拾取坐标（GCJ-02 已自动纠偏）';
        } else if (pc.datum === 'bd09') {
            var g = Geocode.bd09ToGcj02(lng, lat);
            var w2 = Geocode.gcj02ToWgs84(g[0], g[1]);
            lng = w2[0]; lat = w2[1];
            addr = '百度拾取坐标（BD-09 已自动纠偏）';
        } else {
            addr = pc.order === 'lnglat' ? '坐标（WGS-84，识别为「经度,纬度」顺序）' : '坐标点（免网络）';
        }
        return Promise.resolve([{
            name: lat.toFixed(5) + ', ' + lng.toFixed(5),
            address: addr,
            bbox: null,
            lat: lat,
            lng: lng,
            src: '坐标'
        }]);
    }
    var list = providerList();
    if (!list.length) {
        // 所有源都在「暂时连不上」名单里：立即失败，不再让用户等超时
        var e0 = new Error('地名服务暂时不可用（刚连不上，20 分钟内不再自动尝试）');
        e0.noSource = true;
        return Promise.reject(e0);
    }
    // 只剩免 key 的境外慢源：先问用户要不要等（否则就是干等 30~60 秒）
    var onlySlow = list.every(function (p) { return p.slow; });
    if (onlySlow && !state._slowOk) {
        return askSlowConsent(list).then(function (ok) {
            if (!ok) {
                var ec = new Error('已取消等待（免 key 源较慢）');
                ec.cancelled = true;
                throw ec;
            }
            state._slowOk = true; // 本次会话内不再重复询问
            return runGeoProviders(q, onUpdate, list);
        });
    }
    return runGeoProviders(q, onUpdate, list);
}

// 慢源征询：只剩免 key 的境外源时，它们在境内可能要几十秒才有结果。
// 先问用户要不要等，不愿意等就别干等（直接提示改用 key / 代理 / 手动定位）。
function askSlowConsent(list) {
    var names = list.map(function (p) { return p.src; }).join('、');
    return new Promise(function (resolve) {
        showDialog({
            title: '搜索源较慢',
            body:
                '<div class="dialog-note">当前只剩免 key 的境外源（' + esc(names) + '）。' +
                '它们在境内通常要 <b>30~60 秒</b> 才有响应（实测 Photon 约 48 秒）。<br><br>' +
                '更快的办法：<br>' +
                '· 在「搜索源设置」里配置 <b>高德 key</b>（免费，国内直连约 0.3 秒）<br>' +
                '· 或开启代理（Clash 等）走境外线路<br>' +
                '· 或直接用「粘贴坐标」手动定位</div>',
            buttons: [
                { label: '耐心等待', cls: 'primary', onClick: function () { resolve(true); } },
                { label: '不等待', onClick: function () { resolve(false); } }
            ]
        });
    });
}

// 并行请求所有搜索源并合并结果。
// 慢源用长超时（GEOCODE.TIMEOUT_SLOW），国内源用常规超时。
function runGeoProviders(q, onUpdate, list) {
    return new Promise(function (resolve, reject) {
        var pending = list.length;
        var groups = [];
        var errs = [];
        var details = []; // 结构化失败原因：{ src, kind: timeout/network/empty/http }
        function publish() {
            // 按配置顺序合并（而非完成顺序）：先返回的源不能霸占去重先手
            var ordered = groups.slice().sort(function (a, b) { return a.idx - b.idx; });
            var merged = Geocode.mergeGeoResults(q, ordered, (CONFIG.GEOCODE.LIMIT || 6) * 2);
            if (onUpdate && merged.length) onUpdate(merged);
            return merged;
        }
        list.forEach(function (p) {
            var tmo = p.slow ? (CONFIG.GEOCODE.TIMEOUT_SLOW || 60000) : (CONFIG.GEOCODE.TIMEOUT || 10000);
            p.fn(q, tmo).then(function (res) {
                clearSourceFails(p.src);
                if (res && res.length) groups.push({ src: p.src, list: res, idx: p.idx });
                else {
                    errs.push(p.src + '：无结果');
                    details.push({ src: p.src, kind: 'empty' });
                }
            }, function (e) {
                noteSourceFail(p.src, e);
                var msg = (e && e.message) ? e.message : '失败';
                errs.push(p.src + '：' + msg);
                var kind = 'other';
                if (e && e.timeout) kind = 'timeout';
                else if (e && e.network) kind = 'network';
                else if (/^HTTP 4/.test(msg)) kind = 'http';
                details.push({ src: p.src, kind: kind, msg: msg });
            }).then(function () {
                pending--;
                if (!pending) {
                    if (!groups.length) {
                        var err = new Error(errs.join('；') || '全部搜索源无结果');
                        err.details = details;
                        reject(err);
                    } else resolve(publish());
                } else if (groups.length) {
                    publish();
                }
            });
        });
    });
}

/* ===== 搜索源体检 =====
 * 实测每个搜索源的可达性与耗时，结果存 localStorage：
 *   - 排序：快的源先请求，结果先到先展示
 *   - 面板：⚙「检测搜索源」可手动触发，看到各源真实状态
 * 免 key 境外源在境内极慢（实测 Photon ≈48 秒），体检超时 15 秒即判「很慢」。*/
var GEO_PROBE_KEY = 'kinmap_geo_probe';
var GEO_PROBE_TTL = 24 * 60 * 60 * 1000; // 体检结果 24 小时内有效

function geoProbe() {
    try {
        var o = JSON.parse(localStorage.getItem(GEO_PROBE_KEY)) || null;
        if (!o || !o.ts || (Date.now() - o.ts) > GEO_PROBE_TTL) return {};
        return o.res || {};
    } catch (e) { return {}; }
}

function geoProbeSave(res) {
    try { localStorage.setItem(GEO_PROBE_KEY, JSON.stringify({ ts: Date.now(), res: res })); } catch (e) {}
}

// 实测各源：返回 [{ src, ok, ms, kind }]，kind: ok/empty/timeout/network/http/nokey/other
function probeSources() {
    var q = CONFIG.GEOCODE.PROBE_QUERY || '北京';
    var jobs = [];
    Object.keys(GEO_PROVIDERS).forEach(function (name) {
        var p = GEO_PROVIDERS[name];
        if (p.keyStore && !geoKey(p.keyStore)) {
            jobs.push(Promise.resolve({ src: p.src, ok: false, ms: 0, kind: 'nokey' }));
            return;
        }
        var tmo = p.slow ? 15000 : 6000; // 体检不想久等：慢源 15s、快源 6s
        var t0 = Date.now();
        jobs.push(p.fn(q, tmo).then(function (res) {
            var ok = !!(res && res.length);
            return { src: p.src, ok: ok, ms: Date.now() - t0, kind: ok ? 'ok' : 'empty' };
        }, function (e) {
            var kind = 'other';
            if (e && e.timeout) kind = 'timeout';
            else if (e && e.network) kind = 'network';
            else if (/^HTTP 4/.test(e && e.message ? e.message : '')) kind = 'http';
            return { src: p.src, ok: false, ms: Date.now() - t0, kind: kind, msg: (e && e.message) || '失败' };
        }));
    });
    return Promise.all(jobs);
}

function geoProbeHtml(res) {
    return res.map(function (r) {
        var s = esc(r.src);
        if (r.kind === 'nokey') return s + '：需配置 key（免费，见上方说明）';
        if (r.ok) return s + '：✓ 可用，约 ' + (r.ms / 1000).toFixed(1) + ' 秒';
        if (r.kind === 'timeout') return s + '：⏱ 很慢（15 秒内没返回；这类源在境内可能要 30~60 秒）';
        if (r.kind === 'network') return s + '：✗ 连不上（TCP 不通，通常需要代理）';
        if (r.kind === 'http') return s + '：✗ 接口报错（' + esc(r.msg || '') + '）';
        if (r.kind === 'empty') return s + '：能连上但没返回结果';
        return s + '：✗ ' + esc(r.msg || '失败');
    }).join('<br>');
}

function runSourceCheck() {
    openKeySettings('正在检测各搜索源…（慢源最多等 15 秒）');
    probeSources().then(function (res) {
        var map = {};
        res.forEach(function (r) { map[r.src] = r; });
        geoProbeSave(map);
        var fast = res.filter(function (r) { return r.ok && r.ms < 3000; }).map(function (r) { return r.src; });
        var tip = fast.length
            ? '3 秒内可用的源：' + esc(fast.join('、')) + '（搜索会优先用它们）'
            : '没有 3 秒内可用的源 —— 建议配置高德 key（国内直连约 0.3 秒）或开启代理';
        openKeySettings('检测结果：<br>' + geoProbeHtml(res) + '<br><br>' + tip);
    });
}

// 搜索源定义。slow = 境外免 key 源：境内访问很慢（实测 Photon 首字节约 48 秒），
// 这类源走单独的长超时（GEOCODE.TIMEOUT_SLOW），且当只剩这类源时会先问用户要不要等。
var GEO_PROVIDERS = {
    esri:      { src: 'Esri',  fn: geocodeEsri, slow: true },
    nominatim: { src: 'OSM',   fn: geocodeNominatim, slow: true },
    photon:    { src: 'Photon', fn: geocodePhoton, slow: true },
    amap:      { src: '高德',   fn: geocodeAmap, keyStore: 'amap' },
    tianditu:  { src: '天地图', fn: geocodeTianditu, keyStore: 'tianditu' }
};

function providerList() {
    var names = (CONFIG.GEOCODE.PROVIDERS || ['esri']).slice();
    // 填了 key（本机设置或 config.js）但没写进 PROVIDERS 的自动补到最前（兼容旧配置）
    if (geoKey('amap') && names.indexOf('amap') < 0) names.unshift('amap');
    if (geoKey('tianditu') && names.indexOf('tianditu') < 0) names.unshift('tianditu');
    var list = names.map(function (n, i) {
        var p = GEO_PROVIDERS[n];
        if (!p) return null;
        // idx = 配置顺序，合并去重时按它定优先级（完成顺序不可靠：慢的源未必准）
        return { src: p.src, fn: p.fn, keyStore: p.keyStore, slow: !!p.slow, idx: i };
    }).filter(Boolean).filter(function (p) {
        if (p.keyStore && !geoKey(p.keyStore)) return false; // 没填 key 的源不参与
        if (sourceUnreachable(p.src)) return false;          // 本会话连续失败被跳过的源不参与
        return true;
    });
    // 请求顺序按体检结果排：快的源先请求，结果先到先展示。
    // 注意 idx（合并优先级）不跟着变，仍是"高德/天地图的标准名优先"。
    var probe = geoProbe();
    list.sort(function (a, b) {
        var pa = probe[a.src], pb = probe[b.src];
        var sa = pa ? (pa.ok ? pa.ms : 999999) : 60000; // 没体检过的按中等对待
        var sb = pb ? (pb.ok ? pb.ms : 999999) : 60000;
        return sa - sb;
    });
    return list;
}

/* 国内网络下 nominatim 等源不可达，每次搜索都会白等一个超时。
 * 同一源连续 2 次「超时/断网」类失败后，本会话内跳过该源；成功一次即恢复。刷新页面重置。 */
function noteSourceFail(src, e) {
    if (!e || (!e.timeout && !e.network)) return;
    var m = state._geoFails || (state._geoFails = {});
    m[src] = (m[src] || 0) + 1;
    markSourceDead(src); /* 记到磁盘：刷新页面后也不用再白等超时 */
}

function clearSourceFails(src) {
    if (state._geoFails) delete state._geoFails[src];
    var m = geoDeadMap();
    if (m[src]) {
        delete m[src];
        try { localStorage.setItem(GEO_DEAD_KEY, JSON.stringify(m)); } catch (e) {}
    }
}

// 源连不上时记一笔（20 分钟内不再尝试），避免每次搜索都干等 5 秒
var GEO_DEAD_KEY = 'kinmap_geo_dead';
var GEO_DEAD_TTL = 20 * 60 * 1000;

function geoDeadMap() {
    try { return JSON.parse(localStorage.getItem(GEO_DEAD_KEY)) || {}; } catch (e) { return {}; }
}

function markSourceDead(src) {
    var m = geoDeadMap();
    m[src] = Date.now() + GEO_DEAD_TTL;
    try { localStorage.setItem(GEO_DEAD_KEY, JSON.stringify(m)); } catch (e) {}
}

// 「重试」按钮：清掉失败记忆，让所有源重新参与
function reviveSources() {
    try { localStorage.removeItem(GEO_DEAD_KEY); } catch (e) {}
    state._geoFails = {};
}

function sourceUnreachable(src) {
    var m = state._geoFails || {};
    if ((m[src] || 0) >= 2) return true;
    var d = geoDeadMap();
    return !!(d[src] && d[src] > Date.now());
}

/* ===== 搜索源 key：应用内设置（存本机 localStorage，优先于 config.js） ===== */

var GEO_KEY_LS = { amap: 'kinmap_amap_key', tianditu: 'kinmap_tdt_key' };

function geoKey(which) {
    var v = '';
    try { v = localStorage.getItem(GEO_KEY_LS[which]) || ''; } catch (e) {}
    if (!v) v = which === 'amap' ? CONFIG.GEOCODE.AMAP_KEY : CONFIG.GEOCODE.TIANDITU_KEY;
    return String(v || '').trim();
}

function saveGeoKeys() {
    var a = document.getElementById('setAmapKey');
    var t = document.getElementById('setTdtKey');
    if (!a || !t) return;
    try {
        var av = a.value.trim(), tv = t.value.trim();
        if (av) localStorage.setItem(GEO_KEY_LS.amap, av); else localStorage.removeItem(GEO_KEY_LS.amap);
        if (tv) localStorage.setItem(GEO_KEY_LS.tianditu, tv); else localStorage.removeItem(GEO_KEY_LS.tianditu);
    } catch (e) {}
    state._geoFails = {}; // key 变了，旧失败计数作废
    toast('已保存（只存本浏览器）');
}

function clearGeoKeys() {
    try {
        localStorage.removeItem(GEO_KEY_LS.amap);
        localStorage.removeItem(GEO_KEY_LS.tianditu);
    } catch (e) {}
    state._geoFails = {};
    toast('已清除本机 key（config.js 里填的仍生效）');
}

function openKeySettings(msgHtml) {
    showDialog({
        title: '地名搜索源设置',
        body:
            '<div class="dialog-note">国内搜村/镇名，填一个 key 即可（个人免费）。<br>' +
            '<b>高德</b>（推荐，村镇 POI 覆盖最好）：console.amap.com → 创建应用 → 添加 Key → 服务平台选「Web服务」<br>' +
            '<b>天地图</b>（官方）：console.tianditu.gov.cn → 创建应用 → 类型选「浏览器端」<br>' +
            'key 只存本浏览器 localStorage，不上传。</div>' +
            '<div class="form-group"><label class="label">高德 key（Web服务类型）</label>' +
            '<input class="input" id="setAmapKey" maxlength="64" autocomplete="off" placeholder="留空 = 只用免 key 源（Photon / Esri）" value="' + esc(geoKey('amap')) + '" /></div>' +
            '<div class="form-group"><label class="label">天地图 tk（浏览器端类型）</label>' +
            '<input class="input" id="setTdtKey" maxlength="64" autocomplete="off" placeholder="留空 = 只用免 key 源（Photon / Esri）" value="' + esc(geoKey('tianditu')) + '" /></div>' +
            (msgHtml ? '<div class="key-test-msg">' + msgHtml + '</div>' : ''),
        buttons: [
            { label: '检测搜索源', onClick: runSourceCheck },
            { label: '清除本机保存', onClick: clearGeoKeys },
            { label: '保存', cls: 'primary', onClick: saveGeoKeys },
            { label: '保存并测试', onClick: saveAndTestKeys }
        ]
    });
}

function saveAndTestKeys() {
    saveGeoKeys();
    var amapKey = geoKey('amap'), tdtKey = geoKey('tianditu');
    if (!amapKey && !tdtKey) { openKeySettings('请先至少填一个 key'); return; }
    openKeySettings('测试中…');
    var jobs = [];
    if (amapKey) {
        jobs.push(geocodeAmap('北京市').then(
            function (l) { return '高德：✓ 可用（「北京市」返回 ' + l.length + ' 条）'; },
            function (e) { return '高德：✗ ' + (e && e.message ? e.message : '失败'); }));
    }
    if (tdtKey) {
        jobs.push(geocodeTianditu('北京市').then(
            function (l) { return '天地图：✓ 可用（返回 ' + l.length + ' 条）'; },
            function (e) { return '天地图：✗ ' + (e && e.message ? e.message : '失败'); }));
    }
    Promise.all(jobs).then(function (lines) {
        openKeySettings('测试结果：<br>' + lines.map(esc).join('<br>'));
    });
}

// 取 JSON。ms 可指定本次超时（慢源用长超时，见 GEOCODE.TIMEOUT_SLOW）。
function fetchJson(url, ms) {
    ms = ms || CONFIG.GEOCODE.TIMEOUT || 10000;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    var done = function () { if (timer) clearTimeout(timer); };
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined).then(function (res) {
        done();
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    }, function (e) {
        done();
        throw markFetchError(e);
    });
}

// 标记「不可达」类错误（超时 / 断网）：这类错误会计入跳过统计（见 noteSourceFail）。
// 注意不能改写 DOMException 的 message（只读），要换成新 Error。
function markFetchError(e) {
    if (e && e.name === 'AbortError') {
        var t = new Error('请求超时');
        t.timeout = true;
        return t;
    }
    if (e instanceof TypeError) {
        var n = new Error('网络不可达');
        n.network = true;
        return n;
    }
    return e;
}

function geocodeEsri(q, tmo) {
    var c = map ? map.getCenter() : L.latLng(CONFIG.CENTER[0], CONFIG.CENTER[1]);
    var url = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates' +
        '?f=json&singleLine=' + encodeURIComponent(q) +
        '&maxLocations=' + (CONFIG.GEOCODE.LIMIT || 6) +
        '&outFields=LongLabel,Match_addr&outSR=4326' +
        '&langCode=' + encodeURIComponent(CONFIG.GEOCODE.LANGUAGE || 'zh-CN') +
        '&location=' + c.lng.toFixed(5) + ',' + c.lat.toFixed(5);
    return fetchJson(url, tmo).then(function (j) {
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

function geocodeNominatim(q, tmo) {
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2' +
        '&limit=' + (CONFIG.GEOCODE.LIMIT || 6) +
        '&accept-language=' + encodeURIComponent(CONFIG.GEOCODE.LANGUAGE || 'zh-CN') +
        (CONFIG.GEOCODE.EMAIL ? '&email=' + encodeURIComponent(CONFIG.GEOCODE.EMAIL) : '') +
        '&q=' + encodeURIComponent(q);
    return fetchJson(url, tmo).then(function (arr) {
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

var AMAP_ERR_TEXT = {
    INVALID_USER_KEY: 'key 无效（REST 接口需「Web服务」类型 key）',
    USERKEY_PLAT_NOMATCH: 'key 服务类型不对（需「Web服务」）',
    USER_DAILY_QUERY_OVER_LIMIT: 'key 今日配额已用完',
    DAILY_QUERY_OVER_LIMIT: 'key 今日配额已用完',
    NOT_SUPPORT_HTTPS: '该 key 不支持 https 调用'
};

function amapError(j) {
    var info = j && j.info ? String(j.info) : '接口异常';
    // 不带「高德：」前缀：调用处（errs.push / 测试行）已拼接来源名
    return new Error(AMAP_ERR_TEXT[info] || info);
}

// 高德 POI 文本搜索。GCJ-02 返回，转 WGS-84 与底图对齐（见 geocode.js）
function geocodeAmap(q, tmo) {
    var key = geoKey('amap');
    if (!key) return Promise.reject(new Error('未配置高德 key'));
    var url = 'https://restapi.amap.com/v3/place/text?key=' + encodeURIComponent(key) +
        '&keywords=' + encodeURIComponent(q) +
        '&offset=' + (CONFIG.GEOCODE.LIMIT || 6) + '&page=1&extensions=base';
    return fetchJson(url, tmo).then(function (j) {
        if (String(j.status) !== '1') throw amapError(j);
        var list = (j.pois || []).map(function (p) {
            var loc = String(p.location || '').split(',');
            if (loc.length !== 2 || !loc[0]) return null;
            var wgs = Geocode.gcj02ToWgs84(parseFloat(loc[0]), parseFloat(loc[1]));
            return {
                name: p.name || q,
                address: (p.pname || '') + (p.cityname || '') + (p.adname || '') + (p.address || ''),
                bbox: null,
                lat: wgs[1],
                lng: wgs[0]
            };
        }).filter(Boolean);
        if (list.length) return list;
        // POI 没搜到（部分自然村/组未收录）→ 退回行政区划地理编码，至少定位到所属市县镇
        return geocodeAmapDistrict(q, key);
    });
}

function geocodeAmapDistrict(q, key) {
    var url = 'https://restapi.amap.com/v3/geocode/geo?key=' + encodeURIComponent(key) +
        '&address=' + encodeURIComponent(q) + '&multiResult=true';
    return fetchJson(url).then(function (j) {
        if (String(j.status) !== '1') return [];
        return (j.geocodes || []).map(function (g) {
            var loc = String(g.location || '').split(',');
            if (loc.length !== 2 || !loc[0]) return null;
            var wgs = Geocode.gcj02ToWgs84(parseFloat(loc[0]), parseFloat(loc[1]));
            return {
                name: g.district || q,
                address: (g.formatted_address || '') + (g.level ? '（' + g.level + '）' : ''),
                bbox: null,
                lat: wgs[1],
                lng: wgs[0]
            };
        }).filter(Boolean);
    });
}

var PHOTON_KIND = {
    village: '村', hamlet: '自然村', town: '镇', city: '市', county: '县',
    district: '区', municipality: '直辖市', state: '省', country: '国家',
    house: '门牌', street: '道路', locality: '地名', farm: '农场'
};

// Photon：OSM 数据的免 key 检索（photon.komoot.io 公共实例）。
// 免注册免 key、大陆可达性实测较好；数据来自 OSM，村名覆盖不如高德全，作为免 key 方案。
// 返回即 WGS-84，免纠偏。
function geocodePhoton(q, tmo) {
    var c = map ? map.getCenter() : L.latLng(CONFIG.CENTER[0], CONFIG.CENTER[1]);
    var url = 'https://photon.komoot.io/api?q=' + encodeURIComponent(q) +
        '&limit=' + (CONFIG.GEOCODE.LIMIT || 6) +
        '&lat=' + c.lat.toFixed(4) + '&lon=' + c.lng.toFixed(4);
    return fetchJson(url, tmo).then(function (j) {
        return (j.features || []).map(function (f) {
            var p = f.properties || {};
            var g = f.geometry && f.geometry.coordinates;
            if (!g || g.length !== 2 || typeof g[0] !== 'number') return null;
            var parts = [p.country, p.state, p.city, p.county, p.district];
            var seen = {}, addr = [];
            parts.forEach(function (x) {
                if (!x || seen[x] || x === p.name) return; // 去重、避免与名称重复
                seen[x] = true;
                addr.push(x);
            });
            var kind = PHOTON_KIND[p.osm_value] || p.osm_value || '';
            return {
                name: p.name || q,
                address: addr.join(' ') + (kind ? '（' + kind + '）' : ''),
                bbox: p.extent ? { west: p.extent[0], north: p.extent[1], east: p.extent[2], south: p.extent[3] } : null,
                lat: g[1],
                lng: g[0]
            };
        }).filter(Boolean);
    });
}

// 天地图地理编码（国内官方服务，免费 tk；直接返回 WGS-84，免纠偏）。单结果接口，作补充源。
function geocodeTianditu(q, tmo) {
    var key = geoKey('tianditu');
    if (!key) return Promise.reject(new Error('未配置天地图 tk'));
    var ds = JSON.stringify({ keyWord: q });
    var url = 'https://api.tianditu.gov.cn/geocoder?ds=' + encodeURIComponent(ds) +
        '&tk=' + encodeURIComponent(key);
    return fetchJson(url, tmo).catch(function (e) {
        // 天地图对无效 tk 返回 HTTP 400，给出可操作的提示
        if (/^HTTP 40\d$/.test(e && e.message ? e.message : '')) {
            throw new Error('tk 无效（需「浏览器端」类型）');
        }
        throw e;
    }).then(function (j) {
        var loc = j && j.location;
        if (!loc || typeof loc.lon !== 'number' || typeof loc.lat !== 'number') {
            throw new Error('无匹配结果');
        }
        var score = j.score != null && !isNaN(+j.score) ? '，置信度 ' + Math.round(+j.score * 100) + '%' : '';
        return [{
            name: q,
            address: '天地图匹配' + score,
            bbox: null,
            lat: loc.lat,
            lng: loc.lon
        }];
    });
}

// 搜索结果只做定位：把地图移到该处，不建区域、不改数据。
function flyToPlace(i) {
    if (!map) return;
    var r = (state._placeResults || [])[i];
    if (!r) return;
    var b = r.bbox ? L.latLngBounds([[r.bbox.south, r.bbox.west], [r.bbox.north, r.bbox.east]]) : null;
    var anchor = b ? b.getCenter() : L.latLng(r.lat, r.lng);

    // 多区域档案：目标点落在另一个已框定区域内 → 直接切换到那个区域。
    // 视野 = 该区域 + 10km、硬墙与区域高亮一并跟随——比"悬在区域外预览"
    // 更符合档案内跳转（家在 A 村，搜 B 村的亲戚就该切到 B 村）。
    if (state.data && state.data.regions.length) {
        for (var ri = 0; ri < state.data.regions.length; ri++) {
            var rg = state.data.regions[ri];
            if (rg.polygon && rg.polygon.length >= 3 && L.latLngBounds(rg.polygon).contains(anchor)) {
                if (rg.id !== state.data.activeRegionId) { switchRegion(rg.id); return; }
                break; // 目标就在当前区域内：走正常定位流程
            }
        }
    }

    // 目标在当前区域外：临时解除平移硬墙，允许"预览式"定位
    var panB = map.options.maxBounds;
    var outside = !!(panB && !panB.contains(anchor));
    if (outside) {
        setPreview(true);
        map.setMaxBounds(null);
        map.setMinZoom(CONFIG.MIN_ZOOM);
    }

    state._locating = true; /* 定位过程中不要触发"回到区域内"的重新锁定 */
    state._locateTarget = { lat: anchor.lat, lng: anchor.lng };
    if (state._locateTimer) clearTimeout(state._locateTimer);
    // 兜底：万一定位没引起 moveend（比如就在原地），1.6 秒后也解除标记
    state._locateTimer = setTimeout(function () {
        state._locating = false;
        state._locateTarget = null;
    }, 1600);
    if (map.stop) map.stop(); /* 取消上一次还没跑完的动画，避免连点两次只有第一次生效 */
    // 动态比例尺（像高德）：带范围框的结果按范围适配视野（搜"省"看到省、搜"村"看到村），
    // 无范围框的 POI 点给街道级缩放（已比这更近则不动）。
    var zoom;
    if (b) {
        zoom = map.getBoundsZoom(b, false, L.point(80, 80));
        zoom = Math.max(CONFIG.MIN_ZOOM, Math.min(zoom, CONFIG.MAX_ZOOM));
    } else {
        zoom = Math.min(CONFIG.MAX_ZOOM, Math.max(17, map.getZoom()));
    }
    map.setView([anchor.lat, anchor.lng], zoom, { animate: false });

    if (addMode) { toast('已定位：点击地图放置人物', 3000); return; }
    // 区域内不再弹提示：地图已明显移动定位；区域外仍提示（引导怎么建区）
    if (outside) {
        toast('已定位到区域外（不会建区）。要在这里建区：用「地图上框选新区域」', 4500);
    }
}

/* ===== demo ===== */

function demoData() {
    // 演示数据也按新模型：地点（标注主体）→ 其下人物
    function pl(id, name, lat, lng) {
        return { id: id, name: name, note: '', lat: lat, lng: lng, regionId: 'r_demo' };
    }
    function p(id, name, gender, age, placeId) {
        return { id: id, name: name, gender: gender, age: age, titles: [], placeId: placeId };
    }
    var places = [
        pl('pl_grand', '爷爷奶奶家', 31.0016, 111.0004),
        pl('pl_home', '我家', 31.0003, 111.0002),
        pl('pl_uncle', '伯父家', 31.0010, 110.9996),
        pl('pl_yi', '小姨家', 30.9995, 111.0015)
    ];
    var persons = [
        p('d_gf', '爷爷', 'm', 78, 'pl_grand'),
        p('d_gm', '奶奶', 'f', 76, 'pl_grand'),
        p('d_fa', '爸', 'm', 50, 'pl_home'),
        p('d_mo', '妈', 'f', 48, 'pl_home'),
        p('d_me', '我', 'm', 24, 'pl_home'),
        p('d_bo', '伯父', 'm', 52, 'pl_uncle'),
        p('d_co', '堂哥', 'm', 27, 'pl_uncle'),
        p('d_yi', '小姨', 'f', 43, 'pl_yi')
    ];
    return {
        version: Places.SCHEMA_VERSION,
        regions: [{ id: 'r_demo', name: '演示区域', polygon: padPolygon(convexHull(places.map(function (x) { return [x.lat, x.lng]; })), 1.1, 0.0005) }],
        activeRegionId: 'r_demo',
        places: places,
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
    toast('已清空，先「新建区域」再添加地点');
}

/* ===== 地点（标注主体） ===== */

// 侧栏「添加地点」：进入放置模式 → 点地图 → 填地点名
function addPlace() {
    if (!state.workspace || !state.data) return;
    if (!state.data.regions.length) {
        showDialog({
            title: '先建一个区域',
            body: '先加一块区域：搜索地名，或在地图上框选。标注的地点都归入区域管理。',
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
        syncTileBounds();
        toast('已退出放置模式');
        return;
    }
    addMode = true;
    state._tileKey = null;
    syncTileBounds();
    toast('点击地图空白处标注地点（可先在侧栏搜索点「定位」跳过去）', 3500);
}

// 打开地点弹窗（新增 / 编辑）：地点信息 + 该地点的称谓条目（姓名/性别/年龄）都在这里
function openPlaceModal(placeId, latlng) {
    hideRelForm(); // 两个独立窗口互斥
    state.editingPlaceId = placeId || null;
    pendingLatLng = latlng || null;
    var pl = placeId ? Places.findPlace(state.data, placeId) : null;
    document.getElementById('placeModalTitle').textContent = pl ? '编辑地点' : '添加地点';
    document.getElementById('inputPlaceName').value = pl ? pl.name : '';
    document.getElementById('inputPlaceNote').value = pl ? (pl.note || '') : '';
    // 称谓条目表
    var rows = document.getElementById('placeTitleRows');
    rows.innerHTML = '';
    var people = pl ? Places.peopleAt(state.data, pl.id) : [];
    var rootId = effectiveRootId();
    people.forEach(function (p) { addPlaceTitleRow(p.name, p.gender, p.age, p.id === rootId, p.id); });
    if (!people.length) addPlaceTitleRow('', '', null, false, null);
    document.getElementById('btnDeletePlace').style.display = pl ? '' : 'none';
    document.getElementById('placeModal').classList.add('show');
    // 新增时聚焦地点名；编辑时不自动抢焦点
    if (!pl) setTimeout(function () { document.getElementById('inputPlaceName').focus(); }, 50);
}

// 地点编辑器里加一行称谓条目（一个条目 = 一个称谓）。
// isRoot=true 表示这行当前是「我」的起点；kinId 传人物 id 时，
// 行下方带「推算称谓/互称」展开区。
// 一行布局：＋ | 称谓名 | 性别 | 年龄 | ×；称谓名占剩余宽度。
function addPlaceTitleRow(name, gender, age, isRoot, kinId) {
    var rows = document.getElementById('placeTitleRows');
    if (!rows) return;
    var row = document.createElement('div');
    row.className = 'place-title-row' + (isRoot ? ' root-mark' : '');
    row.innerHTML =
        '<button type="button" class="pt-me' + (isRoot ? ' on' : '') + '" data-act="markPlaceRootRow" ' +
        'title="' + (isRoot ? '当前「我」' : '设为「我」') + '" aria-label="设为「我」" ' +
        'aria-pressed="' + (isRoot ? 'true' : 'false') + '">＋</button>' +
        '<input class="input pt-name" placeholder="称谓" title="称谓，如 爷爷" aria-label="称谓" />' +
        '<select class="input pt-gender" aria-label="性别">' +
        '<option value="">性别</option><option value="m">男</option><option value="f">女</option></select>' +
        '<input class="input pt-age" type="number" min="0" max="150" step="1" placeholder="年龄" aria-label="年龄" />' +
        '<button type="button" class="btn-remove" data-act="removePlaceTitleRow" aria-label="删除该称谓条目">×</button>' +
        (kinId ? '<details class="pt-kin-wrap"><summary>推算出的称谓与互称</summary><div class="pt-kin kin-box"></div></details>' : '');
    row.querySelector('.pt-name').value = name || '';
    row.querySelector('.pt-gender').value = gender || '';
    row.querySelector('.pt-age').value = age != null ? age : '';
    rows.appendChild(row);
    if (kinId) renderPersonKin(kinId, row.querySelector('.pt-kin'));
}

// 地点编辑器里点某行的 ＋：把它设为「我」；再点一次取消（回到默认第一人）
function markPlaceRootRow(el) {
    var row = el.closest ? el.closest('.place-title-row') : el.parentElement;
    if (!row) return;
    var wasMarked = row.classList.contains('root-mark');
    var rows = document.querySelectorAll('#placeTitleRows .place-title-row');
    Array.prototype.forEach.call(rows, function (r) {
        r.classList.remove('root-mark');
        var b = r.querySelector('.pt-me');
        if (b) { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }
        if (b) b.title = '设为「我」';
    });
    if (!wasMarked) {
        row.classList.add('root-mark');
        el.classList.add('on');
        el.setAttribute('aria-pressed', 'true');
        el.title = '当前「我」';
    }
}

// 删掉一行称谓条目
function removePlaceTitleRow(el) {
    var row = el.closest ? el.closest('.place-title-row') : el.parentElement;
    if (row) row.remove();
}

// 读表：[{ name, gender, age }]（一个条目 = 一个称谓，没有 titles 字段）
function collectPlaceTitles() {
    var rows = document.getElementById('placeTitleRows');
    if (!rows) return [];
    return Array.prototype.map.call(rows.querySelectorAll('.place-title-row'), function (row) {
        var name = (row.querySelector('.pt-name').value || '').trim();
        if (!name) return null;
        return {
            name: name,
            gender: row.querySelector('.pt-gender').value || '',
            age: normAge(row.querySelector('.pt-age').value)
        };
    }).filter(Boolean);
}

function closePlaceModal() {
    document.getElementById('placeModal').classList.remove('show');
    state.editingPlaceId = null;
    pendingLatLng = null;
}

function confirmPlace() {
    var name = document.getElementById('inputPlaceName').value.trim();
    if (!name) { toast('请输入地点名'); return; }
    var note = document.getElementById('inputPlaceNote').value.trim();
    var entries = collectPlaceTitles();

    // 每行左侧的 ＋ 是「我」的选择（只能一个）；没标记则不改动现有起点
    var markedRow = document.querySelector('#placeTitleRows .place-title-row.root-mark');
    var rootName = markedRow ? (markedRow.querySelector('.pt-name').value || '').trim() : '';

    if (state.editingPlaceId) {
        var pl = Places.findPlace(state.data, state.editingPlaceId);
        if (!pl) { closePlaceModal(); return; }
        pl.name = name;
        pl.note = note;
        // 保存前记录：本地点此前是否持有显式起点（用于「取消 ＋」后回到默认第一人）
        var preIds = {};
        Places.peopleAt(state.data, pl.id).forEach(function (p) { preIds[p.id] = true; });
        var hadExplicitRoot = !!(state.data.rootId && preIds[state.data.rootId]);
        syncPlaceEntries(pl.id, entries);
        applyPlaceRoot(pl.id, rootName, hadExplicitRoot);
        saveData();
        renderAll(false);
        markUserModified();
        closePlaceModal();
        openPlaceCard(pl.id);
        toast('已保存 ' + name);
        return;
    }

    if (!pendingLatLng) { toast('请先在地图上选点'); return; }
    var lat = pendingLatLng.lat, lng = pendingLatLng.lng;
    var draft = { name: name, note: note, lat: lat, lng: lng, entries: entries, rootName: rootName };

    // 还没有区域：先划区域，划完再把地点放进去
    if (!state.data.regions.length) {
        pendingPlaceDraft = draft;
        closePlaceModal();
        startDrawRegion();
        toast('先划定区域，地点随后归入', 3000);
        return;
    }

    var active = activeRegion();
    if (active && pointInPolygon([lat, lng], active.polygon)) {
        savePlaceDraft(draft, active.id);
        return;
    }

    // 落点在当前区域之外：给三种处理方式
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
                var poly = convexHull(active.polygon.concat([[lat, lng]]));
                active.polygon = padPolygon(poly, 1.03, 0.0003);
                saveData();
                renderRegions();
                savePlaceDraft(draft, active.id);
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
                savePlaceDraft(draft, rid);
            }
        });
    }
    buttons.push({ label: '取消' });
    showDialog({ title: '落点超出区域', body: body, buttons: buttons });
}

// 把某地点里指定称谓的人设为「我」；rootName 为空且该地点此前持有显式起点时，
// 取消显式指定并回落到默认第一人（与点掉 ＋ 的语义一致）。
function applyPlaceRoot(placeId, rootName, hadExplicitRoot) {
    if (rootName) {
        var target = Places.peopleAt(state.data, placeId).filter(function (p) { return p.name === rootName; })[0];
        if (target && !(state.data.rootId === null && target.id === Places.effectiveRootId(state.data))) {
            state.data.rootId = target.id;
        }
    } else if (hadExplicitRoot) {
        state.data.rootId = null;
    }
}

// 真正落库一个地点（含它的称谓条目）
function savePlaceDraft(draft, regionId) {
    var pl = Places.addPlace(state.data, {
        name: draft.name, note: draft.note, lat: draft.lat, lng: draft.lng, regionId: regionId
    });
    (draft.entries || []).forEach(function (e) {
        Places.addPerson(state.data, { name: e.name, gender: e.gender, age: e.age, placeId: pl.id, titles: [] });
    });
    // 新地点里被 ＋ 标记的称谓直接成为「我」；未标记则沿用默认第一人
    applyPlaceRoot(pl.id, draft.rootName, false);
    saveData();
    renderAll(false);
    markUserModified();
    closePlaceModal();
    openPlaceCard(pl.id);
    toast('已添加地点 ' + pl.name);
}

// 按编辑器里的表同步某个地点的称谓条目：
// 同名条目保留原 id 与关系，改名视为新条目，多出来的删掉；
// 一个条目 = 一个称谓，已有条目不动其 titles（手填的 titles 由打开档案时拆分清掉）
function syncPlaceEntries(placeId, entries) {
    var existing = Places.peopleAt(state.data, placeId);
    var keep = {};
    existing.forEach(function (p) { keep[p.name] = p; });
    var wanted = {};
    entries.forEach(function (e) { wanted[e.name] = true; });
    existing.slice().forEach(function (p) {
        if (!wanted[p.name]) Places.removePerson(state.data, p.id);
    });
    entries.forEach(function (e) {
        var p = keep[e.name];
        if (!p) {
            Places.addPerson(state.data, { name: e.name, gender: e.gender, age: e.age, placeId: placeId, titles: [] });
            return;
        }
        p.gender = e.gender;
        p.age = e.age;
    });
}

// 删除地点（连带其下人物与相关关系）
function deletePlace() {
    var id = state.editingPlaceId;
    if (!id) return;
    var pl = Places.findPlace(state.data, id);
    if (!pl) { closePlaceModal(); return; }
    var n = Places.peopleCount(state.data, id);
    if (!confirm('删除地点「' + pl.name + '」？' + (n ? '其下的 ' + n + ' 个人物和相关关系也会一并删除。' : ''))) return;
    Places.removePlace(state.data, id);
    saveData();
    renderAll(false);
    markUserModified();
    closePlaceModal();
    closeInfoCard();
    toast('已删除 ' + pl.name);
}

// 地点卡上「+ 称谓」：打开地点编辑器并加一行空条目
function addTitleToPlace() {
    var placeId = state.openPlaceId;
    if (!placeId) return;
    openPlaceModal(placeId);
    addPlaceTitleRow('', '', null);
    var rows = document.getElementById('placeTitleRows');
    if (rows) {
        var last = rows.lastElementChild;
        if (last) {
            var inp = last.querySelector('.pt-name');
            if (inp) inp.focus();
        }
    }
}

function removePerson(id) {
    Places.removePerson(state.data, id);
}

// 地点人物列表里的删除按钮
function deletePersonById(id) {
    var p = findPerson(id);
    if (!p) return;
    var placeId = p.placeId;
    if (!confirm('删除「' + p.name + '」及其全部关系？')) return;
    removePerson(p.id);
    saveData();
    renderAll(false);
    markUserModified();
    if (placeId) openPlaceCard(placeId);
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
    openPlaceModal(state.selectedId);   // 右键标记 → 编辑地点
}

function deleteFromMenu() {
    hideContextMenu();
    var pl = Places.findPlace(state.data, state.selectedId);
    if (!pl) return;
    var n = Places.peopleCount(state.data, pl.id);
    if (!confirm('删除地点「' + pl.name + '」？' + (n ? '其下的 ' + n + ' 个人物和相关关系也会一并删除。' : ''))) return;
    Places.removePlace(state.data, pl.id);
    saveData();
    renderAll(false);
    closeInfoCard();
    toast('已删除 ' + pl.name);
}

/* ===== kinship ===== */

// 称谓推算起点：默认第一人；用户显式标记（rootId）时以标记为准。
// 所有展示与称谓判定都走这里，保证「我」始终有起点。
function effectiveRootId() {
    return state.data ? Places.effectiveRootId(state.data) : null;
}

function computeKinship() {
    var rootId = effectiveRootId();
    if (!state.data || !rootId || !state.data.persons.length) return null;
    try { return Kinship.compute(rootId, state.data.persons, state.data.relations); } catch (e) { return null; }
}

function personName(id) {
    var p = findPerson(id);
    return p ? p.name : '?';
}

/* ===== 地点卡：地点是标注主体，人物挂在地点下 ===== */

function openPlaceCard(placeId) {
    var pl = Places.findPlace(state.data, placeId);
    if (!pl) return;
    toggleSidebarIfOpen();
    state.selectedId = placeId;
    state.openPlaceId = placeId;
    document.getElementById('infoName').textContent = pl.name;
    var kin = document.getElementById('infoKin');
    if (kin) kin.style.display = 'none';
    document.getElementById('infoTitles').textContent = pl.note || '';
    renderPlacePeople(placeId);
    renderRelList(placeId);
    document.getElementById('relModal').classList.remove('show');
    document.getElementById('infoCard').classList.add('show');
}

// 地点下的人物：姓名 + 推算称谓 + 性别年龄，点行编辑该人物
function renderPlacePeople(placeId) {
    var box = document.getElementById('placePeople');
    if (!box) return;
    var people = Places.peopleAt(state.data, placeId);
    if (!people.length) {
        box.innerHTML = '<div class="rel-empty">这个地点还没有称谓，点下面「+ 称谓」添加</div>';
        return;
    }
    var k = computeKinship();
    var rootId = effectiveRootId();
    box.innerHTML = people.map(function (p) {
        var lab = k ? k.labels[p.id] : null;
        var badge = '';
        if (p.id === rootId) {
            badge = '<span class="kin-badge">我</span>';
        } else if (lab) {
            badge = '<span class="kin-badge' + (lab.exact ? '' : ' inexact') + '">' + esc(lab.label) + '</span>';
        }
        var bits = [];
        if (p.gender === 'm') bits.push('男'); else if (p.gender === 'f') bits.push('女');
        if (p.age != null) bits.push(p.age + ' 岁');
        if (p.titles && p.titles.length) {
            var extra = p.titles.filter(function (x) { return x !== p.name; });
            if (extra.length) bits.push('手填：' + extra.join('、'));
        }
        var isRoot = p.id === rootId;
        var meBtn = '<button type="button" class="pp-me' + (isRoot ? ' on' : '') + '" ' +
            'title="' + (isRoot ? '当前「我」' : '设为「我」') + '" ' +
            'aria-label="' + (isRoot ? '当前「我」是 ' + esc(p.name) : '把 ' + esc(p.name) + ' 设为「我」') + '" ' +
            'aria-pressed="' + (isRoot ? 'true' : 'false') + '" ' +
            'data-act="setRootPerson" data-id="' + esc(p.id) + '">＋</button>';
        return '<div class="place-person">' + /* 只读展示：修改统一走「编辑地点」 */
            '<span class="pp-name">' + esc(p.name) + badge + '</span>' +
            '<span class="pp-meta">' + esc(bits.join(' · ')) + '</span>' +
            meBtn +
            '<button type="button" class="pp-del" title="删除人物" aria-label="删除人物 ' + esc(p.name) + '" data-act="deletePersonById" data-id="' + esc(p.id) + '">×</button>' +
            '</div>';
    }).join('');
}

// 每行下方的称谓区：推算称谓 + 路径 + 互称（跟着人物走，不再挂在地点上）
function renderPersonKin(id, box) {
    if (!box) return;
    var p = findPerson(id);
    if (!p) { box.innerHTML = ''; return; }
    var k = computeKinship();
    var lab = k ? k.labels[id] : null;
    var html = '';
    if (id === effectiveRootId()) {
        html = '<div class="kin-main">这是「我」——称谓推算的起点（默认第一人；点行左侧的 ＋ 可换成别人）</div>';
    } else if (lab) {
        html = '<div class="kin-main"><span class="kin-badge' + (lab.exact ? '' : ' inexact') + '">' + esc(lab.label) + '</span>' +
            (lab.alias && lab.alias.length ? '<span class="kin-alias">又叫：' + esc(lab.alias.slice(0, 3).join(' · ')) + '</span>' : '') +
            (lab.path && lab.path.length ? '<span class="kin-path">' + esc(lab.path.join(' → ')) + '</span>' : '') + '</div>';
    } else {
        html = '<div class="kin-main kin-none">' +
            (k ? '算不出彼此的称谓：先在「+ 关系」里把人物连起来' : '还没有人物数据：先在地点里添加称谓条目') +
            '</div>';
    }
    box.innerHTML = html;
    renderMutualTitles(id, lab, box);
}

function closeInfoCard() {
    document.getElementById('infoCard').classList.remove('show');
}

/* ===== 双向称谓换算（信息卡）：处「同龄不同辈」时称呼最易搞错，这里一次给两个方向 ===== */

// 同年龄段判定阈值：两人年龄差这么多岁以内算「同年龄段」，辈分却不同时给出特别提示
var KIN_CLOSE_AGE = 10;

function renderMutualTitles(id, fwdLab, target) {
    // target 传了就追加到那个容器（编辑地点每行的称谓区）；不传则用旧的信息卡容器
    var box = target || document.getElementById('infoMutual');
    if (!box) return;
    if (!target) box.classList.remove('show');
    var rootId = effectiveRootId();
    if (!state.data || !rootId || id === rootId) return;
    var m = null;
    try {
        m = Kinship.mutual(rootId, id, state.data.persons, state.data.relations);
    } catch (e) { m = null; }
    if (!m || (!m.iCall && !m.theyCall)) return; // 未连进「我」的关系网：无换算可给

    var p = findPerson(id);
    var me = findPerson(rootId);
    var he = p && p.gender === 'f' ? '她' : '他';

    function val(lab) {
        if (!lab) return '<span class="kin-none">没有到「我」的称呼链，先补一条关系</span>';
        var alias = lab.alias && lab.alias.length ? lab.alias.slice(0, 2).join(' · ') : '';
        return '<span class="kin-val' + (lab.exact ? '' : ' inexact') + '">' + esc(lab.label) + '</span>' +
            (alias ? '<span class="kin-alias">又叫 ' + esc(alias) + '</span>' : '');
    }

    var html =
        '<div class="kin-mutual-title">称谓换算' + (fwdLab && fwdLab.exact ? '' : '（按最短关系链推算）') + '</div>' +
        '<div class="kin-mutual-row"><span class="kin-who">我 → ' + he + '</span>' + val(m.iCall) + '</div>' +
        '<div class="kin-mutual-row"><span class="kin-who">' + he + ' → 我</span>' + val(m.theyCall) + '</div>';

    // 辈分差 + 同龄不同辈提示：称呼看辈分不看年龄
    var g = m.genDiff;
    if (g !== null && g !== 0) {
        html += '<div class="kin-gen">辈分：' + (g < 0 ? he + '高我 ' + (-g) + ' 辈' : he + '低我 ' + g + ' 辈') + '</div>';
        var bothAged = me && p && typeof me.age === 'number' && typeof p.age === 'number';
        if (bothAged) {
            var gap = Math.abs(me.age - p.age);
            if (gap <= KIN_CLOSE_AGE) {
                var verdict = g < 0
                    ? '我年纪' + (me.age <= p.age ? '更大' : '相仿') + '也照样叫' + he + '「' + esc(m.iCall ? m.iCall.label : '') + '」'
                    : he + '年纪' + (p.age <= me.age ? '更大' : '相仿') + '也要叫我「' + esc(m.theyCall ? m.theyCall.label : '') + '」';
                html += '<div class="kin-mutual-note">⚠ 同年龄段不同辈：差 ' + gap + ' 岁但差 ' + Math.abs(g) + ' 辈。称呼以辈分为准——' + verdict + '</div>';
            }
        }
    }
    if (target) {
        box.insertAdjacentHTML('beforeend', html);
    } else {
        box.innerHTML = html;
        box.classList.add('show');
    }
}

function editFromCard() {
    openPlaceModal(state.selectedId);   // 地点卡上的「编辑地点」
}

// 地点卡上的关系列表：这个地点里的人物之间、以及他们与别处人物之间的关系
function renderRelList(placeId) {
    var box = document.getElementById('relList');
    if (!box) return;
    var rels = Places.relationsOfPlace(state.data, placeId);
    if (!rels.length) {
        box.innerHTML = '<div class="rel-empty">暂无关系，点下方「+ 关系」添加</div>';
        return;
    }
    box.innerHTML = rels.map(function (r) {
        var idx = state.data.relations.indexOf(r);
        return '<div class="rel-item"><span class="rel-sentence" data-act="editRelation" data-i="' +
            idx + '" title="点击编辑关系">' +
            esc(personName(r.from)) + ' 是 ' + esc(personName(r.to)) + ' 的 ' + esc(r.type) +
            '</span><span class="rel-actions">' +
            '<button type="button" class="rel-btn" data-act="jumpToPerson" data-id="' + esc(r.from) + '">定位</button>' +
            '<button type="button" class="rel-btn del" data-act="deleteRelation" data-i="' + idx + '">删除</button>' +
            '</span></div>';
    }).join('');
}

// 定位到某个人物：跳到他所在的地点并打开地点卡
function jumpToPerson(id) {
    var p = findPerson(id);
    if (!p) { toast('该人物不存在'); return; }
    var pl = Places.findPlace(state.data, p.placeId);
    if (!pl) { toast('该人物没有所属地点'); return; }
    hideSearch();
    openPlaceCard(pl.id);
    if (pl.lat != null && pl.lng != null) {
        map.setView([pl.lat, pl.lng], Math.max(map.getZoom(), 17));
    }
    toast('定位到「' + pl.name + '」的 ' + p.name, 2000);
}

function deleteRelation(idx) {
    var r = state.data.relations[idx];
    if (!r) return;
    if (!confirm('删除关系：' + personName(r.from) + ' 是 ' + personName(r.to) + ' 的 ' + r.type + '？')) return;
    state.data.relations.splice(idx, 1);
    saveData();
    renderAll(false);
    if (state.selectedId) openPlaceCard(state.selectedId);
}

function showRelForm(idx) {
    closePlaceModal(); // 两个独立窗口互斥
    var placeId = state.selectedId;
    if (!placeId) return;
    var editing = Number.isInteger(idx) && idx >= 0 && state.data.relations[idx];
    state.relEditingIdx = editing ? idx : null;
    var fromSel = document.getElementById('relFrom');
    var toSel = document.getElementById('relTo');
    var typeSel = document.getElementById('relType');
    // 关系可以跨地点：下拉列出全部人物，并标出各自所在地点
    var opts = state.data.persons.map(function (p) {
        return '<option value="' + esc(p.id) + '">' + esc(Places.personLabel(state.data, p.id)) + '</option>';
    }).join('');
    fromSel.innerHTML = opts;
    toSel.innerHTML = opts;
    // 编辑：预填这条关系的两端与类型；新增：优先用当前地点里的两个人物
    if (editing) {
        fromSel.value = state.data.relations[idx].from;
        toSel.value = state.data.relations[idx].to;
    } else {
        var here = Places.peopleAt(state.data, placeId);
        if (here.length) fromSel.value = here[0].id;
        var other = null;
        if (here.length > 1) {
            other = here[1];
        } else {
            state.data.persons.forEach(function (p) { if (!other && p.id !== fromSel.value) other = p; });
        }
        if (other) toSel.value = other.id;
    }
    typeSel.innerHTML = Kinship.TYPE_GROUPS.map(function (g) {
        return '<optgroup label="' + esc(g.group) + '">' +
            g.types.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('') +
            '</optgroup>';
    }).join('');
    if (editing) typeSel.value = state.data.relations[idx].type;
    var saveBtn = document.getElementById('relSaveBtn');
    if (saveBtn) saveBtn.textContent = editing ? '保存' : '添加';
    var titleEl = document.getElementById('relModalTitle');
    if (titleEl) titleEl.textContent = editing ? '编辑关系' : '添加关系';
    document.getElementById('relModal').classList.add('show');
}

function editRelation(idx) {
    showRelForm(idx);
}

function hideRelForm() {
    state.relEditingIdx = null;
    var saveBtn = document.getElementById('relSaveBtn');
    if (saveBtn) saveBtn.textContent = '添加';
    var titleEl = document.getElementById('relModalTitle');
    if (titleEl) titleEl.textContent = '添加关系';
    document.getElementById('relModal').classList.remove('show');
}

function saveRelation() {
    var from = document.getElementById('relFrom').value;
    var to = document.getElementById('relTo').value;
    var type = document.getElementById('relType').value;
    if (!from || !to) { toast('请选择人物'); return; }
    if (from === to) { toast('不能和自己建立关系'); return; }
    var idx = state.relEditingIdx;
    var editing = Number.isInteger(idx) && idx >= 0 && state.data.relations[idx];
    var dup = state.data.relations.some(function (r, i) {
        return i !== idx && r.from === from && r.to === to && r.type === type;
    });
    if (dup) { toast('该关系已存在'); return; }
    if (editing) {
        state.data.relations[idx] = { from: from, to: to, type: type };
    } else {
        state.data.relations.push({ from: from, to: to, type: type });
    }
    saveData();
    renderAll(false);
    markUserModified();
    hideRelForm();
    if (state.selectedId) openPlaceCard(state.selectedId);
    toast(editing ? '已修改关系' : '已添加关系');
}

/* ===== import / export / clear ===== */

function exportData() {
    if (!state.data) return;
    // places 必须一起导出：v3 里人物的坐标/地点名都挂在地点上，
    // 少了 places 会被 normalize 当成旧格式，导入后地点名与坐标全部丢失。
    var payload = { version: 3, regions: state.data.regions, activeRegionId: state.data.activeRegionId, regionsCleared: state.data.regionsCleared === true, places: state.data.places, persons: state.data.persons, relations: state.data.relations, rootId: state.data.rootId, titlesSplit: state.data.titlesSplit || 0 };
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
        var n = state.data.places.length;
        if (n && !confirm('导入将【覆盖】当前档案的全部数据（' + n + ' 个地点 / ' + state.data.persons.length + ' 个称谓条目）。\n确定覆盖吗？')) return;
        state.data = d;
        var splitN = Places.splitHandFilledTitles(d); // 手填称谓逐个拆成独立条目（一次性）
        saveData();
        renderRegions();
        renderAll(false);
        fitActiveRegion();
        markUserModified();
        var splitNote = splitN ? '；手填称谓另拆出 ' + splitN + ' 条' : '';
        if (d.migratedFrom) {
            // 旧格式数据：人物自带坐标 → 已按称谓重建为「地点 + 称谓条目」
            toast('已导入：' + d.migratedFrom.places + ' 个地点 / ' + d.migratedFrom.people +
                ' 个称谓条目（按旧称谓重建）' + splitNote, 5000);
        } else {
            toast('导入成功：' + d.places.length + ' 个地点 / ' + d.persons.length + ' 个称谓条目' + splitNote);
        }
    };
    reader.onerror = function () { toast('读取文件失败'); };
    reader.readAsText(f, 'utf-8');
}

// 清除当前档案里用户添加的全部数据：区域、地点、称谓条目、人物关系、起点。
// 只保留本机配置（如高德/天地图 key）与离线瓦片缓存，便于重新开始记录。
function clearAll() {
    if (!state.data) return;
    var d = state.data;
    var counts = {
        regions: d.regions.length,
        places: d.places.length,
        persons: d.persons.length,
        relations: d.relations.length
    };
    var total = counts.regions + counts.places + counts.persons + counts.relations;
    if (!total) { toast('还没有添加任何数据'); return; }
    var parts = [];
    if (counts.regions) parts.push(counts.regions + ' 个区域');
    if (counts.places) parts.push(counts.places + ' 个地点');
    if (counts.persons) parts.push(counts.persons + ' 个称谓条目');
    if (counts.relations) parts.push(counts.relations + ' 条关系');
    if (!confirm('清除当前档案的所有数据？\n\n将删除：' + parts.join('、') + '，以及「我」的起点。\n区域、地点、称谓条目、人物关系会全部清空，不可恢复；建议先「导出数据」备份。')) return;

    state.data = freshV3();
    if (state.isDemo) localStorage.setItem(DEMO_FLAG, '1');
    state.isDemo = false;
    updateWsMeta({ demo: false });
    state.selectedId = null;
    state.openPlaceId = null;
    pendingPlaceDraft = null;
    addMode = false;
    closeInfoCard();
    closePlaceModal();
    cleanupDraw();
    saveData();
    renderAll(false);
    showDemoBanner();
    toast('已清除全部添加的数据，可以重新开始记录');
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

// 关系图头部的「我」选择器：列出档案里所有人物，当前起点默认选中。
// 第一人额外标注「默认第一人」，让用户知道没手动指定时的起点规则。
function fillGraphRootSelect() {
    var sel = document.getElementById('graphRootSelect');
    if (!sel) return;
    var persons = (state.data && state.data.persons) || [];
    if (!persons.length) {
        sel.innerHTML = '<option value="">还没有人物</option>';
        sel.disabled = true;
        return;
    }
    var rootId = effectiveRootId();
    var firstId = persons[0].id;
    sel.disabled = false;
    sel.innerHTML = persons.map(function (p) {
        // 姓名放最前：窄屏时下拉框会截断尾部，至少要能看清是谁
        var label = p.name;
        if (p.id === firstId) label += '（默认第一人）';
        var pl = Places.placeOf(state.data, p.id);
        if (pl) label += ' · ' + pl.name;
        return '<option value="' + esc(p.id) + '"' + (p.id === rootId ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
}

// 把任意人物设为「我」：写回 rootId，并同步地图标记、地点卡与关系图（如果开着）。
// 关系图下拉框和地点/称谓行的 ＋ 都走这里，保证三处状态一致。
function setRootPerson(id) {
    if (!state.data) return;
    var p = Places.findPerson(state.data, id);
    if (!p) return;
    var wasRoot = effectiveRootId() === p.id;
    state.data.rootId = p.id;
    saveData();
    markUserModified();
    renderAll(false);            // 地图标记的「我」高亮 / 地点卡人物徽章
    if (state.openPlaceId && document.getElementById('infoCard').classList.contains('show')) {
        openPlaceCard(state.openPlaceId); // 已打开的地点卡重新算称谓
    }
    if (document.getElementById('graphPanel').classList.contains('show')) {
        renderGraph();           // 关系图按新起点重排
    }
    toast(wasRoot ? '「' + p.name + '」已经是「我」' : '已把「' + p.name + '」设为「我」');
}

// 自动补齐关系网：按每个人相对「我」的称谓（含名字前的排行数）反查规则表，
// 为没连进关系网的人反推关系边——只新增、不改动已有关系；
// 同辈之间用排行定长幼（排行小的是哥哥/姐姐），关系图里同辈也按排行排序
function autoFillRelations() {
    if (!state.data || !state.data.persons.length) { toast('还没有人物数据'); return; }
    var rootId = effectiveRootId();
    if (!rootId) { toast('先设一个「我」的起点'); return; }
    var adds = Kinship.buildRelations(state.data.persons, state.data.relations, rootId);
    if (!adds.length) { toast('称谓都已连进关系网，没有可补的了'); return; }
    adds.forEach(function (r) { state.data.relations.push(r); });
    saveData();
    markUserModified();
    renderAll(false);
    if (state.openPlaceId && document.getElementById('infoCard').classList.contains('show')) openPlaceCard(state.openPlaceId);
    if (document.getElementById('graphPanel').classList.contains('show')) renderGraph();
    toast('已补齐 ' + adds.length + ' 条关系');
}

function renderGraph() {
    var body = document.getElementById('graphBody');
    fillGraphRootSelect();
    if (!state.data.persons.length) {
        body.innerHTML = '<div class="graph-empty">还没有人物数据，先在地图上添加人物</div>';
        return;
    }
    var k = computeKinship();
    var rootId = effectiveRootId();
    if (!k || !rootId) {
        body.innerHTML = '<div class="graph-empty">称谓推算暂不可用：检查人物关系数据</div>';
        return;
    }
    var g = GraphLayout.layout({
        persons: state.data.persons,
        relations: state.data.relations,
        labels: k.labels,
        places: state.data.places || [],
        rootId: rootId,
        wrap: true,
        panelWidth: body.clientWidth || 0
    });
    if (!g.nodes.length) {
        body.innerHTML = '<div class="graph-empty">还没有可排布的人物</div>';
        return;
    }
    function r1(v) { return Math.round(v * 10) / 10; }

    var parts = [];
    // 世系参考线：每个物理行一条淡虚线 + 左侧「第几世」
    g.rows.forEach(function (row) {
        (row.ys || [row.y]).forEach(function (y, yi) {
            var ly = r1(y + 18);
            parts.push('<line class="g-gen-tick" x1="' + (GraphLayout.LEFT_W + 6) + '" y1="' + ly +
                '" x2="' + r1(g.width - 12) + '" y2="' + ly + '"></line>');
            if (yi === 0) {
                parts.push('<text class="g-gen-label' + (row.isRootRow ? ' root' : '') + '" x="' +
                    (GraphLayout.LEFT_W - 8) + '" y="' + r1(y + 23) + '" text-anchor="end">' +
                    esc(row.label) + '</text>');
                if (row.isRootRow) {
                    parts.push('<text class="g-gen-me" x="' + (GraphLayout.LEFT_W - 8) + '" y="' +
                        r1(y + 39) + '" text-anchor="end">我</text>');
                }
            }
        });
    });

    // 地点分组大框：同一世、同一地点的人圈在一起（画在世线之上、连线/名框之下）
    g.groups.forEach(function (gp) {
        parts.push('<rect class="g-group" x="' + r1(gp.x) + '" y="' + r1(gp.y) +
            '" width="' + r1(gp.w) + '" height="' + r1(gp.h) + '" rx="12"></rect>');
        if (gp.label) {
            parts.push('<text class="g-group-label" x="' + r1(gp.x + 8) + '" y="' +
                r1(gp.y + 12) + '">' + esc(gp.label) + '</text>');
        }
    });

    // 关系线：父母→子女的下垂线/兄弟横杆、夫妻婚线保持醒目；
    // 旁系/兄弟姐妹线默认变淡（g-edge-dim），悬停高亮时恢复
    g.edges.forEach(function (e) {
        var ri = esc(e.ris.join(' '));
        if (e.kind === 'descent') {
            parts.push('<path class="g-edge g-edge-descent" data-ri="' + ri + '" d="' + e.d + '">' +
                '<title>' + esc(e.title) + '</title></path>');
        } else if (e.kind === 'spouse') {
            parts.push('<line class="g-edge g-edge-spouse" data-ri="' + ri + '" x1="' + r1(e.x1) +
                '" y1="' + r1(e.y1) + '" x2="' + r1(e.x2) + '" y2="' + r1(e.y2) + '">' +
                '<title>配偶</title></line>');
        } else if (e.d) {
            parts.push('<path class="g-edge g-edge-dim" data-ri="' + ri + '" d="' + e.d + '">' +
                '<title>' + esc(e.title) + '</title></path>');
        } else {
            parts.push('<line class="g-edge g-edge-dim" data-ri="' + ri + '" x1="' + r1(e.x1) + '" y1="' + r1(e.y1) +
                '" x2="' + r1(e.x2) + '" y2="' + r1(e.y2) + '"><title>' + esc(e.title) + '</title></line>');
        }
    });

    // 关系文字（已做过避让，带背景色描边，压线也能看清；旁系的默认变淡）
    g.labels.forEach(function (l) {
        parts.push('<text class="g-edge-label' + (l.dim ? ' g-label-dim' : '') +
            '" data-ri="' + esc(l.ris.join(' ')) + '" x="' + r1(l.x) +
            '" y="' + r1(l.y) + '" text-anchor="' + l.anchor + '">' + esc(l.text) + '</text>');
    });

    // 名框：族谱式方框，框内姓名、框下称谓
    g.nodes.forEach(function (n) {
        var tip = n.name + (n.title ? ' · ' + n.title : '');
        if (n.alias && n.alias.length) tip += '（又叫 ' + n.alias.join('、') + '）';
        parts.push('<g class="g-node' + (n.isRoot ? ' root' : '') + '" data-id="' + esc(n.id) + '">' +
            '<title>' + esc(tip) + '</title>' +
            '<rect x="' + r1(n.x - n.w / 2) + '" y="' + r1(n.y) + '" width="' + r1(n.w) +
            '" height="' + g.boxH + '" rx="8"></rect>' +
            '<text class="g-node-name" x="' + r1(n.x) + '" y="' + r1(n.y + 23) + '">' + esc(n.name) + '</text>' +
            (n.titleText ? '<text class="g-node-title" x="' + r1(n.x) + '" y="' + r1(n.y + 52) + '">' +
                esc(n.titleText) + '</text>' : '') +
            '</g>');
    });

    // 自适应折行由布局层完成，这里按实际尺寸绘制，不再整体缩放（避免文字过小）
    body.innerHTML = '<svg class="graph-svg" width="' + g.width + '" height="' + g.height +
        '" viewBox="0 0 ' + g.width + ' ' + g.height + '">' + parts.join('') + '</svg>';
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
    var want = {};
    ce.edges.forEach(function (ri) { want[String(ri)] = true; });
    Array.prototype.forEach.call(document.querySelectorAll('.g-edge, .g-edge-label'), function (el) {
        var list = (el.getAttribute('data-ri') || '').split(/\s+/);
        for (var i = 0; i < list.length; i++) {
            if (want[list[i]]) { el.classList.add('hl'); return; }
        }
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
        var lab = k && k.labels[p.id] ? k.labels[p.id] : null;
        var label = lab ? lab.label : '';
        var alias = lab && lab.alias ? lab.alias : [];
        var hit = p.name.indexOf(q) > -1 ||
            (label && label.indexOf(q) > -1) ||
            alias.some(function (a) { return a.indexOf(q) > -1; }) ||
            p.titles.some(function (t) { return t.indexOf(q) > -1; });
        if (hit) results.push({ p: p, lab: label, alias: alias });
    });
    if (!results.length) {
        box.innerHTML = '<div class="search-empty">没有匹配「' + esc(q) + '」的人</div>';
        box.classList.add('show');
        return;
    }
    box.innerHTML = results.slice(0, 20).map(function (r) {
        var sub = r.lab
            ? r.lab + (r.alias.length ? '（又叫 ' + r.alias.slice(0, 2).join(' / ') + '）' : '')
            : r.p.titles.join(' / ');
        return '<div class="search-item" role="button" tabindex="0" data-act="jumpToPerson" data-id="' + esc(r.p.id) + '">' +
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
    // 便于排查"改了却没生效"：标签页标题会带上构建号（构建号定义在 config.js BUILD）
    try {
        document.title = '亲属关系地图 · 构建 ' + (CONFIG.BUILD || '?');
    } catch (e) {}
}

/* ===== 事件委托：替代内联 onclick（CSP 友好） =====
 * 静态 HTML 与动态 innerHTML 统一用 data-act 声明动作，data-id/data-i/data-e 传参；
 * 白名单分发，不执行任意属性值。 */
var ACTIONS = {
    // 零参动作直接映射
    toggleSidebar: toggleSidebar,
    clearDemo: clearDemo,
    undoVertex: undoVertex,
    finishRegion: finishRegion,
    cancelDraw: cancelDraw,
    flyToMe: flyToMe,
    searchNewWsPlace: searchNewWsPlace,
    hideCreateForm: hideCreateForm,
    createWorkspace: createWorkspace,
    showCreateForm: showCreateForm,
    searchPlaces: searchPlaces,
    startDrawRegion: startDrawRegion,
    offlineRegionDialog: offlineRegionDialog,
    addPlace: addPlace,
    addTitleToPlace: addTitleToPlace,
    // 带默认参的零参动作：必须包一层——dispatch 传的是 (el, e)，
    // 直映射会把按钮元素当第一个参数（曾导致 [object HTMLButtonElement]）
    addPlaceTitleRow: function () { addPlaceTitleRow('', '', null); },
    removePlaceTitleRow: function (el) { removePlaceTitleRow(el); },
    markPlaceRootRow: function (el) { markPlaceRootRow(el); },
    setRootPerson: function (el) { setRootPerson(el.dataset.id); },
    openPlaceModal: function (el) { openPlaceModal(el && el.dataset ? (el.dataset.id || null) : null, null); },
    openKeySettings: function () { openKeySettings(); },
    closePlaceModal: closePlaceModal,
    confirmPlace: confirmPlace,
    deletePlace: deletePlace,
    editPlace: editFromCard,
    // 带参动作（元素自身携带 data-* 参数）
    deletePersonById: function (el) { deletePersonById(el.dataset.id); },
    openGraph: openGraph,
    autoFillRelations: function () { autoFillRelations(); },
    importData: importData,
    exportData: exportData,
    clearAll: clearAll,
    showStartup: showStartup,
    closeInfoCard: closeInfoCard,
    showRelForm: function () { showRelForm(null); },
    hideRelForm: hideRelForm,
    saveRelation: saveRelation,
    editRelation: function (el) { editRelation(Number(el.dataset.i)); },
    editFromCard: editFromCard,
    closeGraph: closeGraph,
    editFromMenu: editFromMenu,
    deleteFromMenu: deleteFromMenu,
    retryPlaceSearch: retryPlaceSearch,
    hintCoords: hintCoords,
    checkSources: runSourceCheck,
    backToRegion: backToRegion,
    // 带参动作（元素自身携带 data-* 参数）
    pickEmoji: function (el) { pickEmoji(el); },
    enterWorkspace: function (el) { enterWorkspace(el.dataset.id); },
    deleteWorkspace: function (el) { deleteWorkspace(el.dataset.id); },
    switchRegion: function (el) { switchRegion(el.dataset.id); },
    deleteRegion: function (el) { deleteRegion(el.dataset.id); },
    jumpToPerson: function (el) { jumpToPerson(el.dataset.id); },
    flyToPlace: function (el) { flyToPlace(Number(el.dataset.i)); },
    pickNewWsPlace: function (el) { pickNewWsPlace(Number(el.dataset.i)); },
    deleteRelation: function (el) { deleteRelation(Number(el.dataset.i)); }
};

function dispatchAction(el, e) {
    var fn = ACTIONS[el.getAttribute('data-act')];
    if (fn) fn(el, e);
}

document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (el) dispatchAction(el, e);
    var m = document.getElementById('contextMenu');
    if (m && m.classList.contains('show') && !m.contains(e.target)) hideContextMenu();
    var sb = document.querySelector('.search-bar');
    var sr = document.getElementById('searchResults');
    if (sr && sr.classList.contains('show') && !sb.contains(e.target) && !sr.contains(e.target)) hideSearch();
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        if (draw.active) cancelDraw();
        var modalOpen = document.getElementById('placeModal').classList.contains('show');
        hideDialog();
        closePlaceModal();
        hideRelForm();
        closeInfoCard();
        closeGraph();
        hideSearch();
        hideContextMenu();
        // 放置模式下（弹窗未开）Escape = 退出放置，否则会悬死在无墙状态且界面无提示
        if (addMode && !modalOpen) {
            addMode = false;
            syncTileBounds(); /* 恢复瓦片范围 + 平移硬墙 */
            toast('已退出放置模式');
        }
        return;
    }
    // role="button" 的 div 卡片（动态生成、外层带删除按钮无法用 <button> 包裹）：
    // Enter / 空格触发，键盘可达。
    // 注意守卫：焦点在原生控件（卡片内的删除按钮等）上时，回车/空格是它自己的
    // 激活语义，若不拦住会冒泡命中外层卡片，造成"删除 + 进入"双重动作。
    if (e.key === 'Enter' || e.key === ' ') {
        var t = e.target;
        if (t.closest && t.closest('button, a, input, select, textarea')) return;
        var c = t.closest ? t.closest('[role="button"][data-act]') : null;
        if (c) { e.preventDefault(); dispatchAction(c, e); }
    }
});

// 输入类事件改由 JS 绑定（替代原内联 oninput/onkeydown/onchange）
document.getElementById('searchInput').addEventListener('input', function () { onSearch(this.value); });
document.getElementById('wsPlaceInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') searchNewWsPlace();
});
document.getElementById('placeInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') searchPlaces();
});
document.getElementById('importFile').addEventListener('change', function () { handleImport(this); });
document.getElementById('graphRootSelect').addEventListener('change', function () { setRootPerson(this.value); });

document.addEventListener('DOMContentLoaded', boot);
