# 健身打卡 App 版本清单（Version Manifest）

> 本文件由版本管理器维护，是人读的总览。真正的版本锚点在 git tag（如 `v1`）。

## 版本对照表

| 版本标签 | 对应 App 版本 | 提交号 | 封装日期 | 说明 |
|---------|--------------|--------|---------|------|
| **v1** | v2.4.0 | `700a926` | 2026-07-29 | 扁平青绿重设计 + 分步打卡向导（滚轮调重量/组数/次数）+ 自动按周计划排程 + 动作「更换」按钮 + 打卡记录动作内容 |
| **v2** | v2.9.1 | （vm.bat 封装后写入） | 2026-07-30 | **新增卡路里计算功能**（v2.9.0）：①今日任务列表/当前动作卡显示做功法 ≈kcal 徽标；②首页「今日预计消耗」汇总卡 + 按类型彩色拆分条；③向导底部「今日累计 ≈kcal」；④日历详情当日总消耗；⑤「记录运动」弹层球类/游泳展示简单项目列表，点击即自动带时长并估算，无需手动输入；⑥统计页体重(kg)可调。**v2.9.1：首页「今日运动」新增「+ 添加运动」按钮（点击打开记录运动弹层，作用于今天），从此在首页即可加运动；日历点日期不再弹出添加/打卡弹层，改为仅查看当日详情（即"删除日历添加运动的功能"）**。合计 101 项 jsdom 测试全通过（含 v2.9.1 新增 test_home_add 8 项）。 |
| **v3** | v3.0.10 | `4e2f688` | 2026-09-11 | **主题 / 壁纸系统 + 蓝白扁平重设计**（v3.0.0 → v3.0.10 全量）：①内置 **5 套主题**（清爽蓝白 / 宁静夜 / 雪光柔白 / 暗夜霓虹 / 暖冬）+ 用户可**上传自定义壁纸**（canvas 压缩存 localStorage）；②默认主题「**雪光柔白**」，卡片**轻磨砂半透明**（20% 白，壁纸透出）；③「居家 / 健身房」场景系统；④结构化动作库（119 动作 / 8 部位）+ 线型 SVG 图标；⑤个人信息引导（性别/体重/身高/年龄）+ 用户名；⑥打卡向导**卡路里实时计算**；⑦「今日预计消耗」**环形图**（按运动类型占比分色）；⑧首页 UI 优化：顶栏圆角悬浮卡、今日任务「载入」按钮、当前动作卡防拥挤；⑨热修复：自定义壁纸在「清爽蓝白」下不可见 + 主题缩略图样式失效。**282 项 jsdom 测试全通过**。线上：https://zhi915.github.io/fitness-checkin/ |
| **v4** | v4.0.0 | （开发中） | 2026-09-11 | **第二批：卡路里算法落地验证 + 打卡逻辑重构**。①卡路里核心抽为独立纯函数模块 `js/calc.js`（UMD，浏览器/Node 双用），参数集中 `CALIB`，`estTaskKcal(t,ctx)` / `estExKcal(e,ctx)` 变薄封装；②新增 `deriveDay(k)` 单一派生层——`checkedIn` / `actions` 不再持久化，全部从 `data.tasks[k]` + `records[k].exercises` 派生，删除 `syncCheckin()`；③旧数据自动迁移（`checkedIn` → `confirmed`）。**347 项测试全通过**（新增 `test_calorie_model` 37 项、`test_derive` 27 项）。 |
| **v5** | v5.1.0 | ✅ 已发布（tag `v5`） | 2026-09-11 | **第三批：用户登录 + 组队共同打卡**（后端：**腾讯云开发 CloudBase**，已放弃 Supabase）。①**登录（匿名起步 + 可绑定邮箱）**——自研零依赖 CloudBase 轻客户端 `js/cloud.js`（认证 `/auth/v1/*` + PostgREST 数据 `/v1/rdb/rest/*`，仅用官方公开 HTTP 接口，不引官方 SDK）；首次打开自动创建**设备账号**，可随时绑定邮箱升级为正式账号、跨设备找回。②**组队房间**——6 位邀请码（剔除 I/O/0/1 易混字符）建房拉人，成员看板显示每人**今日是否打卡 / 连续天数 / 本周消耗 / 今日消耗**，房间有「本月全队累计打卡天数」集体目标与进度条。③**只同步摘要**——`day_summaries` 只存「是否打卡 / 完成项数 / 估算消耗」，**每组重量次数永不上云**。④**离线优先 + 优雅降级**——本地 `localStorage` 仍是唯一事实源，保存后防抖上报；未配置 / 断网 / 云端报错时，App 完全退回纯本地模式，打卡不受任何影响。⑤安全靠数据库 **RLS**（`cloudbase/schema.sql`：4 张表 + 同房间可见性函数 + 凭码入房 RPC）。⑥**UI 迭代**——场景切换条迁到计划页；首页 header 标题可自定义（点击原位改名，统计页也可改）；首页右上角账号入口 + 队友今日打卡状态卡；向导动作完成后图标暗化 + 绿勾；**timed 动作直接显示内嵌计时器**（圆环点按开始/暂停，时长与滚轮实时联动，到点 Web Audio 合成闹钟 + 振动，非 timed 动作完全隐藏）。**661 项测试全通过**（新增 `test_cloud` 85 项、`test_social` 51 项、`test_room_ui` 69 项、`test_room_demo` 32 项、`test_wiz_timer` 47 项、`test_app_title` 30 项）。 |

