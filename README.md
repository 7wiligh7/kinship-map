<<<<<<< HEAD
# 亲属关系地图

在卫星地图上标注亲属的家，自动推算任意人对「我」的称呼。解决春节走亲戚「不知道怎么叫」的问题。

纯前端：HTML + CSS + 原生 JavaScript + Leaflet，无框架、无构建、无数据库。数据只存浏览器本地。

## 快速开始

```bash
python server.py
# 浏览器打开 http://localhost:8000
```

任何静态服务器都可以（甚至直接双击 index.html 的部分功能可用，但推荐本地服务器）。

## 使用

1. **档案**：首次打开选择「新建档案」（首个档案自带演示数据，横幅可一键清空）；左上角档案栏可「切换」档案，各档案数据互相独立
2. **区域**：档案内先划定区域——侧栏「搜索地名」添加（支持 `纬度,经度` 直输），或「＋ 地图上框选新区域」。**地图瓦片只加载当前区域范围**，区域外不请求，省流量
3. **添加人物**：左上角菜单 → 添加人物 → 点击地图位置 → 填姓名/性别/手填称谓 → 确定。落点在当前区域外时会询问：拓展区域范围 / 归入其他区域
4. **标记「我」**：编辑某人物 → 勾选「标记为“我”」（称谓推算的起点，全档案只能有一个）
5. **建立关系**：点击某人标签 → 信息卡 → 「+ 关系」→ 选择「A 是 B 的 某称谓」→ 添加
6. **看称谓**：建立关系链后，点任意人，信息卡自动显示他对「我」的称呼（红色徽章）；推算不出时显示关系路径（灰色徽章）
7. **人物关系图**：菜单 → 人物关系图，按代际分层展示；悬停高亮到「我」的路径，点击节点飞到地图
8. **搜索**：底部搜索框，支持姓名 / 推算称谓 / 手填称谓
9. **数据管理**：导出 JSON 文件备份；导入 JSON 恢复（覆盖前会确认）。数据在浏览器 localStorage，按档案分键存放

## 数据格式（v3）

```json
{
  "version": 3,
  "regions": [
    { "id": "区域id", "name": "区域名", "polygon": [[纬度, 经度], ...] }
  ],
  "activeRegionId": "当前区域id",
  "persons": [
    { "id": "唯一id", "name": "姓名", "gender": "m|f|空", "titles": ["手填称谓"], "lat": 纬度, "lng": 经度, "regionId": "所属区域id" }
  ],
  "relations": [
    { "from": "人物id", "to": "人物id", "type": "父亲" }
  ],
  "rootId": "标记为“我”的人物id"
}
```

- 关系语义：`from` 是 `to` 的 `type`（如 `{from: 伯伯, to: 爸爸, type: 哥哥}`）
- 可用关系类型见 kinship.js 的 TYPE_GROUPS（祖辈/父辈/平辈/晚辈/姻亲）
- 旧版 `buildings` 数组、无 `regions` 的 v2 数据导入时自动迁移（缺失区域会用人物凸包自动合成）
- 存储键：`kinmap_workspaces`（档案列表）+ `kinmap_data_<档案id>`（各档案数据）

## 称谓引擎 kinship.js

规则表 + 反向逆表 + BFS 最短路径。特点：

- 规则与代码分离，可独立测试、可复用于小程序等其他端
- 最短路径优先、防环、同辈分长幼精确区分（伯父/叔父）
- 推算不出时回退为可读的关系路径（如「孙子的儿子」），支持手填称谓兜底

测试：`node tests/kinship.test.js`（47 条断言）

## 隐私

- 数据仅存浏览器 localStorage，不上传任何服务器
- 导出的 JSON 文件请自行保管
- 演示数据使用非私人坐标；真实坐标建议只存在本地与导出文件中

## 目录

```
index.html      页面骨架
style.css       样式
app.js          应用逻辑（地图/数据层/称谓接入/关系图/搜索）
kinship.js      称谓推算引擎（独立可用）
config.js       配置（中心点/缩放/瓦片源/演示开关）
server.py       本地静态服务器
vendor/leaflet/ Leaflet 1.9.4（本地化，不依赖 CDN）
tests/          引擎测试
```

## 瓦片与地名搜索

默认卫星底图：Esri World Imagery（免注册免 key）。config.js 可切换本地瓦片目录（`tiles/{z}/{x}/{y}.png`）或配置其他网络源。

**瓦片按区域加载**：`TILE_LIMIT_TO_REGION: true` 时，只有当前区域范围内的瓦片会被请求，框选范围外不加载（绘制新区域时临时解除限制，画完自动收紧）。

**地名搜索建区域**（`GEOCODE`）按 `PROVIDERS` 顺序尝试：

| provider | key | 坐标系 | 说明 |
|---|---|---|---|
| `esri` | 免 | WGS-84 | 与底图同源；部分网络下较慢或不可达 |
| `nominatim` | 免 | WGS-84 | OSM；大陆通常不可达 |
| `amap` | 需填 `AMAP_KEY` | GCJ-02 → 自动转 WGS-84 | 大陆推荐 |

另外搜索框可直接输入 `纬度,经度`（如 `31.0,111.0`）免网络建区域。单次请求超时 `TIMEOUT` 毫秒，不会卡在加载中。

## 协作

```bash
git checkout main && git pull            # 开工先同步
git checkout -b feature/xxx             # 从 main 切分支
node tests/kinship.test.js               # 改 kinship.js 必跑（47 条断言）
python server.py                         # 本地验证 http://localhost:8000
git add -A && git commit -m "feat: xxx"
git push origin feature/xxx              # 推分支 → GitHub 提 PR
```

- `main` 始终保持可运行，不完整的功能走分支 + PR
- 提交信息用 `feat:` / `fix:` / `refactor:` / `docs:` 前缀
- 私人数据永不提交：`.gitignore` 已排除 `data/private/`、`config.local.js`、`*.local.json`、含学号的 `.doc/.docx`
=======
# kinship-map
基于地图的亲属信息标记工具
>>>>>>> bc2110fc8f04ed3223de661c8f85ad5f3f0a41b3
