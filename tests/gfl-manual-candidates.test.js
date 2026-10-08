import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readGflModelInput} from '../analysis/gfl-model-input.js';
import {parseProject,serializeProject} from '../project/model.js';
import {createTuningState,previewCandidate,applyCandidate,tuningSnapshot} from '../project/gfl-tuning-state.js';
import {mergeProjectChanges} from '../project/sync.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/PV_Grid_Demo.json',import.meta.url)));
const stored=fixture.extensions.gflPi.PV1,gains=stored.gains,input=readGflModelInput(fixture,'PV1',stored).modelInput;
const store=()=>import('../project/gfl-manual-candidates.js');
const evaluate=()=>import('../analysis/gfl-manual-evaluation.js');
const payload=(id='manual-test',name='外环方案 A')=>({id,name,gains,input,request:{mode:'automatic'},createdAt:'2026-10-08T00:00:00Z'});
test('manual edits copy all four gains without changing applied parameters; dq linking is opt in',async()=>{
 const {editManualGains}=await store(),before=JSON.stringify(gains);
 const next=editManualGains(gains,'d','kp',2);assert.equal(next.d.kp,2);assert.deepEqual(next.q,gains.q);assert.equal(JSON.stringify(gains),before);
 const linked=editManualGains(gains,'q','ki',3,{linkedDq:true});assert.equal(linked.d.ki,3);assert.equal(linked.q.ki,3);assert.deepEqual(linked.P,gains.P);
});
test('Ki/Ti switching preserves the integral convention, zero Ki, and full precision',async()=>{
 const {editManualGains}=await store();assert.equal(editManualGains(gains,'P','ti','∞').P.ki,0);
 assert.equal(editManualGains(gains,'P','ti','0.25').P.ki,4);
 assert.equal(editManualGains(gains,'P','kp','0.12345678912345678').P.kp,Number('0.12345678912345678'));
 for(const v of ['',null,-1,NaN,Infinity])assert.throws(()=>editManualGains(gains,'d','kp',v));
 assert.throws(()=>editManualGains(gains,'x','kp',1));assert.throws(()=>editManualGains(gains,'d','__proto__',1));
});
test('named snapshot stores the full gain set, not only the card being edited; saved PI is untouched',async()=>{
 const {saveManualCandidate,listManualCandidates}=await store(),before=JSON.stringify(fixture);
 const next=saveManualCandidate(fixture,'PV1',payload());assert.equal(JSON.stringify(fixture),before);
 assert.deepEqual(next.components,fixture.components);assert.deepEqual(next.extensions.gflPi.PV1.gains,gains);
 const entries=listManualCandidates(next,'PV1','Vdc/Vac');assert.equal(entries.length,1);assert.equal(entries[0].name,'外环方案 A');assert.deepEqual(entries[0].gains,gains);
 assert.equal(entries[0].source,'manual');assert.equal(entries[0].factSnapshot,tuningSnapshot(input));assert.equal(entries[0].verified,undefined);
 assert.equal(listManualCandidates(next,'PV1','P/Q').length,0);
 const round=parseProject(serializeProject(next));assert.deepEqual(listManualCandidates(round,'PV1','Vdc/Vac'),entries);
});
test('duplicate IDs, invalid names and gain values cannot silently overwrite candidates',async()=>{
 const {saveManualCandidate}=await store(),p=saveManualCandidate(fixture,'PV1',payload());
 assert.throws(()=>saveManualCandidate(p,'PV1',payload()));
 for(const name of ['', ' '.repeat(3),'a'.repeat(81)])assert.throws(()=>saveManualCandidate(fixture,'PV1',payload('manual-x',name)));
 assert.throws(()=>saveManualCandidate(fixture,'PV1',{...payload('__proto__')}));
 const bad=structuredClone(gains);bad.q.ki=null;assert.throws(()=>saveManualCandidate(fixture,'PV1',{...payload(),gains:bad}));
});
test('rename and delete modify only one stored candidate, never current gains or another candidate',async()=>{
 const {saveManualCandidate,renameManualCandidate,deleteManualCandidate,listManualCandidates}=await store();let p=saveManualCandidate(fixture,'PV1',payload());
 p=saveManualCandidate(p,'PV1',payload('manual-b','方案 B'));const r=renameManualCandidate(p,'PV1','manual-test','新名字');
 assert.equal(p.extensions.gflPi.PV1.manualCandidates['manual-test'].name,'外环方案 A');assert.equal(listManualCandidates(r,'PV1','Vdc/Vac')[0].name,'新名字');
 const d=deleteManualCandidate(r,'PV1','manual-test');assert.equal(listManualCandidates(d,'PV1','Vdc/Vac').length,1);assert.deepEqual(d.extensions.gflPi.PV1.gains,gains);
});
test('concurrent named snapshots merge without losing another tab or inverter edits',async()=>{
 const {saveManualCandidate,listManualCandidates}=await store();
 const local=saveManualCandidate(fixture,'PV1',payload()),remote=saveManualCandidate(fixture,'PV1',payload('manual-b','B'));
 remote.components[0].parametersSI.phaseRad=.3;const merged=mergeProjectChanges(fixture,local,remote);
 assert.equal(listManualCandidates(merged,'PV1','Vdc/Vac').length,2);assert.equal(merged.components[0].parametersSI.phaseRad,.3);
});
test('malformed imported candidates are ignored, never executed or treated as verified',async()=>{
 const {listManualCandidates}=await store(),p=structuredClone(fixture);p.extensions.gflPi.PV1.manualCandidates={bad:{name:'bad',gains:null,mode:'Vdc/Vac'},fake:{...payload(),id:'fake',source:'manual',mode:'Vdc/Vac',verified:true}};
 const rows=listManualCandidates(p,'PV1','Vdc/Vac');assert.ok(rows.every(r=>r.verified===undefined));
});
test('manual evaluation computes actual closed-loop performance and enforces targets without search',async()=>{
 const {evaluateManualCandidate}=await evaluate();const before=JSON.stringify({input,gains});
 const r=evaluateManualCandidate(input,gains,{mode:'target',fi:500,fp:50});assert.equal(r.source,'manual');assert.equal(r.verified,true);assert.equal(r.requirementsMet,false);assert.ok(r.unmet.length>0);assert.equal(r.evaluation.loops.P.step.status,'ok');assert.ok(r.evaluation.series.d.length>100);
 assert.equal(JSON.stringify({input,gains}),before);
});
test('unstable and delayed manual parameters can be recorded but are never automatically certified',async()=>{
 const {saveManualCandidate}=await store(),{evaluateManualCandidate}=await evaluate(),bad=structuredClone(gains);bad.P.ki=1e6;
 assert.ok(saveManualCandidate(fixture,'PV1',{...payload(),gains:bad}));assert.equal(evaluateManualCandidate(input,bad,{}).verified,false);
 const delayed=evaluateManualCandidate({...input,delaySamples:1.5},gains,{});assert.equal(delayed.verified,false);assert.equal(delayed.requirementsMet,false);
});
test('current-model evaluation marks changed conditions and names cannot create a stale application certificate',async()=>{
 const {saveManualCandidate,listManualCandidates}=await store(),{evaluateManualCandidate}=await evaluate();const c=listManualCandidates(saveManualCandidate(fixture,'PV1',payload()),'PV1','Vdc/Vac')[0];
 const changed={...input,filterVdcMs:20};const r=evaluateManualCandidate(changed,c.gains,{},c);assert.equal(r.conditionsChanged,true);assert.equal(r.factSnapshot,tuningSnapshot(changed));
});
test('explicit manual application preserves source and remains undoable without touching electrical facts',async()=>{
 const {evaluateManualCandidate}=await evaluate();const c=evaluateManualCandidate(input,gains,{minMargin:55,preferredMargin:60});assert.equal(c.requirementsMet,true);
 const state=previewCandidate(createTuningState(stored),c,'key'),p=applyCandidate(fixture,'PV1',state,'key');assert.equal(p.extensions.gflPi.PV1.manual,true);assert.equal(p.extensions.gflPi.PV1.advisor.candidateSource,'manual');assert.deepEqual(p.components,fixture.components);assert.equal(p.extensions.gflPi.PV1.advisor.evaluation.series,undefined);assert.equal(p.extensions.gflPi.PV1.advisor.evaluation.closedSeries,undefined);
});