## v3.0.x 迭代明细（已随 `v3` 发布，2026-09-10）

| App 版本 | 状态 | 说明 |
|---------|------|------|
| **v3.0.0** | ✅ 已发布（含于 tag `v3`） | **大版本升级第一批**：①蓝白配色重设计（`#2563EB`）；②首页顶部场景快捷切换（居家/健身房）；③结构化运动数据库 `EX_LIB`（119 个动作，含 `part/equip/scenes/weighted/timed/met/icon` 字段）；④线型单色 SVG 图标集（22 个 symbol）；⑤向导/任务卡自适应交互（自重动作不显示重量输入，计时动作显示「时长(秒)」）；⑥身体数据扩展（体重/身高/年龄/性别，默认男）；⑦旧数据向后兼容（`LEGACY_EXERCISE_LIB`）。当前 **156 项 jsdom 测试全通过**。第二批（精确卡路里算法落地验证 + 打卡逻辑重构）待第一批审核通过后进行。 |
| **v3.0.1** | ✅ 已发布（含于 tag `v3`） | **v3.0.0 增量**：①新增「默认信息」引导界面（首启弹窗填写性别/体重/身高/年龄，可跳过；统计页「完善个人信息」随时修改）；②打卡向导卡路里**实时计算**——切换重量/组数/次数/时长时，「当前动作 ≈ kcal」与「今日累计 ≈ kcal」即时刷新。当前 **191 项 jsdom 测试全通过**。 |
| **v3.0.2** | ✅ 已发布（含于 tag `v3`） | **v3.0.1 增量**：新增**用户名**功能——默认信息弹窗 & 统计页设置均可填写/修改；首页问候语（`heroGreet`）与打卡成功提示会带上用户名（如「小健，今天也要加油 💪」「小健，打卡成功 🔥」），设置页改名首页实时同步。当前 **198 项 jsdom 测试全通过**。 |
| **v3.0.3** | ✅ 已发布（含于 tag `v3`） | **修复**：今日任务数量与「每日计划」不一致——`autoScheduleToday` 改为按星期映射（周一A/周二B/周四C/周五D，周三周日休息）从计划对应训练日生成今日任务，**今日任务数 = 计划当日项数**；计划页给当天训练日加「今天」高亮徽章。当前 **206 项 jsdom 测试全通过**。 |
| **v3.0.4** | ✅ 已发布（含于 tag `v3`） | **新增主题 / 壁纸系统**：①内置 **5 套主题**——清爽蓝白（默认）、宁静夜（深蓝玻璃拟态）、雪光柔白（明亮白玻璃）、暗夜霓虹（青蓝发光描边）、暖冬（暖蓝紫 + 暖橙点缀）；②用户可**上传自己的壁纸**（`<input type=file>` → canvas 压缩为 JPEG base64 → 存入 localStorage `data.wallpaper`），壁纸作为整页固定背景（`body::before`）；③页面所有蓝底（`--primary` 系）随主题替换为与壁纸协调的色系；④设置页「🎨 主题与壁纸」一键切换 + 预览网格 + 清除自定义壁纸；⑤内置默认壁纸 `assets/wallpaper-snow.jpg`。当前 **233 项 jsdom 测试全通过**（新增 `test_theme.js` 20 项；修复 `test_nologin.js` 未计入统计的问题）。另附 `theme-gallery.html`（5 版 UI 并排对比预览）。 |
| **v3.0.5** | ✅ 已发布（含于 tag `v3`） | **修复：首页今日任务重复展示当前动作**——原「当前动作」放大卡与下方列表都把第一个未完成动作显示了一遍。改为：当前动作**仅在顶部放大卡展示**，列表里过滤掉该动作（不再重复）；顶部放大卡补齐**删除按钮**（`.tc-del`，与原列表内删除一致，可删除当前动作）；列表项不再叠加 `.current` 高亮描边。测试相应更新（`test_plan_sync`/`test_stale`/`test_v230`/`test_checkin`/`test_wizard`/`test_wizard_done` 改用「顶部进度条分母」作为任务总数，不再用列表行数）。当前 **236 项 jsdom 测试全通过**。 |
| **v3.0.6** | ✅ 已发布（含于 tag `v3`） | **默认主题改为「雪光柔白」**（用户选定）：新增 `DEFAULT_THEME="snow"`，`blankData().theme` 默认 `"snow"`；`applyTheme()`/`renderThemeGrid()` 对空 theme 回退 `DEFAULT_THEME`（旧数据 `theme:""` 也自动用雪光柔白）；`setTheme("plain")` 改为显式存 `"plain"`（空串语义让给默认值），选「清爽蓝白」时正确移除 `data-theme` 并隐藏壁纸。当前 **237 项 jsdom 测试全通过**（`test_theme` 更新默认断言 + 新增 plain 持久化断言）。 |
| **v3.0.7** | ✅ 已发布（含于 tag `v3`） | **雪光柔白改为「磨砂半透明」**（用户要求把白底透出壁纸、磨砂别太重）：snow 主题 `--card` 由 `rgba(255,255,255,0.82)` 降到 `0.55`；`--wp-overlay` 由 0.62~0.82 降到 0.26~0.40（壁纸更明显）、`--wp-blur` 2px→1px；header 由 0.86/0.9 降到 0.55/0.62；卡片 `backdrop-filter` 10→7px；`bottom-nav` 0.9→0.6；**原本写死 `#fff` 的小控件**（`input`/`.tc-replace`/`.tc-del`/`.task-replace`/`.task-status.undone`/`.chip`/`.btn-ghost`/`.btn-secondary`/`.cal-nav`/`.scene-btn.sel`/`.gender-toggle button.sel`/`.lib-item .lib-ico`/`.tf-static`/`.sport-item` 等）统一改为 `rgba(255,255,255,0.45)` + `backdrop-filter: blur(6px)`。当前 **242 项 jsdom 测试全通过**（`test_theme` 新增 5 项静态断言：卡片半透明/含 backdrop-filter/-webkit 兼容/控件半透明/磨砂≤8px）。 |
| **v3.0.8** | ✅ 已发布（含于 tag `v3`） | **雪光柔白进一步降到「强透明」**（用户要求"降到 0.2"）：snow 主题 `--card` 由 `0.55` 再降到 **`0.2`**，壁纸大面积透出；`--wp-overlay` 0.26~0.40 → **0.10~0.18**；header 0.55/0.62 → **0.24/0.32**；`bottom-nav` 0.6 → **0.22**；写死白控件 0.45 → **`0.2`**；`--primary-50/100` 相应降到 0.30/0.36。磨砂度保持轻量（≤8px）。当前 **242 项 jsdom 测试全通过**。⚠️ 备注：卡片仅 20% 白，深色壁纸下深色正文对比度会下降，可再调（升数值 / 换浅色文字 / 加文字描边）。 |
| **v3.0.9** | ✅ 已发布（tag `v3`） | **首页 4 处 UI 调整**：①**顶栏改圆角悬浮卡**（`.app-header` 加 `border-radius:20px` + 左右 12px 外边距 + 更柔和投影，不再通顶直角）；②**移除「今日推荐训练」横幅**（`.reco-banner` / `renderRecommend()` 整体删除），改为「今日任务」标题右侧一枚小号**「载入」按钮**（`#taskLoadBtn` → `loadRecommend()`），标题行改 flex 两端布局；③**当前动作卡不再拥挤**——状态徽标移到卡片头部行（`.tc-head`），操作行只留「更换动作 + ✕」，并加大卡内纵向节奏（`.task-fields` gap 10px、label↔input gap 6px、`.tc-actions` margin-top 16px、卡片 padding 18/20）；④**「今日预计消耗」改为环形图**——SVG 双环（`#calRing`，r=52，stroke-dasharray/offset 按占比拼接，12 点起始），中心显示今日总消耗，右侧图例按运动类型分色列各类型 kcal。当前 **270 项 jsdom 测试全通过**（新增 `test_ui_v309.js` 24 项）。 |
| **v3.0.10** | ✅ 已发布（commit `8fe6461`，tag `v3.0.10`） | **修复：自定义壁纸「提示上传成功、却看不到壁纸」**。根因是**两条叠加**：①当前主题若为「清爽蓝白」（`plain`），`applyTheme()` 会移除 `data-theme`，于是 `--bg` 回落到 `css/style.css` 里的不透明默认值 `#F5F7FB`，而 `#app { background: var(--bg) }` 是**不透明实色**，会把 `z-index:-2` 的壁纸层**整片盖住**；同时 `plain` 规则本身还把壁纸层 `opacity:0`。②上传链路**没有任何校验**——图片解码失败、canvas 产出 `data:,`、或超出 localStorage 上限时，仍然无条件提示「壁纸已更新」。**修复**：`applyTheme()` 在 `data.wallpaper` 非空时给 `<html>` 打 `data-wp="custom"` 标记，`css/theme.css` 据此**在任何主题（含 plain / 未启用主题）下强制显示壁纸层**（`opacity:1`）并清掉 `html`/`body`/`#app` 的不透明底色与 `--bg`；`setWallpaper()` 改为返回真实结果（保存失败即**回滚**，不再谎报成功）；新增 `verifyImageDecodable()` 解码校验 + 四级压缩阶梯（1280/0.82 → 1024/0.72 → 800/0.62 → 640/0.55，超限自动降档重试）；`compressImage()` 校验输出必须是合法图片 dataURL（拦截 `data:,`，并补 `getContext` 空值 / 尺寸为 0 的守卫）；另修掉 `renderThemeGrid()` 用 `style="…url("…")"` 拼字符串**被 `url()` 里的双引号截断 HTML 属性**、导致主题缩略图失效的隐藏 bug（改走 CSSOM 赋值）。当前 **282 项 jsdom 测试全通过**（`test_theme` 38 项，新增 `plain + 自定义壁纸` 回归断言）。 |


