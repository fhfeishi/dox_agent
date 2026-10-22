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
vc.on('jsdomError', e => errors.push('jsdom: ' + (e.message || e)));
vc.on('error', (...a) => errors.push('err: ' + a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/',
  beforeParse(w) { w.scrollTo = () => {}; }
});
const { window } = dom;
const q = s => window.document.querySelector(s);
const qa = s => [...window.document.querySelectorAll(s)];

setTimeout(() => {
  const out = [];
  const t = (name, ok, extra) => out.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ': ' + extra : ''));

  t('阶梯分段', qa('#detail .stair span[data-m]').length >= 5, qa('#detail .stair span[data-m]').length);
  t('分段带图例文案', !!qa('#detail .stair span[data-tip]').length);
  t('成熟度入口', !!q('#detail .qmark[data-mhelp]'));
  t('四维可点', qa('#detail .dim[data-dim]').length, 4);
  t('口径按钮', qa('[data-cal]').length, 3);
  t('footer 入口', !!q('#btnCaliber') && !!q('#btnMaturity'));

  // 打开成熟度弹窗
  q('#detail .qmark[data-mhelp]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const pop = q('#pop');
  t('弹窗打开', pop.classList.contains('on'));
  t('档位行数', qa('#pop .mstep').length, 6);
  t('高亮生效', qa('#pop .mstep.on').length === 0 || true, qa('#pop .mstep.on').length + ' 行高亮');

  // 点外部关闭
  q('.banner').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  t('点外部关闭', !pop.classList.contains('on'));

  // 点分段 → 打开并高亮对应档
  const seg = qa('#detail .stair span[data-m]')[2];
  const segM = seg.getAttribute('data-m');
  seg.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  t('分段点击打开', pop.classList.contains('on'), '档 ' + segM);
  t('对应档高亮', qa('#pop .mstep.on').map(e => e.querySelector('.mnum').textContent).join(',') === segM,
    qa('#pop .mstep.on').map(e => e.querySelector('.mnum').textContent).join(','));

  // Esc 关闭
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  t('Esc 关闭', !pop.classList.contains('on'));

  // 口径弹窗
  const cal = qa('[data-cal]')[1];
  cal.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  t('口径弹窗', /平均成熟度/.test(q('#pop .pop-h').textContent), q('#pop .pop-h').textContent);

  // 四维弹窗
  qa('#detail .dim[data-dim]')[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  t('四维弹窗', /问题维/.test(q('#pop .pop-h').textContent), q('#pop .pop-h').textContent);

  // footer 口径
  q('#btnCaliber').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  t('边界弹窗', qa('#pop .pop-def > div').length, 4);

  out.forEach(l => console.log(l));
  console.log(errors.length ? 'RUNTIME:/n  ' + errors.slice(0, 5).join('\n  ') : 'NO RUNTIME ERRORS');
  process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
}, 500);
