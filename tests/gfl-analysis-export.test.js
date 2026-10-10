import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mainlineFixture} from './fixtures/gfl-mainline.js';
import {evaluateGflMainline} from '../analysis/gfl-mainline-evaluation.js';
import {createGflExperimentDefinitions} from '../analysis/gfl-experiments.js';
import {gflNumericalPolicy} from '../analysis/gfl-analysis-contract.js';
import {buildGflReferenceModel} from '../analysis/gfl-model-contract.js';
import {readGflApplicationContext,createGflApplicationTicket,commitGflMainlineCandidate} from '../project/gfl-analysis-evidence.js';
import {readGflAnalysisSettings} from '../project/gfl-analysis-settings.js';
import {gflDqEvidenceExport,applyCandidate,createTuningState,previewCandidate} from '../project/gfl-tuning-state.js';
import {parseProject,serializeProject} from '../project/model.js';

const api=await import('../project/gfl-analysis-export.js').catch(()=>({}));
const build=options=>{assert.equal(typeof api.buildGflAnalysisExport,'function','data-only v9 export builder exists');return api.buildGflAnalysisExport(options);};
const exportedAt='2026-10-10T12:00:00.000Z';
function projectFixture(){
 const f=mainlineFixture(),p=f.project,s=p.extensions.gflPi.PV1;
 Object.assign(s,{dMode:'P',qMode:'Q',filterCurrentMs:.1,filterVoltageMs:.1,analysis:f.settings,advisor:{request:{separationRatio:4,fi:500,fp:50}}});
 p.components.find(c=>c.id==='PV1').parametersSI.activePowerW=2e5;
 return p;
}
const project=projectFixture(),context=readGflApplicationContext(project,'PV1');
const payload={snapshot:context.snapshot,gains:project.extensions.gflPi.PV1.gains,request:context.request,experiments:context.experiments,policy:context.policy};
const evaluation=evaluateGflMainline(payload,{now:()=>0});
assert.equal(evaluation.solveStatus,'completed');
const options=(p=project,e=evaluation)=>({project:p,ibrId:'PV1',snapshot:context.snapshot,evaluation:e,search:null,exportedAt});

test('complete exact reproduction fields include every realized source matrix and numerical proof',()=>{
 const out=build(options()),c=out.currentAnalysis;
 assert.equal(out.schema,'gridcraft-gfl-pi-v9');assert.equal(out.project.schemaVersion,1);assert.equal(out.exportedAt,exportedAt);
 assert.equal(c.status,'completed');assert.equal(out.freshness.status,'current');
 assert.deepEqual(c.model,evaluation.model);assert.deepEqual(c.experiments,evaluation.experiments);
 for(const key of ['modelFingerprint','experimentFingerprints','evaluationFingerprint','solveStatus','stability','responseQuality','targetResult','performance','frequencyResponse','scalarDiagnostics','diagnostics'])assert.deepEqual(c[key],evaluation[key],key);
 assert.deepEqual(c.settings,context.snapshot.analysis);assert.deepEqual(c.snapshot,context.snapshot);assert.deepEqual(c.gains,payload.gains);assert.equal(c.mode,'P/Q');assert.deepEqual(c.request,context.request);
 assert.deepEqual(out.parameterSources,context.snapshot.parameterSources);assert.equal(c.periods.controlStepSeconds,1/context.snapshot.input.fs);assert.equal(c.periods.pwmPeriodSeconds,context.snapshot.pwmPeriodSeconds);
 assert.equal(c.model.quality.operatingPoint.threshold,1e-7);assert.equal(c.model.quality.jacobian.coarseStep,2e-6);assert.equal(c.model.quality.jacobian.fineStep,1e-6);assert.equal(c.model.quality.jacobian.maxNormalizedDifference,1e-5);assert.equal(c.model.quality.poleRealPartTolerance,1e-6);
 for(const item of Object.values(c.experiments)){
  assert.deepEqual(item.experiment.model.operatingPoint,evaluation.experiments[item.experiment.id].experiment.model.operatingPoint);
  assert.equal(item.experiment.model.A.length,item.experiment.model.states.length);
  assert.equal(item.experiment.model.B[0].length,item.experiment.model.inputs.length);
  assert.equal(item.experiment.model.C.length,item.experiment.model.outputs.length);
  assert.ok(item.experiment.sourceExperimentFingerprint);assert.equal(item.responses.length,2);
  for(const response of item.responses){assert.equal(response.amplitudePu,.01);assert.deepEqual(response.quality,evaluation.experiments[item.experiment.id].responses.find(r=>r.inputId===response.inputId).quality);}
 }
 assert.notDeepEqual(c.model.A,c.experiments['current-reference-frozen-outer'].experiment.model.A);
 assert.equal(c.assumptions.includes('Perfect PLL'),false);assert.match(c.assumptions.join(' '),/SRF PLL/);
 assert.equal(out.controlConvention.currentPositive,'converter-to-grid');assert.equal(out.controlConvention.outerPolarity.Q,-1);
 // Canonical JSON follows the established contract: signed zero serializes as
 // zero. Compare the complete canonical serialized records, without rounding.
 assert.deepEqual(JSON.parse(JSON.stringify(out)).currentAnalysis.model,JSON.parse(JSON.stringify(evaluation.model)));
});

