/** Evaluate arbitrary user gains without searching or trusting stored certificates. */
import {evaluateGflMainline} from './gfl-mainline-evaluation.js';
import {tuningSnapshot} from '../project/gfl-tuning-state.js';
export function evaluateManualCandidate(input,gains,rawRequest={},record={},options={}){
 const c={id:record.id??'manual-draft',name:record.name??'手动试调（未应用）',source:'manual',gains:structuredClone(gains),factSnapshot:tuningSnapshot(input),
  verified:false,requirementsMet:false,targetStatus:'notSatisfied',unmet:[],evaluation:null,conditionsChanged:Boolean(record.factSnapshot&&record.factSnapshot!==tuningSnapshot(input))};
 try{
  if(record.mode&&record.mode!==`${input.dMode}/${input.qMode}`)throw Error('已保存方案的控制模式不同，不能跨模式应用。');
  const result=evaluateGflMainline({snapshot:options.snapshot??{modelId:'legacy-scalar',input},gains,request:rawRequest,experiments:options.experiments,policy:options.policy},options.runtime);
  const legacy=result.modelId==='legacy-scalar';c.evaluation=legacy?result.legacyEvaluation??null:result;
  c.verified=legacy?result.legacyVerified===true:result.solveStatus==='completed'&&result.stability.status==='stable'&&result.responseQuality==='completed'&&result.model?.delayRepresentation.approximate===false;
  c.requirementsMet=result.application.eligible;c.unmet=[...result.targetResult.unmet];
  if(result.solveStatus!=='completed')c.unmet.push(...result.diagnostics.map(d=>d.message));
  c.unmet=[...new Set(c.unmet)];
  c.targetStatus=legacy?result.legacyTargetStatus??'notSatisfied':!c.requirementsMet?'notSatisfied':result.targetResult.group==='reduced'?'partiallySatisfied':result.targetResult.request.mode==='automatic'?'notSpecified':'satisfied';
  if(result.solveStatus!=='completed'){c.error=result.diagnostics[0]?.message;}
 }catch(error){c.unmet.push(error.message);c.error=error.message;}
 return c;
}
