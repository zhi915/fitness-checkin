/* 生成 theme-gallery.html：
   把首页真实布局放进 5 个手机框里，每框套一个主题（plain/night/snow/neon/warm），
   并排展示，供用户挑选。壁纸内联为 base64，自包含可离线预览。 */
const fs = require("fs");

/* ---- 读取真实样式与壁纸 ---- */
const styleCss = fs.readFileSync("css/style.css", "utf8");
const themeCss = fs.readFileSync("css/theme.css", "utf8");
let wpB64 = "";
try {
  const buf = fs.readFileSync("assets/wallpaper-snow.jpg");
  wpB64 = "data:image/jpeg;base64," + buf.toString("base64");
} catch (e) {}

/* theme.css 里默认壁纸路径替换为 base64 */
const themeCssInline = themeCss.replace(
  /url\("\.\.\/assets\/wallpaper-snow\.jpg"\)/g,
  'url("' + wpB64 + '")'
);

const THEMES = [
  { key: "plain", name: "清爽蓝白", desc: "经典默认 · 纯净蓝白，无壁纸干扰", tag: "纯净" },
  { key: "night", name: "宁静夜",   desc: "深蓝玻璃拟态 · 壁纸压暗，蓝底替换为雾蓝发光", tag: "沉稳耐看" },
  { key: "snow",  name: "雪光柔白", desc: "明亮白玻璃 · 壁纸提亮蒙白，通透清爽", tag: "✓ 已选为默认" },
  { key: "neon",  name: "暗夜霓虹", desc: "青蓝发光 · 深色卡面 + 霓虹描边，科技感强", tag: "个性吸睛" },
  { key: "warm",  name: "暖冬",     desc: "暖蓝紫 · 壁纸泛紫，蓝底变柔紫 + 暖橙点缀", tag: "氛围温柔" }
];

/* 首页骨架（静态复刻，仅用于视觉预览） */
function phone(themeKey) {
  const dt = (themeKey === "plain") ? "" : ` data-theme="${themeKey}"`;
  return `
  <div class="phone-wrap">
    <div class="phone"${dt}>
      <div class="phone-screen">
        <header class="app-header">
          <div class="header-top">
            <div class="header-titles">
              <div class="header-sub">7月30日 周四</div>
              <div class="header-title">健身打卡</div>
            </div>
            <div class="header-user"><span class="app-version">v3.0.4</span></div>
          </div>
          <div class="scene-switch">
            <button class="scene-btn sel"><span class="scene-ico">🏠</span>居家</button>
            <button class="scene-btn"><span class="scene-ico">🏢</span>健身房</button>
          </div>
        </header>
        <main class="content">
          <div class="hero-card">
            <div class="hero-greet">小明，今天也要加油</div>
            <div class="hero-stats">
              <div class="hstat"><div class="hstat-num">12</div><div class="hstat-label">连续天数</div></div>
              <div class="hstat-divider"></div>
              <div class="hstat"><div class="hstat-num">86</div><div class="hstat-label">累计打卡</div></div>
            </div>
            <button class="checkin-btn"><span class="checkin-emoji">🔥</span><span class="checkin-text">今日打卡</span></button>
            <div class="hero-hint">点击按钮，记录今天的坚持</div>
          </div>

          <div class="cal-summary">
            <div class="cal-sum-left">
              <div class="cal-sum-num">320</div>
              <div class="cal-sum-label">今日预计消耗 (千卡)</div>
            </div>
            <div class="cal-sum-right">
              <div class="cal-type-bar">
                <span style="width:46%;background:#2563EB"></span>
                <span style="width:32%;background:#22C55E"></span>
                <span style="width:22%;background:#F59E0B"></span>
              </div>
              <div class="cal-type-legend">
                <span><i style="background:#2563EB"></i>力量</span>
                <span><i style="background:#22C55E"></i>有氧</span>
                <span><i style="background:#F59E0B"></i>拉伸</span>
              </div>
              <div class="cal-sum-note">估算值，仅供参考</div>
            </div>
          </div>

          <div class="reco-banner">
            <span class="reco-ico">💡</span>
            <div><b>今日推荐</b> · A 推（胸/肩/三头）· 预计 25 分钟</div>
          </div>

          <div class="section-title">今日任务 <span class="task-progress">3/6</span></div>
          <div class="task-list">
            <div class="task-item done"><div class="task-name">俯卧撑</div><div class="task-meta">12 次 × 4 组</div><span class="task-badge">已完成</span></div>
            <div class="task-item"><div class="task-name">哑铃卧推</div><div class="task-meta">10kg × 10 次 × 4 组</div><span class="task-badge">待完成</span></div>
            <div class="task-item"><div class="task-name">哑铃肩推</div><div class="task-meta">8kg × 12 次 × 3 组</div><span class="task-badge">待完成</span></div>
          </div>
        </main>
        <nav class="bottom-nav">
          <div class="nav-item active"><span class="nav-ico">🏠</span>今日</div>
          <div class="nav-item"><span class="nav-ico">📋</span>计划</div>
          <div class="nav-item"><span class="nav-ico">📚</span>动作库</div>
          <div class="nav-item"><span class="nav-ico">📊</span>数据</div>
          <div class="nav-item"><span class="nav-ico">⚙️</span>设置</div>
        </nav>
      </div>
    </div>
    <div class="phone-caption">
      <div class="cap-name">${THEMES.find(t => t.key === themeKey)?.name || ""}</div>
      <div class="cap-tag">${THEMES.find(t => t.key === themeKey)?.tag || ""}</div>
    </div>
  </div>`;
}

