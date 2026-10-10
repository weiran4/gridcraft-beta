/** Arbitrary trial gains are evaluated with the GFM plant and selected forming mode. */
import {evaluateGfm,checkGfmRequirements} from './gfm-tuning-advisor.js';
import {validateTuningRequest} from './gfl-model-input.js';
import {tuningSnapshot} from '../project/gfl-tuning-state.js';
export const gfmManualFacts=({input,settings})=>({input,mode:settings.mode,modeParameters:settings.modes[settings.mode]});
export function evaluateGfmManualCandidate({input,settings,gains,request={},record={}}){
 const factSnapshot=tuningSnapshot(gfmManualFacts({input,settings}));
 const c={id:record.id??'manual-draft',name:record.name??'手动试调（未应用）',source:'manual',mode:settings.mode,gains:structuredClone(gains),factSnapshot,
  verified:false,requirementsMet:false,targetStatus:'notSatisfied',unmet:[],evaluation:null,conditionsChanged:Boolean(record.factSnapshot&&record.factSnapshot!==factSnapshot)};
 try{
  if(record.mode&&record.mode!==settings.mode)throw Error('已保存方案的成网模式不同，不能跨模式应用。');
  const check=validateTuningRequest(request);
  c.evaluation=evaluateGfm(input,gains,settings.mode,settings.modes[settings.mode],{includeSeries:true,count:2001});
  c.verified=c.evaluation.verified;
  if(!check.valid)c.unmet=check.errors.map(e=>e.message);
  else Object.assign(c,checkGfmRequirements(c.evaluation,check.request));
  // Require consistent crossings on a finer grid, just as automatic search does.
  const refined=evaluateGfm(input,gains,settings.mode,settings.modes[settings.mode],{count:3201,includeStep:false,includeCoupled:false});
  for(const k of ['d','q','P','Q']){const a=c.evaluation.loops[k],b=refined.loops[k];
   if(b.crossings.length!==1||b.nearTangency||b.scanStatus!=='ok'||a.crossings.length!==1||Math.abs(a.crossings[0].frequency/b.crossings[0].frequency-1)>.002)c.unmet.push(`${k} 交越精度未确认`);
  }
  c.requirementsMet=check.valid&&c.verified&&c.unmet.length===0;
  if(!c.requirementsMet)c.targetStatus='notSatisfied';
 }catch(error){c.unmet.push(error.message);c.error=error.message;c.verified=false;c.requirementsMet=false;}
 return c;
}
