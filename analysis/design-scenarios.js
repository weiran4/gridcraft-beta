import {sealDesign} from '../project/design-snapshot.js';
import {evaluateOfflineDesign} from './gfl-offline-evaluation.js';
const allowed=['activePowerW','reactivePowerVar','gridVoltagePu','dcVoltage','gridROhm','gridXOhm','L','R','gridCapacitanceF','gridCapResistanceOhm','filterCurrentMs','filterVoltageMs','filterPqMs','filterVdcMs','delaySamples'];
export function buildDesignScenarios(snapshot,ranges={}){
 const scenarios=[{id:'nominal',snapshot}];
 for(const [key,values]of Object.entries(ranges)){
  if(!allowed.includes(key)||!Array.isArray(values)||values.length>4||values.some(v=>!Number.isFinite(v)))throw Error('场景范围无效：'+key);
  if(key==='reactivePowerVar'&&snapshot.requirements.pointPolicy==='mode-reference'&&snapshot.resolvedModel.input.qMode==='Vac')throw Error('Vac 给定模式下 Q 为求解量，不能指定独立 Q 场景');
  for(const value of values){const next=structuredClone(snapshot);next.resolvedModel.input[key]=value;scenarios.push({id:key+'='+value,snapshot:sealDesign(next)});}
 }
 if(scenarios.length>33)throw Error('场景数超过 33');return scenarios;
}
export function assessDesignScenarios(snapshot,gains,scenarios,runtime={}){
 const results=[];for(const s of scenarios){if(runtime.isCancelled?.())break;const assessment=evaluateOfflineDesign({snapshot:s.snapshot,gains,policy:{frequencyPoints:161}},runtime);results.push({id:s.id,assessment});if(['budgetExceeded','cancelled'].includes(assessment.solveStatus))break;}
 return {results,evaluated:results.filter(x=>x.assessment.solveStatus==='completed').length,total:scenarios.length,continuousRangeProven:false,scope:'explicit nominal and one-at-a-time points; no unlisted combinations',allRecommended:results.length===scenarios.length&&results.every(x=>x.assessment.eligibility==='recommended')};
}
