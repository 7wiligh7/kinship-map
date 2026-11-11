// 亲属关系地图 — 全局配置
// 默认值均为非私人通用值；私人坐标/数据永不写入本文件。
var CONFIG = {
  // 地图中心（非私人默认坐标，S7 演示数据就绪后与之对齐）
  CENTER: [31.0, 111.0],
  ZOOM: 17,
  MIN_ZOOM: 10,
  // 放大阈值：地图最大放大级（地图和瓦片层都在此级封顶，不会再请求更高级别）。
  // 底图源按区域供图——大城市 z19 仍有真图，但乡村/县城 z19 会返回
  // 「Map data not yet available」占位图；设为 18 可避免在乡村区域出现该提示。
  // 若你的区域影像清晰且想看更细，可调回 19。
  MAX_ZOOM: 18,

  // 进入档案/切换区域时的默认视野
  VIEW: {
    MAX_ZOOM: 15,        // 仅用于「无区域时看全部人物」的视野上限（越小看到范围越大）；
                         // 有区域时视野由区域外扩范围 + 缩放下限共同决定
    MARGIN_KM: 10        // 框定/切换区域后，四周固定预留的公里数（视野 = 区域 + 10km）。
                         // 视野越大一次要拉的瓦片越多、加载越慢；想看得更少调小即可
  },

// 区域尺寸校验。手绘闭合时不合规就自动撤销并提示重新划定；
  // 地名搜索建区超上限时弹窗询问（仍可创建）。一般一个村/镇远小于上限。
  REGION_MAX_SPAN_KM: 20,   // 跨度上限（km），市级约 100km
  REGION_MIN_SPAN_KM: 0.05, // 跨度下限：小于此值视为顶点几乎重合
  REGION_MIN_AREA_KM2: 0.01, // 面积下限（km²，约 1 公顷）：小于此值视为共线、未围出面积

  TILE: {
    // 默认网络卫星底图（免注册免 key）
    NETWORK: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    // 可选本地瓦片目录，例如 'tiles/{z}/{x}/{y}.png'；留空不加载
    LOCAL: '',
    ATTRIBUTION: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',

    // ---- 加载优化 ----
    // 统一使用 256px 原生瓦片：所有缩放级别都是同一套影像，不会"换级换图"。
    // 空闲时把「放大一级要用的瓦片」提前下到本地缓存：下次缩放直接出图
    PREFETCH: true,
    // 原生最大缩放级：超过该级由 Leaflet 放大低一级瓦片，不再请求更高层。
    // 乡村地区 z18 常是「Map data not yet available」占位图，调成 17 可把
    // 最大级的请求数降到 1/4（画面略糊，换来明显更快）。
    MAX_NATIVE_ZOOM: 18,
    // 视口外多保留几圈瓦片：拖动时更少空白，代价是流量略增（0 最省，4 最顺）
    KEEP_BUFFER: 3,
    // true = 拖动/缩放停下后再请求瓦片（避免拖拽过程中狂发请求）；false = 实时请求
    UPDATE_WHEN_IDLE: true,
    // 瓦片落盘缓存（IndexedDB）：第二次打开、反复拖动同一片区域都不再走网络，
    // 断网也能显示看过的范围。缓存满后按最久未用淘汰。
    CACHE: true,
    // 缓存换代号：底图影像更新导致新旧图"拼花"时 +1，会清空全部已缓存瓦片重新下载。
    // （瓦片按 URL 永久缓存，而 Esri/图源会不定期更新同一 URL 的影像）
    CACHE_EPOCH: 2,
    // 区域离线包：把当前区域范围的瓦片一次性下到本地（IndexedDB）
    // 一次最多下多少片（防止 20km 大区域把硬盘下满）；每片约 12KB
    OFFLINE: {
        MAX_TILES: 2500,
        CONCURRENCY: 4,
        AVG_TILE_KB: 12
    },
    CACHE_MAX: 6000,   // 最多缓存多少片（每片约 12KB ≈ 70MB），超出淘汰最旧的一半
    // 加载失败时的占位图（1×1 透明 GIF），避免破图标
    ERROR_TILE: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  },

  // 启动时尝试加载的数据文件（如 data/buildings.json 模板；不存在则忽略）
  DATA_URL: 'data/buildings.json',

  // 空存储时自动注入演示数据
  DEMO_ON_EMPTY: true,

  // 瓦片是否只加载当前区域范围。默认关闭：瓦片跟随视口加载，
  // 缩放到最小时区域外也始终有图、不会留白。
  // 开启可省流量，但缩小时区域外会出现空白（不推荐）。
  TILE_LIMIT_TO_REGION: false,

  // 地名搜索（搜索结果只用于定位，不会自动建区域）
  // 并行请求下列所有「已配置」的源（没填 key 的国内源自动跳过），合并去重、按相关度排序。
  //
  // ⚠️ key 不要写进本文件（本文件是仓库文件，会公开）：
  //    在应用内点侧栏地名搜索框旁的「⚙」填写，只存本浏览器 localStorage；
  //    本文件里的两项一律留空提交。
  // 国内村镇级搜索推荐填高德或天地图 key（个人均免费，应用内 ⚙ 即可填）：
  //   高德：https://console.amap.com 注册 → 创建应用 → 添加 Key → 服务平台选「Web服务」→ 复制 key
  //   天地图：https://console.tianditu.gov.cn 注册 → 创建应用 → 类型「浏览器端」→ 复制 tk
  //   amap      高德 POI，GCJ-02 → 自动转 WGS84，国内村/镇覆盖最好（需 KEY）
  //   tianditu  天地图地理编码，WGS84 免纠偏，国内官方服务（需 KEY）
  //   photon    Photon（OSM 数据），免 key 免注册，大陆可达性实测较好，
  //             村名覆盖不如高德全，作为「不接入」方案；WGS84 免纠偏
  //   esri      免 key，WGS84，与底图同源；国内村镇覆盖差（常返回拼音/不准结果），作兜底
  //   nominatim 免 key，WGS84（OSM；大陆通常不可达，连续失败会自动跳过；海外可用）
  // 不接入任何 key 也能用的两条路：
  //   1) photon 源（上面的默认顺序已启用，搜不到时说明 OSM 未收录该村名）
  //   2) 高德官方「坐标拾取器」（lbs.amap.com/tools/picker，免费网页免注册）搜地名 →
  //      复制坐标 → 粘贴到搜索框，自动识别 GCJ-02 并纠偏；百度拾取器粘贴加前缀 b:，
  //      GPS 原始坐标强制不纠偏加前缀 w:
  // 也可直接输入 "纬度,经度"（WGS-84，旧行为不变）
  GEOCODE: {
    PROVIDERS: ['amap', 'tianditu', 'photon', 'esri', 'nominatim'],
    AMAP_KEY: '',      // 留空；要用的 key 请在应用内 ⚙ 填（只存本机，勿提交）
    TIANDITU_KEY: '',  // 同上
    LIMIT: 6,
    LANGUAGE: 'zh-CN',
    EMAIL: '',
    // 单个源超时：国内到境外服务常 2~5 秒才失败，设太长会让用户干等
    TIMEOUT: 5000
  },

  // localStorage 数据键
  STORAGE_KEY: 'kinmap_data'
};
