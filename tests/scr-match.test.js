import test from 'node:test';import assert from 'node:assert/strict';
import {matchScr} from '../analysis/scr-match.js';
import {analyzeGridStrength as analyze} from '../analysis/grid-strength.js';
import {pvReferenceDemo as actualPvReferenceDemo} from '../examples/pv-reference.js';
import {fixture,rl,tr} from './fixtures.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
test('all three ideal-transformer PCCs yield same RL and achieve target without mutating preview',()=>{
 const p=pvReferenceDemo({ratedIbrVA:1e6}),saved=JSON.stringify(p),results=['BUS220','BUS35','PCC1'].map(id=>matchScr(p,id,'RG',5));
 assert.equal(JSON.stringify(p),saved);
 for(const v of results){near(v.resistanceOhm,results[0].resistanceOhm);near(v.inductanceH,results[0].inductanceH);}
 const xr=analyze(p,'PCC1').xr;Object.assign(p.components.find(c=>c.id==='RG').parametersSI,results[0]);
 for(const id of ['BUS220','BUS35','PCC1']){near(analyze(p,id).scr,5);near(analyze(p,id).xr,xr);}
});
test('fixed contributions are subtracted in PCC units across transformer',()=>{
 const p=fixture([['rl',rl(60,80)],['transformer',tr(100000,10000)],['rl',rl(.4,.2)]],100000);
 const before=analyze(p,'pcc'),target=before.scr/2,v=matchScr(p,'pcc','e0',target);
 near(v.resistanceOhm,160);near(v.inductanceH,180/(120*Math.PI));
 Object.assign(p.components.find(c=>c.id==='e0').parametersSI,v);near(analyze(p,'pcc').scr,target);near(analyze(p,'pcc').xr,before.xr);
 assert.throws(()=>matchScr(p,'pcc','e0',100),/不可实现/);
});
test('pure R and pure L preserve direction; invalid and zero-network requests rejected',()=>{
 for(const [r,x] of [[1,0],[0,1]]){const p=fixture([['rl',rl(r,x)]]),v=matchScr(p,'pcc','e0',2);near(v.resistanceOhm,r/2);near(v.inductanceH,x/(240*Math.PI));}
 for(const n of [0,-1,Infinity,NaN])assert.throws(()=>matchScr(fixture(),'pcc','e0',n));
 assert.throws(()=>matchScr(fixture(),'pcc','ibr',2),/上游/);
 assert.throws(()=>matchScr(fixture([['rl',rl(0,0)]]),'pcc','e0',2),/阻抗为零/);
});

function pvReferenceDemo(options){const p=actualPvReferenceDemo(options);for(const c of p.components)if(c.type==='transformer')Object.assign(c.parametersSI,{shortCircuitResistancePu:0,shortCircuitReactancePu:0});return p;}
