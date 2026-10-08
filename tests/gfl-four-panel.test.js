import test from 'node:test';
import assert from 'node:assert/strict';
import * as bode from '../ui/bode-plot.js';
import {stepResponseSvg} from '../ui/gfl-step-plot.js';
import * as preview from '../analysis/gfl-step-preview.js';
import {readGflModelInput} from '../analysis/gfl-model-input.js';
import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/PV_Grid_Demo.json',import.meta.url)));
const stored=fixture.extensions.gflPi.PV1,input=readGflModelInput(fixture,'PV1',stored).modelInput;
const series=Object.fromEntries(['d','q','P','Q'].map((k,i)=>[k,[{f:.0001,db:80+i,phase:-90},{f:1,db:0,phase:-135},{f:1e4,db:-80,phase:-180}]]));
const sweep={min:.0001,max:1e4,series};
test('2x2 Bode has one magnitude/phase pair per loop and shared frequency bounds',()=>{
 assert.equal(typeof bode.bodeLoopGrid,'function');
 const before=JSON.stringify(sweep),html=bode.bodeLoopGrid(sweep,{P:'Vdc',Q:'Vac'});
 assert.equal((html.match(/data-bode-loop=/g)||[]).length,4);
 for(const k of ['d','q','P','Q'])assert.match(html,new RegExp(`data-bode-loop="${k}"`));
 assert.equal((html.match(/Magnitude \/ dB/g)||[]).length,4);assert.equal((html.match(/Phase \/ °/g)||[]).length,4);
 assert.match(html,/Vdc 外环/);assert.match(html,/Vac 外环/);assert.equal(JSON.stringify(sweep),before);
 assert.doesNotMatch(html,/NaN|Infinity/);
});
test('legacy Bode API stays overlaid while keyed grid labels are safely escaped',()=>{
 assert.equal((bode.bodeSvg(sweep).match(/<svg/g)||[]).length,1);
 assert.equal(typeof bode.bodeLoopGrid,'function');
 const html=bode.bodeLoopGrid(sweep,{P:'<script>bad</script>',Q:'Q'});
 assert.doesNotMatch(html,/<script>/);assert.match(html,/Q 外环/);
});
test('every step panel owns a unique SVG clip id, independent of another panel dimensions',()=>{
 const response={status:'ok',dcGain:1,points:[{t:0,y:0},{t:1,y:1}],windowSeconds:1,settlingTimeSeconds:1};
 const a=stepResponseSvg({current:response},{width:550,height:270,clipId:'step-clip-d'});
 const b=stepResponseSvg({current:response},{width:400,height:270,clipId:'step-clip-P'});
 assert.match(a,/id="step-clip-d"/);assert.match(a,/url\(#step-clip-d\)/);
 assert.match(b,/id="step-clip-P"/);assert.match(a,/viewBox="0 0 550 270"/);
});
test('one preview request returns all four unchanged model responses without mutating input',()=>{
 assert.equal(typeof preview.buildStepGridPreview,'function');
 const req={input,currentGains:stored.gains,candidateGains:stored.gains},before=JSON.stringify(req);
 const r=preview.buildStepGridPreview(req);assert.deepEqual(Object.keys(r.loops),['d','q','P','Q']);
 for(const k of ['d','q','P','Q']){
  const expected=preview.buildStepPreview({...req,loop:k});
  assert.deepEqual(r.loops[k].current,expected.current);assert.deepEqual(r.loops[k].candidate,expected.candidate);
 }
 assert.equal(JSON.stringify(req),before);
});
test('four-panel preview carries missing or delayed status per curve, not a fabricated zero-delay trace',()=>{
 assert.equal(typeof preview.buildStepGridPreview,'function');
 const r=preview.buildStepGridPreview({input:{...input,delaySamples:1},currentGains:stored.gains});
 for(const k of ['d','q','P','Q']){assert.equal(r.loops[k].current.status,'unsupportedDelay');assert.equal(r.loops[k].candidate.status,'missingGains');assert.deepEqual(r.loops[k].current.points,[]);}
});
test('SCR wording follows the actual switch and does not promise a full dq/PLL model',async()=>{
 const scope=await import('../ui/gfl-model-scope.js').catch(()=>({}));assert.equal(typeof scope.gflModelScope,'function');
 const yes=scope.gflModelScope({considerScr:true,delaySamples:0}),no=scope.gflModelScope({considerScr:false,delaySamples:1});
 assert.match(yes,/已启用/);assert.match(yes,/电网 R\/L/);assert.match(yes,/RC/);assert.match(yes,/未包含 PLL/);
 assert.match(no,/未启用/);assert.match(no,/不使用上游电网阻抗/);assert.match(no,/非零纯延时/);
 assert.doesNotMatch(yes,/不包含 SCR/);
});
