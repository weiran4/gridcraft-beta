import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readGflModelInput,modelFacts} from '../analysis/gfl-model-input.js';
import {gflLinearModels,transferAt,dcGain,polynomialPoles} from '../analysis/gfl-linear-model.js';
import {evaluateGfl} from '../analysis/gfl-linear-evaluation.js';
import {loopResponse} from '../analysis/gfl-frequency.js';
import {closedLoopPolynomials} from '../analysis/gfl-autotune.js';
const project=JSON.parse(readFileSync(new URL('./fixtures/PV_Grid_Demo.json',import.meta.url)));
const p=readGflModelInput(project,'PV1',project.extensions.gflPi.PV1).modelInput,g=project.extensions.gflPi.PV1.gains;
const relative=(a,b)=>Math.hypot(a.re-b.re,a.im-b.im)/Math.max(1,Math.hypot(b.re,b.im));
test('zero-delay rational physical and sensor outputs equal original frequency functions',()=>{
 for(const mode of [{}, {considerScr:false,qMode:'Q'}, {dMode:'P',qMode:'Q'}, {filterCurrentMs:0,filterVoltageMs:0,filterVdcMs:0}]){
  const input={...p,...mode},models=gflLinearModels(input,g);
  for(const f of [.1,1,5,50,200,1000]){
   const r=loopResponse(modelFacts(input),g,f);
   for(const k of ['d','q','P','Q']){
    const m=models[k];assert.ok(relative(transferAt(m,f),r.closed[k])<1e-8,k);
    assert.ok(relative(transferAt({numerator:m.openNumerator,denominator:m.openDenominator},f),r.open[k])<1e-8,k);
    const w=2*Math.PI*f,H={re:1/(1+(w*m.filterSeconds)**2),im:-w*m.filterSeconds/(1+(w*m.filterSeconds)**2)},y=r.closed[k];
    assert.ok(relative(transferAt({numerator:m.measurementNumerator,denominator:m.measurementDenominator},f),{re:y.re*H.re-y.im*H.im,im:y.im*H.re+y.re*H.im})<1e-8);
   }
  }
  const old=closedLoopPolynomials(modelFacts(input),g);
  for(const k of ['d','q','P','Q']){const a=models[k].denominator,b=old[k];assert.equal(a.length,b.filter((_,i)=>i<=b.findLastIndex(x=>x!==0)).length);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-10*Math.max(1,Math.abs(b[i]))));}
 }
});
test('PV1 evaluation reproduces actual crossovers, exact DC gains and stable poles',()=>{
 const e=evaluateGfl(p,g);assert.equal(e.modelCoverage,'exactZeroDelayScalar');assert.equal(e.stability.status,'stable');
 for(const k of ['d','q','P','Q']){
  const target=k==='d'||k==='q'?7.2122177636:1.4424435527;
  assert.equal(e.loops[k].crossings.length,1);assert.ok(Math.abs(e.loops[k].crossings[0].frequency/target-1)<1e-4);
  assert.equal(e.loops[k].stability.status,'stable');assert.ok(e.loops[k].bandwidth.hz>0);assert.equal(dcGain(gflLinearModels(p,g)[k]),1);
 }
});
test('very low crossovers and multi-crossing cases are not hidden',()=>{
 const slow=structuredClone(g);slow.P={kp:0.00001,ki:1e-9};
 assert.ok(evaluateGfl(p,slow).loops.P.crossings[0].frequency<.1);
 const probe={...g,d:{kp:1,ki:0},q:{kp:1,ki:0}};
 const z=loopResponse(modelFacts(p),probe,250).open.d,kp=1/(Math.hypot(z.re,z.im)*Math.hypot(1,.05));
 probe.d=probe.q={kp,ki:kp*.05*2*Math.PI*250};
 assert.ok(evaluateGfl(p,probe).loops.d.crossings.length>1);
});
test('delayed evaluation never claims zero-delay stability or time response',()=>{
 const e=evaluateGfl({...p,delaySamples:1.5},g);assert.equal(e.modelCoverage,'frequencyOnlyWithDelay');assert.equal(e.stability.status,'unverified');
 assert.throws(()=>gflLinearModels({...p,delaySamples:1},g),/延时/);
});
test('pure P with R=0 and bypassed sensors is finite and evaluates as the actual loop',()=>{
 const input={...p,considerScr:false,qMode:'Q',dMode:'P',R:0,filterCurrentMs:0,filterPqMs:0};
 const gains=Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:1,ki:0}]));
 const e=evaluateGfl(input,gains);assert.equal(e.stability.status,'stable');
 assert.equal(dcGain(gflLinearModels(input,gains).d),1);
 assert.ok(relative(transferAt(gflLinearModels(input,gains).P,1),loopResponse(modelFacts(input),gains,1).closed.P)<1e-10);
});
test('polynomial roots distinguish stable, unstable, marginal and invalid data',()=>{
 assert.ok(polynomialPoles([6,11,6,1]).every(z=>z.re<0));
 assert.ok(polynomialPoles([-1,1]).some(z=>z.re>0));
 assert.equal(polynomialPoles([0,1])[0].re,0);
 assert.throws(()=>polynomialPoles([NaN,1]));
});
