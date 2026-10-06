import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../examples/demo.js';
import {prepareResonance,impedanceAt} from '../analysis/resonance.js';
import {preparePcc,sweepPcc} from '../analysis/pcc-frequency.js';
import {frequencyMatrix,invert2,gfmPortModel} from '../analysis/port-response.js';
import {gfmContext,gfmSettings} from '../project/gfm-settings.js';
import {autoTuneGfm} from '../analysis/gfm-pi.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
test('state space frequency solver matches analytical RL and handles singularity',()=>{const r=frequencyMatrix({A:[[-2]],B:[[3,0]],C:[[4],[0]],D:[[5,0],[0,1]]},1);near(r[0][0].re,5+24/(4+4*Math.PI**2));near(r[0][0].im,-24*Math.PI/(4+4*Math.PI**2));assert.throws(()=>invert2([[{re:0,im:0},{re:0,im:0}],[{re:0,im:0},{re:0,im:0}]]),/奇异/);});
test('PCC passive spectrum equals existing RC nodal solution; upstream equals referred RL',()=>{const p=demo('pv315'),m=preparePcc(p,'PCC1','passive'),old=prepareResonance(p,'RC1');for(const f of [1,50,517,2000]){const z=m.at(f).Z,ref=impedanceAt(old,f);near(z.re,ref.re);near(z.im,ref.im);}const g=preparePcc(p,'PCC1','grid');near(g.at(100).Z.im,2*g.at(50).Z.im);near(g.at(100).Z.re,g.at(50).Z.re);});
test('port selection rejects non PCC, controlled remote nodes and missing saved PI',()=>{const p=demo('gfm480');assert.throws(()=>preparePcc(p,'RC1','grid'),/PCC/);assert.throws(()=>preparePcc(p,'BUS220','controlled'),/同一/);assert.throws(()=>preparePcc(p,'PCC1','controlled'),/PI/);});
test('sweep validates range and reports zero impedance without false phase',()=>{const p=demo('pv315'),g=preparePcc(p,'BUS220','grid');assert.throws(()=>sweepPcc(g,{minHz:0,maxHz:100}),/范围/);const r=sweepPcc({unit:'Ω',keys:['Z'],at:f=>({Z:{re:0,im:0}})},{minHz:1,maxHz:100,points:101});assert.equal(r.series.Z[0].phaseDeg,null);assert.equal(r.series.Z[0].magnitude,0);});
test('GFM port model retains equilibrium, current-entry sign and reference-frame feedthrough',()=>{const p=demo('gfm480'),s=gfmSettings(p,'GFM1'),x={...gfmContext(p,'GFM1'),...s,considerScr:true},g=autoTuneGfm(x).gains;for(const mode of ['droop','vsg','sync']){const m=gfmPortModel(x,g,mode,s.modes[mode]);assert.ok(m.residual<1e-7);assert.ok(!m.names.includes('ig0'));near(m.D[0][0],x.Rc/(x.voltageLL**2/x.ratedVA));const z=frequencyMatrix(m,10);assert.ok(z.flat().every(v=>Number.isFinite(v.re)&&Number.isFinite(v.im)));} });
test('controlled GFM reads saved gains without changing project and exposes full dq matrix',()=>{const p=demo('gfm480'),s=gfmSettings(p,'GFM1');s.gains=autoTuneGfm({...gfmContext(p,'GFM1'),...s,considerScr:true}).gains;p.extensions.gfmPi={GFM1:s};const before=JSON.stringify(p),m=preparePcc(p,'PCC1','controlled'),a=m.at(10);assert.deepEqual(Object.keys(a),['Ydd','Ydq','Yqd','Yqq']);assert.equal(JSON.stringify(p),before);assert.ok(Math.hypot(a.Ydq.re,a.Ydq.im)>1e-8);const q=structuredClone(p);q.extensions.gfmPi.GFM1.gains.d.kp*=2;assert.notDeepEqual(a,preparePcc(q,'PCC1','controlled').at(10));});
test('controlled GFL uses saved inner PI, labelled frozen outer loop, and responds to PI changes',()=>{const p=demo('pv315'),m=preparePcc(p,'PCC1','controlled');assert.match(m.scope,/冻结外环/);const z=m.at(20);p.extensions.gflPi.PV1.gains.d.kp*=2;assert.notDeepEqual(z,preparePcc(p,'PCC1','controlled').at(20));});

import {gfmDynamicModel} from '../analysis/gfm-dynamics.js';
import {c,add,mul,scale} from '../analysis/port-response.js';
const mm=(a,b)=>a.map(row=>b[0].map((_,j)=>row.reduce((z,v,k)=>add(z,mul(v,b[k][j])),c(0))));
test('reconnecting extracted GFM port to grid reproduces original coupled system response',()=>{
 const project=demo('gfm480'),s=gfmSettings(project,'GFM1'),p={...gfmContext(project,'GFM1'),...s,considerScr:true},g=autoTuneGfm(p).gains;
 for(const mode of ['droop','vsg','sync']){
  const full=gfmDynamicModel(p,g,mode,s.modes[mode]),port=gfmPortModel(p,g,mode,s.modes[mode]),n=full.names.length,idx=Object.fromEntries(full.names.map((v,i)=>[v,i])),B=Array.from({length:n},()=>[0,0]),C=Array.from({length:2},()=>Array(n).fill(0)),Z=full.op.Z,lg=p.gridL/Z,rc=p.Rc/Z;
  for(let k=0;k<2;k++){B[idx['ig'+k]][k]=-1/lg;C[k][idx['vc'+k]]=1;C[k][idx['il'+k]]=rc;C[k][idx['ig'+k]]=-rc;}C[1][idx.delta]=full.op.V;
  for(const f of [.1,1,10,100]){
   const yg=invert2([[c(p.gridR/Z,2*Math.PI*f*lg),c(-full.op.w*lg)],[c(full.op.w*lg),c(p.gridR/Z,2*Math.PI*f*lg)]]),yc=invert2(frequencyMatrix(port,f)),sum=yg.map((row,i)=>row.map((v,j)=>add(v,yc[i][j]))),expected=mm(invert2(sum),yg),actual=frequencyMatrix({A:full.A,B,C,D:[[0,0],[0,0]]},f);
   for(let i=0;i<2;i++)for(let j=0;j<2;j++){near(actual[i][j].re,expected[i][j].re,2e-5);near(actual[i][j].im,expected[i][j].im,2e-5);}
  }
 }
});
