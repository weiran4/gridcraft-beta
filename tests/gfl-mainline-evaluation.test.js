import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mainlineFixture} from './fixtures/gfl-mainline.js';
import {gflNumericalPolicy,gflFingerprint} from '../analysis/gfl-analysis-contract.js';
import {createGflExperimentDefinitions,findPortIndex} from '../analysis/gfl-experiments.js';
import {validateTuningRequest,readGflModelInput} from '../analysis/gfl-model-input.js';
import {evaluateManualCandidate} from '../analysis/gfl-manual-evaluation.js';
import {evaluateGfl} from '../analysis/gfl-linear-evaluation.js';
import {frequencyMatrix} from '../analysis/port-response.js';
const load=()=>import('../analysis/gfl-mainline-evaluation.js');
const outer='outer-reference-closed',current='current-reference-frozen-outer';
const request={separationRatio:4};
const payload=(f=mainlineFixture(),patch={})=>({snapshot:f.snapshot,gains:f.gains,experiments:createGflExperimentDefinitions(),request,policy:gflNumericalPolicy(),...patch});
const tracking=e=>e.responses.map(r=>r.channels.find(c=>c.role==='tracking'));
const seed=(frequency=10)=>({loops:Object.fromEntries(['d','q','P','Q'].map(k=>[k,{crossings:[{frequency:k==='d'||k==='q'?frequency:frequency/5}],minMargin:80,scanStatus:'ok',nearTangency:false,step:{status:'unsupportedDelay'}}]))});
function targetEvidence(){
 const channel=(outputId,role,metrics)=>({outputId,role,targetDelta:role==='tracking'?.01:0,steadyStateDelta:role==='tracking'?.01:.002,metrics});
 const response=(id,other)=>({status:'completed',channels:[channel(id,'tracking',{overshootPercent:3,settlingTimeSeconds:1,steadyStateErrorPercent:0}),channel(other,'cross',{peakAbsPu:.003,residualOffsetPu:.002})]});
 return {modelId:'gfl-dq-reference-v1',experiments:{[outer]:{responses:[response('pcc.power.p','pcc.power.q'),response('pcc.power.q','pcc.power.p')]},[current]:{responses:[response('current.bridge.d','current.bridge.q'),response('current.bridge.q','current.bridge.d')]}}};
}

