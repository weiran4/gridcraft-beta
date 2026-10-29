import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGfmIslandModel} from '../analysis/gfm-island-model.js';
import {evaluateGfmStructure} from '../analysis/gfm-structure-evaluation.js';
import {eigenvalues} from '../analysis/eigenvalues.js';
const p={ratedVA:30000,voltageLL:400,frequencyHz:50,L:800e-6,R:.02,C:8e-6,Rc:10,gridR:.2,gridL:.001,activePowerW:0,reactivePowerVar:0,dcVoltage:650,fs:20000,fi:500,fv:50,pm:60,filterCurrentMs:1,filterVoltageMs:10,filterPqMs:10,filterVdcMs:0,delaySamples:0,feedforwardCurrent:.75,feedforwardVoltage:.5,considerScr:true};
const g={d:{kp:.092,ki:8.48},q:{kp:.092,ki:8.48},P:{kp:.635,ki:2.23},Q:{kp:.635,ki:2.23}},m={h:1,d:100,nq:5,kv:10};
const config={capacitorDecouplingSignal:'filtered-pcc',decouplingFrequencySource:'nominal',gridCurrentFilterSeconds:.001};
test('full island closes the amplitude loop and exposes an instability hidden by fixed E',()=>{
 const fixed=buildGfmIslandModel(p,g,config),full=buildGfmIslandModel(p,g,config,{},'vsg',m);
 assert.ok(eigenvalues(fixed.A).every(z=>z.re<0));const unstable=eigenvalues(full.A).find(z=>z.re>0&&z.im>0);
 assert.ok(unstable);assert.ok(Math.abs(unstable.re-2.79714)<.001);assert.ok(Math.abs(unstable.im/(2*Math.PI)-6.86389)<.001);
 assert.equal(full.scope,'coupled-island-forming');assert.ok(full.names.includes('emf')&&full.names.includes('omega'));
 assert.ok(!full.names.includes('delta'));assert.ok(full.residual<1e-7);
});
test('outer Jacobian obeys VSG equations and voltage reference enters E, not voltage PI directly',()=>{
 const a=buildGfmIslandModel(p,g,config,{resistanceOhm:16/3},'vsg',m),idx=s=>a.names.indexOf(s),row=s=>a.A[idx(s)];
 assert.ok(a.residual<1e-7);assert.ok(Math.abs(a.op.P-1)<1e-12);
 assert.ok(Math.abs(row('emf')[idx('hv0')]+200)<1e-6);
 assert.ok(Math.abs(row('emf')[idx('qf')]+10)<1e-6);
 assert.ok(Math.abs(row('omega')[idx('pf')]+.5)<1e-6);
 assert.ok(Math.abs(row('omega')[idx('omega')]+50)<1e-6);
 const d=a.derivative(a.x0,{V:.01});assert.ok(Math.abs(d[idx('emf')]-2)<1e-10);assert.ok(Math.abs(d[idx('xv0')])<1e-10);
});
test('full modes support no load and resistive load, bypass filters, delay and grid independence',()=>{
 for(const [mode,params] of [['vsg',m],['droop',{mp:1,nq:5}],['sync',{...m,ke:10}]])for(const resistanceOhm of [null,16/3]){
 const q={...p,filterVoltageMs:0,filterCurrentMs:0,filterPqMs:0,delaySamples:2};
 const a=buildGfmIslandModel(q,g,config,{resistanceOhm},mode,params);
 const b=buildGfmIslandModel({...q,gridR:99,gridL:99,activePowerW:123456},g,config,{resistanceOhm},mode,params);
 assert.deepEqual(a.A,b.A);assert.ok(a.A.flat().every(Number.isFinite));assert.ok(a.residual<1e-7);
 }
 assert.throws(()=>buildGfmIslandModel(p,g,config,{},'vsg',{...m,kv:0}));
});
test('structure request defaults to complete forming model without mutating inputs',()=>{
 const request={input:p,gains:g,mode:'vsg',modeParameters:m,implementation:config,topology:'island'},before=JSON.stringify(request);
 const full=evaluateGfmStructure(request),fixed=evaluateGfmStructure({...request,islandControl:'fixed'});
 assert.equal(full.stable,false);assert.equal(fixed.stable,true);assert.equal(JSON.stringify(request),before);
});
