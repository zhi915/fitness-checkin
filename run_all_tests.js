// 统一测试运行器
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const NODE = "C:/Users/Lenovo/.workbuddy/binaries/node/versions/22.22.2-3/node.exe";
const NODE_PATH = "C:/Users/Lenovo/.workbuddy/binaries/node/workspace/node_modules";
const DIR = "E:/work buddy/健身app";

const files = fs.readdirSync(DIR).filter(f => /^test_.*\.js$/.test(f)).sort();

let totalPass = 0, totalFail = 0;
const report = [];

for (const f of files) {
  try {
    const out = execFileSync(NODE, [path.join(DIR, f)], {
      env: { ...process.env, NODE_PATH },
      encoding: "utf8",
      cwd: DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const m = out.match(/结果[:：]\s*(\d+)\s*通过[,，]\s*(\d+)\s*失败/);
    let p = 0, fl = 0;
    if (m) { p = +m[1]; fl = +m[2]; }
    totalPass += p; totalFail += fl;
    report.push(`${f.padEnd(24)} ${p} 通过 / ${fl} 失败`);
    if (fl > 0) {
      const fails = out.split("\n").filter(l => /✗|FAIL|失败/.test(l)).slice(0, 10);
      report.push("   " + fails.join("\n   "));
    }
  } catch (e) {
    const out = (e.stdout || "") + (e.stderr || "");
    const m = out.match(/结果[:：]\s*(\d+)\s*通过[,，]\s*(\d+)\s*失败/);
    let p = 0, fl = 0;
    if (m) { p = +m[1]; fl = +m[2]; totalPass += p; totalFail += fl; }
    else { fl = 1; totalFail += 1; }
    report.push(`${f.padEnd(24)} ${p} 通过 / ${fl} 失败  [exit ${e.status}]`);
    const fails = out.split("\n").filter(l => /✗|FAIL|Error|失败/.test(l)).slice(0, 12);
    report.push("   " + fails.join("\n   "));
  }
}

console.log(report.join("\n"));
console.log("\n===== 总计: " + totalPass + " 通过, " + totalFail + " 失败 =====");
