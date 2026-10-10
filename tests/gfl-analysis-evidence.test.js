import test from 'node:test';
import assert from 'node:assert/strict';
import {mainlineFixture} from './fixtures/gfl-mainline.js';
import {readGflModelInput} from '../analysis/gfl-model-input.js';
import {resolveGflSnapshot} from '../project/gfl-analysis-settings.js';
import {evaluateGflMainline,checkGflMainlineTargets} from '../analysis/gfl-mainline-evaluation.js';
import {createGflExperimentDefinitions} from '../analysis/gfl-experiments.js';
import {gflNumericalPolicy} from '../analysis/gfl-analysis-contract.js';
import {applyCandidate,createTuningState,previewCandidate,restoreAppliedGains} from '../project/gfl-tuning-state.js';
import {saveManualCandidate,renameManualCandidate,listManualCandidates} from '../project/gfl-manual-candidates.js';
import {manualContextKey,mountManualWorkspace} from '../ui/gfl-manual-workspace.js';
import {createGflAnalysisClient} from '../ui/gfl-analysis-client.js';
import {createGflAnalysisDispatcher} from '../ui/gfl-analysis-worker.js';
import {parseProject,serializeProject} from '../project/model.js';
import {projectStore} from '../project/sync.js';

const api=await import('../project/gfl-analysis-evidence.js').catch(()=>({}));
function projectFixture(){
 const f=mainlineFixture(),p=f.project,s=p.extensions.gflPi.PV1;
 Object.assign(s,{dMode:'P',qMode:'Q',filterCurrentMs:.1,filterVoltageMs:.1,analysis:f.settings,advisor:{request:{separationRatio:4,fi:500,fp:50}}});
 p.components.find(c=>c.id==='PV1').parametersSI.activePowerW=2e5;
 s.gainBank={'P/Q':{gains:structuredClone(s.gains),manual:true,annotation:'preserve original entry'},'Vdc/Vac':{gains:structuredClone(s.gains),manual:false}};
 return p;
}
function realEvaluation(p,gains=p.extensions.gflPi.PV1.gains,{experiments=createGflExperimentDefinitions(),policy=gflNumericalPolicy()}={}){
 const stored=p.extensions.gflPi.PV1,read=readGflModelInput(p,'PV1',stored),component=p.components.find(c=>c.id==='PV1');
 const snapshot=resolveGflSnapshot({...read.modelInput,switchingFrequencyHz:component.extensions?.filterDesign?.fs??null},stored.analysis,
  {...read.sourceMap,switchingFrequencyHz:'component.extensions.filterDesign.fs'});
 return evaluateGflMainline({snapshot,gains,request:stored.advisor.request,experiments,policy},{now:()=>0});
}
const baseline=projectFixture(),candidateGains=structuredClone(baseline.extensions.gflPi.PV1.gains);
candidateGains.d.kp*=1.01;
const evaluated=realEvaluation(baseline,candidateGains);
assert.equal(evaluated.application.eligible,true);
const activeProof=stored=>api.readGflApplicationEvidence(stored);
function transaction(p=projectFixture(),evaluation=evaluated,options={}){
 assert.equal(typeof api.readGflApplicationContext,'function','fresh project application context is implemented');
 const context=api.readGflApplicationContext(p,'PV1',{gains:candidateGains,...options});
 const ticket=api.createGflApplicationTicket({requestKey:context.requestKey,candidateId:'manual-fresh',gains:candidateGains,evaluationFingerprint:evaluation.evaluationFingerprint,source:'manual',name:'Fresh'});
 return {ticket,evaluation,currentRequestKey:context.requestKey,searchComplete:true,appliedAt:'2026-10-10T11:00:00Z'};
}
test('fresh application changes PI only and keeps independent immutable historical evidence',()=>{
 const p=projectFixture(),before=structuredClone(p),opts=transaction(p),next=api.commitGflMainlineCandidate(p,'PV1',opts);
 assert.deepEqual(p,before);assert.deepEqual(next.components,before.components);assert.deepEqual(next.wires,before.wires);
 assert.deepEqual(next.extensions.gflPi.PV1.analysis,before.extensions.gflPi.PV1.analysis);
 assert.deepEqual(next.extensions.gflPi.PV1.gains,candidateGains);assert.deepEqual(next.extensions.gflPi.PV1.gainBank['P/Q'].gains,candidateGains);
 const e=activeProof(next.extensions.gflPi.PV1);
 assert.equal(e.appliedAt,'2026-10-10T11:00:00Z');assert.equal(e.modelFingerprint,evaluated.modelFingerprint);assert.equal(e.evaluationFingerprint,evaluated.evaluationFingerprint);
 assert.equal(e.versions.equationVersion,'gfl-dq-srf-pll-v1');assert.equal(next.extensions.gflPi.PV1.advisor.evidenceHistory.length,1);
 const changed=structuredClone(next);changed.extensions.gflPi.PV1.analysis.sync.fnHz=30;
 assert.equal(changed.extensions.gflPi.PV1.advisor.evidenceHistory[0].configurationSnapshot.analysis.sync.fnHz,20);
});
test('PLL change while applying rejects ticket even if the caller supplies the old request key',()=>{
 const p=projectFixture(),opts=transaction(p);p.extensions.gflPi.PV1.analysis.sync.fnHz=30;
 assert.throws(()=>api.commitGflMainlineCandidate(p,'PV1',opts),/过期|改变/);
 p.extensions.gflPi.PV1.analysis.sync.fnHz=20;assert.throws(()=>api.commitGflMainlineCandidate(p,'PV1',opts),/过期|消费|失效/);
});
test('settings, mode, PI and missing PI changes through another tab reject application',()=>{
 for(const change of [p=>{p.extensions.gflPi.PV1.filterCurrentMs=.2;},p=>{p.extensions.gflPi.PV1.dMode='Vdc';},p=>{p.extensions.gflPi.PV1.gains.P.kp=9;},p=>{delete p.extensions.gflPi.PV1.gains;},p=>{p.extensions.gflPi.PV1.analysis.modelId='legacy-scalar';}]){
  const p=projectFixture(),opts=transaction(p);change(p);assert.throws(()=>api.commitGflMainlineCandidate(p,'PV1',opts),/过期|改变|模式/);
 }
});
test('same gains different goal or experiment cannot reuse eligibility',()=>{
 const p=projectFixture(),opts=transaction(p);p.extensions.gflPi.PV1.advisor.request.maxSettlingSeconds=.000001;
 assert.throws(()=>api.commitGflMainlineCandidate(p,'PV1',opts),/过期|改变/);
 const altered=createGflExperimentDefinitions().map(d=>({...d,amplitudePu:-.01})),other=transaction(projectFixture(),evaluated,{experiments:altered});
 assert.throws(()=>api.commitGflMainlineCandidate(projectFixture(),'PV1',other),/指纹|证据|过期/);
});
test('freshness distinguishes goal changes from model and response changes',()=>{
 assert.equal(typeof api.gflEvidenceFreshness,'function');const keys={modelFingerprint:evaluated.modelFingerprint,experimentFingerprints:evaluated.experimentFingerprints,evaluationFingerprint:evaluated.evaluationFingerprint};
 assert.deepEqual(api.gflEvidenceFreshness(evaluated,keys),{modelCurrent:true,responseCurrent:true,evaluationCurrent:true});
 assert.deepEqual(api.gflEvidenceFreshness(evaluated,{...keys,evaluationFingerprint:'different-goal'}),{modelCurrent:true,responseCurrent:true,evaluationCurrent:false});
 assert.deepEqual(api.gflEvidenceFreshness(evaluated,{...keys,experimentFingerprints:{...keys.experimentFingerprints,'outer-reference-closed':'other-step'}}),{modelCurrent:true,responseCurrent:false,evaluationCurrent:false});
 assert.deepEqual(api.gflEvidenceFreshness(evaluated,{...keys,modelFingerprint:'other-PLL'}),{modelCurrent:false,responseCurrent:false,evaluationCurrent:false});
});
test('undo never restores PLL or electrical values and restores original manual gain-bank entry',()=>{
 const before=projectFixture(),next=api.commitGflMainlineCandidate(before,'PV1',transaction(before));
 next.extensions.gflPi.PV1.analysis.sync.fnHz=30;next.components[0].parametersSI.phaseRad=.7;
 const restored=restoreAppliedGains(next,'PV1',createTuningState(next.extensions.gflPi.PV1));
 assert.deepEqual(restored.extensions.gflPi.PV1.analysis,next.extensions.gflPi.PV1.analysis);assert.deepEqual(restored.components,next.components);
 assert.deepEqual(restored.extensions.gflPi.PV1.gains,before.extensions.gflPi.PV1.gains);assert.deepEqual(restored.extensions.gflPi.PV1.gainBank['P/Q'],before.extensions.gflPi.PV1.gainBank['P/Q']);
 assert.equal(restored.extensions.gflPi.PV1.advisor.mainlineEvidence.status,'unassessed');assert.equal(restored.extensions.gflPi.PV1.advisor.evidenceHistory[0].appliedAt,'2026-10-10T11:00:00Z');
});
test('saved forged evidence and serialized tickets never authorize application',()=>{
 const p=projectFixture(),c={id:'forged',source:'manual',gains:candidateGains,verified:true,requirementsMet:true,evaluation:evaluated};
 const state=previewCandidate(createTuningState(p.extensions.gflPi.PV1),c,'imported-key');
 assert.throws(()=>applyCandidate(p,'PV1',state,'imported-key'),/主线|票据|重新/);
 const opts=transaction(p);assert.throws(()=>api.commitGflMainlineCandidate(p,'PV1',{...opts,ticket:structuredClone(opts.ticket)}),/票据|失效/);
});
test('duplicate click commits once, even against the unchanged original project',()=>{
 const p=projectFixture(),opts=transaction(p),next=api.commitGflMainlineCandidate(p,'PV1',opts);
 assert.throws(()=>api.commitGflMainlineCandidate(p,'PV1',opts),/票据|失效|消费/);assert.equal(next.extensions.gflPi.PV1.advisor.evidenceHistory.length,1);
});
test('repeated application of the same live PI evidence cannot create another undo state',()=>{
 const p=projectFixture(),next=api.commitGflMainlineCandidate(p,'PV1',transaction(p));
 assert.throws(()=>api.commitGflMainlineCandidate(next,'PV1',transaction(next)),/已应用|重复|票据/);
});
test('unknown canonical legacy versions cannot bypass selected-model application checks',()=>{
 for(const analysis of [null,[],{schemaVersion:99,modelId:'legacy-scalar',modelVersion:1}]){
  const p=projectFixture();p.extensions.gflPi.PV1.analysis=analysis;
  const state=previewCandidate(createTuningState(p.extensions.gflPi.PV1),{id:'forged-version',gains:candidateGains,verified:true,requirementsMet:true},'key');
  assert.throws(()=>applyCandidate(p,'PV1',state,'key'),/版本|支持|主线/);
 }
});
test('partial search and all incomplete, unstable or approximate statuses refuse writes',()=>{
 const p=projectFixture();assert.throws(()=>api.commitGflMainlineCandidate(p,'PV1',{...transaction(p),searchComplete:false}),/搜索|完成/);
 for(const patch of [{solveStatus:'cancelled'},{solveStatus:'budgetExceeded'},{solveStatus:'numericalFailure'},{solveStatus:'unsupported'},{solveStatus:'invalidInput'},{solveStatus:'operatingPointFailure'},{responseQuality:'windowExceeded'},{responseQuality:'resolutionLimited'},{responseQuality:'approximateDelay'},{stability:{...evaluated.stability,status:'marginal'}},{targetResult:{...evaluated.targetResult,group:'unmet'}},{model:{...evaluated.model,delayRepresentation:{...evaluated.model.delayRepresentation,approximate:true}}},{application:{eligible:false,reasons:['not verified']}}]){
  const e={...evaluated,...patch};assert.throws(()=>api.commitGflMainlineCandidate(p,'PV1',transaction(p,e)),/完成|证据|应用|稳定|目标|近似/);
 }
});
test('forging saved eligibility cannot override the shared current target derivation',()=>{
 const p=projectFixture();p.extensions.gflPi.PV1.advisor.request.maxSettlingSeconds=.000001;
 const unmet=realEvaluation(p,candidateGains);assert.equal(unmet.targetResult.group,'unmet');
 const forged={...unmet,application:{eligible:true,reasons:[]},targetResult:{...unmet.targetResult,group:'satisfied',unmet:[]}};
 assert.throws(()=>api.commitGflMainlineCandidate(p,'PV1',transaction(p,forged)),/目标|证据|应用/);
});
test('a fresh application may configure initially missing PI, while unrelated latest edits survive',()=>{
 const p=projectFixture();delete p.extensions.gflPi.PV1.gains;const opts=transaction(p);p.extensions.otherTab={keep:'remote'};
 const next=api.commitGflMainlineCandidate(p,'PV1',opts);assert.deepEqual(next.extensions.otherTab,{keep:'remote'});
 const restored=restoreAppliedGains(next,'PV1');assert.equal(restored.extensions.gflPi.PV1.gains,undefined);assert.deepEqual(restored.extensions.gflPi.PV1.gainBank['P/Q'],p.extensions.gflPi.PV1.gainBank['P/Q']);
});
test('saving, renaming, selecting and exporting unmet drafts retain PI and full provenance without imported authority',()=>{
 const p=projectFixture();p.extensions.gflPi.PV1.advisor.request.maxSettlingSeconds=.000001;
 assert.equal(realEvaluation(p,candidateGains).application.eligible,false);
 const before=structuredClone(p.extensions.gflPi.PV1.gains),context=api.readGflApplicationContext(p,'PV1');
 const next=saveManualCandidate(p,'PV1',{id:'manual-unmet',name:'Unmet draft',gains:candidateGains,input:context.snapshot.input,request:context.request,snapshot:context.snapshot,experiments:context.experiments,policy:context.policy});
 const renamed=renameManualCandidate(next,'PV1','manual-unmet','Renamed'),imported=JSON.parse(JSON.stringify(renamed));
 imported.extensions.gflPi.PV1.manualCandidates['manual-unmet'].verified=true;imported.extensions.gflPi.PV1.manualCandidates['manual-unmet'].evaluation=evaluated;
 const rows=listManualCandidates(imported,'PV1','P/Q');assert.equal(rows[0].verified,undefined);assert.equal(rows[0].evaluation,undefined);
 assert.deepEqual(rows[0].provenance.snapshot,context.snapshot);assert.deepEqual(rows[0].provenance.experiments,context.experiments);assert.deepEqual(rows[0].provenance.request,context.request);
 assert.deepEqual(imported.extensions.gflPi.PV1.gains,before);
});
test('mainline manual context includes PLL, goals, experiments and policy, while legacy and GFM context remain compatible',()=>{
 const m={modelInput:{R:1},currentGains:candidateGains,request:{},resolvedSnapshot:{modelId:'gfl-dq-reference-v1',analysis:{sync:{fnHz:20}}},experiments:createGflExperimentDefinitions(),policy:gflNumericalPolicy()};
 const original=manualContextKey(m);
 for(const changed of [{...m,resolvedSnapshot:{...m.resolvedSnapshot,analysis:{sync:{fnHz:30}}}},{...m,experiments:m.experiments.map(d=>({...d,amplitudePu:-.01}))},{...m,policy:{...m.policy,response:{...m.policy.response,fineBins:192}}}])assert.notEqual(manualContextKey(changed),original);
 assert.notEqual(manualContextKey({...m,request:{maxSteadyStateErrorPercent:1}}),original);
});
function deferredController(){
 assert.equal(typeof api.createGflMainlineApplicationController,'function');let project=projectFixture(),writes=0;const workers=[],events=[];
 const controller=api.createGflMainlineApplicationController({readProject:()=>project,writeProject:p=>{project=p;writes++;return p;},onEvent:e=>events.push(e),clientFactory:({onEvent})=>createGflAnalysisClient({onEvent,workerFactory:()=>{
  const w={postMessage(data){this.sent=structuredClone(data);},terminate(){this.terminated=true;},run(){createGflAnalysisDispatcher({postMessage:data=>this.onmessage({data}),now:()=>0})(this.sent);}};workers.push(w);return w;
 }})});
 const candidate={id:'manual-fresh',source:'manual',gains:candidateGains,evaluation:evaluated};
 return {controller,workers,events,candidate,get project(){return project;},get writes(){return writes;},edit(fn){fn(project);}};
}
test('Worker apply-check reads latest project again and rejects a PLL race without synchronous fallback',()=>{
 const x=deferredController();x.controller.apply({ibrId:'PV1',candidate:x.candidate,searchComplete:true});assert.equal(x.writes,0);
 assert.equal(x.workers[0].sent.kind,'apply-check');x.edit(p=>{p.extensions.gflPi.PV1.analysis.sync.fnHz=30;});x.workers[0].run();
 assert.equal(x.writes,0);assert.equal(x.events.at(-1).type,'error');assert.match(x.events.at(-1).message,/过期|改变/);
});
test('cancel during apply-check and duplicate clicks cannot commit late or create multiple undo states',()=>{
 const x=deferredController();x.controller.apply({ibrId:'PV1',candidate:x.candidate,searchComplete:true});x.controller.cancel();x.workers[0].run();assert.equal(x.writes,0);
 x.controller.apply({ibrId:'PV1',candidate:x.candidate,searchComplete:true});x.controller.apply({ibrId:'PV1',candidate:x.candidate,searchComplete:true});x.workers.at(-1).run();
 assert.equal(x.writes,1);assert.equal(x.project.extensions.gflPi.PV1.advisor.evidenceHistory.length,1);assert.equal(x.events.at(-1).type,'applied');
});
test('fresh Worker reevaluation refuses a forged preview whose real current targets are unmet',()=>{
 const x=deferredController();x.edit(p=>{p.extensions.gflPi.PV1.advisor.request.maxSettlingSeconds=.000001;});
 x.controller.apply({ibrId:'PV1',candidate:{...x.candidate,verified:true,requirementsMet:true},searchComplete:true});x.workers[0].run();assert.equal(x.writes,0);assert.equal(x.events.at(-1).type,'error');
});
function workspaceDom(){
 const nodes=new Map();function node(key=''){if(nodes.has(key))return nodes.get(key);const attrs={},listeners={},n={dataset:{},value:key==='#manualIntegralForm'?'ki':'',checked:false,disabled:false,innerHTML:'',textContent:'',addEventListener(t,f){listeners[t]=f;},fire(t){listeners[t]?.();},querySelector:node,querySelectorAll:()=>[],before(){},append(){},remove(){},setAttribute(k,v){attrs[k]=v;},getAttribute(k){return attrs[k]??null;},removeAttribute(k){delete attrs[k];}};
  const m=key.match(/data-manual-(gain|slider)="([^"]+)"/);if(m)n.dataset[m[1]==='gain'?'manualGain':'manualSlider']=m[2];nodes.set(key,n);return n;
 }
 globalThis.document={createElement:()=>node('section-'+nodes.size),activeElement:null};return node;
}
test('manual workspace sends resolved coupled context to its Worker and clears trials after PLL edits',async()=>{
 const node=workspaceDom(),workers=[];globalThis.Worker=class{constructor(){workers.push(this);}postMessage(data){this.sent=data;}terminate(){this.terminated=true;}};
 const p=projectFixture(),context=api.readGflApplicationContext(p,'PV1');let model={modelInput:context.snapshot.input,currentGains:p.extensions.gflPi.PV1.gains,request:context.request,
  resolvedSnapshot:context.snapshot,experiments:context.experiments,policy:context.policy,manualCandidates:[]};
 const workspace=mountManualWorkspace(node('host'),{onChange(){workspace.sync(model,null);}});
 workspace.sync(model,null);const input=node('[data-manual-gain="d.kp"]');input.value=String(candidateGains.d.kp);input.fire('input');
 await new Promise(resolve=>setTimeout(resolve,180));
 assert.equal(workers[0].sent.payload.snapshot.modelId,'gfl-dq-reference-v1');assert.equal(workers[0].sent.payload.snapshot.analysis.sync.fnHz,20);
 assert.deepEqual(workers[0].sent.payload.experiments,createGflExperimentDefinitions());assert.deepEqual(workers[0].sent.payload.policy,gflNumericalPolicy());
 p.extensions.gflPi.PV1.analysis.sync.fnHz=30;const changed=api.readGflApplicationContext(p,'PV1');model={...model,resolvedSnapshot:changed.snapshot};
 assert.equal(workspace.sync(model,null).active,false);assert.equal(workers[0].terminated,true);workspace.destroy();
});
test('GFL page routes selected mainline search and Apply through a fresh Worker transaction',async()=>{
 const nodes=new Map(),workers=[];let raw=serializeProject(projectFixture());
 function node(key=''){if(nodes.has(key))return nodes.get(key);const attrs={},events={};const n={dataset:{},children:[],classList:{add(){}},value:key==='#bodeMode'?'open':key==='#manualIntegralForm'?'ki':'',innerHTML:'',textContent:'',checked:false,disabled:false,clientWidth:1200,
  addEventListener(t,f){events[t]=f;},fire(t){events[t]?.();},querySelector:node,querySelectorAll:()=>[],before(){},append(){},remove(){},replaceChildren(){},insertAdjacentHTML(){},setAttribute(k,v){attrs[k]=v;},getAttribute(k){return attrs[k]??null;},removeAttribute(k){delete attrs[k];},checkValidity(){return true;}};
  const m=key.match(/data-manual-(gain|slider)="([^"]+)"/);if(m)n.dataset[m[1]==='gain'?'manualGain':'manualSlider']=m[2];nodes.set(key,n);return n;
 }
 globalThis.document={getElementById:id=>node('#'+id),createElement:tag=>node(tag+nodes.size),querySelector:node,querySelectorAll:()=>[],addEventListener(){},activeElement:null};
 globalThis.window={addEventListener(){}};globalThis.location={search:'?ibr=PV1'};globalThis.matchMedia=()=>({matches:false});globalThis.localStorage={getItem:()=>raw,setItem:(_,v)=>{raw=v;}};
 globalThis.Worker=class{constructor(){workers.push(this);}postMessage(data){this.sent=data;}terminate(){this.terminated=true;}run(){createGflAnalysisDispatcher({postMessage:data=>this.onmessage({data}),now:()=>0})(this.sent);}};
 await import('../ui/gfl-design.js?task8-evidence-test');assert.equal(node('#designError').textContent,'');
 node('#advisorGenerate').onclick();const search=workers.at(-1);assert.equal(search.sent.kind,'search');assert.equal(search.sent.payload.snapshot.modelId,'gfl-dq-reference-v1');
 search.onmessage({data:{type:'result',requestId:search.sent.requestId,requestKey:search.sent.requestKey,result:{searchStatus:'feasibleFound',completionScope:{complete:true},candidates:[{id:'fresh-auto',gains:candidateGains,verified:true,requirementsMet:true,mainlineEvaluation:evaluated,evaluation:evaluated.scalarDiagnostics}]}}});
 const before=parseProject(raw);node('#advisorApply').onclick();const check=workers.at(-1);assert.equal(check.sent.kind,'apply-check');assert.deepEqual(parseProject(raw),before);
 node('#advisorApply').onclick();assert.equal(workers.at(-1),check);check.run();
 const next=parseProject(raw);assert.deepEqual(next.extensions.gflPi.PV1.gains,candidateGains);assert.deepEqual(next.components,before.components);assert.deepEqual(next.extensions.gflPi.PV1.analysis,before.extensions.gflPi.PV1.analysis);
 assert.equal(next.extensions.gflPi.PV1.advisor.evidenceHistory.length,1);
});
function quotaController(limit=5*1024*1024){
 const p=projectFixture(),before=serializeProject(p);let raw=before,writes=0;const events=[];
 const storage={getItem:()=>raw,setItem(_key,value){writes++;if(value.length*2>limit)throw new DOMException('Storage quota exceeded','QuotaExceededError');raw=value;}};
 const store=projectStore(storage,parseProject,serializeProject);store.accept(p);
 const controller=api.createGflMainlineApplicationController({readProject:()=>store.read(),writeProject:p=>store.write(p),onEvent:event=>events.push(event),clientFactory:({onEvent})=>createGflAnalysisClient({onEvent,workerFactory:()=>({terminate(){},postMessage(data){createGflAnalysisDispatcher({postMessage:result=>this.onmessage({data:result}),now:()=>0})(data);}})})});
 return {store,controller,events,before,get raw(){return raw;},get writes(){return writes;}};
}
test('first fresh Apply persists through the real projectStore within a 5 MiB UTF-16 storage quota',()=>{
 const x=quotaController();x.controller.apply({ibrId:'PV1',candidate:{id:'quota-first',gains:candidateGains,evaluation:evaluated},searchComplete:true});
 assert.equal(x.events.at(-1).type,'applied',x.events.at(-1).message);assert.equal(x.writes,1);assert.equal(x.controller.busy,false);
 const stored=x.store.read().extensions.gflPi.PV1,proof=activeProof(stored);
 assert.deepEqual(stored.gains,candidateGains);assert.equal(stored.advisor.evaluation,undefined);
 assert.deepEqual(stored.advisor.mainlineEvidence,{schemaVersion:1,kind:'gfl-mainline-evidence-pointer',historyIndex:0,status:'applied'});
 assert.equal(proof.schemaVersion,1);assert.equal(proof.kind,'gfl-mainline-application-proof');assert.equal(proof.modelFingerprint,evaluated.modelFingerprint);assert.equal(proof.evaluationFingerprint,evaluated.evaluationFingerprint);
 assert.deepEqual(proof.experimentFingerprints,evaluated.experimentFingerprints);assert.deepEqual(proof.configurationSnapshot,evaluated.model.configurationSnapshot);
 assert.deepEqual(proof.evaluationSummary.model.quality,evaluated.model.quality);assert.deepEqual(proof.evaluationSummary.targetResult,evaluated.targetResult);
 const response=proof.evaluationSummary.experiments['outer-reference-closed'].responses[0],original=evaluated.experiments['outer-reference-closed'].responses[0];
 assert.deepEqual(response.channels,original.channels);assert.equal(response.quality.steadyState.normalizedResidual,original.quality.steadyState.normalizedResidual);
 assert.deepEqual(proof.policy,gflNumericalPolicy());assert.equal(response.points,undefined);assert.equal(response.quality.keptPoints,undefined);assert.equal(proof.evaluation,undefined);
 assert.deepEqual(checkGflMainlineTargets(proof.evaluationSummary,proof.request,proof.evaluationSummary.scalarDiagnostics),evaluated.targetResult,'compact historical metrics still support the shared target inspection');
 assert.ok(x.raw.length*2<512*1024,'one compact proof leaves most of the project storage available');
 assert.equal(x.events.at(-1).evaluation.experiments['outer-reference-closed'].responses[0].points.length,original.points.length,'full fresh response remains transient for current display/export');
 x.controller.destroy();
});
test('new compact applications retain preexisting user history byte-for-byte and read older full evidence records',()=>{
 const p=projectFixture(),retained={status:'applied',candidateId:'retained-old-record',modelFingerprint:'old-model',experimentFingerprints:{old:'old-experiment'},evaluationFingerprint:'old-evaluation',
  evaluation:{points:[{t:0,y:[0]},{t:1,y:[1]}]},userAnnotation:'Keep this original history exactly'};
 p.extensions.gflPi.PV1.advisor.evidenceHistory=[structuredClone(retained)];p.extensions.gflPi.PV1.advisor.mainlineEvidence=structuredClone(retained);
 assert.deepEqual(activeProof(p.extensions.gflPi.PV1),retained);
 const next=api.commitGflMainlineCandidate(p,'PV1',transaction(p));assert.deepEqual(next.extensions.gflPi.PV1.advisor.evidenceHistory[0],retained);
 assert.equal(next.extensions.gflPi.PV1.advisor.evidenceHistory.length,2);assert.equal(next.extensions.gflPi.PV1.advisor.mainlineEvidence.historyIndex,1);
});
test('repeated Apply keeps every compact historical proof with linear bounded-per-record growth under the real storage quota',()=>{
 const x=quotaController(),otherGains=structuredClone(candidateGains);otherGains.d.kp*=1.005;
 const otherEvaluation=realEvaluation(projectFixture(),otherGains);assert.equal(otherEvaluation.application.eligible,true);
 let first=null,lastSize=x.before.length;
 for(let i=0;i<12;i++){
  const gains=i%2?otherGains:candidateGains,evaluation=i%2?otherEvaluation:evaluated;
  x.controller.apply({ibrId:'PV1',candidate:{id:'quota-history-'+i,gains,evaluation},searchComplete:true});
  assert.equal(x.events.at(-1).type,'applied',x.events.at(-1).message);
  const stored=x.store.read().extensions.gflPi.PV1;assert.equal(stored.advisor.evidenceHistory.length,i+1);assert.equal(stored.advisor.mainlineEvidence.historyIndex,i);
  if(i===0)first=structuredClone(stored.advisor.evidenceHistory[0]);else assert.deepEqual(stored.advisor.evidenceHistory[0],first);
  assert.ok((x.raw.length-lastSize)*2<512*1024,'each application adds a compact record rather than repeated full evaluations');lastSize=x.raw.length;
 }
 assert.equal(x.writes,12);assert.ok(x.raw.length*2<5*1024*1024);assert.equal(x.store.read().extensions.gflPi.PV1.advisor.evidenceHistory[11].candidateId,'quota-history-11');
 const restored=restoreAppliedGains(x.store.read(),'PV1');assert.deepEqual(restored.extensions.gflPi.PV1.advisor.evidenceHistory[0],first);assert.equal(activeProof(restored.extensions.gflPi.PV1).status,'unassessed');
 x.controller.destroy();
});
test('a genuine storage quota failure still leaves original PI, history and project unchanged',()=>{
 const x=quotaController(serializeProject(projectFixture()).length*2+128);
 x.controller.apply({ibrId:'PV1',candidate:{id:'quota-failure',gains:candidateGains,evaluation:evaluated},searchComplete:true});
 assert.equal(x.events.at(-1).type,'error');assert.match(x.events.at(-1).message,/quota/i);assert.equal(x.writes,1);assert.equal(x.raw,x.before);assert.equal(x.controller.busy,false);
 assert.deepEqual(x.store.read().extensions.gflPi.PV1.gains,baseline.extensions.gflPi.PV1.gains);assert.equal(x.store.read().extensions.gflPi.PV1.advisor.evidenceHistory,undefined);x.controller.destroy();
});

test('fresh-ticket application cannot apply a false one-second pass obtained by a 50% settling band',()=>{
 const p=projectFixture();p.extensions.gflPi.PV1.advisor.request.maxSettlingSeconds=1;const before=JSON.stringify(p);
 const policy=gflNumericalPolicy(),loose={...policy,response:{...policy.response,settlingBandFraction:.5}},e=realEvaluation(p,candidateGains,{policy:loose});
 assert.throws(()=>api.commitGflMainlineCandidate(p,'PV1',transaction(p,e,{policy:loose})),/2%/);
 assert.equal(JSON.stringify(p),before);assert.equal(p.extensions.gflPi.PV1.advisor.evidenceHistory,undefined);
 const normal=realEvaluation(p,candidateGains);assert.equal(normal.solveStatus,'completed');assert.equal(normal.application.eligible,false);assert.equal(normal.targetResult.group,'unmet');assert.ok(normal.performance.T>7.9&&normal.performance.T<8);
});