test('current manual named and automatic evaluate identically without mutating facts or trusting certificates',async()=>{
 const {evaluateGflMainline}=await load(),f=mainlineFixture(),p=payload(f),before=JSON.stringify(p);
 const automatic=evaluateGflMainline(p),options={snapshot:f.snapshot,experiments:p.experiments,policy:p.policy};
 const currentCandidate=evaluateManualCandidate(f.input,f.gains,request,{},options);
 const named=evaluateManualCandidate(f.input,f.gains,request,{id:'stored',name:'Named',verified:true,requirementsMet:true},options);
 assert.equal(automatic.solveStatus,'completed');assert.equal(automatic.application.eligible,true);
 assert.equal(currentCandidate.evaluation.evaluationFingerprint,named.evaluation.evaluationFingerprint);
 assert.equal(currentCandidate.evaluation.evaluationFingerprint,automatic.evaluationFingerprint);
 assert.deepEqual(currentCandidate.evaluation.experiments,automatic.experiments);
 assert.deepEqual(named.evaluation,automatic);assert.equal(named.id,'stored');assert.equal(named.source,'manual');
 assert.equal(JSON.stringify(p),before);assert.deepEqual(structuredClone(automatic),automatic);
});
test('generic targets own only outer physical channels and scalar time metrics cannot reject coupled performance',async()=>{
 const {checkGflMainlineTargets}=await load(),e=targetEvidence(),s=seed();
 for(const r of e.experiments[current].responses)r.channels[0].metrics={overshootPercent:200,settlingTimeSeconds:100,steadyStateErrorPercent:50};
 for(const l of Object.values(s.loops))l.step={status:'ok',overshootPercent:999,settlingTimeSeconds:999};
 const t=checkGflMainlineTargets(e,{maxOvershootPercent:4,maxSettlingSeconds:2},s);
 assert.equal(t.group,'satisfied');assert.deepEqual(t.unmet,[]);
 e.experiments[outer].responses[0].channels[0].metrics.overshootPercent=5;
 assert.equal(checkGflMainlineTargets(e,{maxOvershootPercent:4},s).group,'unmet');
});
test('inner and cross gates require explicit non-null targets',async()=>{
 const {checkGflMainlineTargets}=await load(),e=targetEvidence();
 e.experiments[current].responses.forEach(r=>{r.status='windowExceeded';r.channels[0].metrics.settlingTimeSeconds=null;r.channels[1].metrics.residualOffsetPu=null;});
 assert.equal(checkGflMainlineTargets(e,{},seed()).group,'satisfied');
 assert.equal(checkGflMainlineTargets(e,{currentTargets:{maxSettlingSeconds:2}},seed()).group,'unmet');
 assert.equal(checkGflMainlineTargets(e,{crossAxisLimits:{currentResidualAbsPu:.01}},seed()).group,'unmet');
 assert.equal(checkGflMainlineTargets(e,{crossAxisLimits:{outerPeakAbsPu:.002}},seed()).group,'unmet');
 assert.equal(checkGflMainlineTargets(e,{currentTargets:{},crossAxisLimits:{}},seed()).group,'satisfied');
});
test('unspecified steady error and cross limits add no thresholds, but unavailable target settling never yields finite T',async()=>{
 const {checkGflMainlineTargets}=await load(),e=targetEvidence();
 e.experiments[outer].responses[0].channels[0].metrics.steadyStateErrorPercent=1;
 assert.equal(checkGflMainlineTargets(e,{},seed()).group,'satisfied');
 assert.equal(checkGflMainlineTargets(e,{maxSteadyStateErrorPercent:.5},seed()).group,'unmet');
 e.experiments[outer].responses[0].channels[0].metrics.settlingTimeSeconds=null;
 assert.equal(checkGflMainlineTargets(e,{},seed()).group,'unmet');
});
test('current request alone authorizes crossover reduction and preserves exact goal grouping',async()=>{
 const {checkGflMainlineTargets}=await load(),e=targetEvidence(),r={mode:'target',fi:20,fp:4,tolerance:.05,minimumFi:8,minimumFp:1};
 assert.equal(checkGflMainlineTargets(e,r,seed()).group,'unmet');
 assert.equal(checkGflMainlineTargets(e,{...r,allowReduction:true},seed()).group,'reduced');
 assert.equal(checkGflMainlineTargets(e,r,seed(20)).group,'satisfied');
 assert.equal(checkGflMainlineTargets(e,{...r,allowReduction:true,minimumFi:11},seed()).group,'unmet');
});
test('stability quality and targets are independent, never certified by inner diagnostic poles',async()=>{
 const {evaluateGflMainline}=await load();
 const unmet=evaluateGflMainline(payload(mainlineFixture(),{request:{...request,maxSettlingSeconds:.00001}}));
 assert.equal(unmet.solveStatus,'completed');assert.equal(unmet.stability.status,'stable');assert.equal(unmet.responseQuality,'completed');assert.equal(unmet.targetResult.group,'unmet');assert.equal(unmet.application.eligible,false);
 const unstable=evaluateGflMainline(payload(mainlineFixture({gains:{P:{ki:1e6}}})));
 assert.equal(unstable.solveStatus,'completed');assert.equal(unstable.stability.status,'unstable');assert.equal(unstable.stability.scope,outer);
 assert.equal(unstable.experiments[current].stability.status,'stable');assert.equal(unstable.application.eligible,false);
 const short=evaluateGflMainline(payload(mainlineFixture(),{experiments:createGflExperimentDefinitions().map(d=>({...d,windowSeconds:.001}))}));
 assert.equal(short.stability.status,'stable');assert.notEqual(short.responseQuality,'completed');assert.equal(short.application.eligible,false);assert.equal(short.performance.T,null);
});
test('full-system stable frozen DC drift is optional until an explicit inner or current cross gate is requested',async()=>{
 const {evaluateGflMainline}=await load(),f=mainlineFixture({input:{dMode:'Vdc'}}),p=payload(f),e=evaluateGflMainline(p);
 assert.equal(e.stability.status,'stable');assert.equal(e.responseQuality,'completed');assert.equal(e.application.eligible,true);
 const inner=e.experiments[current];assert.equal(inner.stability.status,'marginal');
 for(const r of inner.responses){assert.equal(r.status,'windowExceeded');assert.equal(r.quality.windowSource,'stable-outer');assert.ok(r.points.length>0);assert.ok(r.channels.every(c=>c.steadyStateDelta===null&&c.metrics.settlingTimeSeconds===null));}
 assert.ok(Math.abs(inner.responses[0].points.at(-1).y[0])>1);
 const required=evaluateGflMainline({...p,request:{...request,currentTargets:{maxSettlingSeconds:1}}});
 assert.equal(required.stability.status,'stable');assert.equal(required.solveStatus,'completed');assert.equal(required.responseQuality,'windowExceeded');assert.equal(required.targetResult.group,'unmet');assert.equal(required.performance.T,e.performance.T);assert.equal(required.performance.O,e.performance.O);assert.equal(required.performance.E,null);assert.equal(required.application.eligible,false);
 const cross=evaluateGflMainline({...p,request:{...request,crossAxisLimits:{currentResidualAbsPu:.01}}});
 assert.equal(cross.responseQuality,'windowExceeded');assert.equal(cross.targetResult.group,'unmet');assert.equal(cross.application.eligible,false);
});
test('delay cannot pass, including numerically converged Padé response',async()=>{
 const {evaluateGflMainline}=await load(),e=evaluateGflMainline(payload(mainlineFixture({input:{delaySamples:1.5}})));
 assert.equal(e.solveStatus,'completed');assert.equal(e.stability.status,'stable');assert.equal(e.responseQuality,'approximateDelay');assert.equal(e.application.eligible,false);
 assert.ok(e.application.reasons.some(x=>x.includes('Padé')));
});
test('unsupported topology, unknown model, invalid gains and operating-point or Jacobian failures remain typed',async()=>{
 const {evaluateGflMainline}=await load();
 const cases=[['unsupported',mainlineFixture({input:{considerScr:false}})],['invalidInput',mainlineFixture({gains:{d:{kp:-1}}})],['invalidInput',mainlineFixture({input:{dMode:'Vdc',dcCapacitanceF:null}})],['operatingPointFailure',mainlineFixture({input:{activePowerW:1e8}})],['numericalFailure',mainlineFixture({gains:{d:{kp:Number.MAX_VALUE}}})]];
 for(const [status,f]of cases){const e=evaluateGflMainline(payload(f));assert.equal(e.solveStatus,status);assert.equal(e.stability.status,'notEvaluated');assert.equal(e.application.eligible,false);assert.ok(e.diagnostics.length>0);}
 const f=mainlineFixture(),unknown=evaluateGflMainline(payload(f,{snapshot:{...f.snapshot,modelVersion:9}}));assert.equal(unknown.solveStatus,'unsupported');assert.equal(unknown.stability.status,'notEvaluated');
});
test('marginal full model keeps all physical poles and cannot be certified by diagnostics',async()=>{
 const {evaluateGflMainline}=await load(),f=mainlineFixture({input:{R:0,filterCurrentMs:0,filterVoltageMs:0,filterPqMs:0},gains:Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:0,ki:0}])),settings:{syncMode:'fixed-angle'}}),e=evaluateGflMainline(payload(f));
 assert.equal(e.solveStatus,'completed');assert.equal(e.stability.status,'marginal');assert.equal(e.stability.poles.length,e.model.A.length);assert.equal(e.application.eligible,false);
});
test('nonunit final gain uses the requested target and cannot acquire finite settling',async()=>{
 const {evaluateGflMainline}=await load(),f=mainlineFixture({gains:{P:{ki:0}}}),e=evaluateGflMainline(payload(f));
 assert.equal(e.stability.status,'stable');const m=tracking(e.experiments[outer])[0].metrics;
 assert.ok(m.steadyStateErrorPercent>2);assert.equal(m.settlingTimeSeconds,null);assert.equal(e.performance.T,null);assert.equal(e.application.eligible,false);
});
test('resolved experiment identities are shared by columns, preserved as provenance, and used by frequency/evaluation evidence',async()=>{
 const {evaluateGflMainline}=await load(),e=evaluateGflMainline(payload());
 for(const [id,entry]of Object.entries(e.experiments)){
  const [a,b]=entry.responses;assert.equal(a.experimentFingerprint,b.experimentFingerprint);assert.equal(entry.experiment.experimentFingerprint,a.experimentFingerprint);assert.equal(e.experimentFingerprints[id],a.experimentFingerprint);
  assert.equal(a.quality.sourceExperimentFingerprint,b.quality.sourceExperimentFingerprint);assert.notEqual(a.quality.sourceExperimentFingerprint,a.experimentFingerprint);
  const resolved=JSON.parse(a.experimentFingerprint.slice('gfl-analysis-contract/v1/experiment:'.length));assert.equal(resolved.sourceExperimentFingerprint,a.quality.sourceExperimentFingerprint);
  assert.equal(entry.experiment.sourceExperimentFingerprint,a.quality.sourceExperimentFingerprint);
 }
 assert.equal(e.frequencyResponse.experimentFingerprint,e.experimentFingerprints[outer]);
 assert.equal(e.evaluationFingerprint,gflFingerprint('evaluation',{modelFingerprint:e.modelFingerprint,experimentFingerprints:e.experimentFingerprints,request:e.targetResult.request,rankingPolicyId:e.performance.rankingPolicyId}));
});
test('closed reference frequency series selects IDs and obeys the separate control/PWM display rule',async()=>{
 const {evaluateGflMainline}=await load(),f=mainlineFixture({input:{switchingFrequencyHz:1000}}),e=evaluateGflMainline(payload(f)),s=e.frequencyResponse;
 assert.equal(s.scope,'closed-reference');assert.equal(s.inputIds.length,2);assert.equal(s.outputIds.length,2);assert.equal(s.series.length,2);assert.equal(s.series[0].length,2);
 for(let row=0;row<2;row++)for(let col=0;col<2;col++){
  const points=s.series[row][col];assert.equal(points.length,151);assert.equal(points[0].f,.01);assert.equal(points.at(-1).f,100);
  const p=points[73],z=frequencyMatrix(e.model,p.f)[findPortIndex(e.model.outputs,s.outputIds[row])][findPortIndex(e.model.inputs,s.inputIds[col])];
  assert.ok(Math.abs(p.db-20*Math.log10(Math.hypot(z.re,z.im)))<1e-10);assert.equal('margin' in p,false);
 }
 const policy=e.experiments[outer].experiment.policy;assert.equal(policy.frequencyDisplay.count,151);assert.equal(policy.frequencyDisplay.maximumHz,100);
});
test('deadline and cancellation cover construction, responses, scalar diagnostics and closed frequency work',async()=>{
 const {evaluateGflMainline}=await load();
 assert.equal(evaluateGflMainline(payload(),{isCancelled:()=>true}).solveStatus,'cancelled');
 assert.equal(evaluateGflMainline(payload(),{now:()=>10,deadlineMs:10}).solveStatus,'budgetExceeded');
 let frequency=false;const e=evaluateGflMainline(payload(),{now:()=>frequency?10:0,deadlineMs:10,onProgress:event=>{if(event.phase==='closed-reference-frequency')frequency=true;}});
 assert.equal(e.solveStatus,'budgetExceeded');assert.equal(e.responseQuality,'budgetExceeded');assert.equal(e.stability.status,'stable');assert.equal(e.application.eligible,false);assert.equal(e.frequencyResponse,null);
 let cancelled=false;const c=evaluateGflMainline(payload(),{isCancelled:()=>cancelled,onProgress:event=>{if(event.phase==='scalar-diagnostics')cancelled=true;}});
 assert.equal(c.solveStatus,'cancelled');assert.equal(c.application.eligible,false);
});
test('scoped target validation is explicit and normalizes null fields without hidden gates',()=>{
 const check=validateTuningRequest({currentTargets:{maxOvershootPercent:3},crossAxisLimits:{outerPeakAbsPu:.002},maxSteadyStateErrorPercent:1});
 assert.equal(check.valid,true);assert.deepEqual(check.request.currentTargets,{maxOvershootPercent:3,maxSettlingSeconds:null,maxSteadyStateErrorPercent:null});
 for(const change of [{maxSteadyStateErrorPercent:-1},{currentTargets:3},{currentTargets:{maxSettlingSeconds:0}},{currentTargets:{maxSteadyStateErrorPercent:NaN}},{crossAxisLimits:{outerResidualAbsPu:-1}},{crossAxisLimits:[]}])assert.equal(validateTuningRequest(change).valid,false);
});
test('missing modelId remains legacy and preserves original scalar adapter behavior including scoped field ignorance',async()=>{
 const {evaluateGflMainline}=await load(),project=JSON.parse(readFileSync(new URL('./fixtures/PV_Grid_Demo.json',import.meta.url))),stored=project.extensions.gflPi.PV1,input=readGflModelInput(project,'PV1',stored).modelInput;
 const old=evaluateManualCandidate(input,stored.gains,{minMargin:55,preferredMargin:60});assert.equal(old.requirementsMet,true);assert.equal(old.evaluation.loops.P.step.status,'ok');assert.ok(old.evaluation.series.d.length>100);
 const ignored=evaluateManualCandidate(input,stored.gains,{minMargin:55,preferredMargin:60,currentTargets:3,maxSteadyStateErrorPercent:-1});assert.deepEqual(ignored.evaluation,old.evaluation);assert.equal(ignored.requirementsMet,true);
 const e=evaluateGflMainline({snapshot:{input,dqAnalysis:{enabled:true}},gains:stored.gains,request:{minMargin:55,preferredMargin:60}});
 assert.equal(e.modelId,'legacy-scalar');assert.equal(e.model,null);assert.deepEqual(e.experiments,{});assert.equal(e.frequencyResponse,null);assert.deepEqual(e.legacyEvaluation,old.evaluation);
 assert.deepEqual(e.legacyEvaluation.loops.d.crossings,evaluateGfl(input,stored.gains,{count:2001}).loops.d.crossings);
});

