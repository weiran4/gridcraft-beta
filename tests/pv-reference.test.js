import test from 'node:test';
import assert from 'node:assert/strict';
import {pvReferenceDemo as actualPvReferenceDemo} from '../examples/pv-reference.js';
import {analyzeGridStrength} from '../analysis/grid-strength.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)));
test('PV reference requires explicit rated apparent power',()=>assert.throws(()=>pvReferenceDemo(),/额定/));
test('PV reference combines source resistance into grid RL without changing the result',()=>{const p=pvReferenceDemo({ratedIbrVA:1e8});assert.equal(p.components.some(c=>c.id==='RS'),false);assert.equal(p.components.find(c=>c.id==='RG').parametersSI.resistanceOhm,2303.01);assert.equal(p.components.find(c=>c.id==='RG').parametersSI.inductanceH,41.568);const r=analyzeGridStrength(p,'PCC1');assert.equal(r.status,'ok');near(r.shortCircuitVA,3649940.3439716445);near(r.scr,0.036499403439716445);assert.ok(r.contributions.some(c=>c.id==='RG'));});
test('PV reference uses explicitly supplied IBR rating instead of active MW',()=>{const a=analyzeGridStrength(pvReferenceDemo({ratedIbrVA:1e6}),'PCC1');near(a.scr,3.6499403439716445);});

test('220 kV bus uses inverter capacity across ideal transformers and only source-side impedance',()=>{
 const p=pvReferenceDemo({ratedIbrVA:1e6});
 const hv=analyzeGridStrength(p,'BUS220'),lv=analyzeGridStrength(p,'PCC1');
 assert.equal(hv.status,'ok');assert.equal(hv.primaryIbrId,'PV1');
 near(hv.voltageBaseV,220000);near(hv.powerBaseVA,1e6);
 near(hv.zTheveninOhm.re,2303.01);
 assert.deepEqual(hv.contributions.map(c=>c.id),['RG']);
 near(hv.scr,lv.scr);
 p.components.find(c=>c.id==='RG').parametersSI.inductanceH*=2;
 assert.ok(analyzeGridStrength(p,'BUS220').scr<hv.scr);
});
test('an unrelated inverter across grid RL is not a capacity candidate',()=>{
 const p=pvReferenceDemo({ratedIbrVA:1e6});
 p.wires=p.wires.filter(w=>w.to!=='PV1.AC');
 p.wires.push({id:'moved',from:'S1.AC',to:'PV1.AC'});
 p.components.find(c=>c.id==='PV1').parametersSI.ratedAcVoltageV=220000;
 const r=analyzeGridStrength(p,'BUS220');
 assert.equal(r.status,'error');
});

test('PV example exposes all three buses and an ideal 800 V DC supply without changing SCR',()=>{
 const p=pvReferenceDemo({ratedIbrVA:1e6});
 assert.deepEqual(p.components.filter(c=>c.type==='bus'&&c.parametersSI.isPcc).map(c=>c.id),['BUS220','BUS35','PCC1']);
 const dc=p.components.find(c=>c.id==='DC1');
 assert.equal(dc.parametersSI.voltageV,800);assert.equal(dc.parametersSI.resistanceOhm,0);
 assert.ok(p.wires.some(w=>w.from==='PV1.DC'&&w.to==='DC1.DC'));
 for(const id of ['BUS220','BUS35','PCC1'])near(analyzeGridStrength(p,id).scr,3.6499403439716445);
});

function pvReferenceDemo(options){const p=actualPvReferenceDemo(options);for(const c of p.components)if(c.type==='transformer')Object.assign(c.parametersSI,{shortCircuitResistancePu:0,shortCircuitReactancePu:0});return p;}
