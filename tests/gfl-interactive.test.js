
import test from 'node:test';import assert from 'node:assert/strict';
import {designGflPi} from '../analysis/gfl-pi.js';
import {loopResponse,frequencySweep,crossings} from '../analysis/gfl-frequency.js';
import {setGflField,getGfl} from '../project/gfl-settings.js';
import {pvReferenceDemo as actualPvReferenceDemo} from '../examples/pv-reference.js';
const input={filterPqMs:0,filterCurrentMs:0,filterVoltageMs:0,filterVdcMs:0,ratedVA:1e6,voltageLL:315,frequencyHz:50,R:1e-6,L:63e-6,dcVoltage:800,fs:10000,fi:500,fp:50,delaySamples:0};
const d=designGflPi(input),g={d:{...d.current},q:{...d.current},P:{...d.power},Q:{...d.power}};
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t, a+' != '+b);
test('analytical Bode at ideal loop crossover matches cancellation identities',()=>{
 const r=loopResponse(input,g,500).open.d;near(Math.hypot(r.re,r.im),1);near(Math.atan2(r.im,r.re)*180/Math.PI,-90);
 const p=loopResponse(input,g,50).open.P;near(Math.hypot(p.re,p.im),1);
 const closed=loopResponse(input,g,50).closed.P;near(Math.hypot(closed.re,closed.im),1/Math.sqrt(2));
 const cross=crossings(frequencySweep(input,g).series.d)[0];near(cross.frequency,500,.01);near(cross.margin,90,.01);
});
test('manual d gain affects d/P and preserves q/Q; delay adds expected phase',()=>{
 const h=structuredClone(g);h.d.kp*=2;assert.notDeepEqual(loopResponse(input,h,500).open.P,loopResponse(input,g,500).open.P);
 assert.deepEqual(loopResponse(input,h,500).open.Q,loopResponse(input,g,500).open.Q);
 const r=loopResponse({...input,delaySamples:1.5},g,500).open.d;near(Math.atan2(r.im,r.re)*180/Math.PI,-117);
 assert.throws(()=>loopResponse(input,{...g,d:{kp:-1,ki:0}},1));
});
test('selected GFL edits are isolated, connected DC and global frequency synchronize',()=>{
 const p=pvReferenceDemo({ratedIbrVA:1e6}),other=structuredClone(getGfl(p,'PV1'));other.id='PV2';p.components.push(other);
 setGflField(p,'PV1','ratedApparentPowerVA',2e6);assert.equal(other.parametersSI.ratedApparentPowerVA,1e6);
 setGflField(p,'PV1','dcVoltage',850);assert.equal(p.components.find(c=>c.id==='DC1').parametersSI.voltageV,850);
 setGflField(p,'PV1','frequencyHz',60);assert.equal(p.frequencyHz,60);assert.equal(p.components.find(c=>c.type==='source').parametersSI.frequencyHz,60);
 assert.throws(()=>setGflField(p,'missing','ratedAcVoltageV',400));assert.throws(()=>setGflField(p,'PV1','filterInductanceH',-1));
});

test('disabled controllers have finite zero-response plots and no unity crossings',()=>{
 const zero=Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:0,ki:0}]));
 for(const mode of ['open','closed'])for(const pts of Object.values(frequencySweep(input,zero,mode).series)){
  assert.ok(pts.every(p=>p.db===-300&&Number.isFinite(p.phase)));assert.deepEqual(crossings(pts),[]);
 }
});

function pvReferenceDemo(options){const p=actualPvReferenceDemo(options);for(const c of p.components)if(c.type==='transformer')Object.assign(c.parametersSI,{shortCircuitResistancePu:0,shortCircuitReactancePu:0});return p;}
