/** Normalized reference-step deviations, never a physical 0-to-rated startup.
 * Reuses the SAME physical-output model and solver as the advisor metrics.
 * No project writes, new plant model, retuning, nonlinear or pure-delay solver.
 */
import {validateModelFacts} from './gfl-model-input.js';
import {gflLinearModels} from './gfl-linear-model.js';
import {linearStepMetrics} from './gfl-step-metrics.js';
const empty=(status,message='')=>({status,message,points:[],finalError:null});
export function buildStepPreview({input,currentGains=null,candidateGains=null,loop='d'}){
 if(!['d','q','P','Q'].includes(loop))throw Error('请选择有效的控制环。');
 let problem;
 try{validateModelFacts(input);}catch(error){problem=empty('invalidInput',error.message);}
 function response(gains){
  if(problem)return {...problem};
  if(!gains)return empty('missingGains');
  if(input.delaySamples!==0)return empty('unsupportedDelay');
  try{
   const result=linearStepMetrics(gflLinearModels(input,gains)[loop]);
   return {...result,points:result.status==='ok'?result.points:[],finalError:result.status==='ok'?1-result.dcGain:null};
  }catch(error){return empty('numericalFailure',error.message);}
 }
 return {loop,reference:1,current:response(currentGains),candidate:response(candidateGains)};
}
