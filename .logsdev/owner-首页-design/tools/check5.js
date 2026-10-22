const fs=require('fs'),path=require('path');const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'..','library-overview-demo.html'),'utf8');
const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(String(e.message||e)));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'http://localhost/',beforeParse(w){w.scrollTo=()=>{}}});
const {window}=dom;const q=s=>window.document.querySelector(s);const qa=s=>[...window.document.querySelectorAll(s)];
setTimeout(()=>{
  const t=(n,ok,x)=>console.log((ok?'PASS ':'FAIL ')+n+(x!==undefined?': '+x:''));
  t('象限热区',qa('#map .qz-tip').length,4);
  const br=q('#map .qz-tip[data-q="br"]');
  br.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
  t('空白象限弹窗',q('#pop').classList.contains('on')&&/右上象限/.test(q('#pop .pop-h').textContent),q('#pop .pop-h').textContent);
  t('分割线说明',/2 档与 3 档|2\.5/.test(q('#pop').textContent));
  window.document.body.click();
  const tl=q('#map .qz-tip[data-q="tl"]');
  tl.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
  t('左上象限弹窗',/小而精/.test(q('#pop .pop-h').textContent),q('#pop .pop-h').textContent);
  console.log(errs.length?'ERR '+errs[0]:'NO RUNTIME ERRORS');
},500);
