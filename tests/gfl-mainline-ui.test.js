import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readGflAnalysisSettings} from '../project/gfl-analysis-settings.js';
import {gflModelScope} from '../ui/gfl-model-scope.js';
import {controlDiagram} from '../ui/gfl-diagram.js';
import {mainlineFixture} from './fixtures/gfl-mainline.js';
import {evaluateGflMainline} from '../analysis/gfl-mainline-evaluation.js';
const ui=await import('../ui/gfl-mainline-results.js').catch(()=>({}));
const html=readFileSync(new URL('../gfl.html',import.meta.url),'utf8');
const outer='outer-reference-closed',inner='current-reference-frozen-outer';
function evidence(){
 const outputs=[{id:'p',labelZh:'PCC 有功功率',unit:'pu',baseSI:100,baseUnit:'W'},{id:'q',labelZh:'PCC 无功功率',unit:'pu',baseSI:200,baseUnit:'var'}],inputs=[{id:'p*',labelZh:'有功参考增量',baseSI:100,baseUnit:'W'},{id:'q*',labelZh:'无功参考增量',baseSI:200,baseUnit:'var'}];
 const model={outputs,inputs,operatingPoint:{y0:[.7,-.2],op:{P:.7,Q:-.2,V:1}},delayRepresentation:{approximate:false},configurationSnapshot:{input:{dMode:'P',qMode:'Q'},analysis:{syncMode:'srf-pll',sync:{fnHz:20,damping:.707,filterMs:0}},controlStepSeconds:.00005,pwmPeriodSeconds:null},quality:{residual:0},coverage:{}};
 const responses=inputs.map((p,i)=>({inputId:p.id,targetOutputId:outputs[i].id,amplitudePu:.01,status:'completed',experimentFingerprint:'experiment<outer>',points:[{t:0,y:[0,0]},{t:1,y:[.005,.002]},{t:2,y:[.008,.01]}],channels:outputs.map((o,j)=>({outputId:o.id,role:i===j?'tracking':'cross',targetDelta:i===j?.01:0,metrics:{overshootPercent:i===j?0:null,settlingTimeSeconds:i===j?2:null,steadyStateErrorPercent:i===j?20:null,peakAbsPu:.008,residualOffsetPu:.002}}))}));
 const experiment={id:outer,model,experimentFingerprint:'experiment<outer>',steps:responses.map(r=>({inputId:r.inputId,targetOutputId:r.targetOutputId,amplitudePu:r.amplitudePu}))};
 return {modelId:'gfl-dq-reference-v1',model,solveStatus:'completed',stability:{status:'stable',alpha:-2},responseQuality:'completed',targetResult:{group:'satisfied',unmet:[]},performance:{T:2,O:0,E:20},application:{eligible:true,reasons:[]},evaluationFingerprint:'evaluation<1>',experimentFingerprints:{[outer]:'experiment<outer>',[inner]:'experiment<inner>'},experiments:{[outer]:{experiment,responses,stability:{status:'stable'}},[inner]:{experiment:{...experiment,id:inner,experimentFingerprint:'experiment<inner>'},responses:responses.map(r=>({...r,experimentFingerprint:'experiment<inner>'})),stability:{status:'stable'}}},frequencyResponse:{scope:'closed-reference',experimentFingerprint:'experiment<outer>',inputIds:inputs.map(p=>p.id),outputIds:outputs.map(o=>o.id),series:[[ [{f:.1,db:0,phase:0},{f:1,db:-3,phase:-45}], [{f:.1,db:-10,phase:90},{f:1,db:-12,phase:85}] ],[ [{f:.1,db:-20,phase:0},{f:1,db:-22,phase:-30}], [{f:.1,db:0,phase:0},{f:1,db:-3,phase:-45}] ]]}};
}
function dom(){const nodes=new Map();function node(k){if(nodes.has(k))return nodes.get(k);const n={innerHTML:'',textContent:'',value:'',disabled:false,hidden:false,dataset:{},classList:{add(){}},setAttribute(k,v){this[k]=v;},querySelector:node,querySelectorAll:()=>[],replaceChildren(){this.innerHTML='';}};nodes.set(k,n);return n;}return {node,nodes};}
test('mainline is explicit opt-in with grouped physical settings, legacy never infers selection',()=>{
 assert.match(html,/id="gflAnalysisModel"/);assert.match(html,/value="legacy-scalar"[^>]*>原标量/);assert.match(html,/PLL 与 dq 联立工程参考模型/);
 for(const id of ['gflMainlineResults','gflSyncMode','gflPllFn','gflPllDamping','gflPllFilter','gflDecoupling','gflDcModel','gflMainlineDelay'])assert.match(html,new RegExp('id="'+id+'"'));
 const p=mainlineFixture().project;p.extensions.gflPi.PV1.dqAnalysis={enabled:true};assert.equal(readGflAnalysisSettings(p,'PV1').modelId,'legacy-scalar');assert.ok(!html.includes('Perfect PLL'));
});
test('four modes label physical references and fixed angle is not ideal PLL',()=>{
 for(const dMode of ['P','Vdc'])for(const qMode of ['Q','Vac']){const s=gflModelScope({considerScr:true,delaySamples:0},{modelId:'gfl-dq-reference-v1',syncMode:'fixed-angle',sync:{fnHz:20}},{dMode,qMode});assert.match(s,new RegExp(dMode));assert.match(s,new RegExp(qMode));assert.match(s,/固定同步角/);assert.match(s,/不跟踪 PCC/);assert.doesNotMatch(s,/理想 PLL|Perfect PLL|独立面板启用/);}
});
test('normalized series divide requested amplitude only, never measured gain or operating bias',()=>{
 assert.equal(typeof ui.projectGflResponse,'function');const e=evidence(),r=e.experiments[outer].responses[0],before=JSON.stringify(e);
 const v=ui.projectGflResponse(e.experiments[outer].experiment,r,'p',{units:'pu',amplitude:'normalized',quantity:'absolute'});
 assert.deepEqual(v.points.map(p=>p.y),[0,.5,.8]);assert.equal(v.quantity,'increment');assert.equal(v.target,1);assert.equal(JSON.stringify(e),before);
});
test('absolute SI series add the corresponding y0 then apply its descriptor conversion base',()=>{
 assert.equal(typeof ui.projectGflResponse,'function');const e=evidence(),r=e.experiments[outer].responses[0];
 const v=ui.projectGflResponse(e.experiments[outer].experiment,r,'q',{units:'si',amplitude:'actual',quantity:'absolute'});
 assert.deepEqual(v.points.map(p=>p.y),[-40,-39.6,-38]);assert.equal(v.target,-40);assert.equal(v.unit,'var');
 e.model.outputs[1].baseSI=null;assert.equal(ui.projectGflResponse(e.experiments[outer].experiment,r,'q',{units:'si',amplitude:'actual',quantity:'absolute'}).available,false);
});
test('negative perturbations retain requested sign in normalization',()=>{
 assert.equal(typeof ui.projectGflResponse,'function');const e=evidence(),r=e.experiments[outer].responses[0];r.amplitudePu=-.01;r.points=r.points.map(p=>({t:p.t,y:p.y.map(y=>-y)}));r.channels[0].targetDelta=-.01;
 assert.deepEqual(ui.projectGflResponse(e.experiments[outer].experiment,r,'p',{units:'pu',amplitude:'normalized',quantity:'increment'}).points.map(p=>p.y),[0,.5,.8]);
});
test('main chart and ranking share exact evaluation and experiment evidence',()=>{
 assert.equal(typeof ui.gflMainlineResultsHtml,'function');const e=evidence(),before=JSON.stringify(e),s=ui.gflMainlineResultsHtml({current:e,candidate:{name:'试调 <A>',evaluation:e},selection:{experimentId:outer},display:{units:'pu',amplitude:'actual',quantity:'increment'}});
 assert.match(s,/data-evaluation-fingerprint="evaluation&lt;1&gt;"/);assert.match(s,/data-experiment-fingerprint="experiment&lt;outer&gt;"/);assert.match(s,/data-input-id="p\*"/);assert.match(s,/data-output-id="q"/);assert.match(s,/完整外环参考实验/);assert.match(s,/试调 &lt;A&gt;/);assert.match(s,/T = 2 s/);assert.match(s,/E = 20 %/);assert.match(s,/工作点/);assert.equal(JSON.stringify(e),before);
});
test('cross output is peak/residual in physical units, never overshoot percent',()=>{
 assert.equal(typeof ui.gflMainlineResultsHtml,'function');const s=ui.gflMainlineResultsHtml({current:evidence(),selection:{experimentId:outer},display:{units:'si',amplitude:'actual',quantity:'increment'}});
 const cross=s.match(/<tr data-channel-role="cross"[\s\S]*?<\/tr>/)[0];assert.match(cross,/峰值/);assert.match(cross,/残余/);assert.match(cross,/var/);assert.doesNotMatch(cross,/超调|%/);
});
test('closed 2x2 frequency response uses ordered IDs and SI input/output ratios without margin titles',()=>{
 assert.equal(typeof ui.gflMainlineResultsHtml,'function');const s=ui.gflMainlineResultsHtml({current:evidence(),display:{units:'si',amplitude:'actual',quantity:'increment'}});
 assert.equal((s.match(/data-frequency-channel=/g)||[]).length,4);assert.match(s,/闭合参考 2×2/);assert.match(s,/W\/var/);assert.doesNotMatch(s,/相位裕度|开环裕度/);
 assert.equal(typeof ui.projectGflFrequency,'function');const v=ui.projectGflFrequency(evidence(),'p','q*','si');assert.equal(v.series[0].db,-10+20*Math.log10(.5));
});
test('frozen-inner experiment is labeled diagnostic and keeps full outer stability as authority',()=>{
 assert.equal(typeof ui.gflMainlineResultsHtml,'function');const s=ui.gflMainlineResultsHtml({current:evidence(),selection:{experimentId:inner},display:{units:'pu',amplitude:'actual',quantity:'increment'}});
 assert.match(s,/冻结外环输出增量/);assert.match(s,/完整外环稳定性/);assert.match(s,/不能替代完整外环/);assert.match(s,/data-experiment-id="current-reference-frozen-outer"/);
});
test('unavailable model and stale/busy state clear eligible green conclusions and curves',()=>{
 assert.equal(typeof ui.gflMainlineResultsHtml,'function');for(const patch of [{stale:true},{busy:true},{current:{...evidence(),solveStatus:'unsupported',diagnostics:[{message:'缺少 Cdc'}]}}]){const s=ui.gflMainlineResultsHtml({current:evidence(),...patch});assert.doesNotMatch(s,/data-eligible="true"|data-response-trace=/);if(patch.current)assert.match(s,/缺少 Cdc/);}
});
test('display changes reset normalized absolute choice and start no Worker or numerical computation',()=>{
 assert.equal(typeof ui.mountGflMainlineResults,'function');const d=dom();let count=0;globalThis.Worker=class{constructor(){count++;throw Error('renderer must not compute');}};
 const panel=ui.mountGflMainlineResults(d.node('host'));panel.render({current:evidence(),candidate:null,display:{units:'pu',amplitude:'actual',quantity:'absolute'}});
 const before=count;d.node('#gflResponseScale').value='normalized';d.node('#gflResponseScale').onchange();assert.equal(d.node('#gflResponseQuantity').value,'increment');assert.equal(d.node('#gflResponseQuantity').disabled,true);
 d.node('#gflExperiment').value=inner;d.node('#gflExperiment').onchange();assert.equal(count,before);assert.match(d.node('#gflMainlineCharts').innerHTML,/冻结外环输出增量/);panel.destroy();
});
test('responsive controls and status use accessible text rather than color-only pass markers',()=>{
 assert.equal(typeof ui.mountGflMainlineResults,'function');const d=dom();ui.mountGflMainlineResults(d.node('host'));assert.match(d.node('host').innerHTML,/for="gflExperiment"/);assert.match(d.node('host').innerHTML,/aria-live="polite"/);
 const css=readFileSync(new URL('../ui/gfl-mainline-results.css',import.meta.url),'utf8');assert.match(css,/@media/);assert.match(css,/minmax\(0,1fr\)/);
});
test('diagram labels distinguish the physical controller from the selected analysis',()=>{
 const gains=mainlineFixture().gains,s=controlDiagram(gains,gains,{analysis:{modelId:'gfl-dq-reference-v1',syncMode:'fixed-angle'},dMode:'Vdc',qMode:'Vac'});
 assert.match(s,/控制结构示意/);assert.match(s,/联立/);assert.match(s,/固定同步角/);assert.doesNotMatch(s,/理想 PLL/);
});
test('real Worker evaluator evidence renders the original ranked outer metrics and exact response identity',()=>{
 assert.equal(typeof ui.gflMainlineResultsHtml,'function');const f=mainlineFixture(),e=evaluateGflMainline({snapshot:f.snapshot,gains:f.gains,request:{separationRatio:4}},{now:()=>0});assert.equal(e.solveStatus,'completed');
 const s=ui.gflMainlineResultsHtml({current:e,display:{units:'pu',amplitude:'actual',quantity:'increment'}});assert.ok(s.includes('data-experiment-fingerprint="'+e.experimentFingerprints[outer].replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))+'"'));
 assert.equal(ui.projectGflResponse(e.experiments[outer].experiment,e.experiments[outer].responses[0],e.experiments[outer].responses[0].targetOutputId,{units:'pu',amplitude:'normalized',quantity:'increment'}).points.at(-1).y,e.experiments[outer].responses[0].points.at(-1).y[0]/.01);
});