## v4.0.x 迭代明细（开发中，2026-09-11 起）

| App 版本 | 状态 | 说明 |
|---------|------|------|
| **v4.0.0** | ✅ 已发布（含于 tag `v5`） | **第二批：精确卡路里算法落地验证 + 打卡逻辑重构（单一状态源 / 纯函数派生）**。**347 项测试全通过**（新增 `test_calorie_model` 37 项 + `test_derive` 27 项）。 |

### v4.0.0 技术说明

**A. 卡路里算法「落地验证」**
- 把原先写在 `app.js`、与全局 `data` 耦合的公式抽成**独立纯函数模块 `js/calc.js`**（UMD：浏览器 `window.FitCalc` + Node `require` 双用），因此可脱离 DOM 直接单测。
- 模型参数**集中到 `CALIB`**：重力 9.8 / 焦耳当量 4184 / 人体做功效率 0.25 / 代谢补偿 1.6 / 每组 105s / 位移 0.5m / 自重系数 0.6 / 每日 1440min。
- 纯函数：`bmrPure`（Mifflin-St Jeor）、`kcalStrengthPure`（做功 + 代谢摊分）、`kcalTimedPure`（MET × 秒 × 组）、`kcalCardioPure`（MET × 分钟）、`parseDurationSec`。
- `estTaskKcal(t, ctx)` / `estExKcal(e, ctx)` 变**薄封装**（从 `ctxOf()` 取身体参数后调用纯函数），支持显式传入 `ctx` 以便测试。
- 新增 `test_calorie_model.js`（37 项）：BMR 参考值 / 有氧 MET 参考值 / 力量与计时**精确参考值** / **单调性**（重量·次数·组数·位移·时长↑ → 热量↑）/ **边界**（0 值与缺失 → `null`）/ 量级 sanity（单次训练 100~800 千卡）。
- 已知保留行为：`parseDurationSec("45-60秒")` 因 `(\d+)秒` 先命中而返回 **60**（原始匹配顺序使然，非本次改动；如要改为取下界 45，需同步评估所有计时动作显示值）。

