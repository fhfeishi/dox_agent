const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const P = path.join(__dirname, '..', 'library-overview-demo.html');
const html = fs.readFileSync(P, 'utf8');
[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).forEach((s, i) => {
  try { new Function(s); } catch (e) { console.log('SYNTAX ERR #' + i + ': ' + e.message); process.exit(1); }
});
console.log('SYNTAX OK');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(String(e.message || e)));
vc.on('error', (...a) => errors.push(a.join(' ')));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/', beforeParse(w) { w.scrollTo = () => {}; } });
const { window } = dom;
const q = s => window.document.querySelector(s), qa = s => [...window.document.querySelectorAll(s)];
setTimeout(() => {
  const t = (n, ok, x) => console.log((ok ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? ': ' + x : ''));
  t('成熟度柱', qa('#detail .mbar[data-m]').length, 6);
  t('柱状带图例', !!qa('#detail .mbar[data-tip]').length);
  t('四维环', qa('#detail .ring path').length >= 4, qa('#detail .ring path').length);
  t('环中心数值', !!q('#detail .ring-v'), q('#detail .ring-v') && q('#detail .ring-v').textContent);
  t('四维图例', qa('#detail .rl[data-dim]').length, 4);
  t('预览按钮', !!q('#detail #btnPreview'));
  t('无残留打开按钮', !q('#detail #btnOpen'));

  // 打开抽屉
  q('#detail #btnPreview').click();
  const dw = q('#drawer');
  t('抽屉打开', dw.classList.contains('on'));
  t('抽屉标题', q('#dwName').textContent, q('#dwName').textContent);
  t('体系行', qa('#dwBody .sysrow').length, qa('#dwBody .sysrow').length);
  t('高成熟条目', qa('#dwBody .ev').length, qa('#dwBody .ev').length);
  t('遮罩', q('#dwMask').classList.contains('on'));

  // 关闭
  q('#dwMask').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  t('遮罩关闭', !dw.classList.contains('on'));

  // Esc
  q('#detail #btnPreview').click();
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  t('Esc 关闭', !dw.classList.contains('on'));

  // 切库后抽屉内容
  qa('#map .pt[data-id="robo"]')[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  q('#detail #btnPreview').click();
  t('切库后标题', q('#dwName').textContent === '机器人自动化', q('#dwName').textContent);
  t('机器人体系', qa('#dwBody .sysrow')[0].querySelector('u').textContent, qa('#dwBody .sysrow')[0].querySelector('u').textContent);

  console.log(errors.length ? 'RUNTIME:/n  ' + errors.slice(0, 5).join('\n  ') : 'NO RUNTIME ERRORS');
}, 600);
