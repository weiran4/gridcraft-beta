import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readGflModelInput,validateTuningRequest,modelFacts} from '../analysis/gfl-model-input.js';
import {autoTuneGfl} from '../analysis/gfl-autotune.js';
import {outerContext} from '../analysis/gfl-outer.js';
const bytes=readFileSync(new URL('./fixtures/PV_Grid_Demo.json',import.meta.url));
const load=()=>JSON.parse(bytes);
test('PV1 source is intact and extracted facts reproduce all eight legacy gains',()=>{
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'1982d9f5a1c0c59e058ad42fc6b50a876c41da29e2aaa048dac49b3a5d25a972');
 const p=load(),before=JSON.stringify(p),s=p.extensions.gflPi.PV1,r=readGflModelInput(p,'PV1',s);
 assert.equal(r.inputStatus,'valid');assert.equal(r.modelInput.dcCapacitanceF,.064);
 assert.equal(r.modelInput.scr,outerContext(p,'PV1').scr);
 assert.deepEqual(autoTuneGfl({...r.modelInput,fi:s.fi,fp:s.fp}).gains,s.gains);
 assert.equal(JSON.stringify(p),before);assert.equal(1/r.modelInput.fs,50e-6);
});
test('model facts are independent of absent or invalid tuning goals',()=>{
 const p=load(),r=readGflModelInput(p,'PV1',{...p.extensions.gflPi.PV1,fi:-1,fp:null});
 assert.equal(r.inputStatus,'valid');assert.equal('fi' in r.modelInput,false);
 assert.equal(modelFacts({...r.modelInput,fi:NaN,fp:-10}).fi,500);
 assert.equal(validateTuningRequest({mode:'automatic'}).valid,true);
 assert.equal(validateTuningRequest({mode:'target',fi:NaN,fp:50}).valid,false);
});
test('explicit null is not a bypass; legacy defaults carry provenance',()=>{
 const p=load(),s=p.extensions.gflPi.PV1;
 const bypass=readGflModelInput(p,'PV1',{...s,filterCurrentMs:0,delaySamples:0});
 assert.equal(bypass.inputStatus,'valid');assert.equal(bypass.sourceMap.filterCurrentMs,'user');
 const unknown=readGflModelInput(p,'PV1',{...s,filterCurrentMs:null});
 assert.equal(unknown.inputStatus,'incomplete');
 const fallback=readGflModelInput(p,'PV1',{...s,delaySamples:undefined});
 assert.equal(fallback.sourceMap.delaySamples,'legacyDefault');assert.ok(fallback.diagnostics.some(x=>x.field==='delaySamples'));
 assert.equal(readGflModelInput(p,'PV1',{...s,filterCurrentMs:-1}).inputStatus,'invalid');
});
test('outer topology and required DC capacitor are checked separately from targets',()=>{
 const p=load(),s=p.extensions.gflPi.PV1;
 assert.notEqual(readGflModelInput(p,'PV1',{...s,customCapUf:null}).inputStatus,'valid');
 assert.equal(readGflModelInput(p,'PV1',{...s,considerScr:false}).inputStatus,'invalid');
 assert.equal(readGflModelInput(p,'PV1',{...s,considerScr:false,qMode:'Q'}).inputStatus,'valid');
});
test('target bounds, margins and optional performance limits are explicit',()=>{
 const a=validateTuningRequest({mode:'automatic'});assert.equal(a.request.minMargin,60);assert.equal(a.request.maxSettlingSeconds,null);
 for(const change of [{minimumFp:60},{minMargin:75,preferredMargin:60},{separationRatio:0},{tolerance:2},{maxOvershootPercent:-1}]) assert.equal(validateTuningRequest({mode:'target',fi:500,fp:50,...change}).valid,false);
 assert.equal(validateTuningRequest({mode:'target',fi:500,fp:50,allowReduction:true,minimumFp:40,minMargin:45}).valid,true);
});
