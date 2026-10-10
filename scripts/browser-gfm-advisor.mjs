// Real GFM page/Worker regression; never deploys or modifies a remote project.
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {demo} from '../examples/demo.js';
import {gfmContext,gfmDefaults} from '../project/gfm-settings.js';
import {autoTuneGfm} from '../analysis/gfm-pi.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const dir='artifacts/gfl-advisor';mkdirSync(dir,{recursive:true});const root=path.resolve(process.env.SITE_DIR||'.');
const server=createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(!f.startsWith(root+path.sep)||!existsSync(f)||!statSync(f).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(f)]||'application/octet-stream');res.end(readFileSync(f));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage(),errors=[],checks=[];
page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));const origin=`http://127.0.0.1:${server.address().port}`;
const fixture=demo('gfm480');fixture.extensions.gfmPi.GFM1.considerScr=true;
fixture.extensions.gfmPi.GFM1.gains=autoTuneGfm({...gfmContext(fixture,'GFM1'),...gfmDefaults(),considerScr:true}).gains;
fixture.extensions.gfmPi.GFM1.extraMetadata={keep:true};const original=structuredClone(fixture.extensions.gfmPi.GFM1.gains);
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gridcraft-v1')));
const edit=async(selector,value)=>{await page.locator(selector).fill(String(value));await page.locator(selector).dispatchEvent('change');};
const search=async()=>{await page.locator('#gfmGenerate').click();await page.waitForFunction(()=>document.querySelector('#gfmAdvisor')?.dataset.busy==='false',{},{timeout:70000});};
const waitGfmBode=async target=>{
 for(const loop of ['d','q','P','Q']){
  const chart=target.locator(`#bodePlot [data-bode-loop="${loop}"] svg`);
  await chart.waitFor();
  assert.equal(await chart.locator(`[data-bode-trace="${loop}"]`).count(),2,`${loop} must retain magnitude and phase traces`);
 }
 assert.equal(await target.locator('#bodePlot svg').count(),4,'GFM must render all four loop charts');
};
try{
 await page.goto(origin+'/gfm.html?ibr=GFM1');await page.evaluate(p=>localStorage.setItem('gridcraft-v1',JSON.stringify(p)),fixture);await page.reload();
 await page.locator('#gfmAdvisor').waitFor({timeout:4000});await waitGfmBode(page);
 assert.deepEqual((await saved()).extensions.gfmPi.GFM1.gains,original);assert.equal(await page.locator('#gfmAdvisorMode').inputValue(),'automatic');checks.push('load preserves legacy manual=false gains without search');
 await page.locator('#gfmAnalyze').click();assert.ok(await page.locator('#gfmCompare').innerText());assert.deepEqual((await saved()).extensions.gfmPi.GFM1.gains,original);checks.push('analyze current PI is independent of auto tuning');
 await search();assert.equal(await page.locator('#gfmApply').isEnabled(),true,await page.locator('#gfmAdvisorStatus').innerText());assert.deepEqual((await saved()).extensions.gfmPi.GFM1.gains,original);assert.match(await page.locator('#gfmCoupledCompare').innerText(),/Droop|droop/);checks.push('candidate uses selected coupled mode and never overwrites on search');
 await page.locator('#gfmAdvisor').screenshot({path:dir+'/gfm-advisor-desktop.png'});
 await page.locator('#gfmApply').click();const applied=(await saved()).extensions.gfmPi.GFM1.gains;assert.notDeepEqual(applied,original);
 await page.reload();await waitGfmBode(page);assert.deepEqual((await saved()).extensions.gfmPi.GFM1.gains,applied);
 await page.locator('#gfmRestore').click();assert.deepEqual((await saved()).extensions.gfmPi.GFM1.gains,original);assert.deepEqual((await saved()).extensions.gfmPi.GFM1.extraMetadata,{keep:true});checks.push('apply, reload and restore preserve metadata');
 const highPrecision=.687722425123456;await edit('[data-gain="d.kp"]:not([type="range"])',highPrecision);await page.locator('#gfmAnalyze').click();assert.equal((await saved()).extensions.gfmPi.GFM1.gains.d.kp,highPrecision);checks.push('manual PI edits keep full input precision');
 await page.locator('#gfmAdvisorMode').selectOption('target');await edit('#gfmFi',-1);await page.locator('#gfmGenerate').click();assert.match(await page.locator('#gfmAdvisorStatus').innerText(),/无效|正/);await waitGfmBode(page);checks.push('invalid request never clears current PI analysis');
 await edit('#gfmFi',500);await edit('#gfmFv',50);await search();assert.match(await page.locator('#gfmAdvisorStatus').innerText(),/目标未满足/);assert.equal(await page.locator('#gfmApply').isDisabled(),true);checks.push('strict 500/50 failure is not accepted as slow target success');
 await page.locator('#gfmAdvisorMode').selectOption('automatic');await page.locator('#gfmGenerate').click();await page.locator('#gfmCancel').click();assert.equal(await page.locator('#gfmApply').isDisabled(),true);checks.push('cancel clears worker without saving');
 const factsBefore=(await saved()).extensions.gfmPi.GFM1.gains;await edit('#targets [data-setting="delaySamples"]',1.5);assert.deepEqual((await saved()).extensions.gfmPi.GFM1.gains,factsBefore);assert.match(await page.locator('#gainMode').innerText(),/延时|Padé/);await edit('#targets [data-setting="delaySamples"]',0);checks.push('fixed-parameter edits preserve PI and distinguish delay approximation');
 await search();await edit('#filters [data-setting="filterVoltageMs"]',11);assert.equal(await page.locator('#gfmApply').isDisabled(),true);await edit('#filters [data-setting="filterVoltageMs"]',10);checks.push('input change expires old candidate');
 await page.locator('[data-mode="vsg"]').click();assert.equal((await saved()).extensions.gfmPi.GFM1.gains,undefined);assert.match(await page.locator('#gainMode').innerText(),/未保存|尚无/);
 await page.locator('[data-mode="droop"]').click();assert.deepEqual((await saved()).extensions.gfmPi.GFM1.gains,factsBefore);checks.push('separate mode banks keep unknown modes unapplied');
 await page.locator('#gfmGenerate').click();const other=await ctx.newPage();await other.goto(origin+'/gfm.html?ibr=GFM1');await waitGfmBode(other);
 await other.locator('#electrical [data-electrical="L"]').fill('160');await other.locator('#electrical [data-electrical="L"]').dispatchEvent('change');
 await page.waitForTimeout(350);assert.equal(await page.locator('#gfmApply').isDisabled(),true);await other.close();checks.push('cross-tab model updates invalidate running search');
 // Restore existing regression: unrelated remote title survives a local electrical edit.
 await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('gridcraft-v1'));p.name='Remote title';localStorage.setItem('gridcraft-v1',JSON.stringify(p));});
 await edit('#electrical [data-electrical="L"]',170);const concurrent=await saved();assert.equal(concurrent.name,'Remote title');assert.equal(concurrent.components.find(c=>c.id==='GFM1').parametersSI.filterInductanceH,170*1e-6);checks.push('local edit merges unrelated remote fields');
 await page.locator('#considerScr').uncheck();await search();assert.match(await page.locator('#gfmCoupledCompare').innerText(),/未启用|本地|未纳入/);assert.equal(await page.locator('#gfmApply').isEnabled(),true);checks.push('local baseline does not claim grid-coupled verification');
 for(const [name,width,height]of [['laptop',1366,768],['mobile',390,844]]){await page.setViewportSize({width,height});await page.locator('#gfmAdvisor').scrollIntoViewIfNeeded();await page.locator('#gfmAdvisor').screenshot({path:dir+`/gfm-advisor-${name}.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);}
 checks.push('desktop and mobile no document overflow');assert.deepEqual(errors,[]);writeFileSync(dir+'/gfm-advisor-browser.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(`GFM advisor: ${checks.length} browser flows passed.`);
}finally{await browser.close();server.close();}
