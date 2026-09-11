# 部署到 CloudBase 静态托管（当前主站）

## 站点信息

| 项目 | 值 |
|---|---|
| 线上地址 | **https://sports-d6gxbwqzaaabf04d5-1485613066.tcloudbaseapp.com** |
| 环境 ID | `sports-d6gxbwqzaaabf04d5`（上海地域 · PostgreSQL） |
| 后端 API | `https://sports-d6gxbwqzaaabf04d5.api.tcloudbasegateway.com` |
| 静态托管 | CloudBase 静态托管（体验版，到期 2027-03-11） |

> 静态托管的默认域名**本来就在安全域名白名单里**，所以跨域请求直接放行，不需要像 GitHub Pages 那样手动加白名单。

## 一键部署

双击 **`部署到CloudBase.bat`**，或手动执行两条命令：

```bash
node tools/build_dist.js                 # 生成干净的 dist/（只含站点必需文件）
tcb hosting deploy dist / -e sports-d6gxbwqzaaabf04d5
```

`tools/build_dist.js` 会复制 12 个运行必需文件到 `dist/`（`index.html`、`manifest.json`、`icon.svg`、`sw.js`、`css/*`、`js/*`、`assets/wallpaper-snow.jpg`），**不会**上传测试、文档、`cloudbase/schema.sql` 等仓库内文件。它还会自检 `index.html` 的 `?v=` 与 `sw.js` 的 `CACHE` 是否同步升级。

## 首次使用的准备

1. 安装 CLI：`npm i -g @cloudbase/cli`（或用 `npx @cloudbase/cli`）
2. 登录：`tcb login`（设备码流，浏览器授权一次即可，凭据存在 `~/.cloudbase`）
3. 确认能看见环境：`tcb env list`

## 与 GitHub Pages 的关系

GitHub Pages（https://zhi915.github.io/fitness-checkin/）继续保留作为镜像站。两个站点的**数据不互通**——`localStorage` 按域名隔离。

### 换域名后怎么把数据搬过去

1. 在**旧站**（github.io）→ 统计 → 「导出数据」→ 得到 `健身打卡数据_YYYY-MM-DD.json`
2. 在**新站**（tcloudbaseapp.com）→ 统计 → 「导入数据」→ 选择该文件 → 确认覆盖
3. 导入会走标准的 `load()` 迁移逻辑，旧版本备份缺的字段会自动补默认值

手机端建议：删掉旧的「添加到主屏幕」图标，用新域名重新添加一次，避免打开的是旧 origin。

## 常见坑

- **改了静态文件但线上没变**：`index.html` 的 `?v=` 和 `sw.js` 的 `CACHE` 必须同时升级（基线：`?v=1000` ↔ `CACHE v29`，之后同步递增），否则 Service Worker 会继续发旧缓存。
- **`tcb` 命令找不到**：用 `npx @cloudbase/cli ...`，或把 `node_modules/.bin` 加进 PATH。
- **想换自定义域名**：在静态托管里绑定自己的域名，并记得把该域名加进「环境配置 → 安全来源 → 安全域名」，否则云端请求会被 403。
- **`npx` 报 wsl.exe 被拦截**：本机安全策略把 `wsl.exe` 拉黑了，`npx` 会去调它。改用 node 直调 CLI 的 bin：
  `"C:/Users/Lenovo/.workbuddy/binaries/node/versions/22.22.2-3/node.exe" "C:/Users/Lenovo/.workbuddy/binaries/node/workspace/node_modules/@cloudbase/cli/bin/tcb" hosting deploy dist / -e sports-d6gxbwqzaaabf04d5`

## 建房 / 加房相关的数据库坑（v5.1.1 已修前端，库侧仍需一次补丁）

- **现象**：点「创建房间」提示失败，但房间其实已经建好了；或输入邀请码提示失败。
- **原因**：
  1. `rooms` 上的触发器 `rooms_autoadd_owner` 建房瞬间就把房主写进成员表，客户端再插一次就撞主键（409 / 23505）。前端已改为「冲突即视为已入队」并忽略。
  2. `rooms.owner`、`room_members.user_id` 都外键指向 `profiles(id)`；资料没推上去时会报 23503。前端已在建房 / 进房前强制推资料，但**库侧的 `join_room_by_code` 也建议补一次兜底**。
- **需要你在控制台跑一次**：`cloudbase/patch_join_room.sql`（只替换一个函数，不重建表，不影响已有房间）。
- **清理之前失败留下的空房间**（可选）：同一个文件底部有查询与删除的 SQL。
