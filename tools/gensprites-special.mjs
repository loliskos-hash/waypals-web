// Rendert die Sondertauben (SPEC3, Index-Ansicht) nach sprites44/raw/x-<id>.png
// Aufruf: python3 tools/make-export-page.py && node tools/gensprites-special.mjs [id,id,...]
import {createRequire} from 'module';import fs from 'fs';
const require = createRequire('/opt/npm-tools/node_modules/');
const {chromium} = require('playwright');
const only=process.argv[2]?process.argv[2].split(','):null;
const browser = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const ctx = await browser.newContext({viewport:{width:390,height:844}});
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await ctx.addInitScript('try{localStorage.setItem("waypals-pref",JSON.stringify({lang:"de",d3:"1"}));localStorage.setItem("waypals-intro","1")}catch(e){}');
const page = await ctx.newPage();page.setDefaultTimeout(180000);
page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('C',m.text().slice(0,400))});
await page.goto('file://'+process.cwd()+'/page-export.html');await page.waitForTimeout(3000);
const ids=await page.evaluate(()=>Object.keys(window.__SPEC3||{}));
fs.mkdirSync('sprites44/raw',{recursive:true});
for(const key of ids){
  const id=key.slice(2);if(only&&!only.includes(id))continue;
  const fn=`sprites44/raw/x-${id}.png`;if(fs.existsSync(fn))continue;
  const t0=Date.now();
  const b64=await page.evaluate(s=>new Promise(res=>{__p3Make(s,false,async url=>{if(!url){res(null);return}const ab=await (await fetch(url)).arrayBuffer();let bin='';const u=new Uint8Array(ab);for(let i=0;i<u.length;i++)bin+=String.fromCharCode(u[i]);res(btoa(bin))})}),key+'|0');
  if(!b64){console.log('FAIL',id);continue}
  fs.writeFileSync(fn,Buffer.from(b64,'base64'));
  console.log(fn,Date.now()-t0,'ms');
}
await browser.close();
