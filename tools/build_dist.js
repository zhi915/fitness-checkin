// 生成干净的部署目录 dist/（只含站点运行必需文件，不含测试/文档/cloudbase 脚本）
// 用法：node tools/build_dist.js
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

// 站点运行必需的文件（与 sw.js 的 SHELL 列表 + index.html 引用保持一致）
const FILES = [
  "index.html",
  "manifest.json",
  "icon.svg",
  "sw.js",
  "css/style.css",
  "css/theme.css",
  "js/app.js",
  "js/calc.js",
  "js/cloud-config.js",
  "js/cloud.js",
  "js/social.js",
  "assets/wallpaper-snow.jpg",
];

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  for (const f of fs.readdirSync(p)) {
    const fp = path.join(p, f);
    if (fs.statSync(fp).isDirectory()) rmrf(fp);
    else fs.unlinkSync(fp);
  }
  fs.rmdirSync(p);
}

rmrf(DIST);
fs.mkdirSync(DIST, { recursive: true });

let n = 0;
for (const rel of FILES) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) { console.log("⚠️ 缺失：" + rel); continue; }
  const dst = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  n++;
}

// 版本号自检：index.html 的 ?v= 与 sw.js 的 CACHE 必须同步升级，否则 SW 会发旧版
const idx = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(DIST, "sw.js"), "utf8");
const v = (idx.match(/\?v=(\d+)/) || [])[1];
const cache = (sw.match(/var CACHE = "([^"]+)"/) || [])[1];
console.log("dist 已生成：" + n + " 个文件");
console.log("  index.html ?v=" + v + " ｜ sw.js CACHE=" + cache);

// 版本对照基线：?v=1000 ↔ CACHE v29，此后同步递增（即 CACHE 号 = ?v - 971）
const expected = "fitness-checkin-v" + (Number(v) - 971);
if (cache !== expected) {
  console.log("⚠️ 版本可能未同步：按 ?v=" + v + " 推算 CACHE 应为 " + expected + "（请同时升级两处）");
}