// A native-module UI transport test, not a real-browser layout or click test.
function pageDom(project){
 const nodes=new Map(),workers=[],writes=[],requests=[],moves=[],windowEvents={};let raw=JSON.stringify(project);
 function node(key=''){if(nodes.has(key))return nodes.get(key);const events={},attrs={};let text='';const n={dataset:{},children:[],classList:{add(){}},value:key==='#bodeMode'?'open':key==='#manualIntegralForm'?'ki':'',textContent:'',checked:false,disabled:false,clientWidth:1200,tagName:'DIV',
  addEventListener(t,fn){(events[t]??=[]).push(fn);},fire(t,target=n){for(const fn of events[t]??[])fn({target,type:t});},dispatchEvent(e){node('#parameterTables').onchange?.({target:n,type:e.type});},querySelector:selector=>selector.includes('aria-invalid="true"')?([...nodes.values()].find(el=>el.getAttribute('aria-invalid')==='true'&&((selector.includes('data-filter-setting')&&el.dataset.filterSetting)||(selector.includes('data-gain]')&&el.dataset.gain)))??null):node(selector),querySelectorAll(selector){return selector==='[data-request]'?[...nodes.values()].filter(el=>el.dataset.request):[];},before(child){moves.push({target:key,child});},append(){},remove(){},replaceChildren(){},insertAdjacentHTML(_position,value){n.innerHTML+=value;},setAttribute(k,v){attrs[k]=v;},getAttribute(k){return attrs[k]??null;},removeAttribute(k){delete attrs[k];},checkValidity(){return true;},setCustomValidity(v){this.validationMessage=v;}};
  Object.defineProperty(n,'innerHTML',{get:()=>text,set(v){text=v;for(const tag of v.matchAll(/<(input|select)[^>]*id="([^"]+)"[^>]*>/g)){const el=node('#'+tag[2]);el.tagName=tag[1].toUpperCase();const type=tag[0].match(/type="([^"]+)"/);el.type=type?.[1]??'';const req=tag[0].match(/data-request="([^"]+)"/);if(req)el.dataset.request=req[1];}}});
  const m=key.match(/data-manual-(gain|slider)="([^"]+)"/);if(m)n.dataset[m[1]==='gain'?'manualGain':'manualSlider']=m[2];nodes.set(key,n);return n;
 }
 node('body').innerHTML=html;
 globalThis.document={getElementById:id=>node('#'+id),createElement:tag=>node(tag+nodes.size),querySelector:node,querySelectorAll:()=>[],activeElement:null};globalThis.window={addEventListener(type,fn){windowEvents[type]=fn;}};globalThis.location={search:'?ibr=PV1'};globalThis.matchMedia=()=>({matches:false});globalThis.localStorage={getItem:()=>raw,setItem:(_,v)=>{raw=v;writes.push(v);}};
 globalThis.Worker=class{constructor(url){this.url=String(url);workers.push(this);}postMessage(data){this.sent=data;requests.push(data);}terminate(){this.terminated=true;}reply(result){this.onmessage({data:{type:'result',requestId:this.sent.requestId,requestKey:this.sent.requestKey,snapshotKey:this.sent.snapshotKey,result}});}};
 return {node,nodes,workers,requests,writes,moves,fireWindow:type=>windowEvents[type]?.({persisted:true}),project:()=>JSON.parse(raw)};
}
function pageProject(mainline=true){const f=mainlineFixture(),p=f.project,s=p.extensions.gflPi.PV1;Object.assign(s,{dMode:'P',qMode:'Q',filterCurrentMs:.1,filterVoltageMs:.1,advisor:{request:{separationRatio:4,fi:500,fp:50}}});if(mainline)s.analysis=f.settings;p.components.find(c=>c.id==='PV1').parametersSI.activePowerW=2e5;return p;}
test('current mainline uses shared Worker latest key; display edits do not enqueue work; stale results cannot return green',async()=>{
 const p=pageProject(),d=pageDom(p);await import('../ui/gfl-design.js?task9-current-ui-test');
 const current=d.workers.find(w=>w.sent?.kind==='evaluate'&&w.sent.payload.snapshot.modelId==='gfl-dq-reference-v1');assert.ok(current,'current PI is evaluated by the shared Worker');
 assert.equal(d.node('#gflAnalysisModel').value,'gfl-dq-reference-v1');assert.equal(d.node('#gflMainlineResults').hidden,false);assert.equal(d.node('#gflDqPanel').hidden,true);
 const real=evaluateGflMainline(current.sent.payload,{now:()=>0});current.reply(real);assert.match(d.node('#gflMainlineCharts').innerHTML,/完整外环稳定性/);
 const before=d.requests.length;d.node('#gflResponseScale').value='normalized';d.node('#gflResponseScale').onchange();assert.equal(d.requests.length,before);
 const pi=structuredClone(d.project().extensions.gflPi.PV1.gains);d.node('#gflPllFn').value='25';d.node('#gflPllFn').valueAsNumber=25;d.node('#gflPllFn').onchange();
 assert.equal(d.project().extensions.gflPi.PV1.analysis.sync.fnHz,25);assert.deepEqual(d.project().extensions.gflPi.PV1.gains,pi);assert.equal(d.node('#advisorApply').disabled,true);assert.equal(d.node('#manualApply').disabled,true);assert.doesNotMatch(d.node('#gflMainlineCharts').innerHTML,/data-eligible="true"/);
 const after=d.node('#gflMainlineCharts').innerHTML;current.reply(real);assert.equal(d.node('#gflMainlineCharts').innerHTML,after,'late prior-key result cannot republish curves');
 const latest=d.workers.filter(w=>w.sent?.kind==='evaluate'&&w.sent.payload.snapshot.modelId==='gfl-dq-reference-v1').at(-1);latest.reply({...real,solveStatus:'unsupported',application:{eligible:false,reasons:['缺少 Cdc']},diagnostics:[{message:'缺少 Cdc'}]});assert.match(d.node('#gflMainlineCharts').innerHTML,/缺少 Cdc/);assert.equal(d.node('#advisorApply').disabled,true);assert.equal(d.node('#manualApply').disabled,true);
 d.node('#advisorCancel').onclick();assert.doesNotMatch(d.node('#gflMainlineCharts').innerHTML,/data-eligible="true"/);
});
test('mainline scoped request fields persist nullable targets and generic limits address both outer outputs',async()=>{
 const d=pageDom(pageProject());await import('../ui/gfl-design.js?task9-target-ui-test');assert.match(d.node('host').innerHTML??'',/^/);
 const advisor=d.node('#gflAdvisor');assert.match(advisor.innerHTML,/两外环/);assert.match(advisor.innerHTML,/data-request="currentTargets.maxSettlingSeconds"/);assert.match(advisor.innerHTML,/data-request="crossAxisLimits.outerPeakAbsPu"/);
 const field=d.node('#advisorCurrentMaxSettling');field.value='0.2';field.valueAsNumber=.2;advisor.fire('change',field);
 assert.equal(d.project().extensions.gflPi.PV1.advisor.request.currentTargets.maxSettlingSeconds,.2);assert.equal(d.project().extensions.gflPi.PV1.advisor.request.crossAxisLimits,null);
 field.value='';advisor.fire('change',field);assert.equal(d.project().extensions.gflPi.PV1.advisor.request.currentTargets,null);
});
test('legacy selection leaves original scalar primary charts and all manual PI editors available',async()=>{
 const p=pageProject(false),d=pageDom(p),before=structuredClone(p.extensions.gflPi.PV1.gains);await import('../ui/gfl-design.js?task9-legacy-ui-test');assert.equal(d.node('#gflAnalysisModel').value,'legacy-scalar');assert.equal(d.node('#gflMainlineResults').hidden,true);assert.equal(d.workers.filter(w=>w.sent?.kind==='evaluate'&&w.sent.payload?.snapshot.modelId==='gfl-dq-reference-v1').length,0);
 assert.equal([...d.nodes.keys()].filter(k=>k.startsWith('[data-manual-slider=')).length,8);assert.deepEqual(d.project().extensions.gflPi.PV1.gains,before);
 d.node('#gflAnalysisModel').value='gfl-dq-reference-v1';d.node('#gflAnalysisModel').onchange();assert.equal(d.project().extensions.gflPi.PV1.analysis.modelId,'gfl-dq-reference-v1');assert.deepEqual(d.project().extensions.gflPi.PV1.gains,before);assert.match(d.node('#gflScalarBodeTitle').textContent,/标量诊断/);
});

test('mainline is placed before visible scalar diagnostic/editor host and old scalar explanations are scoped',async()=>{
 const d=pageDom(pageProject());await import('../ui/gfl-design.js?task9-diagnostic-order-test');
 assert.ok(d.moves.some(m=>m.target==='#gflScalarDiagnostics'&&m.child===d.node('#gflMainlineResults')),'mainline results precede scalar diagnostics');
 assert.match(d.node('#gflAdvisor').innerHTML,/id="gflScalarDiagnostics"/);assert.match(d.node('#scrScope').textContent,/联立/);assert.doesNotMatch(d.node('#scrScope').textContent,/不含 PLL/);
 assert.match(d.node('#paperEquations').innerHTML,/标量诊断/);assert.match(d.node('#advisorFocus').innerHTML,/稳态误差/);assert.equal([...d.nodes.keys()].filter(k=>k.startsWith('[data-manual-slider=')).length,8);
});
test('render accepts explicit subsequent display props without reusing the old presentation',()=>{
 const d=dom(),panel=ui.mountGflMainlineResults(d.node('host'));panel.render({current:evidence(),display:{units:'pu',amplitude:'actual',quantity:'increment'}});panel.render({current:evidence(),display:{units:'si',amplitude:'actual',quantity:'absolute'}});
 assert.equal(d.node('#gflResponseUnits').value,'si');assert.equal(d.node('#gflResponseQuantity').value,'absolute');panel.destroy();
});
test('approximate delay stays visible for comparison with explicit approximation and never eligible',()=>{
 const e=evidence();e.model.delayRepresentation={approximate:true,seconds:.00005};e.responseQuality='approximateDelay';e.application.eligible=false;e.experiments[outer].responses.forEach(r=>r.status='approximateDelay');
 const s=ui.gflMainlineResultsHtml({current:e});assert.match(s,/Padé 近似/);assert.match(s,/data-response-trace=/);assert.doesNotMatch(s,/data-eligible="true"/);
});
test('invalid sync edit preserves persisted settings and PI, blocks both apply actions and rejects an old result',async()=>{
 const d=pageDom(pageProject());await import('../ui/gfl-design.js?task9-invalid-sync-test');const before=structuredClone(d.project().extensions.gflPi.PV1),old=d.workers.find(w=>w.sent?.payload?.snapshot.modelId==='gfl-dq-reference-v1');
 const el=d.node('#gflPllFn');el.value='-1';el.valueAsNumber=-1;el.onchange();assert.deepEqual(d.project().extensions.gflPi.PV1,before);assert.equal(el.getAttribute('aria-invalid'),'true');assert.equal(d.node('#advisorApply').disabled,true);assert.equal(d.node('#manualApply').disabled,true);
 old.reply(evidence());assert.doesNotMatch(d.node('#gflMainlineCharts').innerHTML,/data-eligible="true"/);
});
test('manual shared-evidence delivery cannot overwrite its completed scalar diagnostic Bode series',async()=>{
 const d=pageDom(pageProject());await import('../ui/gfl-design.js?task9-manual-diagnostic-test');const current=d.workers.find(w=>w.sent?.payload?.snapshot.modelId==='gfl-dq-reference-v1');current.reply(evaluateGflMainline(current.sent.payload,{now:()=>0}));
 const slider=d.node('[data-manual-slider="d.kp"]');slider.value=String(d.project().extensions.gflPi.PV1.gains.d.kp*1.03);slider.fire('input');await new Promise(r=>setTimeout(r,190));
 const diagnostic=d.workers.filter(w=>w.sent?.kind==='evaluate'&&w.sent.payload.snapshot.modelId==='legacy-scalar').at(-1),manual=d.workers.find(w=>w.url.includes('gfl-manual-worker')&&w.sent?.payload.snapshot);
 assert.ok(manual);diagnostic.reply(evaluateGflMainline(diagnostic.sent.payload,{now:()=>0}));assert.match(d.node('#bodePlot').innerHTML,/data-bode-trace=/);
 const payload=manual.sent.payload,e=evaluateGflMainline(payload,{now:()=>0});manual.reply({id:'manual-draft',name:'试调',gains:payload.gains,evaluation:e,verified:true,requirementsMet:e.application.eligible,unmet:[]});await Promise.resolve();
 assert.match(d.node('#bodePlot').innerHTML,/data-bode-trace=/);assert.match(d.node('#bodeParameterStatus').textContent,/标量诊断/);assert.ok(d.node('#gflMainlineCharts').innerHTML.includes(e.evaluationFingerprint.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))));
});
test('explicit capacitor DC analysis exposes the existing independent Cdc editor even in P mode',async()=>{
 const p=pageProject();p.extensions.gflPi.PV1.analysis.dcModel='capacitor';const d=pageDom(p);await import('../ui/gfl-design.js?task9-p-capacitor-test');assert.match(d.node('#parameterTables').innerHTML,/data-mode="capSource"/);
});
test('unknown model version remains unchanged and visibly unsupported instead of scalar fallback',async()=>{
 const p=pageProject();p.extensions.gflPi.PV1.analysis.modelVersion=7;const before=structuredClone(p.extensions.gflPi.PV1),d=pageDom(p);await import('../ui/gfl-design.js?task9-unknown-model-test');assert.equal(d.node('#gflAnalysisModel').value,'unsupported');assert.deepEqual(d.project().extensions.gflPi.PV1,before);assert.match(d.node('#gflAnalysisStatus').textContent,/未支持/);assert.equal(d.node('#advisorApply').disabled,true);assert.equal(d.node('#manualApply').disabled,true);
});