test('current settings differ from compact historical application without relabeling or rebuilding history',()=>{
 assert.equal(evaluation.application.eligible,true);
 const scope=readGflApplicationContext(project,'PV1',{gains:payload.gains});
 const ticket=createGflApplicationTicket({requestKey:scope.requestKey,candidateId:'export-history',gains:payload.gains,evaluationFingerprint:evaluation.evaluationFingerprint});
 const applied=commitGflMainlineCandidate(project,'PV1',{ticket,evaluation,currentRequestKey:scope.requestKey,searchComplete:true,appliedAt:exportedAt});
 const s=applied.extensions.gflPi.PV1,history=structuredClone(s.advisor.evidenceHistory),pointer=structuredClone(s.advisor.mainlineEvidence);
 s.analysis.sync.fnHz=31;
 const out=build(options(applied)),dq=gflDqEvidenceExport(s,{});
 assert.equal(out.currentAnalysis.settings.sync.fnHz,31);assert.equal(out.freshness.status,'stale');assert.equal(out.freshness.modelCurrent,false);
 assert.deepEqual(out.historicalApplications.mainline,history);assert.deepEqual(out.historicalApplications.activePointer,pointer);
 assert.equal(out.historicalApplications.active.configurationSnapshot.analysis.sync.fnHz,20);
 assert.equal(out.historicalApplications.active.evaluationFingerprint,evaluation.evaluationFingerprint);
 assert.equal(out.historicalApplications.active.evaluationSummary.experiments['outer-reference-closed'].responses[0].points,undefined);
 assert.equal(dq.mainline.configuration.sync.fnHz,31);assert.equal(dq.mainline.historicalApplication.configurationSnapshot.analysis.sync.fnHz,20);
 assert.deepEqual(s.advisor.evidenceHistory,history);assert.deepEqual(s.advisor.mainlineEvidence,pointer);
});

test('legacy project roundtrip never applies or fabricates a coupled model',()=>{
 const p=mainlineFixture().project,s=p.extensions.gflPi.PV1;
 s.dqAnalysis={enabled:true,frequencyHz:44};s.advisor={applicationStatus:'applied',assumptions:'Perfect PLL',evaluation:{loops:{d:{step:{settlingTime:null}}}},dqVerification:{version:'old-version',configuration:{frequencyHz:19},scope:'Perfect PLL'}};
 s.manualCandidates={'manual-old':{id:'manual-old',name:'Old',source:'manual',mode:'Vdc/Vac',gains:structuredClone(s.gains),verified:true,application:{eligible:true},userAnnotation:'keep'}};
 const before=structuredClone(p),scalar={loops:{d:{minMargin:null}},stability:{status:'unverified'},modelCoverage:'frequencyOnlyWithDelay'};
 const out=build({...options(p,scalar),snapshot:null});
 assert.equal(out.currentAnalysis.modelId,'legacy-scalar');assert.equal(out.currentAnalysis.model,null);assert.deepEqual(out.currentAnalysis.scalarDiagnostics,scalar);
 assert.equal(out.scalarLegacy.scope,'legacy-scalar');assert.deepEqual(out.scalarLegacy.currentEvaluation,scalar);assert.equal(out.scalarLegacy.zeroDelayStability,null);
 assert.equal(out.manualCandidates[0].userAnnotation,'keep');assert.equal(out.manualCandidates[0].verified,true);
 assert.equal(out.historicalApplications.legacyAdvisor.assumptions,'Perfect PLL');assert.equal(out.currentAnalysis.assumptions.includes('Perfect PLL'),false);
 const reread=parseProject(serializeProject(p));assert.deepEqual(reread,p);assert.deepEqual(reread.extensions.gflPi.PV1.gains,before.extensions.gflPi.PV1.gains);assert.equal(readGflAnalysisSettings(reread,'PV1').modelId,'legacy-scalar');
 assert.deepEqual(p,before);
});

