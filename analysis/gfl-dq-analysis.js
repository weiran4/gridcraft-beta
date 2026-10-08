import {gflDqModel,dqModelVersion} from './gfl-dq-model.js';
import {eigenvalues} from './eigenvalues.js';
import {frequencyMatrix} from './port-response.js';
const labels={d:'Δy₁ / Δr₁',q:'Δy₁ / Δr₂（交叉）',P:'Δy₂ / Δr₁（交叉）',Q:'Δy₂ / Δr₂'};
export function analyzeGflDq(input,gains,options={},settings={}){
 const model=gflDqModel(input,gains,options),poles=eigenvalues(model.A),alpha=poles[0].re;
 const poleStatus=alpha>1e-6?'unstable':alpha< -1e-6?'stable':'marginal';
 const port={A:model.A,B:model.B.map(row=>row.slice(0,2)),C:model.C.slice(0,2),D:model.D.slice(0,2).map(row=>row.slice(0,2))};
 const switching=input.switchingFrequencyHz,upper=Math.min(input.fs/10,Number.isFinite(switching)&&switching>0?switching/10:Infinity);
 const result={status:'ok',poleStatus,alpha,poles,order:model.names.length,residual:model.residual,jacobianError:model.jacobianError,
  delayModel:model.delayModel,applicationEligible:poleStatus==='stable'&&model.delayModel==='none',
  model:{version:dqModelVersion,names:model.names,x0:model.x0,A:model.A,B:model.B,C:model.C,D:model.D,inputNames:model.inputNames,outputNames:model.outputNames,
   op:model.op,pll:model.pll,dcDynamic:model.dcDynamic,dcAssumption:model.dcAssumption,delaySeconds:model.delaySeconds,controlStepSeconds:model.controlStepSeconds},
  scope:{balancedOnly:true,singleLclBranch:true,operatingPoint:'high-voltage PCC P/Q solution',sourceVoltage:'nominal 1 pu unless explicitly supplied',
   discreteController:false,switchingWaveforms:false,currentLimits:false,modulationLimits:false,ieeeCertifiedModel:false,frequencyUpperHz:upper,
   frequencyUpperRule:'one tenth of control/PWM frequency, when provided; engineering display range, not an accuracy proof'}};
 if(settings.includeSeries!==false){
  const min=.01,max=upper,count=settings.count??151;
  if(!(max>min))throw Error('频率范围过小；请核对控制周期。');
  const series=Object.fromEntries(Object.keys(labels).map(k=>[k,[]])),last={};
  for(let i=0;i<count;i++){
   const f=min*(max/min)**(i/(count-1)),h=frequencyMatrix(port,f);
   for(const [key,row,col]of [['d',0,0],['q',0,1],['P',1,0],['Q',1,1]]){
    const z=h[row][col];if(!Number.isFinite(z.re)||!Number.isFinite(z.im))throw Error('dq 联立频响溢出。');
    let phase=Math.atan2(z.im,z.re)*180/Math.PI;
    if(last[key]!==undefined){while(phase-last[key]>180)phase-=360;while(phase-last[key]<-180)phase+=360;}last[key]=phase;
    series[key].push({f,db:20*Math.log10(Math.max(1e-20,Math.hypot(z.re,z.im))),phase});
   }
  }
  result.sweep={min,max,series};result.labels=labels;
 }
 return result;
}
export function assertDqApplication(input,gains,options={}){
 if(!options.enabled)return {status:'notEnabled'};
 const r=analyzeGflDq(input,gains,options,{includeSeries:false});
 if(r.delayModel!=='none')throw Error('dq/PLL 含 Padé 延时近似；当前不把近似通过视为可直接应用的精确验证。');
 if(!r.applicationEligible)throw Error('dq/PLL 联立模型未稳定，不能把单轴候选作为已通过推荐应用。最大极点实部 '+r.alpha.toPrecision(5)+' s⁻¹。');
 return {status:'stable',alpha:r.alpha,version:dqModelVersion,configuration:{...options},scope:'averaged balanced dq only; no limits/HIL validation'};
}
