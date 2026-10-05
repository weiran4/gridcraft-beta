// Scalar electrical-network extension. Ideal angle/decoupling; no PLL.
import {measurementFilters} from './measurement-filters.js?v=filters1';
import {outerModels} from './gfl-outer.js?v=scr1';
const add=(a,b)=>({re:a.re+b.re,im:a.im+b.im}),mul=(a,b)=>({re:a.re*b.re-a.im*b.im,im:a.re*b.im+a.im*b.re}),div=(a,b)=>{const d=b.re*b.re+b.im*b.im;return {re:(a.re*b.re+a.im*b.im)/d,im:(a.im*b.re-a.re*b.im)/d};},one={re:1,im:0};
export function validateGflGrid(p){if(p.gridError)throw Error(p.gridError);for(const k of ['gridROhm','gridXOhm','gridCapacitanceF','gridCapResistanceOhm'])if(!Number.isFinite(p[k])||p[k]<0)throw Error('SCR 分析需要有效的电网及 RC 参数：'+k);if(!(p.frequencyHz>0))throw Error('系统频率必须大于 0。');}
export function gflGridResponse(p,g,hz){
 validateGflGrid(p);const w=2*Math.PI*hz,Z=p.voltageLL**2/p.ratedVA,h=measurementFilters(p),H=key=>div(one,{re:1,im:w*h[key].seconds}),D={re:Math.cos(-w*p.delaySamples/p.fs),im:Math.sin(-w*p.delaySamples/p.fs)},zg={re:p.gridROhm,im:w*p.gridXOhm/(2*Math.PI*p.frequencyHz)},zl={re:p.R,im:w*p.L};
 let zp=zg,hg=one;if(p.gridCapacitanceF>0){const zc={re:p.gridCapResistanceOhm,im:-1/(w*p.gridCapacitanceF)};hg=div(zc,add(zc,zg));zp=mul(zg,hg);}
 const dh=mul(D,H('voltage')),A=add(zl,mul({re:1-dh.re,im:-dh.im},zp));A.re/=Z;A.im/=Z;
 const C=k=>({re:g[k].kp,im:-g[k].ki/w}),open={},closed={};
 for(const k of ['d','q']){const f=div(mul(C(k),D),A);open[k]=mul(f,H('current'));closed[k]=div(f,add(one,open[k]));}
 for(const [k,i]of [['P','d'],['Q','q']]){const m=outerModels(p)[k],measurement=m.label==='Vdc'?one:hg,plant=m.integrator?{re:0,im:-m.gain/w}:{re:m.gain,im:0},f=mul(mul(mul(C(k),closed[i]),measurement),plant);open[k]=mul(f,H(m.filter));closed[k]=div(f,add(one,open[k]));}
 return {open,closed};
}
const pa=(a,b)=>Array.from({length:Math.max(a.length,b.length)},(_,i)=>(a[i]||0)+(b[i]||0)),pm=(...arrays)=>arrays.reduce((a,b)=>{const o=Array(a.length+b.length-1).fill(0);a.forEach((x,i)=>b.forEach((y,j)=>o[i+j]+=x*y));return o;},[1]);
export function gflGridPolynomials(p,g){
 validateGflGrid(p);const Z=p.voltageLL**2/p.ratedVA,h=measurementFilters(p),Hi=[1,h.current.seconds],Hv=[1,h.voltage.seconds],C=p.gridCapacitanceF,Rg=p.gridROhm,Lg=p.gridXOhm/(2*Math.PI*p.frequencyHz),Nc=C>0?[1,p.gridCapResistanceOhm*C]:[1],Dp=C>0?[1,C*(p.gridCapResistanceOhm+Rg),C*Lg]:[1],Np=pm(Nc,[Rg,Lg]);
 const A=pa(pm([p.R,p.L],Dp,Hv),pm([0,h.voltage.seconds],Np)),out={},m=outerModels(p);
 for(const [i,k]of [['d','P'],['q','Q']]){const ci=[g[i].ki,g[i].kp];out[i]=pa(pm([0,1],Hi,A),pm(ci,[Z],Dp,Hv));const n=pm(ci,[Z],Hi,Hv,m[k].label==='Vdc'?Dp:Nc);out[k]=pa(pm(m[k].integrator?[0,0,1]:[0,1],[1,h[m[k].filter].seconds],out[i]),pm([g[k].ki,g[k].kp],[m[k].gain],n));}
 return out;
}
