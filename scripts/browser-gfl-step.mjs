// Step preview integration checks, on the actual browser application / module Worker.
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const dir='artifacts/gfl-advisor';mkdirSync(dir,{recursive:true});
const root=path.resolve(process.env.SITE_DIR||'.'),fixture=JSON.parse(readFileSync('tests/fixtures/PV_Grid_Demo.json'));
const server=createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(!f.startsWith(root+path.sep)||!existsSync(f)||!statSync(f).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(f)]||'application/octet-stream');res.end(readFileSync(f));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage(),errors=[],checks=[];
page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
const origin=`http://127.0.0.1:${server.address().port}`;
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gridcraft-v1')));
const current=()=>page.locator('#stepPreviewPlot [data-curve="step-current"]');
const candidate=()=>page.locator('#stepPreviewPlot [data-curve="step-candidate"]');
const ready=async()=>{await page.waitForFunction(()=>document.getElementById('stepPreview')?.dataset.state==='ready');};
const edit=async(sel,value)=>{await page.locator(sel).fill(String(value));await page.locator(sel).dispatchEvent('change');};
const search=async()=>{await page.locator('#advisorGenerate').click();await page.waitForFunction(()=>!document.getElementById('advisorGenerate').disabled,{},{timeout:60000});await ready();};
try{
 await page.goto(origin+'/gfl.html?ibr=PV1');await page.evaluate(p=>localStorage.setItem('gridcraft-v1',JSON.stringify(p)),fixture);await page.reload();
 // RED: the existing implementation has metrics but no response view.
 await page.locator('#stepPreview').waitFor();await ready();assert.equal(await page.locator('#stepLoop').inputValue(),'P');assert.equal(await current().count(),1);assert.equal(await candidate().count(),0);
 assert.deepEqual((await saved()).extensions.gflPi.PV1.gains,fixture.extensions.gflPi.PV1.gains);checks.push('initial preview preserves imported gains and defaults to Vdc');
 const original=await current().getAttribute('d');await search();assert.equal(await candidate().count(),1);assert.equal(await current().getAttribute('d')===null,false);
 assert.deepEqual((await saved()).extensions.gflPi.PV1.gains,fixture.extensions.gflPi.PV1.gains);checks.push('current and candidate share a chart without application');
 const opts=await page.locator('#advisorChoice option').count();if(opts>1){const prior=await candidate().getAttribute('d');await page.locator('#advisorChoice').selectOption({index:1});await ready();assert.notEqual(await candidate().getAttribute('d'),prior);}checks.push('candidate selection updates its waveform');
 await page.locator('#stepShowCandidate').uncheck();assert.equal(await candidate().count(),0);await page.locator('#stepShowCandidate').check();assert.equal(await candidate().count(),1);checks.push('legend checkbox hides and restores a curve');
 for(const loop of ['d','q','Q','P']){await page.locator('#stepLoop').selectOption(loop);await ready();assert.equal(await current().count(),1);}checks.push('all four channels show actual response');
 await page.locator('#stepPreview').scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/step-preview-desktop.png',fullPage:false});
 await page.locator('#stepPreview').screenshot({path:dir+'/step-preview-card.png'});
 await page.locator('#advisorApply').click();await ready();assert.equal(await candidate().count(),0);const applied=(await saved()).extensions.gflPi.PV1.gains;assert.notDeepEqual(applied,fixture.extensions.gflPi.PV1.gains);
 await page.locator('#advisorRestore').click();await ready();assert.deepEqual((await saved()).extensions.gflPi.PV1.gains,fixture.extensions.gflPi.PV1.gains);assert.equal(await current().getAttribute('d'),original);checks.push('apply and restore update current curve without leftover candidate');
 await search();const field='[data-gain="P.kp"]',old=Number(await page.locator(field).inputValue());await edit(field,old*1.1);await ready();assert.equal(await candidate().count(),0);assert.notEqual(await current().getAttribute('d'),original);assert.match(await page.locator('#stepPreviewNotice').innerText(),/过期/);checks.push('manual PI change refreshes trace and hides stale candidate');
 // Rapid slider edits must show the final value and not resurrect a stale trace.
 await page.locator('[data-slider="P.kp"]').evaluate(el=>{for(const v of [Number(el.value)*.95,Number(el.value)*1.05]){el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));}});await ready();assert.equal(await candidate().count(),0);checks.push('slider edits are debounced/latest-only');
 await edit('[data-gain="P.kp"]',-1);await page.waitForFunction(()=>document.getElementById('stepPreview')?.dataset.state==='empty');assert.equal(await current().count(),0);
 await edit('[data-gain="P.kp"]',old);await ready();assert.equal(await current().count(),1);checks.push('invalid PI clears waveform and valid correction recovers');
 await edit('#field-delaySamples',1.5);await ready();assert.equal(await current().count(),0);assert.match(await page.locator('#stepPreviewMetrics').innerText(),/纯延时/);checks.push('delay never gets a fabricated zero-delay trace');
 await edit('#field-delaySamples',0);await ready();await edit('[data-gain="P.ti"]',.000001);await ready();assert.equal(await current().count(),0);assert.match(await page.locator('#stepPreviewMetrics').innerText(),/不稳定|数值/);checks.push('unstable model does not show a stable-looking curve');
 await edit('[data-gain="P.ti"]',1/fixture.extensions.gflPi.PV1.gains.P.ki);await ready();
 await page.locator('[data-mode="dMode"]').selectOption('P');await page.locator('[data-mode="qMode"]').selectOption('Q');await ready();assert.equal(await page.locator('#stepLoop').inputValue(),'d');assert.equal(await current().count(),0);checks.push('unconfigured P/Q mode has no fake curve and defaults to d');
 await page.locator('[data-mode="dMode"]').selectOption('Vdc');await page.locator('[data-mode="qMode"]').selectOption('Vac');await ready();await search();
 // Cross-tab edit kills the old candidate and updates the current waveform.
 const second=await context.newPage();await second.goto(origin+'/gfl.html?ibr=PV1');await second.locator('#bodePlot svg').waitFor();await second.locator('#field-filterVdcMs').fill('11');await second.locator('#field-filterVdcMs').dispatchEvent('change');await page.waitForTimeout(350);await ready();assert.equal(await candidate().count(),0);await second.close();checks.push('cross-tab facts cannot leave a stale comparison');
 for(const [name,width,height]of [['laptop',1366,768],['mobile',390,844]]){await page.setViewportSize({width,height});await page.locator('#stepPreview').scrollIntoViewIfNeeded();await page.waitForTimeout(120);await page.locator('#stepPreview').screenshot({path:dir+`/step-preview-${name}.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);}checks.push('responsive view has no page overflow at 390 and 1366 pixels');
 assert.equal(errors.length,0,errors.join('\n'));writeFileSync(dir+'/step-browser-verification.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(`Step preview: ${checks.length} browser flows passed.`);
}finally{await browser.close();server.close();}
