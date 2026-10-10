/** Ascending polynomials for the existing rated-point scalar model, Td = 0. */
import {outerModels} from './gfl-outer.js';
import {measurementFilters} from './measurement-filters.js';
import {validateGains} from './gfl-frequency.js';
import {modelFacts,validateModelFacts} from './gfl-model-input.js';
import {eigenvalues} from './eigenvalues.js';
export const trim=a=>{const b=[...a];while(b.length>1&&b.at(-1)===0)b.pop();return b;};
export const polyAdd=(a,b)=>trim(Array.from({length:Math.max(a.length,b.length)},(_,i)=>(a[i]||0)+(b[i]||0)));
export const polyMul=(...arrays)=>arrays.reduce((a,b)=>{const out=Array(a.length+b.length-1).fill(0);a.forEach((v,i)=>b.forEach((w,j)=>out[i+j]+=v*w));return trim(out);},[1]);
export function polynomialAt(a,re,im){let r=0,i=0;for(let n=a.length-1;n>=0;n--){const next=r*re-i*im+a[n];i=r*im+i*re;r=next;}return {re:r,im:i};}
export function transferAt(m,hz){const w=2*Math.PI*hz,a=polynomialAt(m.numerator,0,w),b=polynomialAt(m.denominator,0,w),s=Math.max(Math.abs(b.re),Math.abs(b.im));if(s===0)return {re:NaN,im:NaN};const r=b.re/s,i=b.im/s,d=r*r+i*i;return {re:((a.re/s)*r+(a.im/s)*i)/d,im:((a.im/s)*r-(a.re/s)*i)/d};}
export function dcGain(m){const ni=m.numerator.findIndex(x=>x!==0),di=m.denominator.findIndex(x=>x!==0);if(di<0)return NaN;if(ni<0||ni>di)return 0;if(ni<di)return Infinity;return m.numerator[ni]/m.denominator[di];}
const controller=g=>g.ki===0?{n:[g.kp],d:[1]}:{n:[g.ki,g.kp],d:[0,1]};
export function gflLinearModels(input,gains){
 validateModelFacts(input);validateGains(gains);
 if(input.delaySamples!==0)throw Error('非零纯延时不支持零延时多项式验证。');
 const p=modelFacts(input),h=measurementFilters(p),outer=outerModels(p),Z=p.voltageLL**2/p.ratedVA;
 const Hi=[1,h.current.seconds],Hv=p.considerScr?[1,h.voltage.seconds]:[1];
 const C=p.considerScr?p.gridCapacitanceF:0,rg=p.gridROhm??0,lg=(p.gridXOhm??0)/(2*Math.PI*p.frequencyHz);
 const Nc=C>0?[1,p.gridCapResistanceOhm*C]:[1],Dp=C>0?[1,C*(p.gridCapResistanceOhm+rg),C*lg]:[1];
 const A=p.considerScr?polyAdd(polyMul([p.R,p.L],Dp,Hv),polyMul([0,h.voltage.seconds],Nc,[rg,lg])):[p.R,p.L];
 const result={};
 for(const [i,k]of [['d','P'],['q','Q']]){
  const ci=controller(gains[i]),co=controller(gains[k]),m=outer[k],Ho=[1,h[m.filter].seconds];
  const ni=polyMul(ci.n,[Z],Dp,Hv),di=polyMul(ci.d,A,Hi),den=polyAdd(di,ni);
  result[i]={numerator:polyMul(ni,Hi),denominator:den,openNumerator:ni,openDenominator:di,measurementNumerator:ni,measurementDenominator:den,filterSeconds:h.current.seconds};
  // Hg=Nc/Dp cancels the known Dp numerator factor algebraically, not by
  // approximate pole/zero cancellation. Vdc uses bridge rather than grid current.
  const branch=polyMul(ci.n,[Z],Hi,Hv,p.considerScr&&m.label!=='Vdc'?Nc:Dp);
  const no=polyMul(co.n,branch,[m.gain]),dopen=polyMul(co.d,m.integrator?[0,1]:[1],den,Ho),dout=polyAdd(dopen,no);
  result[k]={numerator:polyMul(no,Ho),denominator:dout,openNumerator:no,openDenominator:dopen,measurementNumerator:no,measurementDenominator:dout,filterSeconds:h[m.filter].seconds};
 }
 return result;
}
export function scaledPolynomial(coefficients){
 const c=trim(coefficients);if(!c.length||c.some(x=>!Number.isFinite(x))||c.at(-1)===0)throw Error('无效闭环多项式。');
 const n=c.length-1,nonzero=c.map((v,i)=>[v,i]).filter(([v])=>v!==0),first=nonzero[0];
 let scale=n>first[1]?Math.exp((Math.log(Math.abs(first[0]))-Math.log(Math.abs(c[n])))/(n-first[1])):1;
 if(!(scale>0)||!Number.isFinite(scale))throw Error('多项式尺度不可计算。');
 const logs=c.map((v,i)=>v===0?-Infinity:Math.log(Math.abs(v))+i*Math.log(scale)),max=Math.max(...logs);
 const a=c.map((v,i)=>v===0?0:Math.sign(v)*Math.exp(logs[i]-max));
 if(a.at(-1)===0||a.some(x=>!Number.isFinite(x)))throw Error('多项式尺度超出范围。');
 return {coefficients:a,scale};
}
export function polynomialPoles(coefficients){
 const {coefficients:c,scale}=scaledPolynomial(coefficients),n=c.length-1;if(n===0)return [];
 if(n===1)return [{re:c[0]===0?0:-c[0]/c[1]*scale,im:0}];
 const A=Array.from({length:n},()=>Array(n).fill(0));for(let i=0;i<n-1;i++)A[i][i+1]=1;for(let j=0;j<n;j++)A[n-1][j]=-c[j]/c[n];
 const roots=eigenvalues(A);
 for(const root of roots){const r=polynomialAt(c,root.re,root.im),a=Math.hypot(root.re,root.im);let bound=0;for(let j=n;j>=0;j--)bound=bound*a+Math.abs(c[j]);if(Math.hypot(r.re,r.im)>1e-7*Math.max(bound,1e-300))throw Error('极点数值残差过大；稳定性未确认。');}
 return roots.map(z=>({re:z.re*scale,im:z.im*scale}));
}
export function poleStability(denominator){
 try{const poles=polynomialPoles(denominator),unstable=poles.some(z=>z.re>1e-9*Math.max(1e-6,Math.hypot(z.re,z.im))),marginal=poles.some(z=>Math.abs(z.re)<=1e-9*Math.max(1e-6,Math.hypot(z.re,z.im)));
  return {status:unstable?'unstable':marginal?'marginal':'stable',poles};
 }catch(error){return {status:'numericalFailure',poles:null,message:error.message};}
}
