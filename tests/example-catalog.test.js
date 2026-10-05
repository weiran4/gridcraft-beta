import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../examples/demo.js';
import {validateProject} from '../project/model.js';
test('PV Grid example preserves saved design settings and independent copies',()=>{const a=demo(),b=demo();assert.equal(a.name,'PV_Grid_Demo');assert.deepEqual(validateProject(a),[]);const pv=a.components.find(c=>c.id==='PV1');assert.equal(pv.extensions.filterDesign.harmonicPu,.389);assert.equal(pv.parametersSI.filterInductanceH,63e-6);assert.equal(a.components.find(c=>c.id==='DC1').parametersSI.voltageV,800);pv.extensions.filterDesign.harmonicPu=.5;assert.equal(b.components.find(c=>c.id==='PV1').extensions.filterDesign.harmonicPu,.389);});

import {autoTuneGfl} from '../analysis/gfl-autotune.js';
import {outerContext} from '../analysis/gfl-outer.js';
test('PV template restores the saved Vdc/Vac tuning inputs and matching automatic gains',()=>{
 const p=demo(),s=p.extensions.gflPi.PV1,c=p.components.find(c=>c.id==='PV1').parametersSI;
 assert.equal(s.fs,20000);assert.equal(s.delaySamples,0);
 assert.equal(s.dMode,'Vdc');assert.equal(s.qMode,'Vac');assert.equal(s.capSource,'custom');assert.equal(s.customCapUf,64000);
 assert.deepEqual([s.filterPqMs,s.filterVdcMs,s.filterVoltageMs,s.filterCurrentMs],[10,10,10,1]);
 const ctx=outerContext(p,'PV1');assert.ok(Math.abs(ctx.gridXOhm-.046617242)<1e-9);
 const a=autoTuneGfl({ratedVA:c.ratedApparentPowerVA,voltageLL:c.ratedAcVoltageV,frequencyHz:p.frequencyHz,R:c.filterResistanceOhm,L:c.filterInductanceH,dcVoltage:800,...s,...ctx,dcCapacitanceF:s.customCapUf*1e-6});
 assert.deepEqual(a.gains,s.gains);assert.equal(s.manual,false);
 s.gains.d.kp=999;assert.notEqual(demo().extensions.gflPi.PV1.gains.d.kp,999);
});

test('PV transformers both use the confirmed 1 MVA rating',()=>{
 assert.ok(demo().components.filter(c=>c.type==='transformer').every(c=>c.parametersSI.ratedApparentPowerVA===1e6));
});
