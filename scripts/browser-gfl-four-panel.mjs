// Real HTTP + Worker checks for the approved 2x2 layouts and stationary editing.
// Scope scalar Bode assertions to its host: the independent dq model has its own 2x2 matrix.
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out='artifacts/gfl-advisor';mkdirSync(out,{recursive:true});
const root=path.resolve(process.env.SITE_DIR||'.'),fixture=JSON.parse(readFileSync('tests/fixtures/PV_Grid_Demo.json'));
const server=createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(!f.startsWith(root+path.sep)||!existsSync(f)||!statSync(f).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(f)]||'application/octet-stream');res.end(readFileSync(f));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[],checks=[],measurements={};
const origin=`http://127.0.0.1:${server.address().port}`;page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
const record=async(name,fn)=>{try{await fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,message:e.message});}};
const ready=()=>page.waitForFunction(()=>document.getElementById('stepPreview')?.dataset.state==='ready');
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gridcraft-v1')));
const edit=async(sel,v)=>{await page.locator(sel).fill(String(v));await page.locator(sel).dispatchEvent('change');};
const layout=()=>page.evaluate(()=>({page:document.documentElement.scrollHeight,preview:document.getElementById('stepPreview').getBoundingClientRect().height,diagram:document.getElementById('diagramHost').getBoundingClientRect().top+scrollY,scroll:scrollY,editY:document.querySelector('[data-gain="P.kp"]').getBoundingClientRect().top}));
const grid=async selector=>{const rs=await page.locator(selector).evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));assert.equal(rs.length,4);assert.ok(Math.abs(rs[0].y-rs[1].y)<2&&rs[1].x>rs[0].x);assert.ok(Math.abs(rs[2].y-rs[3].y)<2&&rs[2].y>rs[0].y);};
try{
 await page.goto(origin+'/gfl.html?ibr=PV1');await page.evaluate(p=>localStorage.setItem('gridcraft-v1',JSON.stringify(p)),fixture);await page.reload();await ready();
 await record('desktop Bode is four independent magnitude/phase cards',async()=>{await grid('#bodePlot [data-bode-loop]');assert.equal(await page.locator('#bodePlot svg').count(),4);});
 await record('desktop step preview is four independent current/candidate cards',async()=>{await grid('[data-step-loop]');assert.equal(await page.locator('#stepPreview [data-curve="step-current"]').count(),4);});
 await record('SCR scope explicitly states included grid dynamics and excluded PLL',async()=>{await page.locator('#modelScope').evaluate(el=>el.closest('details').open=true);const t=await page.locator('#modelScope').innerText({timeout:1000});assert.match(t,/已启用/);assert.match(t,/RC/);assert.match(t,/未包含 PLL/);assert.doesNotMatch(await page.locator('#controlDiagram').textContent(),/PCC 电压与 dq 耦合/);await page.locator('#modelScope').evaluate(el=>el.closest('details').open=false);});
 // Record the entire rendering transition, not only a final screenshot.
 await page.locator('[data-gain="P.kp"]').scrollIntoViewIfNeeded();await page.waitForTimeout(100);
 const base=await layout();measurements.before=base;
 await page.evaluate(()=>{const el=document.querySelector('[data-gain="P.kp"]');el.focus({preventScroll:true});window.__editNode=el;window.__layoutFrames=[];let n=0;const tick=()=>{const r=document.getElementById('stepPreview').getBoundingClientRect();window.__layoutFrames.push({height:document.documentElement.scrollHeight,preview:r.height,editY:el.getBoundingClientRect().top,scroll:scrollY});if(++n<45)requestAnimationFrame(tick);};requestAnimationFrame(tick);el.value=Number(el.value)*1.05;el.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.waitForTimeout(900);await ready();measurements.frames=await page.evaluate(()=>window.__layoutFrames);measurements.after=await layout();
 await record('manual PI update keeps document and preview height throughout loading',async()=>{const heights=[base.page,...measurements.frames.map(f=>f.height)];assert.ok(Math.max(...heights)-Math.min(...heights)<=2,`document shift ${Math.max(...heights)-Math.min(...heights)} px`);const ph=[base.preview,...measurements.frames.map(f=>f.preview)];assert.ok(Math.max(...ph)-Math.min(...ph)<=2,`preview shift ${Math.max(...ph)-Math.min(...ph)} px`);});
 await record('manual PI update preserves input DOM, focus and viewport location',async()=>{assert.ok(await page.evaluate(()=>document.activeElement===window.__editNode&&document.querySelector('[data-gain="P.kp"]')===window.__editNode));assert.ok(Math.abs(measurements.after.editY-base.editY)<=2);});
 await edit('[data-gain="P.kp"]',fixture.extensions.gflPi.PV1.gains.P.kp);await ready();
 await record('manual precision is preserved when a focused gain input blurs',async()=>{const expected=fixture.extensions.gflPi.PV1.gains.P.kp;assert.equal(Number(await page.locator('[data-gain="P.kp"]').inputValue()),expected);await page.locator('[data-gain="P.kp"]').blur();assert.equal((await saved()).extensions.gflPi.PV1.gains.P.kp,expected);});
 const beforeSearch=await layout(),beforeGains=(await saved()).extensions.gflPi.PV1.gains;
 await page.locator('#advisorGenerate').click();await page.waitForFunction(()=>!document.getElementById('advisorGenerate').disabled,{},{timeout:60000});await ready();
 await record('four step comparisons appear without changing gains or panel height',async()=>{assert.equal(await page.locator('#stepPreview [data-curve="step-candidate"]').count(),4);assert.deepEqual((await saved()).extensions.gflPi.PV1.gains,beforeGains);assert.ok(Math.abs((await layout()).preview-beforeSearch.preview)<=2);});
 await record('SVG clipping identifiers do not collide across four step panels',async()=>{const ids=await page.locator('#stepPreview clipPath').evaluateAll(ns=>ns.map(n=>n.id));assert.equal(ids.length,4);assert.equal(new Set(ids).size,4);});
 await record('all four loop names follow the chosen outer modes',async()=>{assert.match(await page.locator('[data-step-loop="P"] h4').innerText({timeout:1000}),/Vdc/);assert.match(await page.locator('#bodePlot [data-bode-loop="Q"] h3').innerText({timeout:1000}),/Vac/);});
 if(await page.locator('[data-step-loop]').count()===4){await page.locator('#stepPreview').screenshot({path:out+'/four-step-desktop.png'});await page.locator('#bodePlot').screenshot({path:out+'/four-bode-desktop.png'});}
 const beforeStale=await layout();await edit('[data-gain="P.kp"]',Number(beforeGains.P.kp)*1.1);await ready();
 await record('stale candidate hides all four traces without collapsing its metric space',async()=>{assert.equal(await page.locator('#stepPreview [data-curve="step-candidate"]').count(),0);assert.ok(Math.abs((await layout()).preview-beforeStale.preview)<=2);assert.match(await page.locator('#stepPreviewNotice').innerText(),/过期/);});
 await record('Bode mode switch updates every card without changing gains',async()=>{const open=await page.locator('#bodePlot').innerHTML(),before=(await saved()).extensions.gflPi.PV1.gains;await page.locator('#bodeMode').selectOption('closed');assert.equal(await page.locator('#bodePlot svg').count(),4);assert.notEqual(await page.locator('#bodePlot').innerHTML(),open);assert.deepEqual((await saved()).extensions.gflPi.PV1.gains,before);await page.locator('#bodeMode').selectOption('open');});
 await page.locator('[data-mode="qMode"]').selectOption('Q');await page.locator('#considerScr').uncheck();await ready();
 await record('disabled SCR and Q mode produce accurate scope and labels',async()=>{await page.locator('#modelScope').evaluate(el=>el.closest('details').open=true);const t=await page.locator('#modelScope').innerText({timeout:1000});assert.match(t,/未启用/);assert.match(t,/不使用上游电网阻抗/);assert.match(await page.locator('[data-step-loop="Q"] h4').innerText({timeout:1000}),/Q 外环/);await page.locator('#modelScope').evaluate(el=>el.closest('details').open=false);});
 await page.locator('#considerScr').check();await page.locator('[data-mode="qMode"]').selectOption('Vac');await ready();
 const stableSize=await layout();await edit('[data-gain="P.kp"]',-1);await page.waitForTimeout(250);
 await record('invalid PI keeps fixed chart space, clears responses and preserves active input',async()=>{assert.equal(await page.locator('#stepPreview [data-curve="step-current"]').count(),0);assert.ok(Math.abs((await layout()).preview-stableSize.preview)<=2);assert.equal(await page.locator('#bodePlot [data-bode-loop]').count(),4);});
 await edit('[data-gain="P.kp"]',beforeGains.P.kp);await ready();
 for(const [name,width,height]of [['laptop',1366,768],['mobile',390,844]]){await page.setViewportSize({width,height});await page.waitForTimeout(200);await record(`${name} grid is readable and has no page overflow`,async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);if(width>1000){await grid('[data-step-loop]');await grid('#bodePlot [data-bode-loop]');}else{const rs=await page.locator('[data-step-loop]').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().y));assert.equal(rs.length,4);assert.ok(rs.every((y,i)=>i===0||y>rs[i-1]));}});if(await page.locator('[data-step-loop]').count()===4)await page.locator('#stepPreview').screenshot({path:out+`/four-step-${name}.png`});}
 await record('no browser page errors',async()=>assert.deepEqual(errors,[]));
}finally{writeFileSync(out+'/four-panel-browser.json',JSON.stringify({checks,measurements,errors},null,2));await browser.close();server.close();}
const failures=checks.filter(c=>!c.passed);console.log(JSON.stringify(checks,null,2));assert.equal(failures.length,0,failures.map(f=>f.name+': '+f.message).join('\n'));console.log(`Four-panel browser checks: ${checks.length} passed.`);
