// Browser regression runner (development/CI only).
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('artifacts/gfl-advisor',{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(process.env.SITE_DIR||'.'),data=JSON.parse(readFileSync('tests/fixtures/PV_Grid_Demo.json'));
const server=createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404).end();return;}const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'}[path.extname(file)]||'application/octet-stream';res.setHeader('Content-Type',type);res.end(readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gridcraft-v1')));
const select=async(id,value)=>page.locator(id).selectOption(value);
const edit=async(id,value)=>{await page.locator(id).fill(String(value));await page.locator(id).dispatchEvent('change');};
const search=async()=>{await page.locator('#advisorGenerate').click();await page.waitForFunction(()=>!document.getElementById('advisorGenerate').disabled,{},{timeout:60000});};
try{
 await page.goto(origin+'/gfl.html?ibr=PV1');await page.evaluate(p=>localStorage.setItem('gridcraft-v1',JSON.stringify(p)),data);await page.reload();
 await page.locator('#bodePlot svg').waitFor();assert.deepEqual((await saved()).extensions.gflPi.PV1.gains,data.extensions.gflPi.PV1.gains);
 await page.locator('#advisorAnalyze').click();assert.match(await page.locator('#advisorCurrent').innerText(),/7\.21/);
 await select('#advisorMode','target');await edit('#advisorFi',500);await edit('#advisorFp',50);await edit('#advisorMinimumFp',40);await page.locator('#advisorAllowReduction').check();await search();
 assert.match(await page.locator('#advisorStatus').innerText(),/目标未满足/);assert.equal(await page.locator('#advisorApply').isDisabled(),true);
 await select('#advisorMode','automatic');const before=await saved();await search();assert.deepEqual((await saved()).components,before.components);assert.deepEqual((await saved()).extensions.gflPi.PV1.gains,before.extensions.gflPi.PV1.gains);
 assert.equal(await page.locator('#advisorApply').isEnabled(),true);await page.screenshot({path:'artifacts/gfl-advisor/desktop-candidates.png',fullPage:true});
 await page.locator('#advisorApply').click();await page.waitForTimeout(200);const applied=(await saved()).extensions.gflPi.PV1.gains;assert.notDeepEqual(applied,before.extensions.gflPi.PV1.gains);
 await page.reload();await page.locator('#bodePlot svg').waitFor();assert.deepEqual((await saved()).extensions.gflPi.PV1.gains,applied);
 await page.locator('#advisorRestore').click();assert.deepEqual((await saved()).extensions.gflPi.PV1.gains,before.extensions.gflPi.PV1.gains);
 await page.locator('#advisorGenerate').click();await page.locator('#advisorCancel').click();await page.waitForTimeout(500);assert.equal(await page.locator('#advisorApply').isDisabled(),true);
 await select('#advisorMode','target');await edit('#advisorFi',-1);assert.ok(await page.locator('#bodePlot svg').count());await page.locator('#advisorGenerate').click();assert.match(await page.locator('#advisorStatus').innerText(),/目标|正/);assert.ok(await page.locator('#bodePlot svg').count());
 await select('#advisorMode','automatic');await edit('#field-filterCurrentMs',.1);assert.ok(await page.locator('#bodePlot svg').count());assert.deepEqual((await saved()).extensions.gflPi.PV1.gains,before.extensions.gflPi.PV1.gains);await edit('#field-filterCurrentMs',1);
 await search();await edit('#field-filterVdcMs',12);assert.equal(await page.locator('#advisorApply').isDisabled(),true);await edit('#field-filterVdcMs',10);
 // Cross-tab fact changes invalidate the first tab's candidate.
 await search();const second=await context.newPage();await second.goto(origin+'/gfl.html?ibr=PV1');await second.locator('#bodePlot svg').waitFor();await second.locator('#field-filterVdcMs').fill('11');await second.locator('#field-filterVdcMs').dispatchEvent('change');await page.waitForTimeout(300);assert.equal(await page.locator('#advisorApply').isDisabled(),true);await second.close();
 // Previously unconfigured modes keep no gains until explicit application.
 await page.locator('[data-mode="dMode"]').selectOption('P');await page.locator('[data-mode="qMode"]').selectOption('Q');assert.equal((await saved()).extensions.gflPi.PV1.gains,undefined);await search();assert.equal(await page.locator('#advisorApply').isEnabled(),true);await page.locator('#advisorApply').click();assert.ok((await saved()).extensions.gflPi.PV1.gains);await page.locator('[data-mode="dMode"]').selectOption('Vdc');await page.locator('[data-mode="qMode"]').selectOption('Vac');assert.deepEqual((await saved()).extensions.gflPi.PV1.gains,before.extensions.gflPi.PV1.gains);
 for(const [name,width,height]of [['laptop',1366,768],['narrow',390,844]]){await page.setViewportSize({width,height});await page.screenshot({path:`artifacts/gfl-advisor/${name}.png`,fullPage:true});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);assert.equal(overflow,false,name+' horizontal document overflow');}
 assert.equal(errors.length,0,errors.join('\n'));writeFileSync('artifacts/gfl-advisor/browser-verification.json',JSON.stringify({passed:true,errors,checks:16},null,2));console.log('Browser regression: 16 flows passed.');
}finally{await browser.close();server.close();}
