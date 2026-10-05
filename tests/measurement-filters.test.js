import test from 'node:test';
import assert from 'node:assert/strict';
import {loopResponse} from '../analysis/gfl-frequency.js';
import {measurementFilters} from '../analysis/measurement-filters.js';
const gains=Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:1,ki:0}]));
const input={ratedVA:1,voltageLL:1,R:0,L:1,fs:100,delaySamples:0,filterPqMs:2000,filterCurrentMs:1000,filterVoltageMs:0,filterVdcMs:0};
const near=(z,re,im)=>{assert.ok(Math.abs(z.re-re)<1e-10,JSON.stringify(z));assert.ok(Math.abs(z.im-im)<1e-10,JSON.stringify(z));};
test('measurement poles enter return ratio while actual current tracking excludes sensor numerator',()=>{
 const r=loopResponse(input,gains,1/(2*Math.PI));
 near(r.open.d,-.5,-.5);near(r.closed.d,1,-1);
 near(r.open.P,-.2,-.6);near(r.closed.P,1.4,-.2);
});
test('zero time constants recover unfiltered loop and PQ sensor affects only outer response',()=>{
 const a=loopResponse({...input,filterPqMs:0,filterCurrentMs:0},gains,1/(2*Math.PI));
 near(a.open.d,0,-1);near(a.closed.d,.5,-.5);
 const b=loopResponse({...input,filterPqMs:0},gains,1/(2*Math.PI));
 near(b.closed.d,1,-1);assert.notDeepEqual(a.open.P,b.open.P);
 const c=loopResponse({...input,filterPqMs:0,filterVoltageMs:10,filterVdcMs:10},gains,1/(2*Math.PI));
 assert.deepEqual(b.open,c.open);assert.deepEqual(b.closed,c.closed);
});
test('default measurement groups use seconds consistently and reject invalid saved values',()=>{
 const f=measurementFilters({});assert.equal(f.pq.seconds,.01);assert.equal(f.current.seconds,.001);
 assert.ok(Math.abs(f.voltage.cutoffHz-15.915494309)<1e-8);assert.equal(f.vdc.seconds,.01);
 assert.equal(measurementFilters({filterPqMs:0}).pq.cutoffHz,null);
 for(const key of ['filterPqMs','filterVdcMs','filterVoltageMs','filterCurrentMs'])for(const value of [-1,NaN,Infinity,null])assert.throws(()=>measurementFilters({[key]:value}));
});
