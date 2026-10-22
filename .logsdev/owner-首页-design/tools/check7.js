const fs=require('fs'),path=require('path');const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'..','library-overview-demo.html'),'utf8');
const errs=[];const vc=new VirtualConsole();
vc.on('jsdomError',e=>errs.push(String(e.message||e)));
vc.on('error',(...a)=>errs.push(a.join(' ')));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'http://localhost/',beforeParse(w){w.scrollTo=()=>{}}});
const {window}=dom;const q=s=>window.document.querySelector(s);const qa=s=>[...window.document.querySelectorAll(s)];
setTimeout(()=>{
  const t=(n,ok,x)=>console.log((ok?'PASS ':'FAIL ')+n+(x!==undefined?': '+x:''));
  // 默认库
  q('#detail #btnPreview').click();
  t('医疗抽屉', q('#drawer').classList.contains('on'), q('#dwName').textContent);
  q('#dwMask').click();
  // 切到机器人
  qa('#map .pt[data-id="robo"]')[0].dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
  t('切库后 sel', q('#detail .d-name').textContent, q('#detail .d-name').textContent);
  const btn=q('#detail #btnPreview');
  t('按钮存在', !!btn);
  btn.click();
  t('机器人抽屉 on', q('#drawer').classList.contains('on'), q('#dwName').textContent);
  t('体系行数', qa('#dwBody .sysrow').length, qa('#dwBody .sysrow').length);
  console.log(errs.length?'RUNTIME:/n  '+errs.slice(0,4).join('\n  '):'NO RUNTIME ERRORS');
},600);
