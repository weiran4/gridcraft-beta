import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {demo} from '../examples/demo.js';
import {gfmContext,gfmSettings,gfmDefaults} from '../project/gfm-settings.js';
import {autoTuneGfm,gfmResponse} from '../analysis/gfm-pi.js';
import {analyzeGfmMode} from '../analysis/gfm-dynamics.js';
import {transferAt} from '../analysis/gfl-linear-model.js';
const input=(considerScr=true)=>({...gfmContext(demo('gfm480'),'GFM1'),...gfmDefaults(),considerScr});
const modes=gfmSettings(demo('gfm480'),'GFM1').modes;
const load=()=>import('../analysis/gfm-tuning-advisor.js');

test('dq link control explains parameter synchronization without changing its id',()=>{
 const source=readFileSync(new URL('../ui/gfl-manual-workspace.js',import.meta.url),'utf8');
 assert.match(source,/同步调整 d\/q 电流环参数/);
 assert.match(source,/id="manualLinkedDq"/);
});
test('GFM facts and existing gain analysis are independent of absent or invalid crossover requests',async()=>{
 const {gfmFacts,evaluateGfm}=await load();const p=input(),g=autoTuneGfm(p).gains;
 const before=JSON.stringify(p);const bad={...p,fi:-1,fv:null,pm:NaN};
 assert.doesNotThrow(()=>gfmFacts(bad));
 const result=evaluateGfm(bad,g,'droop',modes.droop,{includeStep:false});
 assert.equal(result.loops.d.crossings.length,1);assert.equal(JSON.stringify(p),before);
 assert.throws(()=>gfmFacts({...p,C:null}));assert.throws(()=>gfmFacts({...p,fs:0}));
});
test('GFM rational scalar closed responses match existing electrical/RC/feedforward equations',async()=>{
 const {gfmLinearModels}=await load();
 for(const considerScr of [false,true])for(const F of [0,.75,1]){
  const p={...input(considerScr),feedforwardCurrent:F};const g=autoTuneGfm(p).gains,model=gfmLinearModels(p,g);
  for(const f of [.001,.1,1,10,70,500,2000])for(const k of ['d','q','P','Q']){
   const a=transferAt(model[k],f),b=gfmResponse(p,g,f).closed[k];
   assert.ok(Math.hypot(a.re-b.re,a.im-b.im)<1e-8*Math.max(1,Math.hypot(b.re,b.im)),`${considerScr} F=${F} ${k} ${f}`);
  }
 }
});
test('zero integral and zero R are evaluated without inventing an integrator state',async()=>{
 const {evaluateGfm}=await load();const p={...input(false),R:0,filterCurrentMs:0,filterVoltageMs:0};
 const g=Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:.1,ki:0}]));
 const e=evaluateGfm(p,g,'droop',modes.droop);assert.equal(e.loops.d.stability.status,'stable');assert.equal(e.loops.d.step.status,'ok');
 assert.equal(e.coupled.status,'notIncluded');
});
let cached;
async function auto(){if(!cached){const {searchGfmCandidates}=await load();cached=searchGfmCandidates(input(),{mode:'automatic'},null,'droop',modes.droop,{maxMilliseconds:30000});}return cached;}
test('GFM candidate search uses its own plant, multiple PI shapes and selected coupled mode',async()=>{
 const p=input(),before=JSON.stringify(p),r=await auto();assert.equal(r.searchStatus,'feasibleFound',JSON.stringify(r.diagnostics));
 assert.ok(r.candidates.some(c=>c.requirementsMet));assert.ok(r.searchRange.zeroRatios.length>2);
 for(const c of r.candidates.filter(c=>c.requirementsMet)){
  assert.equal(c.evaluation.scalarStability.status,'stable');assert.equal(c.evaluation.coupled.stable,true);
  const actual=analyzeGfmMode(p,c.gains,'droop',modes.droop);assert.ok(actual.stable);
  for(const k of ['d','q','P','Q'])assert.ok(c.evaluation.loops[k].minMargin>=59.99);
  assert.ok(c.evaluation.loops.P.crossings[0].frequency<=c.evaluation.loops.d.crossings[0].frequency/5*1.001);
 }
 assert.equal(JSON.stringify(p),before);
});
test('unmet strict 500/50 goals stay unmet; no silent downgrade or mutation of current PI',async()=>{
 const {searchGfmCandidates}=await load(),p=input(),g=autoTuneGfm(p).gains,before=JSON.stringify(g);
 const r=searchGfmCandidates(p,{mode:'target',fi:500,fp:50},g,'droop',modes.droop,{maxMilliseconds:30000});
 assert.equal(r.searchStatus,'targetNotMet');assert.equal(r.targetStatus,'notSatisfied');assert.ok(r.candidates.length);
 assert.ok(r.candidates.every(c=>!c.requirementsMet));assert.equal(JSON.stringify(g),before);
});
test('explicit achievable targets are distinguished from allowed reductions',async()=>{
 const {searchGfmCandidates}=await load(),c=(await auto()).candidates.find(c=>c.requirementsMet);
 const r=searchGfmCandidates(input(),{mode:'target',fi:c.evaluation.loops.d.crossings[0].frequency,fp:c.evaluation.loops.P.crossings[0].frequency},c.gains,'droop',modes.droop,{maxMilliseconds:30000});
 assert.equal(r.targetStatus,'satisfied');assert.ok(r.candidates.some(c=>c.targetStatus==='satisfied'));
});
test('invalid targets, time budget, cancellation and pure-delay scope are distinct',async()=>{
 const {searchGfmCandidates,evaluateGfm}=await load(),p=input(),g=autoTuneGfm(p).gains;
 assert.equal(searchGfmCandidates(p,{mode:'target',fi:-1,fp:50},null,'droop',modes.droop).searchStatus,'invalidRequest');
 assert.equal(searchGfmCandidates(p,{},null,'droop',modes.droop,{maxEvaluations:1}).searchStatus,'budgetExceeded');
 assert.equal(searchGfmCandidates(p,{},null,'droop',modes.droop,{isCancelled:()=>true}).searchStatus,'cancelled');
 const d=evaluateGfm({...p,delaySamples:1.5},g,'droop',modes.droop);assert.equal(d.modelCoverage,'frequencyAndPadeOnly');
 assert.equal(d.loops.P.step.status,'unsupportedDelay');assert.equal(d.verified,false);assert.equal(d.coupled.delayModel,'first-order-pade');
});
test('VSG and Synchronverter use their own coupled checks; no claimed all-mode guarantee',async()=>{
 const {searchGfmCandidates}=await load();for(const mode of ['vsg','sync']){
  const r=searchGfmCandidates(input(),{},null,mode,modes[mode],{maxMilliseconds:30000});
  assert.equal(r.searchStatus,'feasibleFound',mode+JSON.stringify(r.diagnostics));
  const c=r.candidates.find(c=>c.requirementsMet);assert.ok(c);assert.ok(analyzeGfmMode(input(),c.gains,mode,modes[mode]).stable);
 }
});

test('default demo search must not discard all useful-speed modes in favor of nearly disabled integration',async()=>{
 const r=await auto();assert.ok(r.candidates.some(c=>c.requirementsMet&&c.speed<2),JSON.stringify(r.candidates.map(c=>({speed:c.speed,margin:c.minMargin}))));
});
