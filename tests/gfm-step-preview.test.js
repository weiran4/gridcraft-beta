import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../examples/demo.js';
import {gfmContext,gfmDefaults} from '../project/gfm-settings.js';
import {autoTuneGfm} from '../analysis/gfm-pi.js';
import {gfmLinearModels} from '../analysis/gfm-tuning-advisor.js';
import {linearStepMetrics} from '../analysis/gfl-step-metrics.js';
const p={...gfmContext(demo('gfm480'),'GFM1'),...gfmDefaults(),considerScr:true};
const gains=autoTuneGfm(p).gains;
test('GFM four step traces use its existing voltage/current model and leave gains intact',async()=>{
 const {buildGfmStepPreview}=await import('../analysis/gfm-step-preview.js');
 const before=JSON.stringify({p,gains});const result=buildGfmStepPreview({input:p,currentGains:gains,candidateGains:gains});
 for(const k of ['d','q','P','Q']){const expected=linearStepMetrics(gfmLinearModels(p,gains)[k]);assert.equal(result.loops[k].current.status,'ok');assert.deepEqual(result.loops[k].current.points,expected.points);assert.equal(result.loops[k].candidate.settlingTimeSeconds,expected.settlingTimeSeconds);}
 assert.equal(JSON.stringify({p,gains}),before);
});
test('GFM step missing and delayed curves stay explicitly unassessed',async()=>{
 const {buildGfmStepPreview}=await import('../analysis/gfm-step-preview.js');
 const result=buildGfmStepPreview({input:{...p,delaySamples:1},currentGains:gains});
 for(const k of ['d','q','P','Q']){assert.equal(result.loops[k].current.status,'unsupportedDelay');assert.deepEqual(result.loops[k].current.points,[]);assert.equal(result.loops[k].candidate.status,'missingGains');}
});
test('invalid GFM current gains do not suppress an independently valid candidate',async()=>{
 const {buildGfmStepPreview}=await import('../analysis/gfm-step-preview.js');
 const invalid=structuredClone(gains);invalid.d.kp=-1;
 const r=buildGfmStepPreview({input:p,currentGains:invalid,candidateGains:gains});
 assert.equal(r.loops.d.current.status,'invalidInput');assert.equal(r.loops.d.candidate.status,'ok');
});
