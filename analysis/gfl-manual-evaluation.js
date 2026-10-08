/** Evaluate arbitrary user gains without searching or trusting stored certificates. */
import {evaluateGfl} from './gfl-linear-evaluation.js';
import {gflLinearModels} from './gfl-linear-model.js';
import {linearStepMetrics} from './gfl-step-metrics.js';
import {validateTuningRequest} from './gfl-model-input.js';
import {targetCheck} from './gfl-tuning-search.js';
import {tuningSnapshot} from '../project/gfl-tuning-state.js';
const keys=['d','q','P','Q'];
export function evaluateManualCandidate(input,gains,rawRequest={},record={}){
 const c={id:record.id??'manual-draft',name:record.name??'手动试调（未应用）',source:'manual',gains:structuredClone(gains),factSnapshot:tuningSnapshot(input),
  verified:false,requirementsMet:false,targetStatus:'notSatisfied',unmet:[],evaluation:null,conditionsChanged:Boolean(record.factSnapshot&&record.factSnapshot!==tuningSnapshot(input))};
 try{
  if(record.mode&&record.mode!==`${input.dMode}/${input.qMode}`)throw Error('已保存方案的控制模式不同，不能跨模式应用。');
  const check=validateTuningRequest(rawRequest),request=check.request;
  c.evaluation=evaluateGfl(input,gains,{includeSeries:true,count:2001});
  if(input.delaySamples===0){const models=gflLinearModels(input,gains);for(const k of keys)c.evaluation.loops[k].step=linearStepMetrics(models[k],{includePoints:false});}
  c.verified=c.evaluation.stability.status==='stable'&&keys.every(k=>c.evaluation.loops[k].step.status==='ok');
  if(!c.verified)c.unmet.push('稳定性或时域校核未完成：可保存试验参数，但不能作为通过校核的方案应用。');
  if(!check.valid)c.unmet.push(...check.errors.map(e=>e.message));
  else{
   const target=targetCheck(c.evaluation,request);c.targetStatus=target.targetStatus;c.unmet.push(...target.unmet);
   const refined=evaluateGfl(input,gains,{count:3201});
   for(const k of keys){const l=c.evaluation.loops[k],r=refined.loops[k];
    if(l.crossings.length!==1||r.crossings.length!==1||l.nearTangency||r.nearTangency||l.scanStatus!=='ok'||r.scanStatus!=='ok')c.unmet.push(`${k} 交越不唯一或频域校核未完成`);
    else if(Math.abs(l.crossings[0].frequency/r.crossings[0].frequency-1)>.002)c.unmet.push(`${k} 交越精度未确认`);
    if(l.minMargin===null||l.minMargin<request.minMargin-.005)c.unmet.push(`${k} 相位裕度低于设定下限`);
   }
   for(const [outer,inner]of [['P','d'],['Q','q']]){
    const a=c.evaluation.loops[outer].crossings[0]?.frequency,b=c.evaluation.loops[inner].crossings[0]?.frequency;
    if(!(a<=b/request.separationRatio*1.0001))c.unmet.push(`${outer} 内外环交越比未满足`);
   }
  }
  c.requirementsMet=c.verified&&check.valid&&c.unmet.length===0;
  if(!c.requirementsMet)c.targetStatus='notSatisfied';
 }catch(error){c.unmet.push(error.message);c.error=error.message;}
 return c;
}