test('shared legacy Worker evidence retains its original identity and scalar payload',()=>{
 const p=mainlineFixture().project,scope=readGflApplicationContext(p,'PV1'),gains=p.extensions.gflPi.PV1.gains;
 const e=evaluateGflMainline({snapshot:scope.snapshot,gains,request:scope.request,experiments:scope.experiments,policy:scope.policy},{now:()=>0});
 const out=build({project:p,ibrId:'PV1',snapshot:scope.snapshot,evaluation:e,exportedAt});
 assert.equal(out.freshness.status,'current');assert.deepEqual(out.scalarLegacy.currentEvaluation,e.legacyEvaluation);assert.equal(out.currentAnalysis.modelFingerprint,e.modelFingerprint);assert.equal(out.currentAnalysis.evaluationFingerprint,e.evaluationFingerprint);assert.equal(out.currentAnalysis.model,null);
 const changed=structuredClone(p);changed.extensions.gflPi.PV1.advisor={request:{...scope.request,minMargin:70}};
 assert.equal(build({project:changed,ibrId:'PV1',evaluation:e,exportedAt}).freshness.evaluationCurrent,false);
 const ignored=structuredClone(p);ignored.extensions.gflPi.PV1.advisor={request:{...scope.request,maxSteadyStateErrorPercent:.01,currentTargets:{maxSettlingSeconds:.01},crossAxisLimits:{outerPeakAbsPu:.001}}};
 assert.equal(build({project:ignored,ibrId:'PV1',evaluation:e,exportedAt}).freshness.evaluationCurrent,true);
});

test('unknown future model remains visible and exportable without scalar fallback',()=>{
 const p=projectFixture(),s=p.extensions.gflPi.PV1;s.analysis={schemaVersion:4,modelId:'future-model',modelVersion:9,custom:{value:null},sources:{pll:'future-source'}};
 const before=structuredClone(p),out=build(options(p));
 assert.equal(out.currentAnalysis.modelId,'future-model');assert.deepEqual(out.currentAnalysis.settings,s.analysis);assert.equal(out.currentAnalysis.status,'unsupported');assert.equal(out.freshness.status,'unsupported');assert.equal(out.scalarLegacy,null);
 assert.deepEqual(parseProject(serializeProject(p)),p);assert.deepEqual(p,before);
});

test('diagnostic export does not mutate source inputs and omits functions while retaining nulls',()=>{
 const p=projectFixture(),e=structuredClone(evaluation),search={searchStatus:'budgetExceeded',candidates:[{id:'diagnostic',mainlineEvaluation:e}],runtime:{now:()=>123},performance:{T:null,O:Infinity}};
 e.diagnostics.push({actualError:null,compute:()=>0});const before=JSON.stringify(p),oldEvaluation=JSON.stringify(e),oldSearch=JSON.stringify(search);
 const out=build({...options(p,e),search});
 assert.equal(JSON.stringify(p),before);assert.equal(JSON.stringify(e),oldEvaluation);assert.equal(JSON.stringify(search),oldSearch);
 assert.deepEqual(out.currentAnalysis.diagnostics.at(-1),{actualError:null});assert.equal(out.search.runtime.now,undefined);assert.equal(out.search.performance.T,null);assert.equal(out.search.performance.O,null);
 out.currentAnalysis.model.A[0][0]=999;out.currentAnalysis.settings.sync.fnHz=99;out.search.candidates[0].mainlineEvaluation.model.A[0][0]=111;
 assert.notEqual(e.model.A[0][0],999);assert.equal(p.extensions.gflPi.PV1.analysis.sync.fnHz,20);
});

test('missing, interrupted and stale current evidence is explicit and cannot borrow compact history matrices',()=>{
 const missing=build(options(project,null));assert.equal(missing.currentAnalysis.status,'unavailable');assert.equal(missing.freshness.status,'unavailable');assert.equal(missing.currentAnalysis.model,null);
 assert.equal(missing.currentAnalysis.solveStatus,null);assert.equal(missing.currentAnalysis.responseQuality,'notEvaluated');assert.equal(missing.currentAnalysis.frequencyResponse,null);assert.deepEqual(missing.currentAnalysis.inputs,context.snapshot.input);
 const interrupted=build(options(project,{...evaluation,solveStatus:'cancelled',responseQuality:'cancelled'}));assert.equal(interrupted.currentAnalysis.status,'unavailable');assert.equal(interrupted.currentAnalysis.solveStatus,'cancelled');assert.equal(interrupted.freshness.evaluationCurrent,false);
 const p=projectFixture();p.extensions.gflPi.PV1.gains.d.kp*=1.2;const stale=build(options(p));assert.equal(stale.freshness.status,'stale');assert.equal(stale.currentAnalysis.status,'stale');assert.deepEqual(stale.currentAnalysis.model,evaluation.model);assert.deepEqual(stale.currentAnalysis.gains,p.extensions.gflPi.PV1.gains);
});

