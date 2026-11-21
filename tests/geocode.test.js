require(require('path').join(__dirname, '..', 'geocode.js'));

var G = globalThis.Geocode;
var pass = 0, fail = 0;

function eq(got, want, msg) {
    if (got === want) { pass++; }
    else { fail++; console.log('FAIL: ' + msg + ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }
}
function deepEq(got, want, msg) {
    eq(JSON.stringify(got), JSON.stringify(want), msg);
}

/* ===== parseCoords 坐标直输 ===== */

function pcObj(lat, lng, datum, order) {
    return { lat: lat, lng: lng, datum: datum || 'wgs', order: order || 'latlng' };
}

deepEq(G.parseCoords('31.0,111.0'), pcObj(31, 111), '英文逗号（纬度在前，WGS 原样）');
deepEq(G.parseCoords(' 31.0 ， 111.0 '), pcObj(31, 111), '全角逗号+空白');
deepEq(G.parseCoords('-31.25, 111.75'), pcObj(-31.25, 111.75), '负纬度');
eq(G.parseCoords('李家村'), null, '非坐标');
eq(G.parseCoords('91.0,111.0'), null, '纬度超 90 拦截');
eq(G.parseCoords('31.0,181.0'), null, '经度超 180 拦截');
eq(G.parseCoords('31,111,5'), null, '三段数字不是坐标');

/* 境内「经度,纬度」顺序（高德/腾讯拾取器复制格式）→ 自动识别并按 GCJ-02 纠偏 */
deepEq(G.parseCoords('111.0,31.0'), pcObj(31, 111, 'gcj', 'lnglat'), '境内经度在前→GCJ');
deepEq(G.parseCoords('g:31.0,111.0'), pcObj(31, 111, 'gcj'), 'g: 前缀（纬度在前）');
deepEq(G.parseCoords('g：111.0，31.0'), pcObj(31, 111, 'gcj', 'lnglat'), 'g: 全角冒号+经度在前');
deepEq(G.parseCoords('b:116.403965,39.915119'), pcObj(39.915119, 116.403965, 'bd09', 'lnglat'), 'b: 前缀→BD-09');
deepEq(G.parseCoords('w:111.0,31.0'), pcObj(31, 111, 'wgs', 'lnglat'), 'w: 前缀强制不纠偏');
deepEq(G.parseCoords('w:31.0,111.0'), pcObj(31, 111, 'wgs'), 'w: 前缀（纬度在前）');

/* 境外坐标不纠偏；「经度,纬度」境外只是换序，仍是 WGS-84 */
deepEq(G.parseCoords('35.68,139.69'), pcObj(35.68, 139.69, 'wgs'), '东京（纬度在前）');
deepEq(G.parseCoords('139.69,35.68'), pcObj(35.68, 139.69, 'wgs', 'lnglat'), '东京（经度在前，仅换序）');

/* ===== BD-09 → GCJ-02 ===== */

// 北京一带：BD-09 相对 GCJ-02 向东北偏约 0.005~0.012 度，转换应把两个分量都变小
var bd = [116.403965, 39.915119];
var gOut = G.bd09ToGcj02(bd[0], bd[1]);
var dLng = bd[0] - gOut[0], dLat = bd[1] - gOut[1];
eq(dLng > 0.002 && dLng < 0.015, true, 'BD→GCJ lng 偏移量级');
eq(dLat > 0.002 && dLat < 0.015, true, 'BD→GCJ lat 偏移量级');

// 境外坐标 BD-09 转换仍按公式走（偏移极小）
var bdOut = G.bd09ToGcj02(139.69, 35.68);
eq(Math.abs(bdOut[0] - 139.69) < 0.001, true, '境外 BD→GCJ 近似原样');

/* ===== GCJ-02 ↔ WGS-84 ===== */

// 国内坐标：纠偏后偏移量应在常见量级（约 0.001~0.007 度），且往返一致
var gcj0 = [116.397428, 39.90923]; // 北京一带（GCJ-02 输入）
var wgs = G.gcj02ToWgs84(gcj0[0], gcj0[1]);
var back = G.wgs84ToGcj02(wgs[0], wgs[1]);
eq(Math.abs(wgs[0] - gcj0[0]) > 0.0001, true, '国内坐标应有可见偏移');
eq(Math.abs(wgs[0] - gcj0[0]) < 0.01, true, '偏移量级合理');
eq(Math.abs(back[0] - gcj0[0]) < 1e-6, true, 'wgs→gcj 往返一致 (lng)');
eq(Math.abs(back[1] - gcj0[1]) < 1e-6, true, 'wgs→gcj 往返一致 (lat)');

// 境外坐标：不纠偏，原样返回
deepEq(G.gcj02ToWgs84(139.69, 35.68), [139.69, 35.68], '东京坐标不纠偏');
deepEq(G.wgs84ToGcj02(-0.12, 51.5), [-0.12, 51.5], '伦敦坐标不纠偏');

/* ===== looksChinese ===== */

eq(G.looksChinese('李家村'), true, '中文词');
eq(G.parseCoords('31,111') === null && G.looksChinese('31,111'), false, '数字不算中文');

/* ===== mergeGeoResults 多源合并 ===== */

function r(name, address, lat, lng, bbox) {
    return { name: name, address: address || '', bbox: bbox || null, lat: lat, lng: lng };
}

// 1. 去重：同名且坐标接近（<0.05°）只留优先级高的来源
var g1 = G.mergeGeoResults('李家村', [
    { src: '高德', list: [r('李家村', '湖北省宜昌市', 31.0, 111.0)] },
    { src: 'Esri', list: [r('李家村', 'Yichang, Hubei, China', 31.001, 111.001)] }
], 10);
eq(g1.length, 1, '同名近点去重');
eq(g1[0].src, '高德', '去重保留优先级高的源');
eq(g1[0].name, '李家村', '去重保留优先级源的名字');

// 1b. 不同名的相邻点（~100m）不算重复：村委会和小学可能真的挨着，都保留
var g1b = G.mergeGeoResults('李家村', [
    { src: '高德', list: [r('李家村村委会', '湖北省宜昌市', 31.0, 111.0)] },
    { src: 'Esri', list: [r('Li Jia Cun Primary School', 'Yichang, Hubei', 31.001, 111.001)] }
], 10);
eq(g1b.length, 2, '异名近点不误合并');

// 2. 坐标几乎相同但名字不同：也视为同一点
var g2 = G.mergeGeoResults('李家村', [
    { src: '高德', list: [r('李家村村委会', '', 31.0, 111.0)] },
    { src: '天地图', list: [r('李家村', '', 31.00001, 111.00001)] }
], 10);
eq(g2.length, 1, '同点异名去重（<0.0005°）');

// 3. 中文查询：拼音/英文名结果降权（国内 Esri 搜村名的典型毛病）
var g3 = G.mergeGeoResults('李家村', [
    { src: 'Esri', list: [r('Lijiacun', 'Yichang, Hubei, China', 31.0, 111.0)] },
    { src: '高德', list: [r('李家村', '湖北省宜昌市枝江市', 30.99, 110.99)] }
], 10);
eq(g3[0].src, '高德', '中文查询下中文名优先于拼音名');

// 4. 精确同名最优先
var g4 = G.mergeGeoResults('李家村', [
    { src: '高德', list: [r('李家村文化广场', '', 31.0, 111.0), r('李家村', '', 31.1, 111.1)] }
], 10);
eq(g4[0].name, '李家村', '精确同名排最前');
eq(g4[1].name, '李家村文化广场', '包含关键词次之');

// 5. 地址含词：Esri 返回英文名但地址含中文关键词时仍能排在无关结果前
var g5 = G.mergeGeoResults('枝江', [
    { src: 'Esri', list: [r('Zhijiang', 'Yichang, Hubei, China', 30.5, 111.7), r('Some Place', 'Somewhere else', 40.0, 116.0)] }
], 10);
eq(g5[0].name, 'Zhijiang', '地址命中关键词优先于无关结果');

// 6. 同分时（都只包含关键词、同来源）bbox 跨度小（更具体）者在前
var big = r('王家镇卫生院', '', 31.0, 111.0, { south: 30.5, north: 31.5, west: 110.5, east: 111.5 });
var small = r('王家镇人民政府', '', 31.2, 111.2, { south: 31.19, north: 31.21, west: 111.19, east: 111.21 });
var g6 = G.mergeGeoResults('王家镇', [{ src: 'Esri', list: [big, small] }], 10);
eq(g6[0].name, '王家镇人民政府', 'bbox 更小（更具体）排前');

// 7. 同分且同来源时，无 bbox 的 POI 点视为最具体
var g7 = G.mergeGeoResults('王家镇', [
    { src: 'Esri', list: [r('王家镇卫生院', '', 31.0, 111.0, { south: 30.9, north: 31.1, west: 110.9, east: 111.1 }), r('王家镇汽车站', '', 31.02, 111.02)] }
], 10);
eq(g7[0].name, '王家镇汽车站', 'POI 点（无 bbox）排在模糊大 bbox 前');

// 8. limit 截断
var g8 = G.mergeGeoResults('王', [
    { src: 'Esri', list: [r('王村', '', 31.0, 111.0), r('王庄', '', 31.1, 111.1), r('王集', '', 31.2, 111.2)] },
    { src: '高德', list: [r('王湾', '', 31.3, 111.3)] }
], 3);
eq(g8.length, 3, 'limit 截断');

// 9. 缺坐标的脏数据被过滤
var g9 = G.mergeGeoResults('李家村', [
    { src: 'Esri', list: [r('李家村', '', null, 111.0), r('李家湾', '', 31.0, 111.0)] }
], 10);
eq(g9.length, 1, '缺坐标结果被过滤');

// 10. 结果带 src 标签
var g10 = G.mergeGeoResults('李家村', [{ src: '天地图', list: [r('李家村', '', 31.0, 111.0)] }], 10);
eq(g10[0].src, '天地图', '结果带来源标签');

console.log('geocode.test: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
