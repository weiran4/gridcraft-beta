import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../examples/demo.js';
import {readGfmAdvisor,gfmSnapshot,switchGfmMode,restoreGfmCandidate} from '../project/gfm-advisor-state.js';
import {autoTuneGfm} from '../analysis/gfm-pi.js';
import {parseProject,serializeProject} from '../project/model.js';
const api=()=>import('../project/gfm-manual-candidates.js');
function fixture(){const p=demo('gfm480'),a=readGfmAdvisor(p,'GFM1');p.extensions.gfmPi.GFM1.gains=autoTuneGfm({...a.input,fi:500,fv:50,pm:60}).gains;return p;}
const payload=p=>({id:'manual-test',name:'电压试调',gains:readGfmAdvisor(p,'GFM1').gains});
test('GFM named trials persist all four loops, isolate modes and never mutate current PI',async()=>{
 const {saveGfmManualCandidate,listGfmManualCandidates,renameGfmManualCandidate,deleteGfmManualCandidate}=await api();
 const p=fixture(),before=serializeProject(p),next=saveGfmManualCandidate(p,'GFM1',payload(p));
 assert.equal(serializeProject(p),before);assert.deepEqual(next.extensions.gfmPi.GFM1.gains,p.extensions.gfmPi.GFM1.gains);
 assert.equal(listGfmManualCandidates(next,'GFM1','droop').length,1);assert.equal(listGfmManualCandidates(next,'GFM1','vsg').length,0);
 assert.deepEqual(listGfmManualCandidates(parseProject(serializeProject(next)),'GFM1','droop')[0].gains,payload(p).gains);
 assert.equal(listGfmManualCandidates(next,'GFM1','droop')[0].verified,undefined);
 const renamed=renameGfmManualCandidate(next,'GFM1','manual-test','新名称');assert.equal(renamed.extensions.gfmPi.GFM1.manualCandidates['manual-test'].name,'新名称');
 assert.equal(listGfmManualCandidates(deleteGfmManualCandidate(renamed,'GFM1','manual-test'),'GFM1','droop').length,0);
 assert.throws(()=>saveGfmManualCandidate(next,'GFM1',payload(p)));assert.throws(()=>saveGfmManualCandidate(p,'GFM1',{...payload(p),name:''}));
});
test('GFM manual evaluator uses GFM loops and rejects unsupported delay or wrong mode',async()=>{
 const {evaluateGfmManualCandidate}=await import('../analysis/gfm-manual-evaluation.js');const p=fixture(),a=readGfmAdvisor(p,'GFM1');
 const e=evaluateGfmManualCandidate({...a,gains:a.gains});assert.ok(e.evaluation.series.P.length);assert.equal(e.mode,'droop');assert.equal(e.source,'manual');
 const delayed=evaluateGfmManualCandidate({...a,input:{...a.input,delaySamples:1}});assert.equal(delayed.verified,false);assert.equal(delayed.requirementsMet,false);
 const wrong=evaluateGfmManualCandidate({...a,record:{mode:'vsg'}});assert.equal(wrong.requirementsMet,false);assert.match(wrong.error,/模式/);
});
test('manual apply re-evaluates instead of trusting forged flags and enforces fresh context',async()=>{
 const {applyGfmManualCandidate}=await api();const p=fixture(),a=readGfmAdvisor(p,'GFM1'),key=gfmSnapshot(a),c={...payload(p),mode:'droop',verified:true,requirementsMet:true};
 const bad=structuredClone(c);bad.gains.P.ki=1e8;assert.throws(()=>applyGfmManualCandidate(p,'GFM1',bad,key),/校核|要求/);
 assert.throws(()=>applyGfmManualCandidate(switchGfmMode(p,'GFM1','vsg'),'GFM1',c,key),/过期/);
 const changed=structuredClone(p);changed.extensions.gfmPi.GFM1.modes=structuredClone(a.settings.modes);changed.extensions.gfmPi.GFM1.modes.droop.mp=2;assert.throws(()=>applyGfmManualCandidate(changed,'GFM1',c,key),/过期/);
 // A feasible candidate must be freshly checked, attributed manual and restorable.
 const {searchGfmCandidates}=await import('../analysis/gfm-tuning-advisor.js');const r=searchGfmCandidates(a.input,a.request,a.gains,a.settings.mode,a.settings.modes.droop,{maxMilliseconds:60000});
 const feasible=r.candidates.find(x=>x.requirementsMet);assert.ok(feasible);
 const next=applyGfmManualCandidate(p,'GFM1',feasible,key);assert.equal(next.extensions.gfmPi.GFM1.manual,true);assert.deepEqual(next.extensions.gfmPi.GFM1.gains,feasible.gains);assert.deepEqual(restoreGfmCandidate(next,'GFM1').extensions.gfmPi.GFM1.gains,a.gains);
});