test('each exported realization can be rebuilt from its own original configuration after canonical JSON reread',()=>{
 const out=JSON.parse(JSON.stringify(build(options())));
 for(const item of Object.values(out.currentAnalysis.experiments)){
  const {gains,policy,...snapshot}=item.experiment.model.configurationSnapshot;
  const recreated=JSON.parse(JSON.stringify(buildGflReferenceModel(snapshot,gains,{experimentId:item.experiment.id})));
  for(const key of ['A','B','C','D','states','inputs','outputs','operatingPoint','quality','modelFingerprint','realizationId'])assert.deepEqual(recreated[key],item.experiment.model[key],item.experiment.id+' '+key);
 }
});

test('search ownership is separately stale after a project change even when the caller still says preview',()=>{
 const search={snapshotKey:context.requestKey,searchStatus:'completed',candidateStatus:'preview',candidates:[{id:'ready',gains:payload.gains,mainlineEvaluation:evaluation}]};
 const fresh=build({...options(),search});assert.equal(fresh.search.freshness.status,'current');
 const p=projectFixture();p.extensions.gflPi.PV1.analysis.sync.fnHz=33;
 const stale=build({...options(p),search});assert.equal(stale.search.freshness.status,'stale');assert.equal(stale.search.candidateStatus,'stale');assert.deepEqual(stale.search.candidates[0].mainlineEvaluation.model,evaluation.model);assert.equal(search.candidateStatus,'preview');
});

test('goal changes only stale evaluation while source-provenance or physical edits stale model and response',()=>{
 const p=projectFixture();p.extensions.gflPi.PV1.advisor.request.maxSettlingSeconds=.00001;
 const out=build(options(p));assert.equal(out.freshness.modelCurrent,true);assert.equal(out.freshness.responseCurrent,true);assert.equal(out.freshness.evaluationCurrent,false);assert.equal(out.freshness.status,'stale');assert.equal(out.currentAnalysis.request.maxSettlingSeconds,.00001);
 const changed=projectFixture();changed.components.find(c=>c.id==='PV1').parametersSI.activePowerW=210000;assert.equal(build(options(changed)).freshness.modelCurrent,false);
 const sources=projectFixture();sources.extensions.gflPi.PV1.analysis.sources['sync.fnHz']='measured';assert.equal(build(options(sources)).freshness.modelCurrent,false);
});

test('incomplete experiment arrays remain downloadable as stale diagnostics rather than crashing',()=>{
 const e=structuredClone(evaluation),item=e.experiments['outer-reference-closed'];delete item.responses;delete item.experiment.steps;
 const out=build(options(project,e));assert.equal(out.freshness.modelCurrent,true);assert.equal(out.freshness.responseCurrent,false);assert.equal(out.currentAnalysis.status,'stale');assert.equal(out.currentAnalysis.experiments['outer-reference-closed'].responses,undefined);
});

test('fixed angle, negative steps and explicit delay retain their actual settings, policies and independent quality',()=>{
 for(const variant of ['fixed-angle','negative-step','pade-delay']){
  const p=projectFixture();if(variant==='fixed-angle')p.extensions.gflPi.PV1.analysis.syncMode='fixed-angle';if(variant==='pade-delay')p.extensions.gflPi.PV1.delaySamples=1;
  const scope=readGflApplicationContext(p,'PV1'),experiments=scope.experiments.map(d=>({...d,amplitudePu:variant==='negative-step'?-.01:.01}));
  const e=evaluateGflMainline({snapshot:scope.snapshot,gains:p.extensions.gflPi.PV1.gains,request:scope.request,experiments,policy:scope.policy},{now:()=>0});
  const out=build({...options(p,e),snapshot:scope.snapshot});assert.deepEqual(out.currentAnalysis.model,e.model);assert.deepEqual(out.currentAnalysis.experiments,e.experiments);assert.equal(out.currentAnalysis.solveStatus,e.solveStatus);assert.equal(out.currentAnalysis.responseQuality,e.responseQuality);
  assert.equal(out.currentAnalysis.periods.controlStepSeconds,.00005);assert.equal(out.currentAnalysis.periods.pwmPeriodSeconds,.0005);
  if(variant==='fixed-angle')assert.match(out.currentAnalysis.assumptions.join(' '),/Fixed synchronous reference angle/);
  if(variant==='negative-step')assert.equal(out.currentAnalysis.experiments['outer-reference-closed'].responses[0].amplitudePu,-.01);
  if(variant==='pade-delay'){assert.equal(out.currentAnalysis.model.delayRepresentation.approximate,true);assert.equal(out.currentAnalysis.application.eligible,false);}
 }
});