test('legacy summary exports actual target-relative DC error without changing gain-normalized legacy targets',async()=>{
 const {evaluateGflMainline}=await load(),f=mainlineFixture({gains:{P:{ki:0}}}),e=evaluateGflMainline({snapshot:{input:f.input},gains:f.gains,request});
 assert.equal(e.legacyEvaluation.loops.P.step.status,'ok');const expected=Math.max(...Object.values(e.legacyEvaluation.loops).map(l=>Math.abs(l.step.dcGain-1)*100));
 assert.equal(e.performance.E,expected);assert.ok(e.performance.E>70);
});
test('legacy invalid gains keep typed solve status rather than fabricated instability',async()=>{
 const {evaluateGflMainline}=await load(),f=mainlineFixture();
 const invalid=evaluateGflMainline({snapshot:{input:f.input},gains:{...f.gains,d:{kp:-1,ki:1}},request});assert.equal(invalid.solveStatus,'invalidInput');assert.equal(invalid.stability.status,'notEvaluated');
});
test('legacy numerical step failure has a numerical solve status and keeps original scalar evidence',async()=>{
 const {evaluateGflMainline}=await load(),f=mainlineFixture({gains:{d:{kp:0,ki:0},q:{kp:0,ki:0}}}),failure=evaluateGflMainline({snapshot:{input:f.input},gains:f.gains,request});
 assert.equal(failure.legacyEvaluation.loops.P.step.status,'numericalFailure');assert.equal(failure.solveStatus,'numericalFailure');assert.notEqual(failure.stability.status,'unstable');assert.equal(failure.application.eligible,false);
});
test('missing required experiments, invalid policies and scoped targets cannot produce applicable evidence',async()=>{
 const {evaluateGflMainline}=await load(),f=mainlineFixture();
 for(const patch of [{experiments:[]},{experiments:[createGflExperimentDefinitions()[0]],request:{...request,currentTargets:{maxSettlingSeconds:1}}},{experiments:[createGflExperimentDefinitions()[0],createGflExperimentDefinitions()[0]]},{request:{maxSteadyStateErrorPercent:-1}}]){
  const e=evaluateGflMainline(payload(f,patch));assert.equal(e.solveStatus,'invalidInput');assert.equal(e.application.eligible,false);assert.equal(e.stability.status,'notEvaluated');
 }
 for(const policy of [{...gflNumericalPolicy(),model:{...gflNumericalPolicy().model,id:'future'}},{...gflNumericalPolicy(),response:{...gflNumericalPolicy().response,id:'future'}}])assert.equal(evaluateGflMainline(payload(f,{policy})).solveStatus,'unsupported');
});
test('negative steps and candidate decorations preserve exact numerical and fingerprint semantics',async()=>{
 const {evaluateGflMainline}=await load(),f=mainlineFixture(),p=payload(f),negative=evaluateGflMainline({...p,experiments:p.experiments.map(d=>({...d,amplitudePu:-d.amplitudePu}))}),positive=evaluateGflMainline(p);
 assert.equal(negative.application.eligible,true);assert.ok(Math.abs(negative.performance.T-positive.performance.T)<1e-12);assert.ok(Math.abs(negative.performance.E-positive.performance.E)<1e-9);
 assert.notEqual(negative.evaluationFingerprint,positive.evaluationFingerprint);
 const decorated=evaluateGflMainline({...p,gains:{...f.gains,id:'decorated',d:{...f.gains.d,name:'d'}},request:{...request,displayUnits:'SI',name:'does not change targets'}});
 assert.equal(decorated.evaluationFingerprint,positive.evaluationFingerprint);assert.deepEqual(decorated.experiments,positive.experiments);
});
test('required response point-budget failure does not alter verified physical stability',async()=>{
 const {evaluateGflMainline}=await load(),policy=gflNumericalPolicy(),e=evaluateGflMainline(payload(mainlineFixture(),{policy:{...policy,response:{...policy.response,maxPoints:20}}}));
 assert.equal(e.stability.status,'stable');assert.equal(e.solveStatus,'budgetExceeded');assert.equal(e.responseQuality,'budgetExceeded');assert.equal(e.application.eligible,false);
});

