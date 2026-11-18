# Findings: Day-Day 记账板块

## 代码结构要点

- 面板:index.html 中 `<section class="panel" id="panel-xxx">`,导航 `<a class="nav-link" data-panel="xxx">`;切换走 goPanel(name),app.js 内
- 数据层:public/client/db.js — `STORES` 数组 + `DATA_STORES` Set;openDB 的 onupgradeneeded 按 objectStoreNames 增量建表;DB_VER 当前 = 1,**必须升 2 才能触发老库建表**
- 模块模式:client/*.js 是 ES module(auth.js / birthday.js / db.js / moon-calc.js);index.html 引入方式待确认(可能 type="module" 或普通 script + export)
- 抽屉:index.html aside 内 #drawerTheme(界面风格)下方是 .drawer-foot;记账按钮放 drawerTheme 与 drawer-foot 之间
- toast:app.js 有 toast() 函数;弹窗模式:现有编辑弹窗可参考
- 主题:5 套 data-theme,颜色全走 var(--*);条形图用金色渐变 var(--gold) 系
- server.js 只是静态服务器(3099 端口);浏览器测试可 node server.js 后 CDP 连 http://localhost:3099

## 待确认细节

- [ ] index.html 的 script 引用方式(module?)
- [ ] goPanel 具体签名与面板激活逻辑
- [ ] 现有弹窗/底部弹层的 DOM 模式与 class 命名
- [ ] lite/full 登录的切换点(db.setScope 调用处)
- [ ] 浏览器测试的既有脚本位置(规格提到 Edge headless + CDP,可能有现成脚本)

## 决策记录

- 2026-11-18:入口放侧边抽屉(用户选择,导航保持 6 项);面板内加「←」返回观星台

## 测试发现

- **预先存在的 bug**:app.js tryAutoLogin 自动登录路径里 `if (db) db.setScope(...)` 时 db 尚未加载(loadModules 在其后),lite 用户带 token 重进 app 不会切 lite scope,会看到 full 数据。showLogin 路径正常。影响所有 DATA_STORES(notes/diary/checkins/reminders/storyCollection/ledger)。本次未修(超出记账范围),已记录待用户决定。
- full/lite 可见性语义(既有):full 看全部,lite 只看 lite 记录 —— 与 notes/diary 一致,记账板块遵循。
- 测试基建:Node 24 原生 WebSocket + CDP(Edge headless 9222);脚本在 .tmp-test/(test-ledger.mjs 功能 36 项、test-layout.mjs 布局 15 项,全部通过)。测试库需先 deleteDatabase 清库。

## 构建发现

- **构建环境已漂移**(2026-11-18 发现并全部修复):① E:/Android/gradle 下 gradle-8.10-all 发行版缓存损坏(zip 丢失但 .ok 标记在,残留 daemon 锁文件),杀残留 java 进程后清缓存重建;② android/gradle.properties 指向的 D:/jdk-21.0.11 已不存在(系统仅剩 JDK 24,Gradle 8.10 不支持),改用 ~/.jdks/ms-17.0.17(JDK 17 ≥ AGP 8.x 最低要求);③ Android SDK 整个被删(local.properties 指向 D:\Android 不存在),重新下载 cmdline-tools 并安装 platform-tools / platforms;android-34 / build-tools 34.0.0+35.0.0 至 **E:\Android\sdk**,local.properties 已更新。**注意:若用户以后再清理 D 盘或移动 JDK/SDK,需同步改 android/gradle.properties 和 android/local.properties。**
- 后台 Bash 任务的 cwd 继承前台持久化 cwd 且可能被重置(第一次后台 `cd android` 失败是因为已在 android 目录,后来被重置回 e:\Web);管道 `| tail` 会掩盖 gradlew 退出码 —— 判断构建成败要 grep 输出里的 BUILD SUCCESSFUL/FAILED,不能看 exit code。
