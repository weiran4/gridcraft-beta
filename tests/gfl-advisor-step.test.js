import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {linearStepMetrics,matrixExponential} from '../analysis/gfl-step-metrics.js';
import {gflLinearModels} from '../analysis/gfl-linear-model.js';
import {readGflModelInput} from '../analysis/gfl-model-input.js';
const close=(v,e,t=.005)=>assert.ok(Math.abs(v-e)<=t*Math.max(1e-9,Math.abs(e)),`${v} ≠ ${e}`);
test('first-order physical step has analytic rise and 2% settling times',()=>{
 for(const T of [.001,.1,2]){const r=linearStepMetrics({numerator:[1],denominator:[1,T]});assert.equal(r.status,'ok');close(r.riseTimeSeconds,Math.log(9)*T);close(r.settlingTimeSeconds,-Math.log(.02)*T);assert.ok(r.overshootPercent<.01);}
});
test('constant, zero gain, repeated poles, direct term and unstable cases have explicit outcomes',()=>{
 assert.equal(linearStepMetrics({numerator:[2],denominator:[1]}).settlingTimeSeconds,0);
 assert.equal(linearStepMetrics({numerator:[0],denominator:[1,1]}).status,'undefinedDcGain');
 const repeated=linearStepMetrics({numerator:[1],denominator:[1,2,1]});assert.equal(repeated.status,'ok');assert.ok(repeated.settlingTimeSeconds>5);
 const direct=linearStepMetrics({numerator:[1,1],denominator:[1,2]});close(direct.points[0].y,.5);close(direct.dcGain,1);
 assert.equal(linearStepMetrics({numerator:[1],denominator:[-1,1]}).status,'unstable');
 assert.equal(linearStepMetrics({numerator:[1],denominator:[1,1000]},{maxWindowSeconds:.01}).status,'windowExceeded');
});
test('matrix exponential agrees with diagonal and nilpotent identities',()=>{
 const E=matrixExponential([[-1,0],[0,-2]]);close(E[0][0],Math.exp(-1),1e-12);close(E[1][1],Math.exp(-2),1e-12);
 const N=matrixExponential([[0,1,0],[0,0,1],[0,0,0]]);close(N[0][2],.5,1e-12);close(N[0][1],1,1e-12);
});
test('PV1 physical-output metrics agree with independently established baseline',()=>{
 const p=JSON.parse(readFileSync(new URL('./fixtures/PV_Grid_Demo.json',import.meta.url))),s=p.extensions.gflPi.PV1,input=readGflModelInput(p,'PV1',s).modelInput;
 const m=gflLinearModels(input,s.gains),d=linearStepMetrics(m.P),q=linearStepMetrics(m.Q);
 assert.equal(d.status,'ok');close(d.settlingTimeSeconds,1.4087,.01);assert.ok(Math.abs(d.overshootPercent-12.259)<.2);
 close(q.settlingTimeSeconds,.53425,.01);assert.equal(d.verification.refined,true);
});
