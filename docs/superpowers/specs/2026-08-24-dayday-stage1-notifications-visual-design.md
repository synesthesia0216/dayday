# Day-Day 第一阶段升级设计：本地通知推送 + 视觉大改版

- 日期：2026-08-24
- 状态：已批准（含 7 条优化点，见文末）
- 范围：第一阶段 = 通知推送 + 页面视觉/月相升级；第二阶段（等级扩展 + 素材扩充）另行设计

## 背景与目标

Day-Day 观星台是纯离线 Capacitor Android 应用（com.dayday.app），数据存 IndexedDB，无外部依赖约束。本期目标：

1. 让坐标日志中的提醒真正在系统层面弹出通知
2. 观星台改为「月相 Hero 式」布局，整体视觉大改版（深蓝夜空精修）
3. 月相绘制四维精修：月面纹理、辉光光晕、28 档相位细化、动态效果
4. 四个功能区的交互/视觉调整（不改变数据模型与业务规则）

## A. 提醒推送

### 方案

- 官方 `@capacitor/local-notifications@^5`（与 Capacitor 5.7.8 匹配），与现有 filesystem 插件同模式：npm 安装 → `cap sync` 自动注册原生插件并更新 capacitor.plugins.json
- 浏览器端提供 UMD 包装 `public/plugins/local-notifications.js`（同 filesystem.js 模式），无插件环境静默跳过系统通知，应用内列表照常

### 通知渠道与权限

- Android 渠道 `dayday-reminders`（启动时创建，默认重要级别）
- AndroidManifest.xml 增加 `POST_NOTIFICATIONS`（API 33+ 运行时权限）
- 首次保存提醒时：`checkPermissions()` → 未定则 `requestPermissions()`；拒绝则 toast 提示「提醒将仅在应用内显示」，不报错
- 调度时 `allowWhileIdle: true`，防省电模式延迟

### 调度规则

- 每条提醒 2 条通知，ID 规则：`due-{id}`（到点）、`adv-{id}`（提前 1 天，固定 20:00）
- 边界情况：`adv` 时间若 ≤ 当前时间（如当晚保存、提醒在 24 小时内）→ 跳过不排，仅排 `due`
- 时间转换：`datetime-local` 字符串按本地时区 `new Date()` 解析，不再做任何时区偏移
- 通知文案：`due` → 标题「⏰ {title}」、正文「该观测了」；`adv` → 标题「🌙 {title}」、正文「明天 {HH:mm} 到点」

### 生命周期

| 操作 | 行为 |
|---|---|
| 新建提醒 | 排 `due` + `adv`（若在未来） |
| 编辑提醒 | `cancel([due, adv])` → 按新时间重排 |
| 删除 / 完成 | `cancel([due, adv])` |
| App 启动 | resync：`getPending()` → 取消全部 pending → 重排所有未完成提醒（已有提醒零迁移自动补排，覆盖系统重启/应用升级丢通知的情况） |
| 点击通知 | 打开 App 并切到坐标日志面板（`localNotificationActionPerformed` 监听） |

### 改动文件

- package.json（+@capacitor/local-notifications）
- public/vendor/local-notifications.js（新增；目录为 vendor/ 而非 plugins/——Capacitor CLI 会把 webDir/plugins 当 Cordova 插件暂存目录无条件删除）
- public/vendor/filesystem.js（从 public/plugins/ 移入）
- public/capacitor.js（新增，补上缺失的 Capacitor 运行时）
- public/index.html（script 引用）
- public/js/app.js（调度模块：schedule / cancel / resync / 权限 / 监听）
- android/app/src/main/AndroidManifest.xml（+POST_NOTIFICATIONS）
- android/app/src/main/assets/capacitor.plugins.json（cap sync 自动更新）
- MainActivity.java 无需改动

## B. 观星台新布局（月相 Hero 式）

```
┌──────────────────────────┐
│ 时间行：20:35 · 8月24日 盈凸月 │  ← 保留现有 clock，精修
│                          │
│         ◐ 大月相          │  ← Hero canvas，min(40vw, 200px)
│      盈凸月 / Waxing       │  ← 主相位名 + 英文名
│   光照 87% · 月龄 11 天    │
│   ┌───┐ ┌───┐ ┌───┐      │
│   │连击│ │等级│ │笔记│      │  ← 三列数据卡（含 XP 进度条）
│   └───┘ └───┘ └───┘      │
│ ┌─打卡卡─┐ ┌─周报卡─┐     │  ← 并排；打卡卡内嵌生日横幅（若有）
│ └───────┘ └───────┘     │
│ ┌─日历卡（全宽）────────┐  │  ← 可切换月份
│ ┌─观测热力图（全宽）─────┐  │
│ ┌─月相分布─┐ ┌字迹星轨─┐   │
│ [分享今日星图]              │  ← 保留，移到统计区下方
└──────────────────────────┘
```

- 大月相居中成为视觉主角，名称/光照/月龄紧跟其下
- 日历卡全宽（手机并排会挤，原右列日历移入信息流）
- 窄屏（<380px）三列数据卡保持三列、缩小字号；Hero 尺寸响应式
- 现有 weeklyCard、heatmap、moodDist、wordTrend 元素复用，仅重排容器结构

## C. 月相渲染精修

### 1. 相位细化（8 → 28 档）

