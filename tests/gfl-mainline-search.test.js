import test from 'node:test';
import assert from 'node:assert/strict';
import {readGflModelInput} from '../analysis/gfl-model-input.js';
import {searchGflCandidates} from '../analysis/gfl-tuning-search.js';
import {mainlineFixture} from './fixtures/gfl-mainline.js';
import {createGflExperimentDefinitions} from '../analysis/gfl-experiments.js';
import {gflFingerprint,gflNumericalPolicy} from '../analysis/gfl-analysis-contract.js';
import {gflLinearModels} from '../analysis/gfl-linear-model.js';
import {linearStepMetrics} from '../analysis/gfl-step-metrics.js';
import {evaluateGflMainline} from '../analysis/gfl-mainline-evaluation.js';
const f=mainlineFixture(),experiments=createGflExperimentDefinitions().filter(d=>d.id==='outer-reference-closed');
const options={snapshot:f.snapshot,experiments,policy:gflNumericalPolicy(),maxInner:1,runtime:{now:()=>0},dqSettings:{enabled:true,frequencyHz:0,dcModel:'unsupported'}};
let completed;
const result=()=>completed??=searchGflCandidates(f.input,{focus:'tracking'},f.gains,options);

test('explicit selected model ranks real coupled responses and preserves immutable facts',()=>{
 const before=JSON.stringify({f,options}),r=result();assert.ok(r.candidates.length>0);assert.ok(r.candidates.length<=3);
 assert.equal(r.rankingPolicyId,'gfl-mainline-ranking-v1');assert.ok(r.mainlineScreening.evaluated>0);assert.equal(r.dqScreening.evaluated,0);
 for(const c of r.candidates){assert.equal(c.mainlineEvaluation.modelId,'gfl-dq-reference-v1');assert.equal(c.mainlineEvaluation.solveStatus,'completed');assert.equal(c.verified,true);assert.equal(c.id,gflFingerprint('candidate',{gains:c.gains}));assert.equal(c.evaluation.scope,'scalar-seed');}
 assert.equal(JSON.stringify({f,options}),before);assert.ok(r.candidates.every((c,i,a)=>i===0||a[i-1].mainlineEvaluation.targetResult.group!==c.mainlineEvaluation.targetResult.group||a[i-1].speed<=c.speed));
 assert.equal(r.completionScope.complete,true);assert.equal(r.completionScope.globallyOptimal,false);assert.ok(r.diagnostics.find(d=>d.code==='scope').message.includes('PLL'));
});
test('mainline budgets cap scalar coupled and elapsed work and zero coupled never constructs a model',()=>{
 let constructed=0;const r=searchGflCandidates(f.input,{},null,{...options,maxEvaluations:99999,maxDqEvaluations:0,maxMilliseconds:99999,runtime:{now:()=>0,deadlineMs:99999,onProgress:event=>{if(event.phase==='model-construction')constructed++;}}});
 assert.equal(r.searchStatus,'budgetExceeded');assert.equal(r.budget.maxEvaluations,18000);assert.equal(r.budget.maxCoupledEvaluations,0);assert.equal(r.budget.maxMilliseconds,25000);assert.equal(constructed,0);assert.equal(r.mainlineScreening.evaluated,0);assert.equal(r.candidates.length,0);
 const defaults=searchGflCandidates(f.input,{},null,{...options,runtime:{now:()=>0,isCancelled:()=>true}});assert.equal(defaults.budget.maxCoupledEvaluations,64);
});
test('response propagation consumes the original shared deadline and preserves interrupted evidence',()=>{
 let now=0,response=false;const r=searchGflCandidates(f.input,{},null,{...options,runtime:{now:()=>now,deadlineMs:50,onProgress:event=>{if(event.phase==='response'){response=true;now=50;}}}});
 assert.equal(response,true);assert.equal(r.searchStatus,'budgetExceeded');assert.equal(r.budget.elapsedMilliseconds,50);assert.equal(r.mainlineScreening.evaluated,1);assert.equal(r.mainlineScreening.unverified,1);assert.ok(r.diagnosticCandidates.some(c=>c.mainlineEvaluation.solveStatus==='budgetExceeded'));
 assert.equal(r.candidates.some(c=>c.mainlineEvaluation.application.eligible),false);assert.equal(r.completionScope.complete,false);
});
test('coupled budget interruption downgrades complete partial candidates to diagnostics only',()=>{
 const partial=searchGflCandidates(f.input,{},null,{...options,maxDqEvaluations:1,runtime:{now:()=>0}});
 assert.equal(partial.searchStatus,'budgetExceeded');assert.equal(partial.mainlineScreening.evaluated,1);assert.ok(partial.candidates.length>0);assert.equal(partial.candidates.every(c=>c.incompleteSearch&&c.diagnosticOnly),true);assert.equal(partial.candidates.some(c=>c.mainlineEvaluation.application.eligible),false);assert.equal(partial.targetStatus,'notSatisfied');assert.equal(partial.ranking.fronts.satisfied.length,0);assert.equal(partial.ranking.diagnostics.qualified,0);assert.ok(partial.candidates.every(c=>c.targetStatus==='notSatisfied'));
});
test('mainline candidates match the single shared evaluator for the same data',()=>{
 const r=result(),c=r.candidates[0];assert.ok(c.mainlineEvaluation,'mainline evaluator evidence is required');const fresh=evaluateGflMainline({snapshot:f.snapshot,gains:c.gains,experiments,policy:options.policy,request:r.request});
 assert.deepEqual(c.mainlineEvaluation,fresh);assert.equal(c.requirementsMet,fresh.application.eligible);assert.equal(c.speed,fresh.performance.T);assert.equal(c.overshoot,fresh.performance.O);
});

