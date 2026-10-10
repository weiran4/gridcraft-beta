import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGflAnalysisClient} from '../ui/gfl-analysis-client.js';
import {createGflAnalysisDispatcher} from '../ui/gfl-analysis-worker.js';
import {evaluateGflMainline,isGflEvaluationCacheEntry} from '../analysis/gfl-mainline-evaluation.js';
import {gflNumericalPolicy,gflFingerprint} from '../analysis/gfl-analysis-contract.js';
import {createGflExperimentDefinitions} from '../analysis/gfl-experiments.js';
import {mainlineFixture} from './fixtures/gfl-mainline.js';

const f=mainlineFixture(),payload=()=>({snapshot:structuredClone(f.snapshot),gains:structuredClone(f.gains),experiments:createGflExperimentDefinitions(),policy:gflNumericalPolicy(),request:{separationRatio:4}});
const job=(requestKey='one',patch={})=>({kind:'evaluate',requestKey,payload:{...payload(),...patch}});
function fixture({execute=false}={}){
 const events=[],workers=[];
 const client=createGflAnalysisClient({workerFactory:()=>{
  const w={postMessage(data){this.sent=structuredClone(data);},terminate(){this.terminated=true;},emit(data){this.onmessage({data});},run(){createGflAnalysisDispatcher({postMessage:data=>this.emit(data),now:()=>0})(this.sent);}};
  workers.push(w);return w;
 },onEvent:e=>events.push(e)});
 return {client,workers,events,start(j){client.start(j);if(execute)workers.at(-1).run();}};
}
const reply=(w,type='result',result={solveStatus:'completed',application:{eligible:true}})=>({type,requestId:w.sent.requestId,requestKey:w.sent.requestKey,result});

