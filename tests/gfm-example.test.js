import test from 'node:test';
import assert from 'node:assert/strict';
import {gfm480Demo} from '../examples/gfm-480-demo.js';
import {validateProject} from '../project/model.js';
import {analyzeGridStrength} from '../analysis/grid-strength.js';
// Confirmed example ratings; builder still rejects missing capacity bases.
const fixture={ratedIbrVA:1e6,transformer1VA:1e6,transformer2VA:1e6,activePowerW:1e6,reactivePowerVar:0};
test('GFM example requires explicit capacity bases and operating point',()=>{
 assert.throws(()=>gfm480Demo());
 for(const key of Object.keys(fixture)){const p={...fixture};delete p[key];assert.throws(()=>gfm480Demo(p));}
});
test('GFM 480 V electrical example has supplied components without inherited GFL settings',()=>{
 const p=gfm480Demo(fixture),get=id=>p.components.find(c=>c.id===id);
 assert.deepEqual(validateProject(p),[]);assert.equal(get('GFM1').type,'gfm');
 assert.equal(get('RG').parametersSI.resistanceOhm,2303.0001);assert.equal(get('RG').parametersSI.inductanceH,41.568);
 assert.equal(get('T2').parametersSI.secondaryVoltageV,480);assert.equal(get('PCC1').parametersSI.ratedVoltageV,480);
 assert.equal(get('GFM1').parametersSI.ratedAcVoltageV,480);assert.equal(get('GFM1').parametersSI.filterInductanceH,146.3e-6);
 assert.equal(get('GFM1').parametersSI.filterResistanceOhm,1e-5);assert.equal(get('RC1').parametersSI.capacitanceF,646e-6);
 assert.equal(get('RC1').parametersSI.resistanceOhm,.118);assert.equal(get('DC1').parametersSI.voltageV,800);
 for(const id of ['T1','T2']){assert.equal(get(id).parametersSI.shortCircuitResistancePu,.001);assert.equal(get(id).parametersSI.shortCircuitReactancePu,.1);}
 assert.equal(p.extensions.gflPi,undefined);assert.deepEqual(get('GFM1').extensions,{});
 const result=analyzeGridStrength(p,'BUS220');assert.equal(result.status,'ok');assert.ok(Math.abs(result.shortCircuitVA-3649940.8172283156)<1e-5);
 const low=analyzeGridStrength(p,'PCC1');assert.equal(low.status,'ok');assert.equal(low.primaryIbrId,'GFM1');
 get('RC1').parametersSI.capacitanceF=1;assert.equal(gfm480Demo(fixture).components.find(c=>c.id==='RC1').parametersSI.capacitanceF,646e-6);
});

import {demo} from '../examples/demo.js';
test('catalog loads a separate GFM project and keeps PV as default',()=>{
 const p=demo('gfm480');assert.equal(p.name,'BESS_GFM_demo');assert.equal(p.components.filter(c=>c.type==='gfm').length,1);
 assert.ok(p.components.filter(c=>c.type==='transformer').every(c=>c.parametersSI.ratedApparentPowerVA===1e6));
 assert.equal(demo().name,'PV_Grid_Demo');assert.equal(p.extensions.gfmSetup.GFM1.controlStepSeconds,50e-6);
});
