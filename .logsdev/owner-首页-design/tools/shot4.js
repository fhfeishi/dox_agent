const fs = require('fs'), path = require('path');
const P = path.join(__dirname, '..', 'library-overview-demo.html');
const src = fs.readFileSync(P, 'utf8');
const mode = process.argv[2] || 'page';
const out = process.argv[3];

const HIDE_ALL = '.banner,#works,section[aria-label="工作台"],section[aria-label="我的工作"],.nav';
const HIDE = { page: '', ov: HIDE_ALL, side: HIDE_ALL, dw: HIDE_ALL, dwr: HIDE_ALL, dwp: HIDE_ALL, hover: HIDE_ALL };
const sel = HIDE[mode] || '';
const css = '<style>*{transition:none!important}'
  + (sel ? sel.split(',').filter(Boolean).map(x => x + '{display:none!important}').join('') : '')
  + (mode !== 'page' ? '.sec{margin-top:0!important}' : '')
  + '</style>';

const T = '<' + 'script>';
const E = '</' + 'script>';

let js = '';
if (mode === 'dw' || mode === 'dwr' || mode === 'dwp') {
  const who = mode === 'dwr' ? 'robo' : (mode === 'dwp' ? 'priv' : null);
  const pick = who
    ? 'var p=document.querySelector(\'#map .pt[data-id="' + who + '"]\');if(p)p.click();'
    : '';
  js = T + '(function(){' + pick
    + 'var b=document.querySelector("#detail #btnPreview");if(b)b.click();})();' + E;
}
if (mode === 'hover') {
  js = T + '(function(){var s=document.querySelectorAll("#detail .mbar")[2];'
    + 'if(s)s.dispatchEvent(new MouseEvent("mouseenter"));})();' + E;
}
fs.writeFileSync(out, src.replace('</head>', css + '</head>').replace('</body>', js + '</body>'));
console.log(out);
