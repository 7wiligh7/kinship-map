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
    PADDING: [40, 40],   // 适配内边距（像素）
    MAX_ZOOM: 15,        // 仅用于「无区域时看全部人物」的视野上限（越小看到范围越大）；
                         // 有区域时视野由区域外扩范围 + 缩放下限共同决定
    EXPAND: 0.5          // 区域边界外扩比例（0.5 ≈ 四周各扩 50% 跨度），
                         // 同时用于：默认视野 / 瓦片加载范围 / 平移硬边界 / 缩放下限
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
    ATTRIBUTION: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics'
  },

  // 启动时尝试加载的数据文件（如 data/buildings.json 模板；不存在则忽略）
  DATA_URL: 'data/buildings.json',

  // 空存储时自动注入演示数据
  DEMO_ON_EMPTY: true,

  // 瓦片是否只加载当前区域范围。默认关闭：瓦片跟随视口加载，
  // 缩放到最小时区域外也始终有图、不会留白。
  // 开启可省流量，但缩小时区域外会出现空白（不推荐）。
  TILE_LIMIT_TO_REGION: false,

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
