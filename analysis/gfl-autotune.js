import {designGflPi} from './gfl-pi.js?v=autotune1';
import {outerModels} from './gfl-outer.js?v=outer1';
import {measurementFilters} from './measurement-filters.js?v=filters1';
import {loopResponse,frequencySweep,crossings} from './gfl-frequency.js?v=outer1';

// Ascending powers of s. Keep physical output tracking (not filtered output).
const add=(a,b)=>Array.from({length:Math.max(a.length,b.length)},(_,i)=>(a[i]||0)+(b[i]||0));
const mul=(a,b)=>{const c=Array(a.length+b.length-1).fill(0);a.forEach((x,i)=>b.forEach((y,j)=>c[i+j]+=x*y));return c;};
export function closedLoopPolynomials(p,g){
 const Z=p.voltageLL**2/p.ratedVA,h=measurementFilters(p),m=outerModels(p),result={},tracking={};
 for(const k of ['d','q']){
  const n=[Z*g[k].ki,Z*g[k].kp];
  result[k]=add(mul([0,1],mul([p.R,p.L],[1,h.current.seconds])),n);
  tracking[k]=mul(n,[1,h.current.seconds]);
 }
 for(const [k,inner] of [['P','d'],['Q','q']]){
  const plant=m[k];
  result[k]=add(mul(plant.integrator?[0,0,1]:[0,1],mul(result[inner],[1,h[plant.filter].seconds])),mul([plant.gain*g[k].ki,plant.gain*g[k].kp],tracking[inner]));
 }
 return result;
}
export function isHurwitz(coefficients){
 const c=[...coefficients];while(c.length>1&&c.at(-1)===0)c.pop();
 if(c.some(x=>!Number.isFinite(x))||c.some(x=>x<=0))return false;
 if(c.length<=2)return true;
 const descending=c.reverse(),width=Math.ceil(descending.length/2);
 const normalize=r=>{const max=Math.max(...r.map(Math.abs));return max>0?r.map(x=>x/max):r;};
 let a=normalize(Array.from({length:width},(_,i)=>descending[2*i]||0));
 let b=normalize(Array.from({length:width},(_,i)=>descending[2*i+1]||0));
 for(let row=2;row<descending.length;row++){
  if(!(b[0]>0))return false;
  const next=normalize(Array.from({length:width},(_,i)=>(b[0]*(a[i+1]||0)-a[0]*(b[i+1]||0))/b[0]));
  if(!(next[0]>0))return false;
  a=b;b=next;
 }
 return true;
}

/** Scalar continuous-loop tuning, with sensor poles and pure delay included.
 * A declared fixed zero/crossover ratio is a design policy, not an optimum.
 * Requested frequencies are upper bounds; the first phase-margin boundary
 * is used, avoiding later high-frequency phase wraps / resonant branches.
 */
export function autoTuneGfl(raw){
 const p={fs:20000,delaySamples:0,fi:500,fp:50,...raw};
 const baseDesign=designGflPi(p),models=outerModels(p),filters=measurementFilters(p);
 const targetMargin=60,gains=Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:1,ki:0}])),loops={};
 function tune(k,cap,ratio){
  const trial={...gains,[k]:{kp:1,ki:0}};
  function at(f){
   const w=2*Math.PI*f,z=loopResponse(p,trial,f).open[k],mag=Math.hypot(z.re,z.im);
   let phase=Math.atan2(z.im,z.re)*180/Math.PI;
   if(k==='d'||k==='q')phase=(-Math.atan2(w*p.L,p.R)-Math.atan(w*filters.current.seconds)-w*p.delaySamples/p.fs)*180/Math.PI;
   else if(phase>90)phase-=360;
   const margin=180+phase-Math.atan(ratio)*180/Math.PI;
   const kp=1/(mag*Math.sqrt(1+ratio*ratio));
   return {frequency:f,margin,kp,ki:kp*ratio*w};
  }
  let lo=cap*1e-7,best=at(lo);
  if(best.margin<targetMargin)throw Error('当前参数下未找到满足 60° 裕度的整定点。');
  for(let i=1;i<=240;i++){
   const hi=cap*10**(-7+7*i/240),candidate=at(hi);
   if(candidate.margin<targetMargin){
    let upper=hi;
    for(let j=0;j<42;j++){const mid=Math.sqrt(lo*upper);if(at(mid).margin>=targetMargin)lo=mid;else upper=mid;}
    best=at(lo);break;
   }
   lo=hi;best=candidate;
  }
  if(![best.kp,best.ki].every(x=>Number.isFinite(x)&&x>0))throw Error('PI 整定超出数值范围。');
  gains[k]={kp:best.kp,ki:best.ki};
  loops[k]={frequency:best.frequency,margin:best.margin,requested:k==='d'||k==='q'?p.fi:p.fp,zeroRatio:ratio};
 }
 tune('d',Math.min(p.fi,p.fs/10),.2);tune('q',Math.min(p.fi,p.fs/10),.2);
 tune('P',Math.min(p.fp,loops.d.frequency/5),models.P.integrator?.2:5);
 tune('Q',Math.min(p.fp,loops.q.frequency/5),5);
 const sweep=frequencySweep(p,gains,'open',2001);
 for(const k of Object.keys(gains)){
  const xs=crossings(sweep.series[k]);
  // For very low target frequencies the displayed sweep may start above fc.
  if(xs.some(x=>x.margin<targetMargin-.1)||xs.length>1)throw Error('频响校核发现额外交越或裕度不足；请降低目标频率后重试。');
 }
 const stability=p.delaySamples===0?Object.fromEntries(Object.entries(closedLoopPolynomials(p,gains)).map(([k,c])=>[k,isHurwitz(c)])):null;
 if(stability&&Object.values(stability).some(ok=>!ok))throw Error('闭环稳定性校核未通过，未生成自动 PI。');
 return {gains,loops,targetMargin,stability,baseDesign,models,policy:'sensor-aware-fixed-zero-ratio-v1'};
}
