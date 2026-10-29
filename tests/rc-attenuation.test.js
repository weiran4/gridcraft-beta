import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject,createComponent} from '../project/model.js';
import {prepareRcAttenuation,rcAttenuationAt} from '../analysis/rc-attenuation.js';
function fixture(type='gfm'){
 const p=emptyProject();p.frequencyHz=50;
 const i=createComponent(type,'I'),c=createComponent('rc','C');
 Object.assign(i.parametersSI,{filterInductanceH:800e-6,filterResistanceOhm:0});
 Object.assign(c.parametersSI,{capacitanceF:8e-6,resistanceOhm:2});
 p.components=[i,c];p.wires=[{id:'w',from:'I.AC',to:'C.AC'}];return p;
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('isolated LC agrees with closed-form voltage transfer for GFL and GFM',()=>{
 for(const type of ['gfl','gfm'])for(const R of [0,2,10]){
  const m=prepareRcAttenuation(fixture(type),'C','I',{resistanceOhm:R});
  for(const f of [50,500,12000]){
   const w=2*Math.PI*f;near(rcAttenuationAt(m,f).magnitude,Math.hypot(1,w*R*8e-6)/Math.hypot(1-w*w*800e-6*8e-6,w*R*8e-6));
  }
 }
});
test('grid branch and a parallel path change the transfer, local comparison excludes both',()=>{
 const p=fixture(),base=rcAttenuationAt(prepareRcAttenuation(p,'C','I'),12000).magnitude;
 p.components.push(createComponent('source','S'));
 for(const id of ['G1','G2']){
  const r=createComponent('rl',id);Object.assign(r.parametersSI,{resistanceOhm:1,inductanceH:.001});p.components.push(r);
  p.wires.push({id:id+'a',from:'S.AC',to:id+'.A'},{id:id+'b',from:id+'.B',to:'C.AC'});
 }
 const f=12000,w=2*Math.PI*f,xc=-1/(w*8e-6),xg=w*.001,xf=w*800e-6;
 const yr=2/(4+xc*xc)+2/(1+xg*xg),yi=-xc/(4+xc*xc)-2*xg/(1+xg*xg)-1/xf;
 near(rcAttenuationAt(prepareRcAttenuation(p,'C','I'),f).magnitude,1/Math.hypot(yr,yi)/xf);
 near(rcAttenuationAt(prepareRcAttenuation(p,'C','I',null,'local'),f).magnitude,base);
});
test('trial values never mutate the project; direct ideal source clamps PCC',()=>{
 const p=fixture(),before=JSON.stringify(p);
 prepareRcAttenuation(p,'C','I',{capacitanceF:12e-6,resistanceOhm:10},'local');assert.equal(JSON.stringify(p),before);
 p.components.push(createComponent('source','S'));p.wires.push({id:'s',from:'S.AC',to:'C.AC'});
 near(rcAttenuationAt(prepareRcAttenuation(p,'C','I'),12000).magnitude,0);
});
test('invalid inputs and zero-damping exact resonance are not reported as passing',()=>{
 const p=fixture();assert.throws(()=>prepareRcAttenuation(p,'C','I',{capacitanceF:-1}));
 const m=prepareRcAttenuation(p,'C','I',{resistanceOhm:0});
 assert.equal(rcAttenuationAt(m,1/(2*Math.PI*Math.sqrt(800e-6*8e-6))).singular,true);
 assert.throws(()=>rcAttenuationAt(m,0));
});