**B. 打卡逻辑重构（单一状态源 / 纯函数派生）**
- **单一事实源**：`data.tasks[date]`（每项 `done` + 重量/组数/次数）+ `data.records[date].exercises`（运动记录）。
- **派生层 `deriveDay(k)`** 返回 `{ tasks, total, doneCount, pending, allDone, checked, confirmed, exercises, actions }`；`isChecked(k)` / `dayActions(k)` 均走它。
- **规则统一**：有任务 → **必须全部完成**才算已打卡；无任务（休息日）→ 用户确认过或记录过运动即算已打卡。任何入口（向导 / 记录弹层）都无法绕过「没做完就不算打卡」。
- **删除了旧状态位**：`rec.checkedIn`（原先 5 处写入）与 `rec.actions` 镜像（原先 3 处写入）不再持久化；`syncCheckin()`（含 5 处调用）整体删除——状态现在**自动一致**，不存在可写坏的副本。
- **保留一个显式标志 `rec.confirmed`**：仅用于「休息日/无任务」场景的用户确认（向导完成页 / 记录弹层「完成打卡」写入）。
- **旧数据自动迁移**（`load()` / `ensureRecord()`）：`checkedIn:true` → `confirmed:true`，并删除旧字段；残留「已打卡但有未完成任务」的历史数据由派生层**自动纠正**（原 `syncCheckin` 的自愈职责）。
- **撤销打卡**改为同时回退 `confirmed` 与今日任务完成态（否则任务全完成仍会被判为已打卡）。
- 新增 `test_derive.js`（27 项）：全完成↔未完成切换、增删动作后状态自动一致、核心规则（确认 ≠ 跳过任务）、休息日分支、旧数据兜底与迁移、`estTaskKcal/estExKcal` 显式 `ctx`。