test('only the injected monotonic clock owns a mainline deadline regardless of its epoch',()=>{
 const r=searchGflCandidates(f.input,{},null,{...options,maxDqEvaluations:0,runtime:{now:()=>-1e9}});
 assert.equal(r.mainlineScreening.evaluated,0);assert.ok(r.budget.evaluations>100);assert.equal(r.budget.elapsedMilliseconds,0);
});
test('mainline scalar count never exceeds its limit and user cancellation shares the runtime',()=>{
 const r=searchGflCandidates(f.input,{},null,{...options,maxEvaluations:3,runtime:{now:()=>0}});
 assert.equal(r.searchStatus,'budgetExceeded');assert.equal(r.budget.evaluations,3);assert.equal(r.mainlineScreening.evaluated,0);
 let cancelled=false;const c=searchGflCandidates(f.input,{},null,{...options,runtime:{now:()=>0,isCancelled:()=>cancelled,onProgress:event=>{if(event.phase==='response')cancelled=true;}}});
 assert.equal(c.searchStatus,'cancelled');assert.equal(c.diagnosticCandidates[0].mainlineEvaluation.solveStatus,'cancelled');assert.equal(c.candidates.some(x=>x.mainlineEvaluation.application.eligible),false);
});
test('explicit unsupported model stays selected and exposes the actual reason',()=>{
 const r=searchGflCandidates(f.input,{},null,{...options,snapshot:{...f.snapshot,modelVersion:9},runtime:{now:()=>0}});
 assert.equal(r.searchStatus,'unsupported');assert.equal(r.candidates.length,0);assert.equal(r.dqScreening.evaluated,0);assert.ok(r.diagnostics.some(d=>d.code==='unsupported'&&d.message.includes('版本')));
});
test('mainline diagnostics state coupled coverage and bounded-search conclusions',()=>{
 const r=result(),message=r.diagnostics.find(d=>d.code==='scope').message;
 assert.ok(message.includes('PLL'));assert.equal(message.includes('不含 PLL'),false);assert.ok(message.includes('标量种子'));
 const unmet=searchGflCandidates(f.input,{maxSettlingSeconds:1e-9},null,{...options,runtime:{now:()=>0}});
 assert.equal(unmet.searchStatus,'targetNotMet');assert.ok(unmet.diagnostics.some(d=>d.code==='target-not-met'&&d.message.includes('本次有界搜索未找到')));
});
test('missing and explicit legacy model keep old dq behavior and ignore scoped-only targets',()=>{
 const base={maxInner:1,maxMilliseconds:60000},a=searchGflCandidates(f.input,{},null,base),b=searchGflCandidates(f.input,{currentTargets:3,maxSteadyStateErrorPercent:-1,crossAxisLimits:[]},null,{...base,snapshot:{input:f.input,dqAnalysis:{enabled:true}}}),c=searchGflCandidates(f.input,{},null,{...base,snapshot:{modelId:'legacy-scalar',input:f.input}});
 assert.deepEqual(searchGflCandidates(f.input,null,null,base).candidates,a.candidates);
 assert.deepEqual(b.candidates,a.candidates);assert.deepEqual(c.candidates,a.candidates);assert.equal(b.rankingPolicyId,undefined);assert.equal(b.dqScreening.enabled,false);
});