test('late result is ignored and restart terminates the previous synchronous CPU owner',()=>{
 const x=fixture();x.start(job('first'));const first=x.workers[0];x.start(job('second'));assert.equal(first.terminated,true);
 const second=x.workers[1],n=x.events.length;first.emit(reply(first));second.emit({...reply(second),requestKey:'wrong'});assert.equal(x.events.length,n);
 second.emit(reply(second));assert.equal(x.events.at(-1).requestKey,'second');assert.equal(second.terminated,true);assert.equal(x.client.busy,false);
});
test('same request fingerprint still fences a different request sequence and duplicate results',()=>{
 const x=fixture(),j=job();x.start(j);const first=x.workers[0];x.start(j);const second=x.workers[1];assert.notEqual(first.sent.requestId,second.sent.requestId);
 first.emit(reply(first));assert.equal(x.events.filter(e=>e.type==='result').length,0);second.emit(reply(second));second.emit(reply(second));assert.equal(x.events.filter(e=>e.type==='result').length,1);
});
test('cancel emits no completed evidence and terminates the active worker',()=>{
 const x=fixture();x.start(job());const w=x.workers[0];x.client.cancel();w.emit(reply(w));assert.equal(w.terminated,true);assert.equal(x.client.busy,false);
 assert.equal(x.events.at(-1).type,'cancelled');assert.equal(x.events.at(-1).requestId,w.sent.requestId);assert.equal(x.events.some(e=>e.type==='result'),false);assert.equal(x.events.at(-1).result,undefined);
});
test('error then late success is ignored; invalidate clears evidence without a new worker',()=>{
 const x=fixture();x.start(job());const w=x.workers[0];w.emit({...reply(w,'error'),message:'CPU failed'});w.emit(reply(w));assert.equal(x.events.at(-1).type,'error');assert.equal(x.events.filter(e=>e.type==='result').length,0);
 x.client.invalidate('invalid input');assert.equal(x.events.at(-1).type,'stale');assert.equal(x.events.at(-1).result,undefined);assert.equal(x.workers.length,1);
});
test('destruction while loading rejects stale replies and future starts',()=>{
 const x=fixture();x.start(job());const w=x.workers[0],n=x.events.length;x.client.destroy();w.emit(reply(w));w.onerror({message:'late'});x.client.start(job('later'));
 assert.equal(w.terminated,true);assert.equal(x.events.length,n);assert.equal(x.workers.length,1);assert.equal(x.client.busy,false);
});
test('payload/results are structured-clone safe and immutable independently of their sources',()=>{
 const x=fixture(),j=job(),before=structuredClone(j);x.start(j);const w=x.workers[0];assert.deepEqual(j,before);assert.deepEqual(structuredClone(w.sent),w.sent);
 j.payload.gains.P.ki=99;assert.equal(w.sent.payload.gains.P.ki,before.payload.gains.P.ki);
 const r=reply(w);w.emit(r);assert.deepEqual(structuredClone(x.events.at(-1)),x.events.at(-1));assert.ok(Object.isFrozen(x.events.at(-1).result.application));
 r.result.application.eligible=false;assert.equal(x.events.at(-1).result.application.eligible,true);
});
test('display-only changes never create a numerical job or cancel valid evidence',()=>{
 const x=fixture(),j=job('first',{display:{units:'pu',color:'blue',zoom:1}});x.start(j);const w=x.workers[0],n=x.events.length;
 x.start({...j,requestKey:'display-elsewhere',payload:{...j.payload,display:{units:'SI',color:'red',zoom:2}}});assert.equal(x.workers.length,1);assert.equal(x.events.length,n);assert.notEqual(w.terminated,true);assert.equal(w.sent.payload.display,undefined);
});
test('goal-only edits transfer completed evidence into a replacement Worker and recheck targets there',()=>{
 const x=fixture({execute:true});x.start(job());const first=x.events.find(e=>e.type==='result').result;
 assert.equal(first.application.eligible,true);const responsesBefore=x.events.filter(e=>e.type==='progress'&&e.progress.phase==='response').length;assert.ok(responsesBefore>0);
 x.start(job('new-goal',{request:{separationRatio:4,maxSettlingSeconds:.00001}}));const second=x.events.at(-1).result;
 assert.equal(second.solveStatus,'completed');assert.equal(second.application.eligible,false);assert.equal(second.targetResult.group,'unmet');assert.equal(second.modelFingerprint,first.modelFingerprint);assert.notEqual(second.evaluationFingerprint,first.evaluationFingerprint);
 assert.equal(x.events.filter(e=>e.type==='progress'&&e.progress.phase==='response').length,responsesBefore);assert.ok(x.events.some(e=>e.type==='progress'&&e.progress.phase==='target-recheck'));
 assert.ok(x.workers[1].sent.cacheEntries.length>0);assert.deepEqual(second.experiments,first.experiments);
});
test('invalid targets clear eligibility even after reusable valid evidence',()=>{
 const x=fixture({execute:true});x.start(job());x.start(job('invalid',{request:{maxSettlingSeconds:-1}}));const e=x.events.at(-1);
 assert.equal(e.type,'result');assert.equal(e.result.solveStatus,'invalidInput');assert.equal(e.result.application.eligible,false);assert.equal(e.result.model,null);
});
test('changed physical/sync facts, PI, experiment or numerical policy cannot hit another cache scope',()=>{
 const x=fixture({execute:true});x.start(job());const before=x.events.filter(e=>e.type==='progress'&&e.progress.phase==='response').length,changed=mainlineFixture({settings:{sync:{fnHz:19}}});
 x.start(job('model-change',{snapshot:changed.snapshot}));const after=x.events.filter(e=>e.type==='progress'&&e.progress.phase==='response').length;assert.ok(after>before);
 x.start(job('experiment-change',{experiments:createGflExperimentDefinitions().map(d=>({...d,amplitudePu:-.01}))}));assert.ok(x.events.filter(e=>e.type==='progress'&&e.progress.phase==='response').length>after);
 const policy=gflNumericalPolicy();x.start(job('policy-change',{policy:{...policy,response:{...policy.response,coarseBins:64,fineBins:128}}}));assert.equal(x.events.at(-1).result.solveStatus,'completed');
 assert.equal(x.events.filter(e=>e.type==='progress'&&e.progress.phase==='target-recheck').length,0);
});
test('completed cache survives terminate but is capped at eight results and excludes cancelled/partial jobs',()=>{
 const x=fixture();for(let i=0;i<9;i++){x.start(job('step-'+i));const w=x.workers.at(-1);w.emit({...reply(w),cacheEntries:[{key:'scope-'+i,evidence:{solveStatus:'completed'}}]});}
 x.client.start(job('inspect'));assert.equal(x.workers.at(-1).sent.cacheEntries.length,8);assert.equal(x.workers.at(-1).sent.cacheEntries[0].key,'scope-1');x.client.cancel();
 x.client.start(job('inspect-again'));assert.equal(x.workers.at(-1).sent.cacheEntries.length,8);assert.equal(x.workers[0].terminated,true);
});
test('Worker dispatcher routes evaluate/apply-check identically and forwards real response progress',()=>{
 const events=[],dispatch=createGflAnalysisDispatcher({postMessage:e=>events.push(e),now:()=>0}),p=payload(),before=structuredClone(p);
 dispatch({type:'run',kind:'evaluate',requestId:1,requestKey:'e',payload:p});const evaluated=events.at(-1);assert.equal(events[0].type,'started');assert.ok(events.some(e=>e.type==='progress'&&e.progress.phase==='response'));
 dispatch({type:'run',kind:'apply-check',requestId:2,requestKey:'a',payload:p,cacheEntries:evaluated.cacheEntries});assert.deepEqual(events.at(-1).result,evaluated.result);assert.deepEqual(p,before);assert.deepEqual(structuredClone(evaluated),evaluated);
});
test('one Worker monotonic deadline interrupts response work without eligible evidence',()=>{
 let clock=0;const events=[],dispatch=createGflAnalysisDispatcher({now:()=>clock,postMessage:e=>{events.push(e);if(e.type==='progress'&&e.progress.phase==='response')clock=25000;}});
 dispatch({type:'run',kind:'evaluate',requestId:1,requestKey:'budget',payload:payload()});const e=events.at(-1);assert.equal(e.type,'result');assert.equal(e.result.solveStatus,'budgetExceeded');assert.equal(e.result.application.eligible,false);assert.deepEqual(e.cacheEntries,[]);
});
test('shared evaluator Runtime.cache rechecks only targets and rejects mismatched evidence',()=>{
 const cache=new Map(),events=[],p=payload(),r=evaluateGflMainline(p,{now:()=>0,cache,onProgress:e=>events.push(e)});assert.equal(r.solveStatus,'completed');assert.ok(cache.size>0);
 const responseCount=events.filter(e=>e.phase==='response').length;const next=evaluateGflMainline({...p,request:{...p.request,maxSettlingSeconds:.00001}},{now:()=>0,cache,onProgress:e=>events.push(e)});assert.equal(next.application.eligible,false);assert.equal(events.filter(e=>e.phase==='response').length,responseCount);
 const record=structuredClone([...cache.values()][0]);record.evidence.modelFingerprint='wrong';cache.clear();cache.set(record.key,record);
 evaluateGflMainline(p,{now:()=>0,cache,onProgress:e=>events.push(e)});assert.ok(events.filter(e=>e.phase==='response').length>responseCount);
});
test('shared tuning client preserves legacy protocol, GFM fields and has no post-destroy jobs',async()=>{
 const {createTuningClient}=await import('../ui/gfl-tuning-client.js'),events=[],workers=[],c=createTuningClient({workerFactory:()=>{const w={postMessage(data){this.sent=data;},terminate(){this.terminated=true;}};workers.push(w);return w;},onEvent:e=>events.push(e)});
 c.start({snapshotKey:'gfm',mode:'droop',modeParameters:{k:2},input:{x:1},request:{}});assert.equal(workers[0].sent.type,'search');assert.equal(workers[0].sent.mode,'droop');assert.deepEqual(workers[0].sent.modeParameters,{k:2});
 const w=workers[0];w.onmessage({data:{type:'result',requestId:w.sent.requestId,snapshotKey:'gfm',result:{candidates:[]}}});assert.equal(events.at(-1).snapshotKey,'gfm');c.destroy();c.start({snapshotKey:'after'});assert.equal(workers.length,1);
});
test('legacy tuning/manual Workers share dispatcher and no main-thread numerical fallback is introduced',()=>{
 for(const name of ['gfl-tuning-worker','gfl-manual-worker']){const source=readFileSync(new URL('../ui/'+name+'.js',import.meta.url),'utf8');assert.match(source,/gfl-analysis-worker/);}
 const source=readFileSync(new URL('../ui/gfl-analysis-client.js',import.meta.url),'utf8');assert.doesNotMatch(source,/evaluateGflMainline|stateSpaceStepResponse|searchGflCandidates|gflDqModel/);
});