test('interrupted response evidence consistently retains its resolved identity without waiting for both columns',async()=>{
 const {evaluateGflMainline}=await load(),policy=gflNumericalPolicy(),e=evaluateGflMainline(payload(mainlineFixture(),{policy:{...policy,response:{...policy.response,maxPoints:20}}})),entry=e.experiments[outer],r=entry.responses[0];
 assert.equal(e.solveStatus,'budgetExceeded');assert.notEqual(r.experimentFingerprint,r.quality.sourceExperimentFingerprint);
 assert.equal(entry.experiment.experimentFingerprint,r.experimentFingerprint);assert.equal(e.experimentFingerprints[outer],r.experimentFingerprint);assert.equal(entry.experiment.sourceExperimentFingerprint,r.quality.sourceExperimentFingerprint);
});

test('an explicit unknown legacy version or model identity cannot silently dispatch to scalar compatibility',async()=>{
 const {evaluateGflMainline}=await load(),f=mainlineFixture();
 for(const snapshot of [{modelId:'legacy-scalar',modelVersion:9,input:f.input},{modelId:'legacy-scalar',modelVersion:1,equationVersion:'future',input:f.input},{modelId:null,input:f.input}]){
  const e=evaluateGflMainline({snapshot,gains:f.gains,request});assert.equal(e.solveStatus,'unsupported');assert.equal(e.application.eligible,false);assert.equal(e.legacyEvaluation,undefined);
 }
});