test('unresolved real scalar time metrics cannot reject an otherwise eligible assembled baseline seed',()=>{
 const gains={d:{kp:0.31478793667464755,ki:0.010720205330505965},q:{kp:23.782759205339634,ki:0.0005674732819565158},P:{kp:0.007649584737667352,ki:0.0007415830602490231},Q:{kp:0.017910263921641034,ki:0.043162627624626325}},request={separationRatio:1,minMargin:1,preferredMargin:60};
 assert.equal(linearStepMetrics(gflLinearModels(f.input,gains).Q,{includePoints:false}).status,'numericalFailure');
 const e=evaluateGflMainline({snapshot:f.snapshot,gains,experiments,policy:options.policy,request});assert.equal(e.application.eligible,true);
 const without=searchGflCandidates(f.input,request,null,{...options,runtime:{now:()=>0}}),withSeed=searchGflCandidates(f.input,request,gains,{...options,runtime:{now:()=>0}});
 assert.equal(withSeed.mainlineScreening.accepted,without.mainlineScreening.accepted+1);assert.equal(withSeed.mainlineScreening.evaluated,without.mainlineScreening.evaluated+1);assert.equal(withSeed.rejections['step-unresolved'],undefined);
});
test('malformed budget overrides cannot disable the shared hard limits',()=>{
 const r=searchGflCandidates(f.input,{},null,{...options,maxEvaluations:NaN,maxDqEvaluations:NaN,maxMilliseconds:NaN,runtime:{now:()=>0,isCancelled:()=>true}});
 assert.equal(r.budget.maxEvaluations,18000);assert.equal(r.budget.maxCoupledEvaluations,64);assert.equal(r.budget.maxMilliseconds,25000);
});


test('known unstable full-system poles count as rejected rather than unassessed responses',()=>{
 const input=readGflModelInput(f.project,f.ibrId,f.project.extensions.gflPi[f.ibrId]).modelInput,weak=mainlineFixture({input}),r=searchGflCandidates(weak.input,{},null,{...options,snapshot:weak.snapshot,runtime:{now:()=>0}});
 assert.equal(r.searchStatus,'noCandidateFound');assert.equal(r.mainlineScreening.accepted,0);assert.equal(r.mainlineScreening.unverified,0);assert.equal(r.mainlineScreening.rejected,r.mainlineScreening.evaluated);assert.ok(r.mainlineScreening.rejected>0);assert.equal(r.candidates.length,0);assert.ok(r.diagnosticCandidates.every(c=>c.mainlineEvaluation.stability.status==='unstable'));assert.equal(r.ranking.diagnostics.rejected,r.mainlineScreening.rejected);assert.equal(r.ranking.diagnostics.unverified,0);
});

test('R1 a real candidate-local numerical failure retains successful bounded-search candidates',()=>{
 const gains=Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:1e200,ki:1e200}])),control=searchGflCandidates(f.input,{},null,options),r=searchGflCandidates(f.input,{},gains,options),failure=r.diagnosticCandidates.find(c=>c.isBaseline);
 assert.ok(failure);assert.equal(failure.mainlineEvaluation.solveStatus,'numericalFailure');assert.ok(failure.mainlineEvaluation.diagnostics.some(d=>d.message.includes('电流 PI 积分导数乘积')));
 assert.equal(r.searchStatus,'feasibleFound');assert.equal(r.completionScope.complete,true);assert.equal(r.mainlineScreening.evaluated,control.mainlineScreening.evaluated+1);assert.equal(r.mainlineScreening.accepted,control.mainlineScreening.accepted);assert.equal(r.mainlineScreening.unverified,1);
 assert.equal(r.ranking.diagnostics.qualified,control.ranking.diagnostics.qualified);assert.equal(r.ranking.diagnostics.unverified,1);assert.deepEqual(r.candidates,control.candidates);assert.ok(r.candidates.every(c=>c.mainlineEvaluation.application.eligible&&!c.incompleteSearch));assert.equal(failure.mainlineEvaluation.application.eligible,false);assert.equal(failure.incompleteSearch,undefined);
});