- `moon-calc.getPhase` 已输出连续相位；新增 28 档映射（每档约 12.86°）
- 8 个主相位名不变（朔/娥眉/上弦/盈凸/满/亏凸/下弦/残月），28 档只用于月形绘制与光照百分比的平滑细分
- 光照 % 与月龄展示取连续值，不再只有 8 档跳变

### 2. 月面纹理（程序化，无图片资源）

- 离屏 canvas 生成 256px 月面纹理，固定随机种子：
  - 月海暗斑：低频噪声圆斑（静海、雨海等意象，不追求天文精确）
  - 环形山：约 15 个椭圆（暗底 + 亮边），大小/位置由种子确定
- 渲染流程：画满月纹理（裁剪为圆）→ 按相位角叠加明暗界线（terminator 阴影渐变）→ 暗面压暗
- **性能**：纹理只在首次生成时绘制一次并缓存离屏 canvas；月形变化才重绘，呼吸动画不触发重绘

### 3. 辉光光晕（CSS 实现）

- 月亮容器外圈 radial-gradient 光晕，强度随光照 % 变化（满月最强、新月最弱）
- 暖白带金色调，与 --gold 呼应；不占 canvas 重绘开销

### 4. 动态效果

- 月亮呼吸：CSS transform scale 1.00↔1.02，6s ease-in-out 循环（不逐帧重绘 canvas）
- 背景星空：2~3 颗星 CSS opacity 闪烁（省电，不做全背景旋转）
- 页面入场：卡片依次淡入上移（stagger 300ms），仅在 App 启动/会话首次进入观星台时播放，切 tab 不重播

## D. 功能调整（仅交互与视觉，不改数据模型与业务规则）

- **打卡与连击**：心情选择升级为大 emoji 九宫格（在现有心情映射上扩展），选中即打卡，打卡成功按钮脉冲 + toast；连击卡配星轨/火焰意象装饰
- **笔记与日记**：星图卡片加类型色标（灵感/随笔/草稿/摘录/其他各一色），无图卡片用相位 emoji + 渐变封面；搜索 chips 选中态升级；编辑弹窗视觉统一
- **书库与图鉴**：故事卡片分类色带；随机故事按钮触发星闪动效；收藏按钮点击星形填充动画
- **登录与个人化**：登录页星空背景 + 浮动月相装饰；星名卡展示精修；设置/个人资料区统一新视觉

## E. 视觉系统（深蓝夜空精修）

- 配色：保留深蓝基调与 --gold 金色点缀，背景升级为多层级渐变（#0d1026 → #080a1c → #05060f）
- 玻璃拟态克制使用：**仅 Hero 与弹窗**用 backdrop-filter blur；普通卡片用半透明纯色 rgba(255,255,255,0.03~0.05) + 1px 细边框 + 顶部微光边线（低端机滚动不卡）
- 圆角：卡片 16~20px、按钮 12px；间距按 8px 网格系统化
- 动效：统一 --ease 曲线，150~300ms
- 字体不变（LXGW WenKai Lite 已内嵌 APK，离线约束下不引入新字体）

## F. 兼容性与测试

### 浏览器自动化测试（Edge headless + CDP）

- 矩阵：full/lite 两种登录 × 桌面/移动视口 × 六个面板逐一检查
- 月相：28 档光照值正确、纹理渲染无报错、辉光层级正常
- 分享卡片回归：多轮测试（有/无今日日记、无月相数据、连点、移动视口）——与升级后的界面一起回归

### APK 构建与真机验证

- `gradlew assembleDebug` 构建通过
- 通知功能必须在真机/模拟器验证（浏览器无法触发系统通知），验证清单：
  1. 首次保存提醒弹出权限请求
  2. 到点通知弹出、点击进入坐标日志
  3. 提前 1 天通知在 20:00 弹出
  4. 编辑/删除/完成后通知正确取消
  5. 重启 App 后通知仍保留（resync）
- 若本机无模拟器/真机，构建出 APK 由用户在手机上安装验证

## 优化点记录（设计评审时纳入）

1. adv 通知落在过去则跳过
2. 月面纹理离屏渲染一次，动画用 CSS transform，不逐帧重绘 canvas
3. backdrop-filter 仅 Hero/弹窗使用
4. 日历卡全宽；Hero 尺寸 min(40vw, 200px)
5. 入场动画仅在启动/首访播放
6. 28 档仅用于月形/光照细分，主相位名保持 8 个
7. 通知渠道 dayday-reminders；启动 resync 自动补排已有提醒；allowWhileIdle

## 文件改动总览

- package.json：+@capacitor/local-notifications@^5
- public/capacitor.js：新增（Capacitor 运行时，此前缺失）
- public/vendor/local-notifications.js：新增（UMD 包装；避开 CLI 删除 webDir/plugins 的坑）
- public/vendor/filesystem.js：自 public/plugins/ 移入
- public/index.html：script 引用 + 观星台结构重排 + 各面板局部调整
- public/js/app.js：通知调度模块 + 月相渲染升级 + 布局渲染 + 各面板交互升级
- public/client/moon-calc.js：28 档相位映射
- public/css/style.css：视觉系统大改
- android/app/src/main/AndroidManifest.xml：+POST_NOTIFICATIONS
- android/app/src/main/assets/capacitor.plugins.json：cap sync 自动更新
- MainActivity.java：不改

## 不在本期范围（第二阶段）

- 等级体系扩展（7 级 → 更多，XP 曲线重调）
- 素材扩充（新秘藏故事、图鉴天体、更多心情/头像素材）
- 第二阶段细节问题到启动时再澄清