test('imported eligible flags in full exports or old project extensions cannot authorize application',()=>{
 const out=JSON.parse(JSON.stringify(build(options()))),p=projectFixture();out.currentAnalysis.application.eligible=true;
 p.extensions.gflPi.PV1.advisor.mainlineEvidence=out.currentAnalysis;const reread=parseProject(serializeProject(p));
 const candidate={id:'forged-export',gains:payload.gains,verified:true,requirementsMet:true,evaluation:out.currentAnalysis};
 assert.throws(()=>applyCandidate(reread,'PV1',previewCandidate(createTuningState(reread.extensions.gflPi.PV1),candidate,'same'),'same'),/Worker|票据/);
 assert.deepEqual(reread.extensions.gflPi.PV1.gains,p.extensions.gflPi.PV1.gains);
});

test('legacy side-panel adapter exports completed diagnostic data without computing or pretending mainline authority',async()=>{
 const {buildGflDqPanelExport}=await import('../ui/gfl-dq-panel.js');assert.equal(typeof buildGflDqPanelExport,'function');
 const model={input:{fs:20000,switchingFrequencyHz:null},settings:{enabled:true,pllEnabled:false},currentGains:payload.gains,candidateGains:null},data={current:{status:'ok',model:{A:[[1]],x0:[0]},residual:null,compute:()=>0},candidate:null};
 const out=buildGflDqPanelExport(model,data,exportedAt);assert.equal(out.schema,'gridcraft-dq-analysis-v1');assert.equal(out.scope,'legacy-scalar-dq-side-check');assert.equal(out.applicationAuthority,'none');assert.equal(out.result.current.compute,undefined);assert.equal(out.result.current.residual,null);assert.equal(out.periods.pwmPeriodSeconds,null);assert.deepEqual(out.result.current.model.A,[[1]]);
});

