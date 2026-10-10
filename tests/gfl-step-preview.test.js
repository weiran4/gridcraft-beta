import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readGflModelInput} from '../analysis/gfl-model-input.js';
import {gflLinearModels} from '../analysis/gfl-linear-model.js';
import {linearStepMetrics} from '../analysis/gfl-step-metrics.js';
const project=JSON.parse(readFileSync(new URL('./fixtures/PV_Grid_Demo.json',import.meta.url)));
const stored=project.extensions.gflPi.PV1,input=readGflModelInput(project,'PV1',stored).modelInput,gains=stored.gains;
const load=()=>import('../analysis/gfl-step-preview.js');
test('PV1 plot samples preserve the peak used to calculate the existing overshoot',()=>{
 const r=linearStepMetrics(gflLinearModels(input,gains).P);
 assert.equal(r.status,'ok');
 assert.ok(Math.abs((Math.max(...r.points.map(p=>p.y))/r.dcGain-1)*100-r.overshootPercent)<1e-10);
 assert.deepEqual(r.peakPoint,r.points.find(p=>p.t===r.peakPoint.t));
});
test('preview reuses physical-output steps, keeps unit input scale, and does not mutate gains',async()=>{
 const {buildStepPreview}=await load(),candidate=structuredClone(gains);candidate.P.kp*=1.2;
 const before=JSON.stringify({input,gains,candidate});
 const r=buildStepPreview({input,currentGains:gains,candidateGains:candidate,loop:'P'});
 const metric=linearStepMetrics(gflLinearModels(input,gains).P);
 assert.equal(r.current.status,'ok');assert.equal(r.candidate.status,'ok');assert.equal(r.loop,'P');
 assert.equal(r.current.settlingTimeSeconds,metric.settlingTimeSeconds);assert.deepEqual(r.current.points,metric.points);
 assert.notDeepEqual(r.current.points,r.candidate.points);assert.equal(JSON.stringify({input,gains,candidate}),before);
});
test('zero-delay scope, missing gains and invalid inputs never fabricate a trace',async()=>{
 const {buildStepPreview}=await load();
 let r=buildStepPreview({input:{...input,delaySamples:1.5},currentGains:gains,loop:'P'});
 assert.equal(r.current.status,'unsupportedDelay');assert.deepEqual(r.current.points,[]);
 assert.equal(buildStepPreview({input,currentGains:null,loop:'d'}).current.status,'missingGains');
 assert.equal(buildStepPreview({input:{...input,L:NaN},currentGains:gains,loop:'d'}).current.status,'invalidInput');
 assert.throws(()=>buildStepPreview({input,currentGains:gains,loop:'x'}),/控制环/);
});
test('unstable current does not hide an independently valid candidate',async()=>{
 const {buildStepPreview}=await load(),unstable=structuredClone(gains);unstable.P.ki=1e6;
 const r=buildStepPreview({input,currentGains:unstable,candidateGains:gains,loop:'P'});
 assert.equal(r.current.status,'unstable');assert.deepEqual(r.current.points,[]);assert.equal(r.candidate.status,'ok');
});
test('final tracking error is not hidden by normalizing the output to its own final gain',async()=>{
 const {buildStepPreview}=await load();const p={...input,considerScr:false,dMode:'P',qMode:'Q',R:.1,filterCurrentMs:0,filterPqMs:0};
 const pureP=Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:1,ki:0}]));
 const r=buildStepPreview({input:p,currentGains:pureP,loop:'d'}).current;
 assert.equal(r.status,'ok');assert.ok(r.dcGain<.6&&r.dcGain>.4);assert.ok(Math.abs(r.finalError-(1-r.dcGain))<1e-12);
 assert.ok(Math.abs(r.points.at(-1).y-r.dcGain)<.002);
});
test('P/Q and Vdc/Vac channel keys follow selected modes, and all four loops work',async()=>{
 const {buildStepPreview}=await load();for(const loop of ['d','q','P','Q']){
 const r=buildStepPreview({input,currentGains:gains,loop});assert.equal(r.current.status,'ok');assert.equal(r.candidate.status,'missingGains');}
});