test('a relabelled cache entry cannot pass a changed model scope',()=>{
 const p=payload(),cache=new Map(),events=[];evaluateGflMainline(p,{now:()=>0,cache});const old=structuredClone([...cache.values()][0]);
 const changed=payload();changed.snapshot=mainlineFixture({settings:{sync:{fnHz:19}}}).snapshot;const targetCache=new Map();evaluateGflMainline(changed,{now:()=>0,cache:targetCache});const target=[...targetCache.values()][0];
 old.key=target.key;old.modelKey=target.modelKey;old.experimentKey=target.experimentKey;cache.clear();cache.set(old.key,old);
 const result=evaluateGflMainline(changed,{now:()=>0,cache,onProgress:e=>events.push(e)});assert.equal(result.modelFingerprint,target.evidence.modelFingerprint);assert.ok(events.some(e=>e.phase==='response'));
});
test('new current targets cannot upgrade cached optional frozen drift evidence',()=>{
 const p=payload();p.snapshot=mainlineFixture({input:{dMode:'Vdc'}}).snapshot;const cache=new Map(),events=[];const outer=evaluateGflMainline(p,{now:()=>0,cache});assert.equal(outer.application.eligible,true);
 const inner=evaluateGflMainline({...p,request:{...p.request,currentTargets:{maxSettlingSeconds:1}}},{now:()=>0,cache,onProgress:e=>events.push(e)});assert.equal(inner.application.eligible,false);assert.equal(inner.responseQuality,'windowExceeded');assert.equal(inner.performance.E,null);assert.ok(events.some(e=>e.phase==='target-recheck'));
});
test('a required missing experiment remains invalid even when outer-only evidence is cached',()=>{
 const p=payload();p.experiments=p.experiments.slice(0,1);const cache=new Map();evaluateGflMainline(p,{now:()=>0,cache});const r=evaluateGflMainline({...p,request:{...p.request,currentTargets:{maxSettlingSeconds:1}}},{now:()=>0,cache});
 assert.equal(r.solveStatus,'invalidInput');assert.equal(r.application.eligible,false);
});