test('P2 explicit current targets preserve outer-only T/O while E includes required inner tracking',async()=>{
 const {evaluateGflMainline}=await load();
 for(const f of [mainlineFixture(),mainlineFixture({gains:{d:{ki:0}}})]){
  const p=payload(f),baseline=evaluateGflMainline(p),explicit=evaluateGflMainline({...p,request:{...request,currentTargets:{maxOvershootPercent:1e9,maxSettlingSeconds:1e9,maxSteadyStateErrorPercent:1e9}}});
  assert.equal(explicit.application.eligible,true);assert.deepEqual(explicit.experiments,baseline.experiments);
  const outerMetrics=tracking(explicit.experiments[outer]).map(c=>c.metrics),innerMetrics=tracking(explicit.experiments[current]).map(c=>c.metrics);
  const max=(metrics,key)=>Math.max(...metrics.map(m=>Math.abs(m[key])));
  assert.ok(max(innerMetrics,'overshootPercent')>max(outerMetrics,'overshootPercent'));
  assert.equal(explicit.performance.T,baseline.performance.T);assert.equal(explicit.performance.O,baseline.performance.O);
  assert.equal(explicit.performance.T,max(outerMetrics,'settlingTimeSeconds'));assert.equal(explicit.performance.O,max(outerMetrics,'overshootPercent'));
  assert.equal(explicit.performance.E,max([...outerMetrics,...innerMetrics],'steadyStateErrorPercent'));
  assert.ok(explicit.performance.E>baseline.performance.E);
  if(f.gains.d.ki===0)assert.ok(explicit.performance.E>.01);
 }
});

