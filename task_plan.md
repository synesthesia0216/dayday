# Task Plan: Day-Day 记账板块(标准版)

- 规格: docs/superpowers/specs/2026-11-18-dayday-bookkeeping-panel-design.md(已批准)
- 基准提交: c29987d(Stage 1 已入库)
- 开始: 2026-11-18

## Goal

新增「记账」面板:侧边抽屉入口、B 统计先行布局、快速记账弹层(弹层内数字键盘)、月度总览+分类条形图+按日账单列表、编辑/删除。纯离线 IndexedDB,5 套主题适配。

## Phases

| # | 阶段 | 状态 |
|---|------|------|
| 1 | 数据层:db.js +ledger store(DB_VER 2)+ db.ledger API | complete(两份副本都改了) |
| 2 | ledger.js 模块:分类/统计计算/渲染/弹层/月份切换 | complete |
| 3 | index.html:抽屉入口 + panel-ledger + script 引用 | complete |
| 4 | style.css:面板/弹层/条形图样式 | complete |
| 5 | app.js:面板切换钩子(goPanel 集成,最小改动) | complete |
| 6 | 浏览器自动化测试(Edge headless + CDP) | complete(功能 36/36、布局 15/15、控制台 0 错误) |
| 7 | cap sync + gradlew assembleDebug 构建 APK | complete(BUILD SUCCESSFUL 3m42s,APK 7.98MB 含 ledger.js;修复了三个环境问题:gradle 缓存损坏/JDK 21 缺失→改用 JDK 17/Android SDK 缺失→重装至 E:\Android\sdk) |

## Key Decisions(来自规格)

- amount 存整数分;date 为 'YYYY-MM-DD';ledger 加入 DATA_STORES(full/lite 隔离)
- 分类固定:支出 8 类 / 收入 3 类(emoji + 中文)
- 面板:月份切换 → 大数字卡(支出/收入/结余/环比/日均)→ 分类条形图(纯 CSS)→ 最近账单(8 条可展开)
- 弹层:支出/收入 tab → 分类九宫格 → 数字键盘 → 备注 + 原生 date input → ✓ 记一笔(金额 0 或无分类置灰)
- 点条目 → 编辑/删除;编辑复用弹层预填
- 统计纯函数,进面板实时算,整数分运算
- 全部用 var(--*) token;backdrop-filter 仅弹层;入场动画切 tab 不重播

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| Gradle 构建失败 "Could not extract native JNI library"(gradle-8.10-all 缓存损坏:zip 缺失但 .ok 标记在) | 1 | 删除损坏 dists 目录失败(文件被残留 Gradle 守护进程锁定)→ taskkill 杀掉 java.exe(PID 29168)后 rm -rf,重新下载发行版 |
| Gradle 构建失败 "org.gradle.java.home=D:/jdk-21.0.11 invalid"(D 盘 JDK 21 已被删除) | 2 | 系统仅有 JDK 24(Gradle 8.10 不支持);改用 ~/.jdks/ms-17.0.17(JDK 17,满足 AGP 8.x 最低要求),更新 android/gradle.properties |