test('an interrupted search returns diagnostic candidates without new reusable completed evidence',()=>{
 const events=[],dispatch=createGflAnalysisDispatcher({now:()=>0,postMessage:e=>events.push(e)}),p=payload();
 dispatch({type:'run',kind:'search',requestId:1,requestKey:'search',payload:{...p,baselineGains:p.gains,experiments:p.experiments.slice(0,1),options:{maxInner:1,maxDqEvaluations:1}}});
 const e=events.at(-1);assert.equal(e.type,'result');assert.equal(e.result.searchStatus,'budgetExceeded');assert.equal(e.result.completionScope.complete,false);assert.ok(e.result.candidates.length>0);assert.equal(e.result.candidates.some(c=>c.mainlineEvaluation.application.eligible),false);
 assert.equal(e.cacheEntries.length,0);assert.ok(events.some(e=>e.type==='progress'&&e.progress.phase==='response'));
});
test('selected-model tuning client routes immutable search payloads through the unified dispatcher',async()=>{
 const {createTuningClient}=await import('../ui/gfl-tuning-client.js'),events=[],workers=[],c=createTuningClient({workerFactory:()=>{const w={postMessage(data){this.sent=structuredClone(data);},terminate(){this.terminated=true;}};workers.push(w);return w;},onEvent:e=>events.push(e)}),p=payload();
 c.start({...p,snapshotKey:'selected-search',baselineGains:p.gains,options:{maxInner:1,maxDqEvaluations:0}});const w=workers[0];assert.equal(w.sent.type,'run');assert.equal(w.sent.kind,'search');assert.equal(w.sent.requestKey,'selected-search');
 createGflAnalysisDispatcher({now:()=>0,postMessage:data=>w.onmessage({data})})(w.sent);assert.equal(events.at(-1).type,'result');assert.equal(events.at(-1).result.snapshotKey,'selected-search');assert.equal(events.at(-1).result.searchStatus,'budgetExceeded');assert.ok(Object.isFrozen(events.at(-1).result));assert.equal(c.busy,false);assert.equal(w.terminated,true);
});
test('legacy manual Worker preview stays result-only for the existing preview client',async()=>{
 const previous=globalThis.self,events=[];globalThis.self={postMessage:e=>events.push(e)};
 try{
  await import('../ui/gfl-manual-worker.js?task7-preview');const p=payload();self.onmessage({data:{type:'preview',requestId:7,snapshotKey:'manual',payload:{...p,input:p.snapshot.input,record:{id:'named',name:'Named'}}}});
  assert.equal(events.length,1);assert.equal(events[0].type,'result');assert.equal(events[0].result.id,'named');assert.equal(events[0].result.requirementsMet,true);assert.equal(events[0].result.evaluation.modelId,'gfl-dq-reference-v1');assert.equal(events[0].snapshotKey,'manual');
 }finally{if(previous===undefined)delete globalThis.self;else globalThis.self=previous;}
});
test('start callback cancellation prevents dispatch and functions never cross Worker boundary',()=>{
 let worker,client;const events=[];client=createGflAnalysisClient({workerFactory:()=>worker={postMessage(){this.posted=true;},terminate(){this.terminated=true;}},onEvent:e=>{events.push(e);if(e.type==='started')client.cancel();}});client.start(job());assert.equal(worker.posted,undefined);assert.equal(worker.terminated,true);assert.equal(events.at(-1).type,'cancelled');
 const x=fixture();x.start(job('function',{snapshot:{...f.snapshot,bad:()=>{}}}));assert.equal(x.workers.length,0);assert.equal(x.events.at(-1).type,'error');assert.equal(x.client.busy,false);
});

