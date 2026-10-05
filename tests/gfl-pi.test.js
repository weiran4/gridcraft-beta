
import test from 'node:test';import assert from 'node:assert/strict';
import {designGflPi} from '../analysis/gfl-pi.js';
const input={ratedVA:1e6,voltageLL:315,frequencyHz:50,R:1e-6,L:63e-6,dcVoltage:800};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)));
test('rated dq bases preserve three-phase power and voltage/current impedance',()=>{const r=designGflPi(input);close(1.5*r.base.Vdq*r.base.Idq,input.ratedVA);close(r.base.Vdq/r.base.Idq,r.base.Z);});
test('current PI cancels RL pole in pu and seconds, outer loop cancels reduced current pole',()=>{
 const r=designGflPi(input);
 close(r.current.ki/r.current.kp,input.R/input.L);
 close(r.current.kp*r.base.Z/input.L,2*Math.PI*500);
 close(r.current.kiSI/r.current.ki,r.base.Z);
 close(r.power.ki/r.power.kp,r.current.bandwidth);
 close(r.current.kiStep,r.current.ki/10000);
});
test('changing sample time only changes discrete increments and delay estimate',()=>{
 const a=designGflPi(input),b=designGflPi({...input,fs:20000});
 close(a.current.kp,b.current.kp);close(a.current.kiStep,2*b.current.kiStep);
 assert.ok(b.delayMargin>a.delayMargin);
});
test('invalid designs rejected, low DC and narrow bandwidth separation flagged',()=>{
 for(const patch of [{L:0},{R:-1},{dcVoltage:0},{fp:500},{fi:5000},{ratedVA:NaN}])assert.throws(()=>designGflPi({...input,...patch}));
 const r=designGflPi({...input,dcVoltage:100,fp:150});assert.ok(r.warnings.some(w=>w.includes('DC')));assert.ok(r.warnings.some(w=>w.includes('5倍')));
});