test('null or missing snapshots return typed invalidInput before any numerical work',async()=>{
 const {evaluateGflMainline}=await load();
 for(const p of [null,undefined,{}, {snapshot:null},{snapshot:[]},{snapshot:4}]){const progress=[],e=evaluateGflMainline(p,{now:()=>0,onProgress:v=>progress.push(v)});assert.equal(e.solveStatus,'invalidInput');assert.equal(e.stability.status,'notEvaluated');assert.equal(e.application.eligible,false);assert.deepEqual(progress,[]);}
 for(const snapshot of [{modelId:'unknown'},{modelId:'legacy-scalar',modelVersion:99}])assert.equal(evaluateGflMainline({snapshot},{now:()=>0}).solveStatus,'unsupported');
});

test('a 50% policy cannot authorize a one-second target or reach response cache lookup',async()=>{
 const {evaluateGflMainline}=await load(),p=payload(),valid=evaluateGflMainline({...p,request:{separationRatio:4,maxSettlingSeconds:1}},{now:()=>0});
 assert.equal(valid.solveStatus,'completed');assert.equal(valid.targetResult.group,'unmet');assert.ok(valid.performance.T>7.8&&valid.performance.T<7.9);assert.equal(valid.application.eligible,false);
 const policy={...p.policy,response:{...p.policy.response,settlingBandFraction:.5}},progress=[];let lookups=0;
 const invalid=evaluateGflMainline({...p,policy,request:{separationRatio:4,maxSettlingSeconds:1}},{now:()=>0,cache:{get(){lookups++;}},onProgress:e=>progress.push(e)});
 assert.equal(invalid.solveStatus,'invalidInput');assert.equal(invalid.application.eligible,false);assert.equal(invalid.performance.T,null);assert.equal(lookups,0);assert.deepEqual(progress,[]);assert.match(invalid.diagnostics[0].message,/2%/);
});
test('compatible refinement, window and point budgets retain distinct cache identity and conservative outcomes',async()=>{
 const {evaluateGflMainline}=await load(),p=payload(),baseline=evaluateGflMainline(p,{now:()=>0});
 const refined={...p.policy,response:{...p.policy.response,coarseBins:64,fineBins:128}},r=evaluateGflMainline({...p,policy:refined},{now:()=>0});
 assert.equal(r.solveStatus,'completed');assert.equal(r.application.eligible,true);assert.notEqual(r.experimentFingerprints[outer],baseline.experimentFingerprints[outer]);assert.equal(r.experiments[outer].responses[0].quality.policy.fineBins,128);
 for(const patch of [{maxWindowSeconds:.001},{maxPoints:20}]){
  const e=evaluateGflMainline({...p,policy:{...p.policy,response:{...p.policy.response,...patch}}},{now:()=>0});
  assert.equal(e.application.eligible,false);assert.equal(e.performance.T,null);assert.equal(e.responseQuality,patch.maxPoints?'budgetExceeded':'windowExceeded');
 }
});
