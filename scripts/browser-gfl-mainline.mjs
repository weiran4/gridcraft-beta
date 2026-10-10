/** Real HTTP/module-Worker/UI gate. Run only on an authorized browser host.
 * Syntax-checking this file is NOT browser evidence. No publishing is performed.
 */
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {demo} from '../examples/demo.js';
import {gfmContext,gfmDefaults} from '../project/gfm-settings.js';
import {autoTuneGfm} from '../analysis/gfm-pi.js';
const out='artifacts/gfl-advisor',root=path.resolve(process.env.SITE_DIR||'dist');mkdirSync(out,{recursive:true});
const report={status:'running',passed:false,checks:[],errors:[],viewports:[{width:1440,height:1000},{width:390,height:844}],environment:{node:process.version,platform:process.platform,siteDir:root},releaseId:null};
const persist=()=>writeFileSync(out+'/mainline-browser-verification.json',JSON.stringify(report,null,2)+'\n');
const record=(name,details={})=>{report.checks.push({name,...details});console.log('PASS '+name);persist();};
let browser,server;
try{
 const manifest=JSON.parse(readFileSync(path.join(root,'release.json'),'utf8'));report.releaseId=manifest.releaseId;report.sourceCommit=manifest.sourceCommit;report.sourceState=manifest.sourceState;
 for(const [name,digest]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(readFileSync(path.join(root,name))).digest('hex'),digest,name);
 record('built asset bytes match the release manifest',{assets:Object.keys(manifest.files).length});
 server=createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(!f.startsWith(root+path.sep)||!existsSync(f)||!statSync(f).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(f)]||'application/octet-stream');res.end(readFileSync(f));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 report.environment.browser=browser.version();
 const original=JSON.parse(readFileSync('tests/fixtures/PV_Grid_Demo.json'));
 const stable=structuredClone(original),stored=stable.extensions.gflPi.PV1;
 Object.assign(stored,{dMode:'P',qMode:'Q',filterCurrentMs:.1,filterVoltageMs:.1,manual:true,advisor:{request:{separationRatio:4,fi:500,fp:50}}});
 stored.gainBank['P/Q']={gains:structuredClone(stored.gains),manual:true};
 stable.components.find(c=>c.id==='PV1').parametersSI.activePowerW=2e5;
 for(const viewport of report.viewports){
  const tag=viewport.width+'x'+viewport.height,context=await browser.newContext({viewport,acceptDownloads:true}),page=await context.newPage();
  page.setDefaultTimeout(30000);page.on('pageerror',error=>report.errors.push({viewport:tag,message:error.message}));
  // Test-only transport gate: compute with real module Workers, hold an actual
  // apply-check terminal packet, then exercise the page's edit/callback fence.
  await page.addInitScript(()=>{
   const NativeWorker=window.Worker,setItem=Storage.prototype.setItem;
   const probe=window.__pendingApplyProbe={hold:false,pending:[],writes:0};
   Storage.prototype.setItem=function(key,value){if(key==='gridcraft-v1')probe.writes++;return setItem.call(this,key,value);};
   window.Worker=class{
    constructor(...args){this.native=new NativeWorker(...args);this.terminated=false;
     this.native.onmessage=event=>{if(probe.hold&&this.job?.kind==='apply-check'&&event.data.type==='result'){probe.pending.push({callback:this.onmessage,errorCallback:this.onerror,event,transport:this});return;}this.onmessage?.(event);};
     this.native.onerror=event=>this.onerror?.(event);
    }
    postMessage(data,...args){this.job=data;return this.native.postMessage(data,...args);}
    terminate(){this.terminated=true;this.native.terminate();}
   };
  });
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gridcraft-v1')));
  const edit=async(selector,value)=>{await page.locator(selector).fill(String(value));await page.locator(selector).dispatchEvent('change');await page.locator(selector).blur();};
  const seed=async(project,url='/gfl.html?ibr=PV1')=>{await page.goto(origin+url);await page.evaluate(p=>localStorage.setItem('gridcraft-v1',JSON.stringify(p)),project);await page.reload();};
  const ready=()=>page.waitForFunction(()=>document.querySelector('#gflMainlineResults')?.getAttribute('aria-busy')==='false'&&document.querySelector('#gflMainlineCharts .mainline-summary[data-evaluation-fingerprint]'));
  const manualReady=()=>page.waitForFunction(()=>document.querySelector('#manualWorkspace')?.dataset.busy==='false'&&document.querySelectorAll('#gflMainlineCharts .mainline-summary[data-evaluation-fingerprint]').length===2);
  const download=async()=>{const pending=page.waitForEvent('download');await page.locator('#exportPi').click();const file=await pending;return JSON.parse(readFileSync(await file.path(),'utf8'));};
  const noPass=async()=>{assert.equal(await page.locator('#gflMainlineCharts [data-eligible="true"]').count(),0);assert.equal(await page.locator('#advisorApply').isDisabled(),true);assert.equal(await page.locator('#manualApply').isDisabled(),true);};
  await seed(original);await page.locator('#bodePlot svg').first().waitFor();
  assert.equal(await page.locator('#gflAnalysisModel').inputValue(),'legacy-scalar');assert.deepEqual((await saved()).extensions.gflPi.PV1.gains,original.extensions.gflPi.PV1.gains);
  let exported=await download();assert.equal(exported.currentAnalysis.modelId,'legacy-scalar');assert.equal(exported.currentAnalysis.model,null);
  record(tag+' legacy import stays scalar and PI-identical');
  await seed(stable);await page.locator('#bodePlot svg').first().waitFor();await page.locator('#gflAnalysisModel').selectOption('gfl-dq-reference-v1');await ready();
  exported=await download();let evaluation=exported.currentAnalysis;
  assert.equal(exported.freshness.status,'current');assert.equal(evaluation.modelId,'gfl-dq-reference-v1');assert.equal(evaluation.application.eligible,true);
  assert.deepEqual((await saved()).extensions.gflPi.PV1.gains,stored.gains);assert.equal(await page.locator('#gflMainlineResults').isVisible(),true);
  assert.ok(evaluation.model.states.some(s=>s.legacyName==='pllAngle'));assert.equal(evaluation.model.A.length,evaluation.model.states.length);
  assert.equal(evaluation.model.C.length,evaluation.model.outputs.length);assert.ok(evaluation.model.outputs.every(p=>p.unit&&p.frame&&Object.hasOwn(p,'baseSI')));
  const plotted=await page.locator('#gflMainlineCharts [data-evaluation-fingerprint]').evaluateAll(nodes=>nodes.map(n=>({evaluation:n.dataset.evaluationFingerprint,experiment:n.dataset.experimentFingerprint,experimentId:n.dataset.experimentId})));
  assert.ok(plotted.length>4);for(const item of plotted){assert.equal(item.evaluation,evaluation.evaluationFingerprint);if(item.experiment)assert.equal(item.experiment,evaluation.experimentFingerprints[item.experimentId]);}
  assert.ok(await page.locator('#gflMainlineCharts .mainline-channel-metrics').count());
  record(tag+' opt-in plots, metrics, matrices, ordered units and export share current evidence');
  await page.locator('#manualReset').click();await manualReady();
  assert.deepEqual(await page.locator('#gflMainlineCharts .mainline-summary').evaluateAll(ns=>ns.map(n=>n.dataset.evaluationFingerprint)),[evaluation.evaluationFingerprint,evaluation.evaluationFingerprint]);
  const identity=evaluation.evaluationFingerprint;await page.locator('#gflResponseUnits').selectOption('si');await page.locator('#gflResponseQuantity').selectOption('absolute');
  assert.equal((await download()).currentAnalysis.evaluationFingerprint,identity);await page.locator('#gflExperiment').selectOption('current-reference-frozen-outer');
  assert.ok(await page.locator('#gflMainlineCharts [data-input-id="reference.current.d"]').count());
  await page.locator('#gflResponseUnits').selectOption('pu');await page.locator('#gflResponseQuantity').selectOption('increment');await page.locator('#gflExperiment').selectOption('outer-reference-closed');
  record(tag+' same-PI manual/current agree; display transforms retain evidence identity');
  // Exercise actual module Workers through the shipped client. Auto candidates
  // are compared with fresh evaluate/apply-check using exactly their own PI.
  const parity=await page.evaluate(async release=>{
   const {readGflApplicationContext}=await import('/project/gfl-analysis-evidence.js?v='+release);
   const p=JSON.parse(localStorage.getItem('gridcraft-v1')),c=readGflApplicationContext(p,'PV1');
   const payload={snapshot:c.snapshot,gains:c.baselineGains,baselineGains:c.baselineGains,request:c.request,experiments:c.experiments,policy:c.policy};
   const run=(kind,data)=>new Promise((resolve,reject)=>{const worker=new Worker('/ui/gfl-analysis-worker.js?v='+release,{type:'module'}),timer=setTimeout(()=>{worker.terminate();reject(Error('Worker timeout'));},60000);worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(Error(e.message));};worker.onmessage=({data:m})=>{if(m.type==='error'){clearTimeout(timer);worker.terminate();reject(Error(m.message));}if(m.type==='result'){clearTimeout(timer);worker.terminate();resolve(m.result);}};worker.postMessage({type:'run',kind,requestId:1,requestKey:'browser-parity',payload:data});});
   const search=await run('search',{...payload,options:{maxInner:1}});
   if(!search.completionScope.complete||!search.candidates.length)throw Error('Bounded search did not complete with a candidate: '+search.searchStatus);
   const candidate=search.candidates[0],fresh=await run('evaluate',{...payload,gains:candidate.gains}),apply=await run('apply-check',{...payload,gains:candidate.gains});
   if(JSON.stringify(candidate.mainlineEvaluation)!==JSON.stringify(fresh)||JSON.stringify(fresh)!==JSON.stringify(apply))throw Error('Same-PI candidate/evaluate/apply-check disagreement');
   return {searchStatus:search.searchStatus,candidateGains:candidate.gains,evaluationFingerprint:fresh.evaluationFingerprint,modelFingerprint:fresh.modelFingerprint,performance:fresh.performance};
  },manifest.releaseId);
  for(const loop of ['d','q','P','Q'])for(const gain of ['kp','ki'])await edit(`[data-manual-gain="${loop}.${gain}"]`,parity.candidateGains[loop][gain]);
  await manualReady();assert.equal(await page.locator('#gflMainlineCharts .mainline-summary').last().getAttribute('data-evaluation-fingerprint'),parity.evaluationFingerprint);
  record(tag+' same-PI auto/current/manual/apply-check Worker parity',{searchStatus:parity.searchStatus,performance:parity.performance});
  // Cancel a real in-progress Worker, then deliver its captured late callback.
  // This fault injection checks the generation fence; it is not a fake solve.
  const cancelled=await page.evaluate(async release=>{
   const {createGflAnalysisClient}=await import('/ui/gfl-analysis-client.js?v='+release);
   const {readGflApplicationContext}=await import('/project/gfl-analysis-evidence.js?v='+release);
   const p=JSON.parse(localStorage.getItem('gridcraft-v1')),c=readGflApplicationContext(p,'PV1');let client,transport,resolve,reject;const events=[],done=new Promise((a,b)=>{resolve=a;reject=b;});
   const timer=setTimeout(()=>reject(Error('No response progress before cancellation')),15000);
   client=createGflAnalysisClient({workerFactory:()=>{const worker=new Worker('/ui/gfl-analysis-worker.js?v='+release,{type:'module'});transport={postMessage:data=>{transport.sent=data;worker.postMessage(data);},terminate:()=>worker.terminate()};worker.onmessage=event=>transport.onmessage(event);worker.onerror=e=>reject(Error(e.message));return transport;},onEvent:event=>{events.push(event.type);if(event.type==='progress'&&event.progress.phase==='response'){const callback=transport.onmessage,message=transport.sent;client.cancel();callback({data:{type:'result',requestId:message.requestId,requestKey:message.requestKey,result:{application:{eligible:true}}}});clearTimeout(timer);resolve();}}});
   try{client.start({kind:'evaluate',requestKey:'browser-cancel',payload:{snapshot:c.snapshot,gains:c.baselineGains,request:c.request,experiments:c.experiments,policy:c.policy}});await done;return {events,busy:client.busy,projectUnchanged:JSON.stringify(p)===JSON.stringify(JSON.parse(localStorage.getItem('gridcraft-v1')))};}finally{clearTimeout(timer);client.destroy();}
  },manifest.releaseId);
  assert.equal(cancelled.events.includes('result'),false);assert.equal(cancelled.events.at(-1),'cancelled');assert.equal(cancelled.busy,false);assert.equal(cancelled.projectUnchanged,true);
  await page.locator('#advisorGenerate').click();await page.locator('#advisorCancel').click();assert.equal(await page.locator('#advisorApply').isDisabled(),true);assert.deepEqual((await saved()).extensions.gflPi.PV1.gains,stored.gains);
  record(tag+' real Worker cancellation, late packet and UI cancellation cannot write');
  await page.locator('#advisorAnalyze').click();await ready();await page.locator('#manualReset').click();await manualReady();
  for(const [kind,value]of [['manual','oops'],['manual',''],['manual','1e999'],['filter','-1'],['filter',''],['filter','1e999']]){
   await edit('[data-manual-gain="d.kp"]',stored.gains.d.kp*1.03);await manualReady();assert.equal(await page.locator('#manualApply').isEnabled(),true);
   const beforeInvalid=await saved();await page.evaluate(()=>{window.__pendingApplyProbe.hold=true;window.__pendingApplyProbe.pending=[];});
   await page.locator('#manualApply').click();await page.waitForFunction(()=>window.__pendingApplyProbe.pending.length===1);
   const stale=await page.evaluate(({kind,value})=>{
    const probe=window.__pendingApplyProbe,packet=probe.pending[0],writes=probe.writes;
    const input=document.querySelector(kind==='manual'?'[data-manual-gain="d.kp"]':'[data-filter-setting="filterCurrentMs"][aria-label^="id 反馈 "]');
    input.focus();input.value=value;input.dispatchEvent(new Event(kind==='manual'?'input':'change',{bubbles:true}));
    return {terminated:packet.transport.terminated,writes:probe.writes-writes,actualInput:input.value};
   },{kind,value});
   assert.equal(stale.terminated,true);assert.equal(stale.writes,0);assert.equal(await page.locator('#advisorApply').isDisabled(),true);assert.equal(await page.locator('#manualApply').isDisabled(),true);
   const late=await page.evaluate(()=>{
    const probe=window.__pendingApplyProbe,packet=probe.pending[0],writes=probe.writes;
    packet.callback(packet.event);packet.errorCallback({message:'injected late apply error'});probe.hold=false;
    return {writes:probe.writes-writes,eligible:packet.event.data.result.application.eligible};
   });
   assert.equal(late.eligible,true,'the held packet must contain a real eligible solve');assert.equal(late.writes,0);assert.deepEqual(await saved(),beforeInvalid);
   assert.equal(await page.locator('#advisorApply').isDisabled(),true);assert.equal(await page.locator('#manualApply').isDisabled(),true);
   if(kind==='filter'){await edit('[data-filter-setting="filterCurrentMs"][aria-label^="id 反馈 "]',.11);await ready();assert.deepEqual(await page.locator('[data-filter-setting="filterCurrentMs"]').evaluateAll(nodes=>nodes.map(n=>Number(n.value))),[.11,.11]);}
   await edit('[data-manual-gain="d.kp"]',stored.gains.d.kp*1.04);await manualReady();assert.equal(await page.locator('#manualApply').isEnabled(),true);
   const history=beforeInvalid.extensions.gflPi.PV1.advisor?.evidenceHistory?.length??0;
   await page.locator('#manualApply').click();await page.waitForFunction(n=>JSON.parse(localStorage.getItem('gridcraft-v1')).extensions.gflPi.PV1.advisor?.evidenceHistory?.length===n+1,history);await ready();
   assert.equal((await saved()).extensions.gflPi.PV1.gains.d.kp,stored.gains.d.kp*1.04);
   record(tag+' pending apply invalid '+kind+' '+JSON.stringify(value)+' fences real late success/error and permits corrected fresh apply');
   // Reseed only the isolated test page; this is not product history pruning.
   await seed(stable);await page.locator('#bodePlot svg').first().waitFor();await page.locator('#gflAnalysisModel').selectOption('gfl-dq-reference-v1');await ready();
  }
  const before=await saved();await edit('[data-manual-gain="d.kp"]',stored.gains.d.kp*1.01);await manualReady();assert.equal(await page.locator('#manualApply').isEnabled(),true);
  await page.locator('#manualApply').evaluate(button=>{button.click();button.click();});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('gridcraft-v1')).extensions.gflPi.PV1.advisor?.evidenceHistory?.length===1);await ready();
  const after=await saved();assert.equal(after.extensions.gflPi.PV1.gains.d.kp,stored.gains.d.kp*1.01);assert.deepEqual(after.components,before.components);assert.deepEqual(after.extensions.gflPi.PV1.analysis,before.extensions.gflPi.PV1.analysis);
  await page.locator('#advisorRestore').click();await ready();const restored=await saved();assert.deepEqual(restored.extensions.gflPi.PV1.gains,stored.gains);assert.deepEqual(restored.components,before.components);assert.deepEqual(restored.extensions.gflPi.PV1.analysis,before.extensions.gflPi.PV1.analysis);
  record(tag+' double apply commits once; apply/undo preserve PLL and electrical settings');
  const beforeEdit=(await download()).currentAnalysis.evaluationFingerprint;
  const stale=await page.locator('#gflPllFn').evaluate(input=>{input.value='23';input.dispatchEvent(new Event('change',{bubbles:true}));return {eligible:document.querySelectorAll('#gflMainlineCharts [data-eligible="true"]').length,disabled:document.querySelector('#advisorApply').disabled};});
  assert.deepEqual(stale,{eligible:0,disabled:true});await ready();assert.notEqual((await download()).currentAnalysis.evaluationFingerprint,beforeEdit);
  await page.locator('#gflSyncMode').selectOption('fixed-angle');await ready();evaluation=(await download()).currentAnalysis;assert.equal(evaluation.model.states.some(s=>s.legacyName.startsWith('pll')),false);
  record(tag+' PLL edits synchronously stale evidence; fixed-angle removes PLL states');
  await edit('#gflMainlineDelay',1);await ready();evaluation=(await download()).currentAnalysis;assert.equal(evaluation.model.delayRepresentation.approximate,true);assert.equal(evaluation.application.eligible,false);await noPass();
  await edit('#gflMainlineDelay',0);await ready();await page.locator('#gflDcModel').selectOption('capacitor');await ready();evaluation=(await download()).currentAnalysis;
  assert.equal(evaluation.stability.status,'marginal');assert.equal(evaluation.application.eligible,false);await noPass();
  record(tag+' Padé-only and unregulated capacitor marginal results never show pass');
  const unknown=await saved();unknown.extensions.gflPi.PV1.analysis.modelVersion=99;await seed(unknown);await page.waitForFunction(()=>document.querySelector('#gflAnalysisModel')?.value==='unsupported');await noPass();assert.deepEqual((await saved()).extensions.gflPi.PV1.analysis,unknown.extensions.gflPi.PV1.analysis);
  record(tag+' unknown model version remains unsupported and preserves configuration');
  await seed(stable);await page.locator('#bodePlot svg').first().waitFor();await page.locator('#gflAnalysisModel').selectOption('gfl-dq-reference-v1');await ready();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await page.locator('#gflMainlineResults').screenshot({path:out+'/mainline-'+tag+'.png'});record(tag+' mainline layout fits viewport; screenshot captured');
  const gfm=demo('gfm480');gfm.extensions.gfmPi.GFM1.considerScr=true;gfm.extensions.gfmPi.GFM1.gains=autoTuneGfm({...gfmContext(gfm,'GFM1'),...gfmDefaults(),considerScr:true}).gains;
  await seed(gfm,'/gfm.html?ibr=GFM1');await page.waitForFunction(()=>document.querySelector('#gfmStepPreview')?.dataset.state==='ready');
  assert.equal(await page.locator('#gfmStepPreview [data-curve="step-current"]').count(),4);assert.match(await page.locator('#stepTitle-P').innerText(),/d 轴电压/);assert.equal(await page.locator('#gflAnalysisModel').count(),0);assert.deepEqual((await saved()).extensions.gfmPi.GFM1.gains,gfm.extensions.gfmPi.GFM1.gains);
  record(tag+' GFM retains its existing current/voltage model');await context.close();
 }
 assert.deepEqual(report.errors,[]);report.status='passed';report.passed=true;persist();
 console.log('GFL mainline: '+report.checks.length+' browser checks passed.');
}catch(error){report.status='failed';report.passed=false;report.error=error.message;report.stack=error.stack;persist();throw error;}
finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
