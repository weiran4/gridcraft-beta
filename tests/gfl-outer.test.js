import test from 'node:test';import assert from 'node:assert/strict';
import {outerModels,outerContext} from '../analysis/gfl-outer.js';
import {loopResponse,frequencySweep,crossings} from '../analysis/gfl-frequency.js';
import {fixture} from './fixtures.js';
const input={ratedVA:1,voltageLL:1,R:0,L:1,fs:100,fi:10,fp:1/(2*Math.PI),delaySamples:0,dcVoltage:2,dcCapacitanceF:.125,gridXOhm:.25,filterPqMs:0,filterCurrentMs:0,filterVoltageMs:0,filterVdcMs:0};
const gains=Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:1,ki:0}]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
test('Vdc energy balance and Vac sensitivity give distinct plants, polarities and initial gains',()=>{
 const m=outerModels({...input,dMode:'Vdc',qMode:'Vac'});
 near(m.P.gain,2);assert.equal(m.P.integrator,true);assert.equal(m.P.sign,-1);assert.equal(m.P.filter,'vdc');near(m.P.ki,.5);near(m.P.kp,Math.SQRT1_2);
 near(m.Q.gain,.25);assert.equal(m.Q.sign,-1);assert.equal(m.Q.filter,'voltage');near(m.Q.ki,4);
 const normal=outerModels(input);assert.equal(normal.P.sign,1);assert.equal(normal.Q.sign,-1);near(normal.P.ki,1);
});
test('all four combinations use the selected plant and selected measurement pole',()=>{
 const pq=loopResponse(input,gains,1/(2*Math.PI));
 const dc=loopResponse({...input,dMode:'Vdc'},gains,1/(2*Math.PI));near(dc.open.P.re,-1);near(dc.open.P.im,-1);assert.deepEqual(dc.open.Q,pq.open.Q);
 const ac=loopResponse({...input,qMode:'Vac'},gains,1/(2*Math.PI));near(ac.open.Q.re,.125);near(ac.open.Q.im,-.125);assert.deepEqual(ac.open.P,pq.open.P);
 const both=loopResponse({...input,dMode:'Vdc',qMode:'Vac',filterVdcMs:1000,filterVoltageMs:1000},gains,1/(2*Math.PI));near(both.open.P.re,-1);near(both.open.P.im,0);near(both.open.Q.re,0);near(both.open.Q.im,-.125);
});
test('voltage modes reject missing capacitance, zero grid authority and unknown modes',()=>{
 assert.throws(()=>outerModels({...input,dMode:'Vdc',dcCapacitanceF:null}),/电容/);
 assert.throws(()=>outerModels({...input,qMode:'Vac',gridXOhm:0}),/电抗/);
 assert.throws(()=>outerModels({...input,dMode:'bad'}));assert.doesNotThrow(()=>outerModels({...input,dcCapacitanceF:null,gridXOhm:0}));
});
test('outer context reads inverter capacitor and exact AC node impedance without mutation',()=>{
 const p=fixture();const c=p.components.find(c=>c.id==='ibr');c.extensions={dcCapacitor:{capacitanceF:.064,seriesCount:2}};
 const before=JSON.stringify(p),a=outerContext(p,'ibr');near(a.dcCapacitanceF,.064);near(a.gridXOhm,.8);assert.equal(JSON.stringify(p),before);
 p.components.find(c=>c.type==='rl').parametersSI.inductanceH*=2;near(outerContext(p,'ibr').gridXOhm,1.6);
});

test('Vdc double-integrator phase starts near minus 180 and reports negative margin',()=>{
 const p={...input,ratedVA:1e6,voltageLL:315,R:1e-6,L:63e-6,fs:1e4,fi:500,fp:50,dcVoltage:800,dcCapacitanceF:.064,dMode:'Vdc',filterCurrentMs:1,filterVdcMs:10};
 const m=outerModels(p),wi=2*Math.PI*p.fi,Z=p.voltageLL**2/p.ratedVA;
 const g={d:{kp:p.L*wi/Z,ki:p.R*wi/Z},q:{kp:p.L*wi/Z,ki:p.R*wi/Z},P:{kp:m.P.kp,ki:m.P.ki},Q:{kp:m.Q.kp,ki:m.Q.ki}};
 const pts=frequencySweep(p,g).series.P;
 assert.ok(pts[0].phase<-180&&pts[0].phase>-181);
 const [cross]=crossings(pts);assert.ok(cross.margin<0&&cross.margin>-20);
});