## v5.0.x 迭代明细（开发中，2026-09-11 起）

| App 版本 | 状态 | 说明 |
|---------|------|------|
| **v5.0.0** | ✅ 已发布（含于 tag `v5`） | **用户登录 + 组队共同打卡**（用户选型：托管 BaaS / 匿名起步 + 可绑邮箱 / 组队房间 / 仅摘要）。**554 项测试全通过**（`test_cloud` 55 + `test_social` 51 + `test_room_ui` 69 + `test_room_demo` 32）。 |

### v5.0.0 → v5.1.0 技术说明

**A. 硬约束：登录与组队是「叠加能力」，不是前置条件**
- 本 App 原本是 100% 纯前端（GitHub Pages 静态托管 + `localStorage` 单键 `fitapp_data`）。登录需要可信身份、共同打卡需要多方共享数据，两者都必须在服务端完成。
- 但**本地存储仍然是唯一事实源**：`save()` 先写 `localStorage`，再防抖（1.2s）上报摘要；任何云端异常都只影响「组队」页，不影响打卡本身。
- `js/cloud-config.js` 留空 → `cloudOn()` 为 false → 组队页显示接入指引，其余功能与旧版完全一致（`test_room_ui` A/D 两组专门覆盖「未配置」与「云端 500」两个降级场景）。

