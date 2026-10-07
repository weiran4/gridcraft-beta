import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTuningState,previewCandidate,applyCandidate,restoreAppliedGains,tuningSnapshot} from '../project/gfl-tuning-state.js';
const load=()=>JSON.parse(readFileSync(new URL('./fixtures/PV_Grid_Demo.json',import.meta.url)));
const candidate=p=>({id:'checked',verified:true,requirementsMet:true,gains:Object.fromEntries(Object.entries(p.extensions.gflPi.PV1.gains).map(([k,v])=>[k,{kp:v.kp*2,ki:v.ki*2}])),evaluation:{stability:{status:'stable'}},targetStatus:'notSpecified'});
test('legacy automatic gains remain a baseline and preview never mutates the project',()=>{
 const p=load(),before=JSON.stringify(p),s=createTuningState(p.extensions.gflPi.PV1),next=previewCandidate(s,candidate(p),'snapshot');
 assert.deepEqual(s.baselineGains,p.extensions.gflPi.PV1.gains);assert.equal(s.applicationStatus,'baseline');assert.equal(next.applicationStatus,'preview');assert.equal(JSON.stringify(p),before);
});
test('application changes only selected GFL PI and supports restoring old gains',()=>{
 const p=load();p.extensions.gflPi.PV1.unknownExtension={keep:1};const before=structuredClone(p),s=previewCandidate(createTuningState(p.extensions.gflPi.PV1),candidate(p),'one');
 const updated=applyCandidate(p,'PV1',s,'one');assert.deepEqual(p,before);assert.deepEqual(updated.components,p.components);assert.deepEqual(updated.wires,p.wires);
 assert.deepEqual(updated.extensions.gflPi.PV1.unknownExtension,{keep:1});assert.deepEqual(updated.extensions.gflPi.PV1.gainBank['Vdc/Vac'].gains,candidate(p).gains);
 updated.components[0].name='new unrelated edit';
 const restored=restoreAppliedGains(updated,'PV1',createTuningState(updated.extensions.gflPi.PV1));
 assert.deepEqual(restored.extensions.gflPi.PV1.gains,p.extensions.gflPi.PV1.gains);assert.equal(restored.components[0].name,'new unrelated edit');
});
test('stale snapshots, changed gains, wrong mode and unverified candidates cannot apply',()=>{
 const p=load(),c=candidate(p),state=previewCandidate(createTuningState(p.extensions.gflPi.PV1),c,'one');
 assert.throws(()=>applyCandidate(p,'PV1',state,'two'),/过期/);
 const edited=load();edited.extensions.gflPi.PV1.gains.P.kp=99;assert.throws(()=>applyCandidate(edited,'PV1',state,'one'),/改变/);
 const switched=load();switched.extensions.gflPi.PV1.dMode='P';assert.throws(()=>applyCandidate(switched,'PV1',state,'one'),/模式/);
 for(const change of [{verified:false},{requirementsMet:false},{incompleteSearch:true}])assert.throws(()=>applyCandidate(p,'PV1',previewCandidate(createTuningState(p.extensions.gflPi.PV1),{...c,...change},'one'),'one'));
});
test('unrelated remote changes survive application and no-gain mode stays unapplied',()=>{
 const p=load(),s=previewCandidate(createTuningState(p.extensions.gflPi.PV1),candidate(p),'one');p.extensions.otherTab={important:true};
 assert.deepEqual(applyCandidate(p,'PV1',s,'one').extensions.otherTab,{important:true});
 assert.equal(createTuningState({dMode:'P',qMode:'Q'}).applicationStatus,'unapplied');
 assert.equal(tuningSnapshot({b:2,a:1}),tuningSnapshot({a:1,b:2}));
 assert.notEqual(tuningSnapshot({i:1,request:1}),tuningSnapshot({i:1,request:2}));
});
test('applied evaluation is marked stale after facts or gains change',async()=>{
 const {applicationEvidence}=await import('../project/gfl-tuning-state.js');
 assert.equal(typeof applicationEvidence,'function');
 const p=load(),g=p.extensions.gflPi.PV1.gains;
 const s={...p.extensions.gflPi.PV1,advisor:{appliedMode:'Vdc/Vac',appliedGains:g,factSnapshot:tuningSnapshot({R:1}),applicationStatus:'applied'}};
 assert.equal(applicationEvidence(s,{R:1}).status,'applied');
 assert.equal(applicationEvidence(s,{R:2}).status,'stale');
 assert.equal(applicationEvidence({...s,gains:{...g,P:{kp:9,ki:10}}},{R:1}).status,'stale');
 assert.equal(applicationEvidence(p.extensions.gflPi.PV1,{R:1}).status,'baseline');
});