test('pagehide cancels current work and pageshow can resume the same project without a destroyed client',async()=>{
 const d=pageDom(pageProject());await import('../ui/gfl-design.js?task9-page-lifecycle-test');const old=d.workers.find(w=>w.sent?.payload?.snapshot.modelId==='gfl-dq-reference-v1'),before=d.requests.length;
 d.fireWindow('pagehide');assert.equal(old.terminated,true);d.fireWindow('pageshow');assert.ok(d.requests.length>before);const fresh=d.workers.filter(w=>w.sent?.payload?.snapshot.modelId==='gfl-dq-reference-v1').at(-1);assert.notEqual(fresh,old);assert.equal(fresh.sent.kind,'evaluate');assert.deepEqual(fresh.sent.payload.gains,old.sent.payload.gains);
});

async function cancellationPage(suffix){const d=pageDom(pageProject());await import('../ui/gfl-design.js?task9-fix1-'+suffix);const current=d.workers.find(w=>w.sent?.payload?.snapshot.modelId==='gfl-dq-reference-v1');current.reply(evaluateGflMainline(current.sent.payload,{now:()=>0}));return d;}
function editDraft(d){const slider=d.node('[data-manual-slider="d.kp"]');slider.value=String(d.project().extensions.gflPi.PV1.gains.d.kp*1.03);slider.fire('input');return slider.value;}
const transportWait=()=>new Promise(resolve=>setTimeout(resolve,200));
test('manual-only busy enables Cancel, terminates its transport, fences late results and stays paused on render',async()=>{
 const d=await cancellationPage('manual-cancel');editDraft(d);await transportWait();const manual=d.workers.find(w=>w.url.includes('gfl-manual-worker')&&w.sent?.payload.snapshot);assert.ok(manual);assert.equal(d.node('#advisorCancel').disabled,false,'manual-only busy is cancellable');
 d.node('#advisorCancel').onclick();assert.equal(manual.terminated,true);assert.equal(d.node('#advisorApply').disabled,true);assert.equal(d.node('#manualApply').disabled,true);const count=d.requests.length;
 manual.reply({id:'manual-draft',name:'late',gains:manual.sent.payload.gains,evaluation:evidence(),verified:true,requirementsMet:true,unmet:[]});await Promise.resolve();await transportWait();
 assert.equal(d.requests.length,count,'same-key paused draft must not restart during render');assert.doesNotMatch(d.node('#manualStatus').textContent,/已通过/);assert.doesNotMatch(d.node('#gflMainlineCharts').innerHTML,/data-eligible="true"/);d.fireWindow('pagehide');
});
test('Cancel fences manual and scalar-step pending debounce before either Worker is created',async()=>{
 const d=await cancellationPage('pending-cancel');const value=editDraft(d);await Promise.resolve();assert.equal(d.node('#advisorCancel').disabled,false);const count=d.requests.length;
 d.node('#advisorCancel').onclick();await transportWait();assert.equal(d.requests.length,count,'cancelled debounce cannot post work');assert.equal(d.workers.filter(w=>w.sent&&!w.terminated).length,0);assert.equal(d.node('[data-manual-slider="d.kp"]').value,value);assert.equal(d.node('#manualApply').disabled,true);d.fireWindow('pagehide');
});
test('pagehide stops every active manual/scalar transport and pageshow resumes the preserved draft with a fresh generation',async()=>{
 const d=await cancellationPage('active-pagehide');const saved=structuredClone(d.project().extensions.gflPi.PV1.gains),value=editDraft(d);await transportWait();const manual=d.workers.find(w=>w.url.includes('gfl-manual-worker')&&w.sent?.payload.snapshot),steps=d.workers.filter(w=>w.url.includes('gfl-step-worker')&&!w.terminated);assert.ok(manual);assert.ok(steps.length);
 d.fireWindow('pagehide');assert.equal(manual.terminated,true);assert.ok(steps.every(w=>w.terminated));const count=d.requests.length;manual.reply({id:'manual-draft',gains:manual.sent.payload.gains,evaluation:evidence(),verified:true,requirementsMet:true,unmet:[]});await Promise.resolve();await transportWait();assert.equal(d.requests.length,count);assert.equal(d.workers.filter(w=>w.sent&&!w.terminated).length,0);
 d.fireWindow('pageshow');await transportWait();const fresh=d.workers.filter(w=>w.url.includes('gfl-manual-worker')&&w.sent?.payload.snapshot).at(-1);assert.notEqual(fresh,manual);assert.ok(fresh.sent.requestId>manual.sent.requestId);assert.deepEqual(fresh.sent.payload.gains,manual.sent.payload.gains);assert.equal(d.node('[data-manual-slider="d.kp"]').value,value);assert.deepEqual(d.project().extensions.gflPi.PV1.gains,saved);assert.equal(d.node('#advisorApply').disabled,true);assert.equal(d.node('#manualApply').disabled,true);d.fireWindow('pagehide');
});
test('explicit Analyze resumes a cancelled manual draft instead of destroying its client or editors',async()=>{
 const d=await cancellationPage('analyze-resume');const value=editDraft(d);await transportWait();const old=d.workers.find(w=>w.url.includes('gfl-manual-worker')&&w.sent?.payload.snapshot);d.node('#advisorCancel').onclick();d.node('#advisorAnalyze').onclick();await transportWait();const fresh=d.workers.filter(w=>w.url.includes('gfl-manual-worker')&&w.sent?.payload.snapshot).at(-1);assert.notEqual(fresh,old);assert.equal(d.node('[data-manual-slider="d.kp"]').value,value);assert.deepEqual(fresh.sent.payload.gains,old.sent.payload.gains);d.fireWindow('pagehide');
});
test('shared manual suspend/resume keeps the GFM adapter payload, draft and latest-generation fence reusable',async()=>{
 const {mountManualWorkspace}=await import('../ui/gfl-manual-workspace.js');const d=pageDom(pageProject(false)),workers=[],comparisons=[];
 const model={modelInput:{L:1},currentGains:mainlineFixture().gains,request:{},settings:{mode:'droop'},manualCandidates:[]};
 const adapter={contextKey:m=>m.settings.mode,factsKey:m=>JSON.stringify(m.settings),payload:(m,g,record)=>({input:m.modelInput,settings:m.settings,gains:g,record}),workerFactory:()=>{const w={postMessage(data){this.sent=data;},terminate(){this.terminated=true;}};workers.push(w);return w;}};
 const workspace=mountManualWorkspace(d.node('adapter-host'),{onChange(){workspace.sync(model,null);},onComparison:c=>comparisons.push(c)},adapter);workspace.sync(model,null);const slider=d.node('[data-manual-slider="d.kp"]');slider.value=String(model.currentGains.d.kp*1.03);slider.fire('input');await transportWait();assert.equal(typeof workspace.suspend,'function');assert.equal(typeof workspace.resume,'function');const old=workers[0];workspace.suspend('paused');workspace.sync(model,null);await transportWait();assert.equal(old.terminated,true);assert.equal(workers.length,1);
 old.onmessage({data:{...old.sent,type:'result',result:{gains:old.sent.payload.gains,requirementsMet:true,evaluation:{tag:'late'}}}});assert.ok(comparisons.at(-1).evaluation==null,'late cancelled evidence stays absent');workspace.resume();await transportWait();assert.equal(workers.length,2);assert.deepEqual(workers[1].sent.payload.settings,{mode:'droop'});assert.deepEqual(workers[1].sent.payload.gains,old.sent.payload.gains);workspace.destroy();
});
test('a new explicit search after cancellation resumes ownership and remains cancellable',async()=>{
 const d=await cancellationPage('search-resume');editDraft(d);await transportWait();d.node('#advisorCancel').onclick();d.node('#advisorGenerate').onclick();const search=d.workers.filter(w=>w.sent?.kind==='search').at(-1);assert.ok(search);assert.equal(d.node('#advisorCancel').disabled,false);d.node('#advisorCancel').onclick();assert.equal(search.terminated,true);d.fireWindow('pagehide');
});

