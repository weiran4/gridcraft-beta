/** Data-only dispatcher shared by mainline evaluate, search and application check. */
import {evaluateGflMainline,isGflEvaluationCacheEntry} from '../analysis/gfl-mainline-evaluation.js';
import {searchGflCandidates} from '../analysis/gfl-tuning-search.js';
import {rankGflMainlineCandidates} from '../analysis/gfl-mainline-ranking.js';
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const duration=value=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(25000,value)):25000;
export function createGflWorkerRuntime({now=()=>performance.now(),onProgress=()=>{},isCancelled=()=>false,cache=new Map(),maxMilliseconds=25000}={}){
 const started=now();return {now,deadlineMs:started+duration(maxMilliseconds),isCancelled,onProgress,cache};
}
const exportBudgetMessage='计算时间预算耗尽（Worker 导出）。';
function expireEvaluation(result){
 result.solveStatus='budgetExceeded';result.responseQuality='budgetExceeded';result.evaluationFingerprint=null;
 result.application={eligible:false,reasons:[...new Set([...(result.application?.reasons??[]),exportBudgetMessage])]};
 result.targetResult={...result.targetResult,group:'unmet',unmet:[...new Set([...(result.targetResult?.unmet??[]),exportBudgetMessage])]};
 result.diagnostics??=[];if(!result.diagnostics.some(d=>d.code==='budgetExceeded'))result.diagnostics.push({code:'budgetExceeded',severity:'error',message:exportBudgetMessage});
}
function expireJob(result,kind,runtime,maxMilliseconds){
 if(kind!=='search'){expireEvaluation(result);return;}
 result.searchStatus='budgetExceeded';result.targetStatus='notSatisfied';if(result.completionScope)result.completionScope={...result.completionScope,complete:false};
 const candidates=[...new Map([...(result.candidates??[]),...(result.diagnosticCandidates??[]),...Object.values(result.ranking?.fronts??{}).flat()].map(c=>[c.id,c])).values()];
 for(const candidate of candidates){candidate.incompleteSearch=true;candidate.diagnosticOnly=true;candidate.verified=false;candidate.requirementsMet=false;candidate.targetStatus='notSatisfied';candidate.unmet=[...new Set([...(candidate.unmet??[]),exportBudgetMessage])];if(candidate.mainlineEvaluation)expireEvaluation(candidate.mainlineEvaluation);}
 if(result.ranking){const ranking=rankGflMainlineCandidates(candidates,result.request);result.ranking={fronts:ranking.fronts,diagnostics:ranking.diagnostics,rankingPolicyId:ranking.rankingPolicyId};result.diagnosticCandidates=candidates;}
 result.budget.elapsedMilliseconds=Math.max(result.budget.elapsedMilliseconds??0,runtime.now()-(runtime.deadlineMs-duration(maxMilliseconds)));
 result.diagnostics.push({code:'budgetExceeded',severity:'error',message:exportBudgetMessage});
}
export function createGflAnalysisDispatcher({postMessage,now=()=>performance.now()}={}){
 return data=>{
  if(data?.type!=='run')return;
  const {requestId,requestKey,kind}=data,prepare=event=>freeze(structuredClone({...event,requestId,requestKey})),send=event=>postMessage(prepare(event));
  try{
   if(!['evaluate','search','apply-check'].includes(kind))throw Error('未支持的分析任务。');
   const cache=new Map(),runtime=createGflWorkerRuntime({now,cache,maxMilliseconds:data.payload?.options?.maxMilliseconds,onProgress:progress=>send({type:'progress',progress})});
   const payload=freeze(structuredClone(data.payload));
   for(const entry of Array.isArray(data.cacheEntries)?data.cacheEntries:[]){if(isGflEvaluationCacheEntry(entry)){cache.set(entry.key,freeze(structuredClone(entry)));while(cache.size>8)cache.delete(cache.keys().next().value);}}
   const importedEntries=[...cache.values()];
   send({type:'started'});
   const result=kind==='search'?searchGflCandidates(payload.snapshot?.input??payload.input,payload.request,payload.baselineGains??payload.gains??null,
    {...payload.options,snapshot:payload.snapshot,experiments:payload.experiments,policy:payload.policy,dqSettings:payload.dqSettings,runtime,isCancelled:runtime.isCancelled,onProgress:runtime.onProgress}):evaluateGflMainline(payload,runtime);
   if(result.solveStatus==='cancelled'||result.searchStatus==='cancelled'){send({type:'cancelled'});return;}
   const completeSearch=kind!=='search'||(result.completionScope?result.completionScope.complete:['feasibleFound','targetNotMet','noCandidateFound'].includes(result.searchStatus));
   // Interrupted searches cannot upgrade their selected diagnostic candidates
   // into a reusable completed-result certificate. Preserve only prior evidence.
   const reusable=completeSearch?[...cache.values()]:importedEntries,expired=()=>runtime.now()>=runtime.deadlineMs;
   const cacheEntries=[];
   for(const entry of reusable){if(expired())break;if(isGflEvaluationCacheEntry(entry))cacheEntries.push(entry);if(expired())break;}
   let terminal=expired()?null:prepare({type:'result',result,cacheEntries:cacheEntries.slice(-8)});
   // Filtering, structured cloning and deep freezing all consume the same job
   // budget. Check after preparing transport, immediately before success publish.
   if(!terminal||expired()){expireJob(result,kind,runtime,payload.options?.maxMilliseconds);terminal=prepare({type:'result',result,cacheEntries:importedEntries});}
   postMessage(terminal);
  }catch(error){send({type:'error',message:error.message});}
 };
}
// A synchronous CPU loop cannot process a cancel message. Its owning client must
// terminate this Worker and fence its generation; Runtime checks enforce budget.
if(typeof self!=='undefined'&&typeof self.postMessage==='function')self.onmessage=({data})=>createGflAnalysisDispatcher({postMessage:message=>self.postMessage(message)})(data);
