import test from 'node:test';
import assert from 'node:assert/strict';
import {tiFromKi,kiFromTi,piTimeParameters} from '../analysis/pi-time.js';
import {loopResponse} from '../analysis/gfl-frequency.js';
test('case Ti is reciprocal integral gain, independent of Kp',()=>{
 const entries=[[5,.01,100],[2,.01,100],[1.5,.02,50],[1,.02,50]];
 for(const [kp,ti,ki] of entries){assert.equal(kiFromTi(ti),ki);assert.equal(tiFromKi(ki),ti);assert.deepEqual(piTimeParameters({kp,ki}),{kp,tiSeconds:ti,integralEnabled:true});}
});
test('Ti roundtrip preserves legacy controller frequency responses',()=>{
 const input={ratedVA:1e6,voltageLL:315,R:1e-6,L:63e-6,fs:10000,fi:500,fp:50,delaySamples:1.5};
 const old={d:{kp:1.5,ki:50},q:{kp:1,ki:50},P:{kp:5,ki:100},Q:{kp:2,ki:100}};
 const converted=Object.fromEntries(Object.entries(old).map(([k,v])=>[k,{kp:v.kp,ki:kiFromTi(tiFromKi(v.ki))}]));
 for(const hz of [1,50,500])assert.deepEqual(loopResponse(input,converted,hz),loopResponse(input,old,hz));
});
test('zero integral is explicit infinity and invalid Ti cannot become a controller',()=>{
 assert.equal(tiFromKi(0),Infinity);assert.equal(kiFromTi('∞'),0);assert.equal(kiFromTi(Infinity),0);
 assert.deepEqual(piTimeParameters({kp:1,ki:0}),{kp:1,tiSeconds:null,integralEnabled:false});
 for(const x of [0,-1,'',NaN,'abc',1e-320])assert.throws(()=>kiFromTi(x));
});
