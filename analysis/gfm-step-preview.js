/** GFM current/voltage scalar step preview. Forming commands are frozen;
 * the selected-mode coupled stability result remains a SEPARATE check.
 * Uses the same model and solver as the GFM advisor's existing time metrics.
 */
import {gfmFacts,gfmLinearModels} from './gfm-tuning-advisor.js';
import {linearStepMetrics} from './gfl-step-metrics.js';
const keys=['d','q','P','Q'];
const empty=(status,message='')=>({status,message,points:[],finalError:null});
export function buildGfmStepPreview({input,currentGains=null,candidateGains=null}){
 let error;try{gfmFacts(input);}catch(e){error=e.message;}
 function responses(gains){
  let model,issue=error;try{if(gains&&!issue&&input.delaySamples===0)model=gfmLinearModels(input,gains);}catch(e){issue=e.message;}
  return Object.fromEntries(keys.map(k=>{
   if(!gains)return [k,empty('missingGains')];
   if(issue)return [k,empty('invalidInput',issue)];
   if(input.delaySamples!==0)return [k,empty('unsupportedDelay')];
   const r=linearStepMetrics(model[k]);return [k,{...r,points:r.status==='ok'?r.points:[],finalError:r.status==='ok'?1-r.dcGain:null}];
  }));
 }
 const current=responses(currentGains),candidate=responses(candidateGains);
 return {loops:Object.fromEntries(keys.map(k=>[k,{reference:1,current:current[k],candidate:candidate[k]}]))};
}
