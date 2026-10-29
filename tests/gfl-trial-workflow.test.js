import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTuningRequest} from '../analysis/gfl-model-input.js';
import * as state from '../project/gfl-tuning-state.js';
import {pvGridExample} from '../examples/pv-grid-demo.js';
import {readGflApplicationContext} from '../project/gfl-analysis-evidence.js';
test('precision budget persists into application context without relaxing tolerances',()=>{const p=structuredClone(pvGridExample);const s=p.extensions.gflPi.PV1;s.considerScr=true;s.advisor={request:{responseMaxPoints:60000,enforceScalarMargin:false}};const c=readGflApplicationContext(p,'PV1');assert.equal(c.policy.response.maxPoints,60000);assert.equal(c.policy.response.settlingBandFraction,.02);assert.equal(c.request.enforceScalarMargin,false);assert.equal(validateTuningRequest({responseMaxPoints:1}).valid,false);});
test('trial PI is explicit, unassessed, PI-only and reversible; stale writes rejected',()=>{const p=structuredClone(pvGridExample),s=p.extensions.gflPi.PV1,g=structuredClone(s.gains);g.d.kp=2.2;const before=JSON.stringify(p);const n=state.saveTrialGains(p,'PV1',g,state.tuningSnapshot(p));assert.equal(JSON.stringify(p),before);assert.deepEqual(n.components,p.components);assert.equal(n.extensions.gflPi.PV1.advisor.applicationStatus,'trial');assert.equal(n.extensions.gflPi.PV1.advisor.targetStatus,'unassessed');assert.deepEqual(state.restoreAppliedGains(n,'PV1').extensions.gflPi.PV1.gains,s.gains);assert.throws(()=>state.saveTrialGains(p,'PV1',g,'stale'));});

test('optional scalar margin gate does not relax coupled response requirements',async()=>{
 const {checkGflMainlineTargets}=await import('../analysis/gfl-mainline-evaluation.js');
 const response=()=>({status:'completed',channels:[{role:'tracking',metrics:{overshootPercent:3,settlingTimeSeconds:.5,steadyStateErrorPercent:0}}]});
 const e={modelId:'gfl-dq-reference-v1',experiments:{'outer-reference-closed':{responses:[response(),response()]},'current-reference-frozen-outer':{responses:[]}}};
 const scalar={loops:Object.fromEntries(['d','q','P','Q'].map(k=>[k,{crossings:[{frequency:k==='d'||k==='q'?50:5}],minMargin:24,scanStatus:'ok',nearTangency:false}]))};
 assert.equal(checkGflMainlineTargets(e,{},scalar).group,'unmet');
 assert.equal(checkGflMainlineTargets(e,{enforceScalarMargin:false},scalar).group,'satisfied');
 e.experiments['outer-reference-closed'].responses[0].status='resolutionLimited';
 assert.equal(checkGflMainlineTargets(e,{enforceScalarMargin:false},scalar).group,'unmet');
});
