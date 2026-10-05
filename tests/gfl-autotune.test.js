import test from 'node:test';
import assert from 'node:assert/strict';
import {autoTuneGfl,closedLoopPolynomials,isHurwitz} from '../analysis/gfl-autotune.js';
import {frequencySweep,crossings} from '../analysis/gfl-frequency.js';
import {designGflPi} from '../analysis/gfl-pi.js';
import {outerModels} from '../analysis/gfl-outer.js';
const p={ratedVA:1e6,voltageLL:315,frequencyHz:50,R:1e-6,L:63e-6,dcVoltage:800,dcCapacitanceF:.064,gridXOhm:.036694742,fs:20000,fi:500,fp:50,delaySamples:0,dMode:'Vdc',qMode:'Vac',filterCurrentMs:1,filterVdcMs:10,filterVoltageMs:10,filterPqMs:10};
test('filtered voltage modes tune all four stable loops with at least 60 degree margin',()=>{
 const a=autoTuneGfl(p),s=frequencySweep(p,a.gains,'open',4001);
 for(const k of ['d','q','P','Q']){
  assert.ok(a.gains[k].kp>0&&a.gains[k].ki>0);
  const xs=crossings(s.series[k]);assert.equal(xs.length,1);assert.ok(xs[0].margin>=59.98);
  assert.ok(a.loops[k].frequency<=(k==='d'||k==='q'?p.fi:p.fp));
  assert.equal(a.stability[k],true);
 }
 assert.ok(a.loops.d.frequency<100);assert.ok(a.loops.P.frequency<a.loops.d.frequency/5+1e-6);
});
test('old unfiltered Vdc recommendation is unstable even with zero delay',()=>{
 const b=designGflPi(p),m=outerModels(p),g={d:b.current,q:b.current,P:m.P,Q:m.Q};
 assert.equal(isHurwitz(closedLoopPolynomials(p,g).P),false);
});
test('each voltage filter affects its own tuning, and current filter affects the cascade',()=>{
 const a=autoTuneGfl(p),dc=autoTuneGfl({...p,filterVdcMs:100}),ac=autoTuneGfl({...p,filterVoltageMs:100}),i=autoTuneGfl({...p,filterCurrentMs:2});
 assert.ok(dc.loops.P.frequency<a.loops.P.frequency);assert.deepEqual(dc.gains.Q,a.gains.Q);
 assert.ok(ac.loops.Q.frequency<a.loops.Q.frequency);assert.deepEqual(ac.gains.P,a.gains.P);
 assert.ok(i.loops.d.frequency<a.loops.d.frequency);
});
test('all mode combinations, bypassed sensors and zero R have finite stable solutions',()=>{
 for(const dMode of ['P','Vdc'])for(const qMode of ['Q','Vac'])for(const bypass of [false,true]){
  const b=autoTuneGfl({...p,dMode,qMode,R:0,...(bypass?{filterCurrentMs:0,filterVdcMs:0,filterVoltageMs:0,filterPqMs:0}:{})});
  assert.ok(Object.values(b.stability).every(Boolean));
 }
});
test('step alone at zero delay leaves gains unchanged; delay reduces achievable crossover',()=>{
 const a=autoTuneGfl(p),step=autoTuneGfl({...p,fs:10000}),delay=autoTuneGfl({...p,delaySamples:10});
 assert.deepEqual(step.gains,a.gains);assert.ok(delay.loops.d.frequency<a.loops.d.frequency);
 assert.equal(delay.stability,null);
});
test('invalid model parameters are rejected instead of producing gains',()=>{
 assert.throws(()=>autoTuneGfl({...p,dcCapacitanceF:null}));
 assert.throws(()=>autoTuneGfl({...p,gridXOhm:0}));
 assert.throws(()=>autoTuneGfl({...p,filterVoltageMs:-1}));
});
test('Hurwitz check distinguishes stable, unstable and marginal polynomials',()=>{
 assert.equal(isHurwitz([6,11,6,1]),true);
 assert.equal(isHurwitz([1,-2,1]),false);
 assert.equal(isHurwitz([0,1,1]),false);
 assert.equal(isHurwitz([1,0,1]),false);
});
