/* 生成 preview.html：把 css/style.css 与 js/app.js 内联进 index.html，便于沙箱预览（相对路径失效时） */
const fs = require("fs");

let html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("css/style.css", "utf8");
const js = fs.readFileSync("js/app.js", "utf8");

// 注入 CSS
html = html.replace(/<link rel="stylesheet" href="css\/style\.css[^>]*>/, "<style>\n" + css + "\n</style>");
// 注入 JS
html = html.replace(/<script src="js\/app\.js[^>]*><\/script>/, "<script>\n" + js + "\n</script>");
// 去掉 manifest / icon 等可能在 file:// 下报错的外部引用（预览用，不影响正式版）
html = html.replace(/<link rel="manifest"[^>]*>/, "");
html = html.replace(/<link rel="apple-touch-icon"[^>]*>/, "");

fs.writeFileSync("preview.html", html);
console.log("preview.html 已重新生成（内联 css/js）");
