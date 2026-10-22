const fs = require('fs'), path = require('path');
const P = path.join(__dirname, '..', 'library-overview-demo.html');
const src = fs.readFileSync(P, 'utf8');
const mode = process.argv[2] || 'page';
const out = process.argv[3];

const HIDE = {
  page: '',
  ov: '.banner,#works,section[aria-label="工作台"],section[aria-label="我的工作"],.nav',
  mat: '.banner,#works,section[aria-label="工作台"],section[aria-label="我的工作"],.nav',
  mat5: '.banner,#works,section[aria-label="工作台"],section[aria-label="我的工作"],.nav',
  dim: '.banner,#works,section[aria-label="工作台"],section[aria-label="我的工作"],.nav',
  cal: '.banner,#works,section[aria-label="工作台"],section[aria-label="我的工作"],.nav',
  hover: '.banner,#works,section[aria-label="工作台"],section[aria-label="我的工作"],.nav',
  foot: '.banner,#works,section[aria-label="工作台"],section[aria-label="我的工作"],.nav',
  qz: '.banner,#works,section[aria-label="工作台"],section[aria-label="我的工作"],.nav',
  qz2: '.banner,#works,section[aria-label="工作台"],section[aria-label="我的工作"],.nav'
};
const sel = HIDE[mode] || '';
const css = '<style>*{transition:none!important;animation:none!important}'
  + (sel ? sel.split(',').filter(Boolean).map(x => x + '{display:none!important}').join('') : '')
  + (mode !== 'page' ? '.sec{margin-top:0!important}' : '')
  + '</style>';

let js = '';
if (mode === 'mat') {
  js = '<script>setTimeout(function(){var b=document.querySelector("#detail .qmark");if(b)b.click();},350);</script>';
}
if (mode === 'mat5') {
  js = '<script>setTimeout(function(){var s=document.querySelectorAll("#detail .stair span[data-m]");if(s[4])s[4].click();},350);</script>';
}
if (mode === 'cal') {
  js = '<script>setTimeout(function(){var b=document.querySelectorAll("[data-cal]")[1];if(b)b.click();},350);</script>';
}
if (mode === 'dim') {
  js = '<script>setTimeout(function(){var b=document.querySelectorAll("#detail .dim")[1];if(b)b.click();},350);</script>';
}
if (mode === 'qz') {
  js = '<script>setTimeout(function(){var g=document.querySelector(\'#map .qz-tip[data-q="br"]\');if(g)g.dispatchEvent(new MouseEvent("click",{bubbles:true}));},350);</script>';
}
if (mode === 'qz2') {
  js = '<script>setTimeout(function(){var g=document.querySelector(\'#map .qz-tip[data-q="tl"]\');if(g)g.dispatchEvent(new MouseEvent("click",{bubbles:true}));},350);</script>';
}
if (mode === 'foot') {
  js = '<script>setTimeout(function(){var b=document.querySelector("#btnCaliber");if(b)b.click();},350);</script>';
}
if (mode === 'qz') {
  js = '<script>setTimeout(function(){var g=document.querySelector(\'#map .qz-tip[data-q="br"]\');if(g)g.dispatchEvent(new MouseEvent("click",{bubbles:true}));},350);</script>';
}
if (mode === 'qz2') {
  js = '<script>setTimeout(function(){var g=document.querySelector(\'#map .qz-tip[data-q="tl"]\');if(g)g.dispatchEvent(new MouseEvent("click",{bubbles:true}));},350);</script>';
}
if (mode === 'foot') {
  js = '<script>setTimeout(function(){window.scrollTo(0,document.body.scrollHeight);'
     + 'setTimeout(function(){var b=document.querySelector("#btnCaliber");if(b)b.click();},260);},200);</script>';
}
if (mode === 'hover') {
  js = '<script>setTimeout(function(){var s=document.querySelectorAll("#detail .stair span[data-m]")[2];'
     + 'if(s)s.dispatchEvent(new MouseEvent("mouseenter",{bubbles:false}));},350);</script>';
}
fs.writeFileSync(out, src.replace('</head>', css + '</head>').replace('</body>', js + '</body>'));
console.log(out);
