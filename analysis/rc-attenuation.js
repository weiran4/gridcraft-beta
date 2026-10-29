import {prepareResonance,impedanceAt} from './resonance.js';
import {rcDesignContext} from './rc-filter.js';

// Passive, balanced per-phase network. A 1 V bridge harmonic is Norton-equivalent
// to 1/Zf injected at its AC node; all other ideal voltage sources are zeroed.
// Thus H = Zdriving/Zf, including the selected inverter's grounded filter branch.
export function prepareRcAttenuation(project,rcId,ibrId,proposal=null,scope='network'){
 rcDesignContext(project,rcId,ibrId);
 if(!['network','local'].includes(scope))throw Error('未知校核网络。');
 const draft=structuredClone(project),ibr=draft.components.find(c=>c.id===ibrId),rc=draft.components.find(c=>c.id===rcId);
 if(proposal)Object.assign(rc.parametersSI,proposal);
 const R=ibr.parametersSI.filterResistanceOhm,L=ibr.parametersSI.filterInductanceH;
 if(!Number.isFinite(R)||R<0||!Number.isFinite(L)||L<=0)throw Error('谐波校核要求 Lf > 0、Rf ≥ 0。');
 if(scope==='local'){
  draft.components=[ibr,rc];draft.wires=[{id:'local',from:ibrId+'.AC',to:rcId+'.AC'}];
 }
 const network=prepareResonance(draft,rcId);
 return {network,R,L,scope,components:network.components};
}
export function rcAttenuationAt(model,frequencyHz){
 const z=impedanceAt(model.network,frequencyHz),x=2*Math.PI*frequencyHz*model.L,d=model.R**2+x*x;
 if(z.singular)return {frequencyHz,magnitude:Infinity,db:Infinity,singular:true};
 const re=(z.re*model.R+z.im*x)/d,im=(z.im*model.R-z.re*x)/d,magnitude=Math.hypot(re,im);
 return {frequencyHz,magnitude,db:magnitude===0?-Infinity:20*Math.log10(magnitude),singular:false};
}
export function sweepRcAttenuation(model,minHz,maxHz,points=241){
 if(!Number.isFinite(minHz)||minHz<=0||!Number.isFinite(maxHz)||maxHz<=minHz||!Number.isInteger(points)||points<2||points>2001)throw Error('请输入有效扫频范围。');
 return Array.from({length:points},(_,i)=>rcAttenuationAt(model,minHz*(maxHz/minHz)**(i/(points-1))));
}
