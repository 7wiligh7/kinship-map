// 亲属关系地图 — 全局配置
// 默认值均为非私人通用值；私人坐标/数据永不写入本文件。
var CONFIG = {
  // 地图中心（非私人默认坐标，S7 演示数据就绪后与之对齐）
  CENTER: [31.0, 111.0],
  ZOOM: 17,
  MIN_ZOOM: 10,
  MAX_ZOOM: 19,

  // 进入档案/切换区域时的默认视野
  VIEW: {
    PADDING: [40, 40],   // 适配内边距（像素）
    MAX_ZOOM: 15,        // 区域较小时最多放大到的层级（越小，看到的范围越大）
    EXPAND: 0.5,         // 区域边界外扩比例（0.5 ≈ 四周各扩 50% 跨度）
    TILE_MARGIN: 1.0     // 瓦片比实际视野再外扩的比例，避免扩大后边缘留白
  },

  TILE: {
    // 默认网络卫星底图（免注册免 key）
    NETWORK: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    // 可选本地瓦片目录，例如 'tiles/{z}/{x}/{y}.png'；留空不加载
    LOCAL: '',
    ATTRIBUTION: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics'
  },

  // 启动时尝试加载的数据文件（如 data/buildings.json 模板；不存在则忽略）
  DATA_URL: 'data/buildings.json',

  // 空存储时自动注入演示数据
  DEMO_ON_EMPTY: true,

  // 瓦片只加载当前区域范围，范围外不请求（省流量）
  TILE_LIMIT_TO_REGION: true,

  // 地名搜索（用搜索结果新建区域）
  // PROVIDERS: 按顺序尝试，全部失败才报错
  //   esri      免 key，WGS84，与底图同源（海外/部分国内网络可达）
  //   nominatim 免 key，WGS84（OSM；大陆通常不可达）
  //   amap      需 KEY，GCJ-02 → 自动转 WGS84（大陆推荐）
  // 也可直接在搜索框输入 "纬度,经度"（如 31.0,111.0）免网络建区域
  GEOCODE: {
    PROVIDERS: ['esri', 'nominatim'],
    AMAP_KEY: '',
    LIMIT: 6,
    LANGUAGE: 'zh-CN',
    EMAIL: '',
    TIMEOUT: 8000
  },

  // localStorage 数据键
  STORAGE_KEY: 'kinmap_data'
};
