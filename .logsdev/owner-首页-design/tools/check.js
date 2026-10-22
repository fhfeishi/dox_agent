const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const P = path.join(__dirname, "..", "library-overview-demo.html");
const html = fs.readFileSync(P, "utf8");

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
scripts.forEach((s, i) => {
  try { new Function(s); } catch (e) { console.log("SYNTAX ERROR #" + i + ": " + e.message); process.exit(1); }
});
console.log("SYNTAX OK  scripts=" + scripts.length);

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.message || e)));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/"
});
const w = dom.window;
const q = (s) => w.document.querySelector(s);
const qa = (s) => w.document.querySelectorAll(s);

setTimeout(() => {
  const checks = [];
  const add = (n, got, want) => checks.push([n, got, want]);

  add("散点", qa("#map .pt circle.dot").length, 11);
  add("点标签", qa("#map text.pt").length, 11);
  add("象限虚线框", qa('#map rect[stroke-dasharray="6 6"]').length, 1);
  add("读数三条", qa(".ro").length, 3);
  add("banner 条", qa(".b-row").length, 11);
  add("工作台卡", qa(".wcard").length, 4);
  add("详情四维", qa("#detail .dim").length, 4);
  add("阶梯段", qa("#detail .stair span").length >= 5 ? 1 : 0, 1);

  let fail = 0;
  checks.forEach(([n, got, want]) => {
    const ok = got === want;
    if (!ok) fail++;
    console.log((ok ? "PASS " : "FAIL ") + n + ": " + got + " / " + want);
  });

  const title = () => (q("#detail .d-name") || {}).textContent;
  console.log("默认选中: " + title());

  const pts = [...qa("#map .pt")].filter((g) => g.getAttribute("data-id"));
  const robo = pts.find((g) => g.getAttribute("data-id") === "robo");
  robo.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const t2 = title();
  console.log((t2 === "机器人自动化" ? "PASS " : "FAIL ") + "点选切换: " + t2);
  const warns = [...qa("#detail .d-warn")].map((e) => e.textContent);
  console.log((warns.length === 2 ? "PASS " : "FAIL ") + "缺口并列: " + warns.length + " 条 → " + warns.join(" | ").slice(0, 72));

  const priv = pts.find((g) => g.getAttribute("data-id") === "priv");
  priv.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  console.log((/没有一条/.test((q("#detail .d-warn") || {}).textContent) ? "PASS " : "FAIL ") + "零成熟提示");

  q("#btnGap").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const faded = [...qa("#map .pt circle.dot")].filter((c) => c.getAttribute("fill-opacity") === ".26").length;
  console.log((faded === 5 ? "PASS " : "FAIL ") + "只看待补淡化: " + faded + " / 5（11 - 6 待补）");

  q("#btnAll").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const back = [...qa("#map .pt circle.dot")].filter((c) => c.getAttribute("fill-opacity") === ".26").length;
  console.log((back === 0 ? "PASS " : "FAIL ") + "恢复全部: " + back);

  const target = qa("#map .pt")[2];
  target.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: true, clientX: 300, clientY: 300 }));
  const tip = q("#tip");
  console.log((tip.style.opacity === "1" && tip.textContent.length > 6 ? "PASS " : "FAIL ") + "悬停浮层: " + tip.textContent.slice(0, 30));

  if (errors.length) { console.log("RUNTIME ISSUES:"); errors.slice(0, 6).forEach((e) => console.log("  " + e)); }
  else console.log("NO RUNTIME ERRORS");

  process.exit(fail ? 1 : 0);
}, 400);