test('error and Worker-cancel envelopes cannot carry completed evidence',()=>{
 const x=fixture();x.start(job('error'));const first=x.workers[0];first.emit({...reply(first,'error'),message:'failure'});assert.equal(x.events.at(-1).result,undefined);
 x.start(job('cancel'));const second=x.workers[1];second.emit(reply(second,'cancelled'));assert.equal(x.events.at(-1).type,'cancelled');assert.equal(x.events.at(-1).result,undefined);
});

test('a real CPU Worker is terminated during response propagation with no late result',async()=>{
 const {Worker}=await import('node:worker_threads'),workerUrl=new URL('../ui/gfl-analysis-worker.js',import.meta.url).href;
 const source=`import {parentPort} from 'node:worker_threads'; globalThis.self={postMessage:data=>parentPort.postMessage(data)}; await import(${JSON.stringify(workerUrl)}); parentPort.on('message',data=>self.onmessage({data}));`;
 const events=[];let client,done,failed,timer,cancelled=false;
 const completion=new Promise((resolve,reject)=>{done=resolve;failed=reject;});
 client=createGflAnalysisClient({workerFactory:()=>{
  const worker=new Worker(source,{eval:true,type:'module'}),adapter={postMessage:data=>worker.postMessage(data),terminate(){worker.terminate().then(done,failed);}};
  worker.on('message',data=>adapter.onmessage({data}));worker.on('error',error=>adapter.onerror(error));return adapter;
 },onEvent:e=>{events.push(e);if(e.type==='error')failed(Error(e.message));if(e.type==='progress'&&e.progress.phase==='response'&&!cancelled){cancelled=true;client.cancel();}}});
 try{timer=setTimeout(()=>failed(Error('Worker response progress timed out')),10000);client.start(job('real-cancel'));await completion;assert.equal(cancelled,true);assert.equal(client.busy,false);assert.equal(events.at(-1).type,'cancelled');assert.equal(events.some(e=>e.type==='result'),false);}
 finally{clearTimeout(timer);client.destroy();}
});

test('completed-evidence cache bookkeeping cannot outlive the shared deadline or certify a result',()=>{
 let clock=0;class ExpiringCache extends Map{set(key,value){clock=25;return super.set(key,value);}}
 const cache=new ExpiringCache(),r=evaluateGflMainline(payload(),{now:()=>clock,deadlineMs:25,cache});
 assert.equal(r.solveStatus,'budgetExceeded');assert.equal(r.application.eligible,false);assert.equal(cache.size,0);
});

