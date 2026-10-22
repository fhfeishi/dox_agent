const fs=require('fs'),path=require('path');const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'..','library-overview-demo.html'),'utf8');
const errs=[];const vc=new VirtualConsole();
vc.on('jsdomError',e=>errs.push(String(e.message||e)));
vc.on('error',(...a)=>errs.push(a.join(' ')));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'http://localhost/',beforeParse(w){w.scrollTo=()=>{}}});
const {window}=dom;const q=s=>window.document.querySelector(s);const qa=s=>[...window.document.querySelectorAll(s)];
const pick=id=>qa('#map .pt[data-id="'+id+'"]')[0].dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
setTimeout(()=>{
  const t=(n,ok,x)=>console.log((ok?'PASS ':'FAIL ')+n+(x!==undefined?': '+x:''));
  pick('robo');
  const rn = qa('#detail .d-note').map(e => e.textContent.trim());
  t('机器人双诊断', rn.length === 2 && /问题维/.test(rn.join('')), rn.join(' || '));
  q('#detail #btnPreview').click();
  t('机器人体系首位', q('#dwBody .sys-top u').textContent, q('#dwBody .sys-top u').textContent);
  t('机器人代表条目', qa('#dwBody .ev').length, qa('#dwBody .ev').length);
  q('#dwMask').click();

  pick('priv');
  const pn = qa('#detail .d-note').map(e => e.textContent.trim());
  t('隐私诊断', pn.length === 1 && /仅 0 条/.test(pn[0]), pn.join(' || '));
  q('#detail #btnPreview').click();
  t('隐私空态', /还没有条目达到成熟度 4/.test(q('#dwBody .dw-empty').textContent), q('#dwBody .dw-empty').textContent.trim());

  console.log(errs.length?'RUNTIME:/n  '+errs.slice(0,4).join('\n  '):'NO RUNTIME ERRORS');
},600);