**B. 自研 CloudBase 轻客户端 `js/cloud.js`（零依赖）**
- 不引 `@cloudbase/js-sdk`：只用官方公开 HTTP 接口——身份认证 `/auth/v1/*` 与数据 API `/v1/rdb/rest/*`（基于开源 PostgREST，查询语法与 Supabase 一致）。
- 域名：`https://{envId}.api.tcloudbasegateway.com`；请求头只需 `Authorization: Bearer <token>`（CloudBase 没有 `apikey` 概念）。
- 能力：匿名登录（`POST /signin/anonymously`，**必带 `x-device-id`**）、令牌刷新（`POST /token`，提前 60s）、确保会话（`ensureSession` 有效复用 → 过期刷新 → 刷新失败回退匿名登录）、邮箱绑定/升级（`POST /verification` 发码 → `POST /verification/verify` 校验 → `POST /signup` 带 `anonymous_token`）、验证码登录（`POST /signin`）、用户名密码登录、通用增删改查 + `rpc`、登出（`POST /user/signout`）。
- **设备 ID（`fitapp_cloud_device`）**：随机生成 24 位十六进制并缓存。CloudBase 的匿名用户按设备 ID 去重——同一 ID 恒对应同一用户，所以「刷新失败 → 重新匿名登录」不会丢身份；反过来说清掉它就等于换个人。
- `fetch` / `storage` **可注入**，因此可在 Node 里用 mock 断言真实发出的 URL / 方法 / 请求头 / 请求体（`test_cloud.js`，全程不联网）。
- 会话存 `fitapp_cloud_session`；`scope === "anonymous"` 判定匿名，刷新响应缺字段时沿用旧会话 / 从 JWT 兜底。

**C. 组队领域层 `js/social.js`（纯函数）**
- 邀请码：32 字符集 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`（剔除 I/O/0/1）、6 位、`normalizeCode` 容忍分隔符与大小写。
- 日期：`weekStart`（周一为周起点，与 App 周计划一致）/ `monthStart` / `addDays` / `daysBetween` **全部按 UTC 运算**，避免本机时区导致跨日误判。
- 投影与聚合：`summaryRow`（本地派生 → 摘要行）、`profileRow`、`progress`（集体目标）、`kcalByUser`、`todayMap`、`memberBoard`（排序：今日已打卡 → 连续天数 → 本周消耗 → 昵称）、`roomOverview`。

**D. 数据库（`cloudbase/schema.sql`，4 张表 + RLS）**
- `profiles`（`id` 即令牌中的 `sub`；**刻意不建 `auth.users` 外键、也不装触发器**——认证 schema 由平台托管，改由客户端登录后 `pushProfile` 建档）、`rooms`（6 位唯一邀请码）、`room_members`（`user_id` 外键指向 `profiles(id)`，使 PostgREST 可嵌入查询）、`day_summaries`（主键 `(user_id, day)`，摘要字段）。
- ⚠️ **身份列一律用 `text`，不是 `uuid`**（CloudBase 的 `auth.uid()` 返回 `text`，照搬 Supabase 的 `uuid` 会报 `operator does not exist: uuid = text (SQLSTATE 42883)`；Platform 的 `auth.users.id` 本身也是 `varchar(64)`）。函数参数同理为 `text`。
- 身份列均带 `default auth.uid()`（昵称/房主/成员/摘要），由数据库盖章，客户端漏传也不会写脏。
- RLS 策略**不写 `to authenticated` 角色限定**：CloudBase 的 `anon` 涵盖「匿名身份」，而匿名登录正是本 App 默认路径，限定后会被整条拒掉。一律用 `(select auth.uid())` 表达式判定（子查询形式只求值一次；未登录时为 null，策略自然为假）。另加 `do $$ ... exception when others then null $$` 包住的**表级 GRANT**（Supabase 会自动授予，CloudBase 需要显式授予，且额外显式给了 `anon`）。
- 可见性用两个 `security definer` 函数：`is_room_member(room)`、`is_roommate(user)`（后者是「同房间可见」的核心，且内部绕过 RLS 以免策略自递归）。
- 入房走 `join_room_by_code(text)` RPC：调用者此刻还不是成员，普通 RLS 查不到 `rooms`，故用 `security definer` 统一处理「校验邀请码 + 写成员关系」。
- **建房即自动入队**：`after insert on rooms` 触发器 `rooms_autoadd_owner` 把 owner 写进成员表（`on conflict do nothing`）。客户端也会显式插一次，这里作兜底——否则那步一旦失败，就会出现「房主不在成员表里 → 自己看不到队友摘要」的诡异不一致。
- **离线验证**：`node tools/check_schema.js` 用本地 WASM PostgreSQL（PGlite）真跑一遍脚本，并模拟两个用户验证 RLS（未入房互相不可见 → 凭码入房后摘要可见 → 越权写被拒 → 未登录全拒）。**23 项全通过**。

**E. 接入步骤（用户操作，一次性）**
1. 到 https://tcb.cloud.tencent.com 登录（需**个人实名认证**），在购买页创建**免费体验版**环境：**上海地域 + PostgreSQL 数据库**（免费 3000 资源点/月，有效期 6 个月，到期前可 0 元续）；
2. 「环境概览」复制**环境 ID**（形如 `cloud1-3gxxxxxxxx`，也可自定义前缀如 `sports-xxxxxxxx`）；
3. 填入 `js/cloud-config.js` 的 `envId`（`accessKey` 可选，留空即可）；该文件在 Service Worker 里走**网络优先**，改完刷新即生效，无需清缓存；
4. 数据库 → SQL 编辑器，执行一次 `cloudbase/schema.sql`（脚本开头含一次性 `drop table if exists` 重建，故可反复执行；云端只是本机数据的投影，重建后 App 会自动重新上传，代价只是房间需重新加入）；
5. 身份认证 → 登录方式：打开 **匿名登录** 与 **邮箱验证码**（配好邮件模板）；
6. 身份认证 → 开发设置：把站点域名加入**「安全来源」白名单**（GitHub Pages 即 `https://用户名.github.io`）——**这一步最容易漏**，漏了前端请求会被判为非法来源。