// Final review I1: real page/evaluator/store with only Worker delivery controlled.
async function pendingManualApply(suffix){
 const d=await cancellationPage('final-'+suffix);editDraft(d);await transportWait();
 const manual=d.workers.find(w=>w.url.includes('gfl-manual-worker')&&w.sent?.payload.snapshot);
 const evaluation=evaluateGflMainline(manual.sent.payload,{now:()=>0});assert.equal(evaluation.application.eligible,true);
 manual.reply({id:'manual-draft',name:'pending',gains:manual.sent.payload.gains,evaluation,verified:true,requirementsMet:true,unmet:[]});await Promise.resolve();
 assert.equal(d.node('#manualApply').disabled,false);d.node('#manualApply').onclick();
 const apply=d.workers.find(w=>w.sent?.kind==='apply-check');assert.ok(apply);
 return {d,apply,evaluation};
}
for(const [kind,values]of [['manual',['oops','','Infinity','NaN','1e999']],['filter',['-1','','NaN','Infinity']]])for(const value of values){
 test(`pending apply is revoked by ${kind} invalid edit ${JSON.stringify(value)}, including late success/error`,async()=>{
  const {d,apply,evaluation}=await pendingManualApply(kind+'-'+encodeURIComponent(value||'blank'));
  const before=structuredClone(d.project()),writes=d.writes.length;
  const el=d.node(kind==='manual'?'[data-manual-gain="d.kp"]':'invalid-filter');el.value=value;document.activeElement=el;
  if(kind==='manual')el.fire('input');else{el.dataset.filterSetting='filterCurrentMs';el.valueAsNumber=value===''?NaN:Number(value);d.node('#diagramHost').fire('change',el);}
  await Promise.resolve();
  assert.equal(apply.terminated,true,'invalid editing must terminate the pending apply-check');
  assert.equal(d.node('#manualApply').disabled,true);assert.equal(d.node('#advisorApply').disabled,true);
  apply.reply(evaluation);apply.onerror({message:'late apply error'});await Promise.resolve();
  assert.equal(d.writes.length,writes);assert.deepEqual(d.project(),before);assert.equal(d.project().extensions.gflPi.PV1.advisor.evidenceHistory?.length??0,0);
  // Correction must create a fresh evaluation and require another explicit Apply.
  if(kind==='manual'){el.value=String(before.extensions.gflPi.PV1.gains.d.kp*1.04);el.fire('input');}
  else{el.value='.11';el.valueAsNumber=.11;const field=d.node('#field-filterCurrentMs');field.dataset.setting='filterCurrentMs';field.valueAsNumber=.11;d.node('#diagramHost').fire('change',el);}
  document.activeElement=null;
  await Promise.resolve();await Promise.resolve();
  const current=d.workers.filter(w=>w.sent?.kind==='evaluate'&&w.sent.payload.snapshot.modelId==='gfl-dq-reference-v1'&&!w.terminated).at(-1);
  if(current)current.reply(evaluateGflMainline(current.sent.payload,{now:()=>0}));
  if(kind==='filter')editDraft(d);
  await transportWait();const freshManual=d.workers.filter(w=>w.url.includes('gfl-manual-worker')&&w.sent?.payload.snapshot&&!w.terminated).at(-1);assert.ok(freshManual);
  const fresh=evaluateGflMainline(freshManual.sent.payload,{now:()=>0});assert.equal(fresh.application.eligible,true);
  freshManual.reply({id:'manual-draft',name:'corrected',gains:freshManual.sent.payload.gains,evaluation:fresh,verified:true,requirementsMet:true,unmet:[]});await Promise.resolve();
  assert.deepEqual(d.project().extensions.gflPi.PV1.gains,before.extensions.gflPi.PV1.gains);assert.equal(d.node('#manualApply').disabled,false,JSON.stringify({manual:d.node('#manualStatus').textContent,current:d.node('#gflAnalysisStatus').textContent,error:d.node('#designError').textContent,active:d.workers.filter(w=>w.sent&&!w.terminated).map(w=>({kind:w.sent.kind,model:w.sent.payload?.snapshot?.modelId}))}));
  d.node('#manualApply').onclick();const freshApply=d.workers.filter(w=>w.sent?.kind==='apply-check').at(-1);assert.notEqual(freshApply,apply);
  freshApply.reply(evaluateGflMainline(freshApply.sent.payload,{now:()=>0}));await Promise.resolve();
  assert.deepEqual(d.project().extensions.gflPi.PV1.gains,freshManual.sent.payload.gains);assert.equal(d.project().extensions.gflPi.PV1.advisor.evidenceHistory.length,1);d.fireWindow('pagehide');
 });
}
test('invalid manual edit does not resume other explicitly cancelled work',async()=>{
 const d=await cancellationPage('invalid-stays-cancelled');editDraft(d);await transportWait();d.node('#advisorCancel').onclick();const count=d.requests.length;
 const el=d.node('[data-manual-gain="d.kp"]');el.value='oops';el.fire('input');await Promise.resolve();await transportWait();
 assert.equal(d.requests.length,count);assert.equal(d.workers.filter(w=>w.sent&&!w.terminated).length,0);assert.equal(d.node('#manualApply').disabled,true);assert.equal(d.node('#advisorApply').disabled,true);d.fireWindow('pagehide');
});
test('raw malformed response samples are unavailable instead of a fabricated zero curve',()=>{
 for(const bad of [NaN,undefined,null,Infinity,-Infinity,'0',false]){
  const e=evidence(),item=e.experiments[outer],r=item.responses[0];r.points[1].y[0]=bad;
  const actual=ui.projectGflResponse(item.experiment,r,'p');assert.equal(actual.available,false,String(bad));assert.deepEqual(actual.points,[]);
 }
 const e=evidence(),item=e.experiments[outer],r=item.responses[0];r.points=[{t:0,y:[0,0]}];
 assert.deepEqual(ui.projectGflResponse(item.experiment,r,'p').points,[{t:0,y:0}]);
 r.points=[{t:0,y:[Number.MAX_VALUE,0]}];assert.equal(ui.projectGflResponse(item.experiment,r,'p',{amplitude:'normalized'}).available,false);
});
