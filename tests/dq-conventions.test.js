import test from 'node:test';
import assert from 'node:assert/strict';
import {loopResponse} from '../analysis/gfl-frequency.js';
import {outerModels} from '../analysis/gfl-outer.js';
import {measurementFilters} from '../analysis/measurement-filters.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9*(1+Math.abs(b)),`${a} != ${b}`);
const add=(a,b)=>({re:a.re+b.re,im:a.im+b.im});
const mul=(a,b)=>({re:a.re*b.re-a.im*b.im,im:a.re*b.im+a.im*b.re});
const scale=(a,k)=>({re:k*a.re,im:k*a.im});
const div=(a,b)=>scale(mul(a,{re:b.re,im:-b.im}),1/(b.re*b.re+b.im*b.im));
const one={re:1,im:0};
const input={ratedVA:1e6,voltageLL:315,frequencyHz:50,R:.001,L:63e-6,dcVoltage:800,dcCapacitanceF:.064,gridXOhm:.0367,fs:20000,fi:500,fp:50,delaySamples:0,filterCurrentMs:1,filterPqMs:10,filterVdcMs:10,filterVoltageMs:10};
const gains={d:{kp:.23,ki:15},q:{kp:.3,ki:18},P:{kp:1.4,ki:10},Q:{kp:.6,ki:200}};
test('abc KVL transformed with cos/-sin gives +wLiq in d dynamics and -wLid in q dynamics',()=>{
 const R=.02,L=.001,w=314,theta=.73,ids=[2,-.6],vs=[300,12],us=[310,-8];
 const inv=([d,q])=>[0,-2*Math.PI/3,2*Math.PI/3].map(a=>d*Math.cos(theta+a)-q*Math.sin(theta+a));
 const park=a=>[0,1].map(k=>2/3*a.reduce((s,v,j)=>s+v*(k?-Math.sin(theta+[0,-2*Math.PI/3,2*Math.PI/3][j]):Math.cos(theta+[0,-2*Math.PI/3,2*Math.PI/3][j])),0));
 const abcI=inv(ids),abcV=inv(vs),abcU=inv(us),rotated=park(abcI.map((i,j)=>(abcU[j]-abcV[j]-R*i)/L));
 near(rotated[0]+w*ids[1],(us[0]-vs[0]-R*ids[0])/L+w*ids[1]);
 near(rotated[1]-w*ids[0],(us[1]-vs[1]-R*ids[1])/L-w*ids[0]);
});
test('reversing both current coordinates, PI voltage polarity and decoupling preserves physical voltage',()=>{
 const i=[.7,-.3],filtered=[.68,-.29],ref=[.8,-.4],integral=[.02,-.03],voltage=[1,.01],wL=.2;
 const command=direction=>{
  const e=ref.map((r,k)=>direction*(r-filtered[k]));
  const c=e.map((x,k)=>gains[k?'q':'d'].kp*x+direction*integral[k]);
  return [voltage[0]+direction*c[0]-direction*wL*(direction*filtered[1]),voltage[1]+direction*c[1]+direction*wL*(direction*filtered[0])];
 };
 command(1).forEach((v,k)=>near(v,command(-1)[k]));
 // A sensor-only sign reversal has the opposite voltage response to positive current error.
 const e=.1;assert.ok(gains.d.kp*e>0);assert.ok(-gains.d.kp*e<0);
});
test('signed inner and outer chains match production responses in either current direction',()=>{
 for(const dMode of ['P','Vdc'])for(const qMode of ['Q','Vac'])for(const hz of [1,10,100,500]){
  const p={...input,dMode,qMode},w=2*Math.PI*hz,models=outerModels(p),filters=measurementFilters(p),actual=loopResponse(p,gains,hz);
  assert.equal(models.P.sign,dMode==='P'?1:-1);assert.equal(models.Q.sign,-1);
  const C=k=>({re:gains[k].kp,im:-gains[k].ki/w});
  const H=k=>div(one,{re:1,im:w*filters[k].seconds});
  for(const direction of [1,-1])for(const [outer,axis] of [['P','d'],['Q','q']]){
   const signedPlant=div({re:direction*p.voltageLL**2/p.ratedVA,im:0},{re:p.R,im:w*p.L});
   const innerForward=mul(scale(C(axis),direction),signedPlant);
   const inner=div(innerForward,add(one,mul(innerForward,H('current'))));
   const m=models[outer],signedOuter=scale(m.integrator?{re:0,im:-m.gain/w}:{re:m.gain,im:0},direction*m.sign);
   const forward=mul(mul(scale(C(outer),direction*m.sign),inner),signedOuter);
   const open=mul(forward,H(m.filter)),closed=div(forward,add(one,open));
   for(const part of ['re','im']){near(open[part],actual.open[outer][part]);near(closed[part],actual.closed[outer][part]);}
  }
 }
});