> 费用口径（2026-09 官方价格文档）：静态托管流量 210 点/GB、静态托管存储 3.94 点/GB/天、身份认证调用 500 点/万次、云开发 API 调用 100 点/万次、PostgreSQL CPU 342 点/(核·小时)。3000 点/月对个人 + 少量朋友的用量是够的；且**免费体验版不支持按量付费**，超额只会停服、不会产生意外账单。

### F. 产物
- `room-demo.html`（由 `node gen_room_demo.js` 生成）：**假云端演示页**——用户还没建 CloudBase 环境时，也能看到「已接上云端 + 已加入房间」的组队页真实样子（3 人看板、邀请码 K7X2QM、集体进度）。在演示页里回「今日」完成一次打卡，再回组队页可看到自己的状态从「未打卡」变成「已打卡 ✓」。`demo/room-mock.js` 只在演示页里注入，**正式 App 不引用**。
- `preview.html`（由 `node gen_preview.js` 生成）：单文件预览，保持「未配置云端」的真实首屏。
- 生成器改动：`gen_preview.js` / `gen_room_demo.js` 都要内联新增的 3 个 JS，否则 preview 里 `window.FitCloud` 为 undefined。

> 备注：`js/cloud-config.js` 在 `sw.js` 里走**网络优先**（其余静态走缓存优先），所以配置改完刷新即生效、无需清缓存。


## 如何管理版本

双击 **`vm.bat`** 打开版本管理器（菜单为英文数字，照数字选即可）：

1. **List versions** — 列出所有已封装的版本（v1、v2…）
2. **Tag current state as new version** — 把当前代码封装成新版本：输入版本号（如 `v2`）+ 说明，自动打 tag 并推到 GitHub
3. **Rollback to a version** — 回档：输入版本号（如 `v1`）→ 自动先打一个 `pre-rollback-日期` 备份标签 → 把代码恢复到该版本
4. **Force push main (after rollback)** — 回档后选它，把回档结果强推到 GitHub（让线上也回到该版本）
5. **Push all tags to GitHub** — 把本地所有标签推到 GitHub（首次封装 v1 后需要推一次）
6. **Show version detail** — 查看某版本的详细说明

## 回档流程（更新翻车时）

1. 双击 `vm.bat` → 选 `3` → 输入要回到的版本（如 `v1`）
2. 脚本会先自动创建 `pre-rollback-今天日期` 备份标签（防止误删找不回）
3. 代码已恢复到 v1 状态
4. 再选 `4` 强推 main，线上即同步回档
5. 若回档后发现不对，可再选 `3` 回到 `pre-rollback-...` 备份标签

## 注意事项

- 首次封装 v1 后，记得选 `5` 把标签推到 GitHub，否则标签只在本机。
- 回档（选项 3+4）会改写 main 分支历史，属预期操作；备份标签 `pre-rollback-*` 可随时找回。
- 推送标签 / 强推时需要输入 GitHub 用户名 `zhi915` + 你的 Personal Access Token（建议用独立的、权限仅 `repo` 的 token，用后撤销重发）。
- 不要手改 `.workbuddy/` 目录（含本地记忆），它不在版本管理范围内。
