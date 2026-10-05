import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeGridStrength as analyze} from '../analysis/grid-strength.js';
import {fixture, tr, rl} from './fixtures.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
test('single RL uses line voltage and rated MVA without factor three',()=>{const r=analyze(fixture(),'pcc');assert.equal(r.status,'ok');near(r.zTheveninOhm.re,.6);near(r.zTheveninOhm.im,.8);near(r.shortCircuitVA,1e8);near(r.scr,1);near(r.zBaseOhm,1);});
test('one transformer refers upstream impedance',()=>{const r=analyze(fixture([['rl',rl(60,80)],['transformer',tr(100000,10000)],['rl',rl(.4,.2)]],100000),'pcc');near(r.zTheveninOhm.re,1);near(r.zTheveninOhm.im,1);});
test('two transformer stages accumulate ratio',()=>{const r=analyze(fixture([['rl',rl(100,200)],['transformer',tr(100000,20000)],['rl',rl(4,8)],['transformer',tr(20000,10000)],['rl',rl(1,2)]],100000),'pcc');near(r.zTheveninOhm.re,3);near(r.zTheveninOhm.im,6);});
test('reverse transformer direction',()=>{const p=fixture([['rl',rl(.6,.8)],['transformer',tr(100000,10000)]],10000,100000);p.wires[1].to='e1.B';p.wires[2].from='e1.A';const r=analyze(p,'pcc');near(r.zTheveninOhm.re,60);near(r.zTheveninOhm.im,80);});
test('ideal source produces structured infinity without NaN',()=>{const r=analyze(fixture([]),'pcc');assert.equal(r.status,'ideal-grid');assert.equal(r.scr,'Infinity');assert.equal(r.xr,null);assert.ok(!JSON.stringify(r).includes('NaN'));});
test('disconnected PCC returns error',()=>{const p=fixture();p.wires=p.wires.filter(w=>w.id!=='wp');assert.equal(analyze(p,'pcc').status,'error');});
test('operating P Q do not change SCR',()=>{const p=fixture();const a=analyze(p,'pcc').scr;p.components.at(-1).parametersSI.activePowerW=1e7;p.components.at(-1).parametersSI.reactivePowerVar=3e7;near(analyze(p,'pcc').scr,a);});
test('RC excluded explicitly',()=>{const p=fixture();p.components.push({id:'rc',type:'rc',name:'RC',x:200,y:300,parametersSI:{resistanceOhm:1,capacitanceF:.0001}});p.wires.push({id:'wr',from:'pcc.AC',to:'rc.AC'});const r=analyze(p,'pcc');near(r.scr,1);assert.ok(r.warnings.some(w=>w.includes('RC')));});
test('multiple sources rejected',()=>{const p=fixture();p.components.push({...p.components[0],id:'s2'});p.wires.push({id:'ws',from:'s2.AC',to:'pcc.AC'});assert.match(analyze(p,'pcc').errors.join(' '),/电源/);});
test('parallel path rejected',()=>{const p=fixture();p.components.push({id:'parallel',type:'rl',name:'Parallel',x:0,y:0,parametersSI:rl(1,1)});p.wires.push({id:'pa',from:'source.AC',to:'parallel.A'},{id:'pb',from:'parallel.B',to:'pcc.AC'});assert.match(analyze(p,'pcc').errors.join(' '),/环网|路径/);});
test('voltage mismatch rejected',()=>{const p=fixture();p.components.find(c=>c.id==='pcc').parametersSI.ratedVoltageV=20000;assert.match(analyze(p,'pcc').errors.join(' '),/电压/);});
test('negative and nonfinite values rejected',()=>{for(const v of [-1,NaN,Infinity]){const p=fixture();p.components[1].parametersSI.resistanceOhm=v;assert.equal(analyze(p,'pcc').status,'error');}});
test('pure reactance has infinite X/R',()=>{const p=fixture([['rl',rl(0,1)]]);assert.equal(analyze(p,'pcc').xr,'Infinity');});

test('no IBR gives Ssc without SCR',()=>{const p=fixture();p.components=p.components.filter(c=>c.id!=='ibr');p.components.find(c=>c.id==='pcc').parametersSI.primaryIbrId='';p.wires=p.wires.filter(w=>w.id!=='wi');const r=analyze(p,'pcc');near(r.shortCircuitVA,1e8);assert.equal(r.scr,null);assert.equal(r.zBaseOhm,null);});
test('multiple IBR requires selection and uses chosen rated S',()=>{const p=fixture();p.components.push({...structuredClone(p.components.at(-1)),id:'ibr2'});p.wires.push({id:'wibr2',from:'pcc.AC',to:'ibr2.AC'});p.components.find(c=>c.id==='pcc').parametersSI.primaryIbrId='';assert.equal(analyze(p,'pcc').status,'error');p.components.find(c=>c.id==='pcc').parametersSI.primaryIbrId='ibr2';p.components.at(-1).parametersSI.ratedApparentPowerVA=5e7;near(analyze(p,'pcc').scr,2);});
test('overflow is an explicit error',()=>{const p=fixture();p.components[1].parametersSI.inductanceH=1e308;assert.equal(analyze(p,'pcc').status,'error');});
test('RC wire excluded from highlight',()=>{const p=fixture();p.components.push({id:'rc',type:'rc',name:'RC',x:0,y:0,parametersSI:{resistanceOhm:1,capacitanceF:1e-4}});p.wires.push({id:'rc-wire',from:'pcc.AC',to:'rc.AC'});const r=analyze(p,'pcc');assert.ok(!r.upstreamWireIds.includes('rc-wire'));assert.ok(!r.upstreamWireIds.includes('wi'));assert.ok(r.upstreamWireIds.includes('wp'));});

test('extreme finite X/R stays JSON safe',()=>{const p=fixture([['rl',rl(1e-320,1)]]);const result=analyze(p,'pcc');assert.equal(result.xr,'Infinity');});