// Native-module UI download boundary; no browser process, screenshots or layout
// assertions. Real Worker payload/evaluation and Blob serialization are exercised.
function downloadPage(p){
 const nodes=new Map(),workers=[],requests=[],writes=[],blobs=[];let raw=JSON.stringify(p);
 function node(key=''){
  if(nodes.has(key))return nodes.get(key);const attrs={},events={};let text='';
  const n={dataset:{},children:[],classList:{add(){}},value:key==='#bodeMode'?'open':key==='#manualIntegralForm'?'ki':'',textContent:'',checked:false,disabled:false,clientWidth:1200,tagName:'DIV',
   addEventListener(t,fn){events[t]=fn;},querySelector:node,querySelectorAll(s){return s==='[data-request]'?[...nodes.values()].filter(el=>el.dataset.request):[];},before(){},append(){},remove(){},replaceChildren(){},click(){},
   insertAdjacentHTML(_where,v){n.innerHTML+=v;},setAttribute(k,v){attrs[k]=v;},getAttribute(k){return attrs[k]??null;},removeAttribute(k){delete attrs[k];},checkValidity(){return true;},setCustomValidity(v){this.validationMessage=v;}};
  Object.defineProperty(n,'innerHTML',{get:()=>text,set(v){text=v;for(const tag of v.matchAll(/<(input|select)[^>]*id="([^"]+)"[^>]*>/g)){const el=node('#'+tag[2]);el.tagName=tag[1].toUpperCase();el.type=tag[0].match(/type="([^"]+)"/)?.[1]??'';const req=tag[0].match(/data-request="([^"]+)"/);if(req)el.dataset.request=req[1];}}});
  const m=key.match(/data-manual-(gain|slider)="([^"]+)"/);if(m)n.dataset[m[1]==='gain'?'manualGain':'manualSlider']=m[2];nodes.set(key,n);return n;
 }
 node('body').innerHTML=readFileSync(new URL('../gfl.html',import.meta.url),'utf8');
 globalThis.document={getElementById:id=>node('#'+id),createElement:tag=>node(tag+nodes.size),querySelector:node,querySelectorAll:()=>[],activeElement:null};globalThis.window={addEventListener(){}};globalThis.location={search:'?ibr=PV1'};globalThis.matchMedia=()=>({matches:false});
 globalThis.localStorage={getItem:()=>raw,setItem:(_,v)=>{raw=v;writes.push(v);}};
 globalThis.Worker=class{constructor(url){this.url=String(url);workers.push(this);}postMessage(data){this.sent=data;requests.push(data);}terminate(){this.terminated=true;}reply(result){this.onmessage({data:{type:'result',requestId:this.sent.requestId,requestKey:this.sent.requestKey,snapshotKey:this.sent.snapshotKey,result}});}};
 URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:export-test';};URL.revokeObjectURL=()=>{};
 return {node,workers,requests,writes,blobs,replaceProject:next=>{raw=JSON.stringify(next);},project:()=>JSON.parse(raw)};
}
test('PI download consumes immutable completed Worker evidence without numerical work or project writes',async()=>{
 const d=downloadPage(projectFixture());await import('../ui/gfl-design.js?task10-export-completed');
 const worker=d.workers.find(w=>w.sent?.kind==='evaluate'&&w.sent.payload.snapshot.modelId==='gfl-dq-reference-v1');assert.ok(worker);
 const e=evaluateGflMainline(worker.sent.payload,{now:()=>0});worker.reply(e);
 const before=JSON.stringify(d.project()),requests=d.requests.length,writes=d.writes.length;d.node('#exportPi').onclick();
 const out=JSON.parse(await d.blobs.at(-1).text());assert.equal(out.schema,'gridcraft-gfl-pi-v9');assert.deepEqual(out.currentAnalysis.model,JSON.parse(JSON.stringify(e.model)));assert.deepEqual(out.currentAnalysis.experiments,JSON.parse(JSON.stringify(e.experiments)));assert.equal(out.freshness.status,'current');
 assert.equal(d.requests.length,requests);assert.equal(d.writes.length,writes);assert.equal(JSON.stringify(d.project()),before);
 const edited=d.project();edited.extensions.gflPi.PV1.analysis.sync.fnHz=38;d.replaceProject(edited);d.node('#exportPi').onclick();
 const stale=JSON.parse(await d.blobs.at(-1).text());assert.equal(stale.currentAnalysis.settings.sync.fnHz,38);assert.equal(stale.freshness.status,'stale');assert.equal(d.requests.length,requests);assert.equal(d.writes.length,writes);
});
test('PI download during pending evaluation and with unknown future settings exports explicit unavailable diagnostics',async()=>{
 const d=downloadPage(projectFixture());await import('../ui/gfl-design.js?task10-export-pending');const requests=d.requests.length;d.node('#exportPi').onclick();
 const pending=JSON.parse(await d.blobs.at(-1).text());assert.equal(pending.schema,'gridcraft-gfl-pi-v9');assert.equal(pending.currentAnalysis.status,'unavailable');assert.equal(pending.currentAnalysis.model,null);assert.equal(d.requests.length,requests);
 const unknown=d.project();unknown.extensions.gflPi.PV1.analysis.modelVersion=99;d.replaceProject(unknown);d.node('#exportPi').onclick();
 const future=JSON.parse(await d.blobs.at(-1).text());assert.equal(future.currentAnalysis.status,'unsupported');assert.equal(future.currentAnalysis.settings.modelVersion,99);assert.equal(d.requests.length,requests);
});

test('legacy PI download checks the evaluated input/gain identity against the latest project',async()=>{
 const p=mainlineFixture().project,d=downloadPage(p);await import('../ui/gfl-design.js?task10-legacy-export');
 d.node('#exportPi').onclick();const fresh=JSON.parse(await d.blobs.at(-1).text());assert.equal(fresh.freshness.status,'current');assert.equal(fresh.scalarLegacy.scope,'legacy-scalar');assert.equal(fresh.currentAnalysis.model,null);
 const edited=d.project();edited.extensions.gflPi.PV1.gains.d.kp*=1.05;d.replaceProject(edited);const before=d.requests.length;d.node('#exportPi').onclick();
 const stale=JSON.parse(await d.blobs.at(-1).text());assert.equal(stale.freshness.status,'stale');assert.equal(stale.scalarLegacy.zeroDelayStability,null);assert.equal(d.requests.length,before);
});