const phones = THEMES.map(t => phone(t.key)).join("\n");

const page = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>主题方案对比 · 5 版 UI</title>
<style>
/* === 真实 App 样式 === */
${styleCss}
/* === 主题样式 === */
${themeCssInline}

/* === 画廊外壳（仅预览页用，不影响 App） === */
body { margin: 0; background: #0b1020; }
.gallery-head {
  text-align: center; color: #fff; padding: 34px 20px 8px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
.gallery-head h1 { margin: 0 0 8px; font-size: 26px; letter-spacing: .5px; }
.gallery-head p { margin: 0; color: #9fb0d4; font-size: 14px; }
.gallery {
  display: flex; gap: 22px; padding: 26px 26px 60px;
  overflow-x: auto; align-items: flex-start;
  justify-content: flex-start;
}
.phone-wrap { flex: 0 0 auto; }
.phone {
  width: 300px; height: 620px; border-radius: 34px;
  background: #000; padding: 9px; box-sizing: border-box;
  box-shadow: 0 22px 60px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08) inset;
  overflow: hidden;
}
.phone-screen {
  width: 100%; height: 100%; border-radius: 26px; overflow: hidden;
  position: relative; display: flex; flex-direction: column;
  background: var(--bg, #f5f8ff);
}
.phone-screen .content { flex: 1; overflow: hidden; }
.phone-caption { text-align: center; margin-top: 12px; }
.cap-name { color: #fff; font-weight: 800; font-size: 15px; }
.cap-tag { color: #8ea6d6; font-size: 12px; margin-top: 2px; }
.gallery-foot {
  text-align: center; color: #7f8fb2; font-size: 13px; padding: 0 20px 40px;
  font-family: -apple-system, sans-serif;
}
</style>
</head>
<body>
  <div class="gallery-head">
    <h1>主题方案 · 5 版 UI 对比</h1>
    <p>同一张壁纸下，5 种不同配色与玻璃质感。横向滑动查看，挑出你喜欢的一版。</p>
  </div>
  <div class="gallery">
    ${phones}
  </div>
  <div class="gallery-foot">以上为首页静态预览 · 实际 App 中可在「设置 → 🎨 主题与壁纸」里一键切换并上传自己的壁纸</div>
</body>
</html>`;

fs.writeFileSync("theme-gallery.html", page);
console.log("theme-gallery.html 已生成（5 版 UI 并排对比）");
