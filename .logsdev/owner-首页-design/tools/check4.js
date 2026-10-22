const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const P = path.join(__dirname, '..', 'library-overview-demo.html');
const html = fs.readFileSync(P, 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(String(e.message || e)));
vc.on('error', (...a) => errors.push(a.join(' ')));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/', beforeParse(w) { w.scrollTo = () => {}; } });
const { window } = dom;
const q = s => window.document.querySelector(s);
const qa = s => [...window.document.querySelectorAll(s)];

setTimeout(() => {
  const t = (n, ok, x) => console.log((ok ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? ': ' + x : ''));

  // 阶梯段 hover
  const seg = qa('#detail .stair span[data-m]')[2];
  seg.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: false }));
  const hint = q('#hint');
  t('hover 浮层出现', !!hint && hint.classList.contains('on'));
  t('浮层文案', hint && /算法与模型验证/.test(hint.textContent), hint && hint.textContent.trim());
  seg.dispatchEvent(new window.MouseEvent('mouseleave', { bubbles: false }));
  t('离开隐藏', hint && !hint.classList.contains('on'));

  // 锚点标记
  const cal = qa('[data-cal]')[0];
  cal.click();
  t('锚点高亮', cal.classList.contains('anchor-on'));
  t('弹窗内容', /技术条目数/.test(q('#pop .pop-h').textContent), q('#pop .pop-h').textContent);
  // 切换到另一个锚点
  const cal2 = qa('[data-cal]')[2];
  cal2.click();
  t('切换锚点', cal2.classList.contains('anchor-on') && !cal.classList.contains('anchor-on'));
  // 关闭后清除
  window.document.body.click();
  t('关闭清除标记', !cal2.classList.contains('anchor-on'));

  // 切换库时弹窗关闭
  q('#detail .qmark').click();
  const b = qa('#map .pt[data-id="robo"]')[0];
  b && b.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  t('切库关弹窗', !q('#pop').classList.contains('on'));

  console.log(errors.length ? 'RUNTIME:/n  ' + errors.slice(0, 4).join('\n  ') : 'NO RUNTIME ERRORS');
}, 500);
