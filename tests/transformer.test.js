import test from 'node:test';import assert from 'node:assert/strict';
import {transformerImpedance} from '../core/electrical/transformer.js';
import {pvReferenceDemo} from '../examples/pv-reference.js';
import {analyzeGridStrength as analyze} from '../analysis/grid-strength.js';
import {matchScr} from '../analysis/scr-match.js';
import {parseProject,validateProject} from '../project/model.js';
import {fixture,tr,rl} from './fixtures.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
test('RTDS short circuit pu uses transformer rating and base frequency',()=>{
 const p=pvReferenceDemo({ratedIbrVA:1e6}).components.find(c=>c.id==='T1').parametersSI;
 const z=transformerImpedance(p,50,false);near(z.re,1.225);near(z.im,122.5);
 const primary=transformerImpedance(p,50,true);near(primary.re,48.4);near(primary.im,4840);
 const z60=transformerImpedance(p,60,false);near(z60.re,z.re);near(z60.im,z.im*1.2);
 near(transformerImpedance({...p,ratedApparentPowerVA:2e6},50,false).im,61.25);
});
test('successive PCCs include zero, one, and two leakage impedances; fixed-X/R matching verifies downstream',()=>{
 const p=pvReferenceDemo({ratedIbrVA:1e6}),a=analyze(p,'BUS220'),b=analyze(p,'BUS35'),c=analyze(p,'PCC1');
 assert.ok(a.scr>b.scr&&b.scr>c.scr);
 near(b.zTheveninPu.re-a.zTheveninPu.re,.001);near(b.zTheveninPu.im-a.zTheveninPu.im,.1);
 near(c.zTheveninPu.re-a.zTheveninPu.re,.002);near(c.zTheveninPu.im-a.zTheveninPu.im,.2);
 const v=matchScr(p,'PCC1','RG',3);Object.assign(p.components.find(c=>c.id==='RG').parametersSI,v);
 near(analyze(p,'PCC1').scr,3);near(analyze(p,'PCC1').xr,c.xr);
 assert.throws(()=>matchScr(p,'PCC1','RG',20),/不可实现/);
});
test('reverse transformer traversal refers leakage to the actual winding',()=>{
 const p=fixture([['rl',rl(0,0)],['transformer',{...tr(100000,10000),shortCircuitResistancePu:.001,shortCircuitReactancePu:.1,baseFrequencyHz:60}]],10000,100000);
 p.wires[1].to='e1.B';p.wires[2].from='e1.A';const a=analyze(p,'pcc');near(a.zTheveninOhm.re,.1);near(a.zTheveninOhm.im,10);
});
test('legacy import receives defaults; explicit ideal values survive; negative leakage rejected',()=>{
 const p=pvReferenceDemo({ratedIbrVA:1e6}),t=p.components.find(c=>c.id==='T1');
 delete t.parametersSI.baseFrequencyHz;delete t.parametersSI.shortCircuitResistancePu;delete t.parametersSI.shortCircuitReactancePu;
 const restored=parseProject(JSON.stringify(p)).components.find(c=>c.id==='T1');near(restored.parametersSI.shortCircuitReactancePu,.1);
 Object.assign(t.parametersSI,{baseFrequencyHz:50,shortCircuitResistancePu:0,shortCircuitReactancePu:0});near(parseProject(JSON.stringify(p)).components.find(c=>c.id==='T1').parametersSI.shortCircuitReactancePu,0);
 t.parametersSI.shortCircuitReactancePu=-1;assert.ok(validateProject(p).length);
});
