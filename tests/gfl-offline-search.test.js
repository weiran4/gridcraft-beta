import test from 'node:test';import assert from 'node:assert/strict';
import {pvGridExample} from '../examples/pv-grid-demo.js';
import {resolveDesignSnapshot} from '../project/design-snapshot.js';
import {searchOfflineDesign} from '../analysis/gfl-offline-search.js';
const snapshot=resolveDesignSnapshot(pvGridExample,{}).snapshot;
test('symmetric bounds must intersect and all evaluations count against budget',()=>{
 const initialGains=pvGridExample.extensions.gflPi.PV1.gains;
 assert.throws(()=>searchOfflineDesign(snapshot,{initialGains,symmetricDq:true,bounds:{'d.kp':[1,2],'q.kp':[10,20]}}),/交集/);
 const r=searchOfflineDesign(snapshot,{initialGains,maxEvaluations:1});
 assert.equal(r.budget.evaluations,1);assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].screeningOnly,true);
 assert.notEqual(r.candidates[0].assessment.eligibility,'recommended');
});
test('deadline retains completed pole screening with its frequency-pending status',()=>{
 let ticks=0;const initialGains={d:{kp:1.25,ki:50},q:{kp:1.25,ki:50},P:{kp:5,ki:100},Q:{kp:2,ki:100}};
 const r=searchOfflineDesign(snapshot,{initialGains},{now:()=>ticks++<6?0:10001});
 assert.equal(r.status,'budgetExceeded');assert.ok(r.candidates.length);assert.equal(r.candidates[0].screeningOnly,true);assert.notEqual(r.candidates[0].assessment.eligibility,'recommended');
});
test('complete model search finds stable area without copying a reference answer',()=>{
 const r=searchOfflineDesign(snapshot,{initialGains:pvGridExample.extensions.gflPi.PV1.gains,maxEvaluations:900,maxMilliseconds:25000});
 assert.ok(r.candidates.some(c=>c.assessment.stability.status==='stable'),JSON.stringify(r));assert.ok(r.budget.evaluations<=900);
});
test('locks and zero Ki survive search; cancellation yields no recommendation',()=>{
 const initialGains=structuredClone(pvGridExample.extensions.gflPi.PV1.gains);initialGains.d.ki=0;
 const r=searchOfflineDesign(snapshot,{initialGains,locks:['d.ki'],maxEvaluations:10,maxMilliseconds:25000});
 for(const c of r.candidates)assert.equal(c.gains.d.ki,0);
 const c=searchOfflineDesign(snapshot,{initialGains},{isCancelled:()=>true});assert.equal(c.status,'cancelled');assert.equal(c.candidates.length,0);
});
