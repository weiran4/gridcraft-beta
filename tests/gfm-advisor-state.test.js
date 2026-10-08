import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../examples/demo.js';
import {gfmContext,gfmDefaults,gfmSettings} from '../project/gfm-settings.js';
import {autoTuneGfm} from '../analysis/gfm-pi.js';
const load=()=>import('../project/gfm-advisor-state.js');
function initial(){const p=demo('gfm480');const g=autoTuneGfm({...gfmContext(p,'GFM1'),...gfmDefaults(),considerScr:false}).gains;p.extensions.gfmPi.GFM1.gains=g;p.extensions.gfmPi.GFM1.extraField={retained:1};return p;}
test('GFM current facts and snapshot exclude goals but preserve stored PI and source project',async()=>{
 const {readGfmAdvisor,gfmSnapshot}=await load();const p=initial(),before=JSON.stringify(p),a=readGfmAdvisor(p,'GFM1');
 assert.deepEqual(a.gains,p.extensions.gfmPi.GFM1.gains);assert.equal(JSON.stringify(p),before);
 assert.equal('fi' in a.input,false);assert.equal('fv' in a.input,false);assert.equal(a.settings.manual,false);
 assert.notEqual(gfmSnapshot(a),gfmSnapshot({...a,request:{...a.request,minMargin:55}}));
});
test('GFM apply/restore affects only selected gains and metadata, keeping unrelated fields',async()=>{
 const {readGfmAdvisor,gfmSnapshot,applyGfmCandidate,restoreGfmCandidate}=await load();const p=initial(),s=readGfmAdvisor(p,'GFM1'),g=structuredClone(s.gains);g.d.kp*=.9;
 const c={id:'test',mode:s.settings.mode,verified:true,requirementsMet:true,gains:g,evaluation:{scalarStability:{status:'stable'}},targetStatus:'notSpecified'};
 const next=applyGfmCandidate(p,'GFM1',c,gfmSnapshot(s));assert.deepEqual(next.components,p.components);assert.deepEqual(next.extensions.gfmPi.GFM1.extraField,{retained:1});assert.deepEqual(next.extensions.gfmPi.GFM1.gains,g);assert.deepEqual(p.extensions.gfmPi.GFM1.gains,s.gains);
 next.name='new remote name';const restored=restoreGfmCandidate(next,'GFM1');assert.deepEqual(restored.extensions.gfmPi.GFM1.gains,s.gains);assert.equal(restored.name,'new remote name');
});
test('stale GFM facts/gains/mode/goals and incomplete or unverified candidates cannot apply',async()=>{
 const {readGfmAdvisor,gfmSnapshot,applyGfmCandidate}=await load();const p=initial(),s=readGfmAdvisor(p,'GFM1'),key=gfmSnapshot(s),c={id:'test',mode:s.settings.mode,verified:true,requirementsMet:true,gains:s.gains};
 for(const change of [p=>p.components.find(c=>c.id==='GFM1').parametersSI.filterInductanceH*=2,p=>p.extensions.gfmPi.GFM1.gains.d.kp*=2,p=>p.extensions.gfmPi.GFM1.mode='vsg',p=>p.extensions.gfmPi.GFM1.advisor={request:{...s.request,minMargin:55}}]){const q=structuredClone(p);change(q);assert.throws(()=>applyGfmCandidate(q,'GFM1',c,key),/过期|模式/);}
 for(const bad of [{verified:false},{requirementsMet:false},{incompleteSearch:true}])assert.throws(()=>applyGfmCandidate(p,'GFM1',{...c,...bad},key),/校核|要求/);
});
test('settings save and mode switch never generate PI and do not lose metadata',async()=>{
 const {readGfmAdvisor,saveGfmAdvisorSettings,switchGfmMode}=await load();const p=initial(),a=readGfmAdvisor(p,'GFM1');
 const q=saveGfmAdvisorSettings(p,'GFM1',{...a.settings,filterVoltageMs:8},a.gains,a.request);
 assert.deepEqual(q.extensions.gfmPi.GFM1.gains,a.gains);assert.deepEqual(q.extensions.gfmPi.GFM1.extraField,{retained:1});
 const v=switchGfmMode(q,'GFM1','vsg');assert.equal(readGfmAdvisor(v,'GFM1').gains,null);
 const back=switchGfmMode(v,'GFM1','droop');assert.deepEqual(readGfmAdvisor(back,'GFM1').gains,a.gains);
});
test('first explicit application can be restored to no PI and wrong component is rejected',async()=>{
 const {readGfmAdvisor,gfmSnapshot,applyGfmCandidate,restoreGfmCandidate}=await load();const p=demo('gfm480'),a=readGfmAdvisor(p,'GFM1');assert.equal(a.gains,null);
 const g=initial().extensions.gfmPi.GFM1.gains,c={id:'test',mode:'droop',verified:true,requirementsMet:true,gains:g};
 const next=applyGfmCandidate(p,'GFM1',c,gfmSnapshot(a));assert.equal(readGfmAdvisor(restoreGfmCandidate(next,'GFM1'),'GFM1').gains,null);
 assert.throws(()=>readGfmAdvisor(p,'PV1'),/GFM/);
});
