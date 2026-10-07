import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readGflModelInput} from '../analysis/gfl-model-input.js';
import {searchGflCandidates} from '../analysis/gfl-tuning-search.js';
const project=JSON.parse(readFileSync(new URL('./fixtures/PV_Grid_Demo.json',import.meta.url))),stored=project.extensions.gflPi.PV1,p=readGflModelInput(project,'PV1',stored).modelInput;
const deepFreeze=o=>{Object.freeze(o);Object.values(o).forEach(v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v))deepFreeze(v);});return o;};
test('automatic candidate search explores PI shape without changing any physical fact',()=>{
 const input=deepFreeze(structuredClone(p)),g=deepFreeze(structuredClone(stored.gains)),before=JSON.stringify(input),r=searchGflCandidates(input,{mode:'automatic'},g);
 assert.ok(r.candidates.length>0,JSON.stringify(r.diagnostics));assert.ok(r.probes.some(x=>x.frequency===50&&x.zeroRatio===.05&&x.screened));
 assert.equal(JSON.stringify(input),before);assert.deepEqual(g,stored.gains);assert.equal(r.searchStatus,'feasibleFound');
 assert.ok(r.candidates.some(c=>c.evaluation.loops.P.step.settlingTimeSeconds<.8));
 for(const c of r.candidates){assert.equal(c.evaluation.stability.status,'stable');assert.ok(c.minMargin>=59.99);assert.ok(c.evaluation.loops.P.crossings[0].frequency<=c.evaluation.loops.d.crossings[0].frequency/5*1.0001);}
});
test('unmet 500/50 target is not reported as successful tuning',()=>{
 const r=searchGflCandidates(p,{mode:'target',fi:500,fp:50,minimumFi:250,minimumFp:40,allowReduction:true},stored.gains);
 assert.equal(r.searchStatus,'targetNotMet');assert.notEqual(r.targetStatus,'satisfied');assert.ok(r.candidates.every(c=>!c.requirementsMet));
});
test('invalid target, missing model, tiny budget and cancellation have distinct states',()=>{
 assert.equal(searchGflCandidates(p,{mode:'target',fi:-2,fp:50},stored.gains).searchStatus,'invalidRequest');
 assert.equal(searchGflCandidates({...p,dcCapacitanceF:null},{},stored.gains).inputStatus,'invalid');
 assert.equal(searchGflCandidates(p,{},stored.gains,{maxEvaluations:1}).searchStatus,'budgetExceeded');
 assert.equal(searchGflCandidates(p,{},stored.gains,{isCancelled:()=>true}).searchStatus,'cancelled');
});
test('nonzero delay never produces a fully verified or time-qualified recommendation',()=>{
 const r=searchGflCandidates({...p,delaySamples:1.5},{maxSettlingSeconds:1},stored.gains,{maxInner:3});
 for(const c of r.candidates){assert.equal(c.evaluation.stability.status,'unverified');assert.equal(c.verified,false);assert.equal(c.requirementsMet,false);assert.notEqual(c.targetStatus,'satisfied');}
});
test('low target, zero R and bypassed sensors remain supported',()=>{
 const local={...p,considerScr:false,dMode:'P',qMode:'Q',R:0,filterCurrentMs:0,filterPqMs:0};
 const r=searchGflCandidates(local,{mode:'target',fi:.05,fp:.005,allowReduction:false,minMargin:45,preferredMargin:60},stored.gains,{maxInner:3});
 assert.ok(r.candidates.length>0);assert.ok(r.candidates.some(c=>c.requirementsMet));
});