test('non-finite or non-JSON scope values cannot collide with reusable null/default data',()=>{
 const p=payload(),cache=new Map();evaluateGflMainline(p,{now:()=>0,cache});
 const invalid={...p,experiments:p.experiments.map(d=>({...d,windowSeconds:Infinity}))};const window=evaluateGflMainline(invalid,{now:()=>0,cache});assert.equal(window.solveStatus,'invalidInput');assert.equal(window.application.eligible,false);
 const policy={...p.policy,response:{...p.policy.response,extra:null}},policyCache=new Map();evaluateGflMainline({...p,policy},{now:()=>0,cache:policyCache});
 const invalidPolicy=evaluateGflMainline({...p,policy:{...policy,response:{...policy.response,extra:NaN}}},{now:()=>0,cache:policyCache});assert.equal(invalidPolicy.solveStatus,'invalidInput');assert.equal(invalidPolicy.application.eligible,false);
});


test('I1 relabelled experiment windows/policies/amplitudes/sets are rejected against actual evidence',()=>{
 const p=payload(),cache=new Map(),original=evaluateGflMainline(p,{now:()=>0,cache}),saved=[...cache.values()][0];assert.equal(original.application.eligible,true);
 const relabel=projection=>{const entry=structuredClone(saved);entry.projection=structuredClone(projection);entry.key=entry.experimentKey=gflFingerprint('cache-experiment',{modelKey:entry.modelKey,experiments:projection.experiments,policy:projection.policy.response});return entry;};
 const short={...p,experiments:p.experiments.map(d=>({...d,windowSeconds:1e-6}))},wrong=relabel(short);assert.equal(isGflEvaluationCacheEntry(wrong),false);
 const events=[],reused=evaluateGflMainline(short,{now:()=>0,cache:new Map([[wrong.key,wrong]]),onProgress:e=>events.push(e)}),fresh=evaluateGflMainline(short,{now:()=>0});
 assert.equal(reused.application.eligible,false);assert.equal(reused.responseQuality,fresh.responseQuality);assert.equal(reused.experimentFingerprints['outer-reference-closed'],fresh.experimentFingerprints['outer-reference-closed']);assert.equal(reused.experiments['outer-reference-closed'].experiment.policy.windowSeconds,1e-6);assert.ok(events.some(e=>e.phase==='response'));assert.equal(events.some(e=>e.phase==='target-recheck'),false);
 for(const projection of [{...p,experiments:p.experiments.map(d=>({...d,amplitudePu:-.01}))},{...p,experiments:p.experiments.slice(0,1)},{...p,policy:{...p.policy,response:{...p.policy.response,coarseBins:64,fineBins:128}}}])assert.equal(isGflEvaluationCacheEntry(relabel(projection)),false);
});
test('I2 a display edit with nonfinite scope clears completed eligibility and fences an active owner',()=>{
 const x=fixture({execute:true});x.start(job('valid',{display:{units:'pu'}}));assert.equal(x.events.at(-1).result.application.eligible,true);
 x.client.start(job('invalid',{display:{units:'SI'},experiments:createGflExperimentDefinitions().map(d=>({...d,windowSeconds:NaN}))}));assert.equal(x.events.at(-1).type,'error');assert.equal(x.events.at(-1).result,undefined);assert.equal(x.events.at(-1).requestKey,'invalid');assert.equal(x.client.busy,false);
 const active=fixture();active.start(job('active',{display:{units:'pu'}}));const old=active.workers[0];active.client.start(job('invalid-active',{display:{units:'SI'},experiments:createGflExperimentDefinitions().map(d=>({...d,windowSeconds:Infinity}))}));old.emit(reply(old));assert.equal(old.terminated,true);assert.equal(active.events.at(-1).type,'error');assert.equal(active.events.some(e=>e.type==='result'),false);
});
test('I3 final result clone/export expiry downgrades evaluation and preserves only prior reusable evidence',()=>{
 const p=payload(),cache=new Map();evaluateGflMainline(p,{now:()=>0,cache});const prior=[...cache.values()][0],events=[],originalClone=globalThis.structuredClone;let clock=0;
 globalThis.structuredClone=value=>{const copied=originalClone(value);if(value?.type==='result'&&Array.isArray(value.cacheEntries))clock=25001;return copied;};
 try{createGflAnalysisDispatcher({now:()=>clock,postMessage:e=>events.push(e)})({type:'run',kind:'evaluate',requestId:1,requestKey:'export-expiry',payload:{...p,experiments:p.experiments.map(d=>({...d,amplitudePu:-.01}))},cacheEntries:[prior]});}
 finally{globalThis.structuredClone=originalClone;}
 const e=events.at(-1);assert.equal(e.type,'result');assert.equal(e.result.solveStatus,'budgetExceeded');assert.equal(e.result.application.eligible,false);assert.equal(e.result.responseQuality,'budgetExceeded');assert.equal(e.cacheEntries.length,1);assert.equal(e.cacheEntries[0].key,prior.key);assert.equal(clock,25001);
});
test('I3 expiry during terminal search export downgrades all completed candidates and ranking fronts',()=>{
 const events=[],originalClone=globalThis.structuredClone;let clock=0;globalThis.structuredClone=value=>{const copied=originalClone(value);if(value?.type==='result'&&Array.isArray(value.cacheEntries))clock=25001;return copied;};
 try{const p=payload();createGflAnalysisDispatcher({now:()=>clock,postMessage:e=>events.push(e)})({type:'run',kind:'search',requestId:1,requestKey:'search-export-expiry',payload:{...p,baselineGains:p.gains,experiments:p.experiments.slice(0,1),options:{maxInner:1}}});}
 finally{globalThis.structuredClone=originalClone;}
 const e=events.at(-1);assert.equal(e.result.searchStatus,'budgetExceeded');assert.equal(e.result.completionScope.complete,false);assert.equal(e.result.targetStatus,'notSatisfied');assert.equal(e.result.candidates.some(c=>c.mainlineEvaluation.application.eligible),false);assert.equal(e.result.ranking.diagnostics.qualified,0);assert.equal(e.result.ranking.fronts.satisfied.length,0);assert.equal(e.cacheEntries.length,0);
});

