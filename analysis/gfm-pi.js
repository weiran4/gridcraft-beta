/** Scalar dq-decoupled continuous small-signal reference model.
 * Frozen forming angle/amplitude commands. One shunt series RC, radial grid RL.
 * PCC voltage feedforward uses Hv. Grid-current feedforward is instantaneous.
 * Does not certify the coupled dq / forming-outer-loop / sampled-data system.
 */
import {crossings} from './gfl-frequency.js?v=scr1';
import {isHurwitz} from './gfl-autotune.js?v=scr1';
export const loops=['d','q','P','Q']; // P/Q are voltage d/q here, for shared plotting only.
const c=(re,im=0)=>({re,im}),one=c(1);
const add=(a,b)=>c(a.re+b.re,a.im+b.im),neg=a=>c(-a.re,-a.im),mul=(a,b)=>c(a.re*b.re-a.im*b.im,a.re*b.im+a.im*b.re);
const div=(a,b)=>{const z=b.re*b.re+b.im*b.im;return c((a.re*b.re+a.im*b.im)/z,(a.im*b.re-a.re*b.im)/z);};
const scale=(a,k)=>c(a.re*k,a.im*k);
const pa=(a,b)=>Array.from({length:Math.max(a.length,b.length)},(_,i)=>(a[i]||0)+(b[i]||0));
const pm=(...arr)=>arr.reduce((a,b)=>{const o=Array(a.length+b.length-1).fill(0);a.forEach((x,i)=>b.forEach((y,j)=>o[i+j]+=x*y));return o;},[1]);
const ps=(a,k)=>a.map(x=>x*k);
export function validateGfmInput(p){
 for(const k of ['ratedVA','voltageLL','frequencyHz','L','C','dcVoltage','fs','fi','fv','pm'])if(!Number.isFinite(p[k])||p[k]<=0)throw Error(k+' 必须为正的有限数。');
 for(const k of ['R','Rc','gridR','gridL','delaySamples','filterCurrentMs','filterVoltageMs','filterPqMs','filterVdcMs'])if(!Number.isFinite(p[k])||p[k]<0)throw Error(k+' 必须为非负有限数。');
 for(const k of ['feedforwardCurrent','feedforwardVoltage'])if(!Number.isFinite(p[k])||p[k]<0||p[k]>1)throw Error('前馈系数须在 0–1 之间。');
 if(p.pm<30||p.pm>=90)throw Error('目标相位裕度须在 30°（含）至 90°（不含）之间。');
 if(p.fi>=p.fs/2||p.fv>=p.fi)throw Error('电压交越须低于电流交越，电流交越须低于 1/(2Ts)。');
 if(p.considerScr!==false&&p.gridR===0&&p.gridL===0)throw Error('理想刚性电网钳位 PCC 电压，不能按此模型整定电压环。');
}
export function validateGfmGains(g){for(const k of loops)for(const f of ['kp','ki'])if(!Number.isFinite(g?.[k]?.[f])||g[k][f]<0)throw Error('PI 增益必须为非负有限数。');}
export function gfmResponse(p,g,hz){
 const w=2*Math.PI*hz,Zb=p.voltageLL**2/p.ratedVA;
 const zl=c(p.R,w*p.L),zc=c(p.Rc,-1/(w*p.C)),zg=c(p.gridR,w*p.gridL),zp=p.considerScr===false?zc:div(mul(zc,zg),add(zc,zg));
 const hi=div(one,c(1,w*p.filterCurrentMs/1000)),hv=div(one,c(1,w*p.filterVoltageMs/1000)),D=c(Math.cos(-w*p.delaySamples/p.fs),Math.sin(-w*p.delaySamples/p.fs));
 const A=p.considerScr===false?scale(zl,1/Zb):scale(add(zl,mul(add(one,neg(scale(mul(D,hv),p.feedforwardVoltage))),zp)),1/Zb);
 const C=k=>c(g[k].kp,-g[k].ki/w),open={},closed={};
 for(const k of ['d','q']){const forward=div(mul(C(k),D),A);open[k]=mul(forward,hi);closed[k]=div(forward,add(one,open[k]));}
 for(const [k,i] of [['P','d'],['Q','q']]){
  const T=closed[i],plant=div(scale(mul(T,zp),1/Zb),add(one,neg(scale(mul(T,(p.considerScr===false?c(0):div(zp,zg))),p.feedforwardCurrent))));
  const forward=mul(C(k),plant);open[k]=mul(forward,hv);closed[k]=div(forward,add(one,open[k]));
 }
 return {open,closed};
}
export function gfmPolynomials(p,g){
 // Exact zero-delay characteristic polynomials, ascending powers of s.
 if(p.delaySamples!==0)throw Error('含纯延时时不使用有限阶 Routh 判据。');
 if(p.considerScr===false){
  const Z=p.voltageLL**2/p.ratedVA,Hi=[1,p.filterCurrentMs/1000],Hv=[1,p.filterVoltageMs/1000],Nc=[1,p.Rc*p.C],Dp=[0,p.C],out={};
  for(const [i,v]of [['d','P'],['q','Q']]){const ni=pm([g[i].ki,g[i].kp],Hi,[Z]),di=pa(pm([0,1],Hi,[p.R,p.L]),pm([g[i].ki,g[i].kp],[Z]));out[i]=di;out[v]=pa(pm([0,1],Hv,di,Dp),pm([g[v].ki,g[v].kp],ni,Nc,[1/Z]));}
  return out;
 }
 const Zb=p.voltageLL**2/p.ratedVA,Hi=[1,p.filterCurrentMs/1000],Hv=[1,p.filterVoltageMs/1000],Nc=[1,p.Rc*p.C];
 const Np=pm(Nc,[p.gridR,p.gridL]),Dp=[1,p.C*(p.Rc+p.gridR),p.C*p.gridL];
 const A=pa(pm([p.R,p.L],Dp,Hv),pm(pa(Hv,[-p.feedforwardVoltage]),Np)),out={};
 for(const [i,v] of [['d','P'],['q','Q']]){
  const ni=pm([g[i].ki,g[i].kp],Hi,Dp,Hv,[Zb]);
  const di=pa(pm([0,1],Hi,A),pm([g[i].ki,g[i].kp],Dp,Hv,[Zb]));out[i]=di;
  const dv=pa(pm(di,Dp),ps(pm(ni,Nc),-p.feedforwardCurrent));
  out[v]=pa(pm([0,1],Hv,dv),pm([g[v].ki,g[v].kp],ni,Np,[1/Zb]));
 }
 return out;
}
export function gfmSweep(p,g,mode='open',count=701,min=.00001){
 const max=p.fs/2,series=Object.fromEntries(loops.map(k=>[k,[]])),last={};
 for(let i=0;i<count;i++){
  const f=min*(max/min)**(i/(count-1)),z=gfmResponse(p,g,f)[mode];
  for(const k of loops){if(!Number.isFinite(z[k].re)||!Number.isFinite(z[k].im))throw Error('频响超出数值范围。');let phase=Math.atan2(z[k].im,z[k].re)*180/Math.PI;
   if(last[k]!==undefined){while(phase-last[k]>180)phase-=360;while(phase-last[k]<-180)phase+=360;}last[k]=phase;
   series[k].push({f,db:20*Math.log10(Math.max(1e-20,Math.hypot(z[k].re,z[k].im))),phase});
  }
 }
 return {min,max,series};
}
export function autoTuneGfm(p){
 validateGfmInput(p);
 const blank=()=>Object.fromEntries(loops.map(k=>[k,{kp:1,ki:1}]));let lastError='';
 for(let attempt=0;attempt<16;attempt++){
  const g=blank(),details={};
  function tune(k,cap,ratio){
   const trial={...g,[k]:{kp:1,ki:0}};
   const at=f=>{const z=gfmResponse(p,trial,f).open[k],mag=Math.hypot(z.re,z.im);let phase=Math.atan2(z.im,z.re)*180/Math.PI;if(phase>90)phase-=360;
    const kp=1/(mag*Math.sqrt(1+ratio*ratio));return {frequency:f,margin:180+phase-Math.atan(ratio)*180/Math.PI,kp,ki:kp*ratio*2*Math.PI*f};};
   let lo=cap*1e-7,best=at(lo);if(best.margin<p.pm)throw Error('低频相位不足。');
   for(let j=1;j<=200;j++){const hi=cap*10**(-7+7*j/200),candidate=at(hi);if(candidate.margin<p.pm){let upper=hi;for(let n=0;n<36;n++){const mid=Math.sqrt(lo*upper);if(at(mid).margin>=p.pm)lo=mid;else upper=mid;}best=at(lo);break;}lo=hi;best=candidate;}
   if(![best.kp,best.ki].every(x=>Number.isFinite(x)&&x>0))throw Error('增益超出数值范围。');g[k]={kp:best.kp,ki:best.ki};details[k]=best;
  }
  try{
   tune('d',Math.min(p.fi,p.fs/10)*.65**attempt,.2);g.q={...g.d};details.q={...details.d};
   tune('P',Math.min(p.fv,details.d.frequency/5)*.65**attempt,(p.considerScr===false||p.feedforwardCurrent===1)?.2:5);g.Q={...g.P};details.Q={...details.P};
   const sweep=gfmSweep(p,g,'open',1801,Math.min(.00001,details.P.frequency/100));
   for(const k of loops){const xs=crossings(sweep.series[k]);if(xs.length!==1||xs[0].margin<p.pm-.2)throw Error(k+' 环存在多次交越或裕度不足：'+JSON.stringify(xs));details[k]={...details[k],...xs[0],requested:['d','q'].includes(k)?p.fi:p.fv};}
   const stable=p.delaySamples===0?Object.fromEntries(Object.entries(gfmPolynomials(p,g)).map(([k,v])=>[k,isHurwitz(v)])):null;
   if(stable&&Object.values(stable).some(x=>!x))throw Error('Routh 校核未通过。');
   return {gains:g,loops:details,stability:stable,targetMargin:p.pm,policy:p.considerScr===false?'gfm-local-rc-ideal-decoupling-v1':'gfm-scalar-rc-grid-filtered-feedforward-v1'};
  }catch(e){lastError=e.message;}
 }
 throw Error('未找到通过当前模型校核的 PI：'+lastError+' 请检查前馈、测量滤波或降低目标交越。');
}
