import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readGflModelInput} from '../analysis/gfl-model-input.js';
import {searchGflCandidates} from '../analysis/gfl-tuning-search.js';
import {analyzeGflDq} from '../analysis/gfl-dq-analysis.js';
const project=JSON.parse(readFileSync(new URL('./fixtures/PV_Grid_Demo.json',import.meta.url))),stored=project.extensions.gflPi.PV1;
const base=readGflModelInput(project,'PV1',stored).modelInput;
const input={...base,dMode:'P',qMode:'Q',activePowerW:2e5,gridXOhm:base.gridXOhm*.1,filterCurrentMs:.1,filterVoltageMs:.1};
test('enabled dq search screens the assembled pool before final three-candidate selection',()=>{
 const r=searchGflCandidates(input,{},stored.gains,{dqSettings:{enabled:true},maxMilliseconds:60000});
 assert.equal(r.dqScreening.enabled,true);assert.ok(r.dqScreening.evaluated>3);assert.ok(r.candidates.length>0);assert.ok(r.candidates.length<=3);
 assert.equal(r.dqScreening.evaluated,r.dqScreening.accepted+r.dqScreening.rejected+r.dqScreening.unverified);
 for(const c of r.candidates){assert.ok(c.dqVerification.alpha<0);assert.equal(analyzeGflDq(input,c.gains,{}, {includeSeries:false}).applicationEligible,true);}
});
test('dq unsupported topology and nonzero delay stop early without certifying candidates',()=>{
 for(const change of [{considerScr:false},{delaySamples:1}]){
 const r=searchGflCandidates({...input,...change},{},stored.gains,{dqSettings:{enabled:true}});
 assert.equal(r.candidates.length,0);assert.equal(r.budget.evaluations,0);assert.ok(r.diagnostics.some(d=>d.code.startsWith('dq-')));
 }
});
test('coupled solve budget is enforced and partial candidates never look complete',()=>{
 const r=searchGflCandidates(input,{},stored.gains,{dqSettings:{enabled:true},maxDqEvaluations:1,maxMilliseconds:60000});
 assert.equal(r.searchStatus,'budgetExceeded');assert.equal(r.dqScreening.evaluated,1);assert.ok(r.candidates.every(c=>c.incompleteSearch));
});
test('disabled dq preserves scalar candidates even if inactive PLL configuration is unsupported',()=>{
 const scalar=searchGflCandidates(input,{},stored.gains,{maxMilliseconds:60000,maxInner:1});
 const disabled=searchGflCandidates(input,{},stored.gains,{maxMilliseconds:60000,maxInner:1,dqSettings:{enabled:false,frequencyHz:0,dcModel:'unsupported'}});
 assert.deepEqual(disabled.candidates,scalar.candidates);assert.equal(disabled.searchStatus,scalar.searchStatus);assert.equal(disabled.dqScreening.evaluated,0);
});
test('an exhausted coupled budget reports unassessed work rather than infeasibility or unstable rejection',()=>{
 const r=searchGflCandidates(input,{},stored.gains,{dqSettings:{enabled:true},maxDqEvaluations:0,maxMilliseconds:60000});
 assert.equal(r.searchStatus,'budgetExceeded');assert.equal(r.dqScreening.evaluated,0);assert.equal(r.dqScreening.rejected,0);assert.equal(r.dqScreening.unverified,0);
 assert.ok(r.diagnostics.some(d=>d.code==='dq-budget'));assert.equal(r.candidates.length,0);
});
test('all assessed candidates failing coupled stability is distinct from an exhausted search budget',()=>{
 const r=searchGflCandidates(base,{},stored.gains,{dqSettings:{enabled:true},maxMilliseconds:60000});
 assert.equal(r.searchStatus,'noCandidateFound');assert.ok(r.dqScreening.evaluated>3);assert.equal(r.dqScreening.accepted,0);assert.equal(r.dqScreening.rejected,r.dqScreening.evaluated);assert.equal(r.dqScreening.unverified,0);assert.equal(r.candidates.length,0);
 assert.equal(r.diagnostics.some(d=>d.code==='dq-budget'),false);assert.equal(r.searchRange.globallyOptimal,false);
});
