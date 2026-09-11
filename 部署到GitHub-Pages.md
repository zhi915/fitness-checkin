# 部署到 GitHub Pages（健身打卡 App）

本应用在 GitHub Pages 上**纯静态运行**，无需服务器。下面是从零推上去并开启 Pages 的完整步骤。

## 一、先在 GitHub 建仓库

1. 打开 <https://github.com/new>
2. Repository name 填一个，例如 `fitness-checkin`（这会变成网址的一部分）
3. 选 **Public**
4. **不要**勾选 "Add a README file / .gitignore"（保持空仓库，避免首次 push 冲突）
5. 点 **Create repository**
6. 创建后页面会显示仓库地址，复制 **HTTPS** 那行，形如：  
   `https://github.com/<你的用户名>/fitness-checkin.git`  
   下面命令里用 `<REPO_URL>` 代替它。

## 二、在本机把代码推上去

在电脑上打开 **PowerShell**（或 Git Bash），依次执行：

```powershell
# 1) 进入项目目录（含中文/空格，路径加引号）
cd "E:\work buddy\健身app"

# 2) （如首次使用 git）设置提交身份
git config --global user.name "zhi915"
git config --global user.email "3440675072@qq.com"

# 3) 初始化并提交
git init
git add -A
git commit -m "健身打卡 App：多用户登录版"

# 4) 关联远程仓库（把 <REPO_URL> 换成你的地址）
git remote add origin <https://github.com/zhi915/fitness-checkin.git>

# 5) 推送（main 分支；如本地默认是 master，用 git branch -M main 改名后再推）
git branch -M main
git push -u origin main
```

> 提示：若 `git` 无法直接运行，请用 **Git Bash**（安装 Git for Windows 后自带）执行上面的命令。本机已检测到 git：`C:\Program Files\Git\cmd\git.exe`。

## 三、开启 GitHub Pages

1. 进入仓库页面 → 顶部 **Settings** → 左侧 **Pages**
2. **Build and deployment** → Source 选 **Deploy from a branch**
3. Branch 选 **main** → 目录选 **/ (root)** → 点 **Save**
4. 等 1 分钟左右，页面会显示你的站点地址：  
   `https://<你的用户名>.github.io/fitness-checkin/`

## 四、使用

- 手机/电脑浏览器打开上面的地址。
- 首次进入是**登录/注册**页：先点「注册」建一个账号，之后用「登录」进入。
- 同一设备可注册多个账号、随时「退出」切换，数据各自独立（存在本机浏览器）。
- 想装成手机 App：Chrome 打开 → 菜单 → **「添加到主屏幕」**。

## 重要说明（多用户模型）

- 本版是**前端多账户**：账号与密码存在浏览器本机（密码经 SHA-256 多次哈希，非明文）。
- 数据**不跨设备同步**：同一账号在另一台手机/电脑登录，看不到另一台的数据（GitHub Pages 是纯静态，没有服务器/数据库）。
- 如果以后想要「同一账号任意设备同步」，需要接入后端（如腾讯云开发 CloudBase），那就不是纯静态托管了。

## 本地预览（不改 GitHub）

- 桌面已有一个「健身打卡服务器.bat」，双击启动本地服务；手机同 WiFi 下访问  
  `http://192.168.1.105:8080`（IP 可能因重连变化，变了重启 .bat 即可）。
- 注意：局域网 `http://` 不是安全上下文，登录鉴权仍可用（用的是纯 JS 哈希，不依赖 HTTPS）。