test('evaluate and apply-check Worker requests reject incompatible settling policies without transferable evidence',()=>{
 for(const kind of ['evaluate','apply-check']){
  const p=payload();p.policy={...p.policy,response:{...p.policy.response,settlingBandFraction:.5}};p.request.maxSettlingSeconds=1;
  const events=[];createGflAnalysisDispatcher({now:()=>0,postMessage:e=>events.push(e)})({type:'run',kind,requestId:1,requestKey:'bad-band-'+kind,payload:p});
  const terminal=events.at(-1);assert.equal(terminal.type,'result');assert.equal(terminal.result.solveStatus,'invalidInput');assert.equal(terminal.result.application.eligible,false);assert.deepEqual(terminal.cacheEntries,[]);assert.equal(events.some(e=>e.type==='progress'),false);
 }
});
test('completed cache certificates with a coherently changed settling definition are rejected at import',()=>{
 const cache=new Map();evaluateGflMainline(payload(),{now:()=>0,cache});const valid=[...cache.values()][0];assert.equal(isGflEvaluationCacheEntry(valid),true);
 // Re-sign every nested canonical fingerprint as an old-version producer could.
 // This deliberately tests admission, rather than an incidental checksum mismatch.
 const change=value=>{
  if(Array.isArray(value))return value.map(change);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,key==='settlingBandFraction'?.5:change(child)]));
  if(typeof value==='string'&&value.startsWith('gfl-analysis-contract/v1/')){const colon=value.indexOf(':');return gflFingerprint(value.slice('gfl-analysis-contract/v1/'.length,colon),change(JSON.parse(value.slice(colon+1))));}
  return value;
 };
 const invalid=change(valid);assert.equal(isGflEvaluationCacheEntry(invalid),false);
 const events=[];createGflAnalysisDispatcher({now:()=>0,postMessage:e=>events.push(e)})({type:'run',kind:'evaluate',requestId:1,requestKey:'reject-old-band',payload:{...payload(),policy:invalid.projection.policy},cacheEntries:[invalid]});
 assert.equal(events.at(-1).result.solveStatus,'invalidInput');assert.deepEqual(events.at(-1).cacheEntries,[]);
});
