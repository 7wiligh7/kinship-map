// 亲属关系地图 — 地名搜索的纯函数部分（独立可用、可测试）
// 与 kinship.js 同样的隔离写法：浏览器挂 window.Geocode，node 直接 require 后取 globalThis.Geocode。
// 网络请求部分仍在 app.js（依赖 fetch / CONFIG / Leaflet 地图中心）。
(function (global) {
  'use strict';

  /* ===== 坐标直输：`纬度,经度` 与拾取器粘贴 =====
   * 中国境内经纬度范围天然不重叠（纬 18~54，经 73~136），
   * 因此粘贴「经度,纬度」顺序（高德/百度拾取器的复制格式）可以可靠识别。
   * 坐标基准：
   *   无前缀 + 纬度在前        → WGS-84 原样（旧行为不变）
   *   无前缀 + 经度在前(境内)  → 视为高德/腾讯拾取的 GCJ-02，自动纠偏
   *   g: 经度,纬度（或纬度,经度）→ 高德/腾讯 GCJ-02 纠偏
   *   b: …                    → 百度 BD-09 纠偏
   *   w: …                    → 强制按 WGS-84 原样（GPS 原始坐标）
   * 返回 null 或 { lat, lng, datum, order }（未转换的原始值）。
   */

  var CN_LAT_MIN = 17.5, CN_LAT_MAX = 54.5, CN_LNG_MIN = 72.5, CN_LNG_MAX = 136.5;

  function inRange(v, a, b) { return v >= a && v <= b; }

  function parseCoords(q) {
    var s = String(q || '').trim();
    var datum = 'wgs';
    var forced = false; // 显式前缀：w: 必须原样，g:/b: 必须转换，不做境内猜测
    var m = s.match(/^([gwbGWB])\s*[:：]\s*(.*)$/);
    if (m) {
      datum = { g: 'gcj', b: 'bd09', w: 'wgs' }[m[1].toLowerCase()];
      forced = true;
      s = m[2];
    }
    var n = s.match(/^(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (!n) return null;
    var a = parseFloat(n[1]), b = parseFloat(n[2]);
    if (isNaN(a) || isNaN(b)) return null;

    var lat, lng;
    var aIsLat = inRange(a, -90, 90);
    var pairCN = (inRange(a, CN_LAT_MIN, CN_LAT_MAX) && inRange(b, CN_LNG_MIN, CN_LNG_MAX));
    var pairCNRev = (inRange(a, CN_LNG_MIN, CN_LNG_MAX) && inRange(b, CN_LAT_MIN, CN_LAT_MAX));
    if (aIsLat && (datum !== 'wgs' ? true : pairCN || !pairCNRev)) {
      // 纬度在前：显式前缀一律按此顺序；无前缀时境内 pairCN 优先，境外维持旧行为
      lat = a; lng = b;
    } else if (aIsLat || inRange(b, -90, 90)) {
      // 经度在前（高德/百度拾取器复制格式）
      lat = b; lng = a;
      if (datum === 'wgs' && !forced && pairCNRev) {
        datum = 'gcj'; // 境内无前缀经度在前 → 视为高德/腾讯拾取粘贴
      }
    } else {
      return null; // 两个数都当不了纬度
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat: lat, lng: lng, datum: datum, order: (lat === a) ? 'latlng' : 'lnglat' };
  }

  /* ===== GCJ-02（高德/腾讯）↔ WGS-84（Esri 底图），迭代反算 ===== */

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

  /* BD-09（百度）→ GCJ-02（标准公开公式）。境外无偏移概念，原样返回 */
  var BD_PI_X = Math.PI * 3000.0 / 180.0;

  function bd09ToGcj02(lng, lat) {
    if (gcjOutOfChina(lng, lat)) return [lng, lat];
    var x = lng - 0.0065, y = lat - 0.006;
    var z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * BD_PI_X);
    var theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * BD_PI_X);
    return [z * Math.cos(theta), z * Math.sin(theta)];
  }

  /* ===== 多源结果合并 =====
   * q          查询词
   * groups     [{ src:'高德', list:[{name,address,bbox,lat,lng}] }]，数组顺序即来源优先级
   * limit      最多返回条数
   * 策略：去重（同名且坐标接近 / 坐标几乎相同）→ 按相关度排序 → 截断。
   * 排序因子：精确同名 > 名称含词 > 地址含词 > 不相关；
   *          中文查询却返回拼音/英文名的结果降权（国内 Esri 搜村名的典型毛病）；
   *          同分时来源优先级高者优先，再比 bbox 跨度（越小越具体）。
   */

  function looksChinese(q) {
    return /[\u4e00-\u9fff]/.test(String(q || ''));
  }

  function sameSpot(a, b, tolDeg) {
    return Math.abs(a.lat - b.lat) <= tolDeg && Math.abs(a.lng - b.lng) <= tolDeg;
  }

  function matchRank(r, q) {
    var name = String(r.name || '');
    var addr = String(r.address || '');
    if (name === q) return 0;
    if (name.indexOf(q) >= 0) return 1;
    if (addr.indexOf(q) >= 0) return 2;
    return 3;
  }

  function bboxSpan(r) {
    var b = r.bbox;
    if (!b) return -1; // 无 bbox 的 POI 点视为最具体，排最前
    return Math.max(b.north - b.south, b.east - b.west);
  }

  function mergeGeoResults(q, groups, limit) {
    q = String(q || '').trim();
    var out = [];
    var cjkQ = looksChinese(q);
    (groups || []).forEach(function (g, gi) {
      (g && g.list ? g.list : []).forEach(function (r) {
        if (!r || typeof r.lat !== 'number' || typeof r.lng !== 'number' || isNaN(r.lat) || isNaN(r.lng)) return;
        var nameKey = String(r.name || '').trim().toLowerCase();
        var dup = null;
        for (var i = 0; i < out.length; i++) {
          var o = out[i];
          var sameName = nameKey && o._nameKey === nameKey && sameSpot(o, r, 0.05);
          var samePoint = Math.abs(o.lat - r.lat) < 0.0005 && Math.abs(o.lng - r.lng) < 0.0005;
          if (sameName || samePoint) { dup = o; break; }
        }
        if (dup) return; // 高优先级来源已收录（约 50m 内视为同一点）
        out.push({
          name: r.name || q,
          address: r.address || '',
          bbox: r.bbox || null,
          lat: r.lat,
          lng: r.lng,
          src: g.src || '',
          _nameKey: nameKey,
          _prio: gi,
          _rank: matchRank(r, q) + (cjkQ && !looksChinese(r.name) ? 10 : 0),
          _span: bboxSpan(r)
        });
      });
    });
    out.sort(function (a, b) {
      if (a._rank !== b._rank) return a._rank - b._rank;
      if (a._prio !== b._prio) return a._prio - b._prio;
      if (a._span !== b._span) return a._span - b._span;
      return (a.name || '').length - (b.name || '').length;
    });
    var n = Math.max(1, limit || 12);
    out = out.slice(0, n);
    out.forEach(function (r) { delete r._nameKey; delete r._prio; delete r._rank; delete r._span; });
    return out;
  }

  global.Geocode = {
    parseCoords: parseCoords,
    gcjOutOfChina: gcjOutOfChina,
    wgs84ToGcj02: wgs84ToGcj02,
    gcj02ToWgs84: gcj02ToWgs84,
    bd09ToGcj02: bd09ToGcj02,
    looksChinese: looksChinese,
    mergeGeoResults: mergeGeoResults
  };
})(typeof window !== 'undefined' ? window : globalThis);
