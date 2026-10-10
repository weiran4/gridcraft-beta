/** UI-side ownership only. Numerical work and target checks belong to Workers. */
import {gflFingerprint} from '../analysis/gfl-analysis-contract.js';
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const requestFields=['mode','focus','minMargin','preferredMargin','separationRatio','tolerance','allowReduction','fi','fp','minimumFi','minimumFp','maxOvershootPercent','maxSettlingSeconds','maxSteadyStateErrorPercent','currentTargets','crossAxisLimits'];
function canonicalData(value,seen=new Set()){
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
 if(!value||typeof value!=='object'||(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))||seen.has(value))throw Error('分析数值数据须为有限、无循环的 JSON 数据。');
 seen.add(value);for(const child of Array.isArray(value)?Array.from(value):Object.values(value))canonicalData(child,seen);seen.delete(value);
}
function numericalPayload(kind,payload){
 const fields=kind==='search'?['snapshot','input','baselineGains','gains','experiments','policy','dqSettings','options']:['snapshot','gains','experiments','policy'];
 const copy=Object.fromEntries(fields.filter(k=>Object.hasOwn(payload,k)&&payload[k]!==undefined).map(k=>[k,payload[k]]));
 copy.request=Object.fromEntries(requestFields.filter(k=>Object.hasOwn(payload.request??{},k)).map(k=>[k,payload.request[k]]));
 return structuredClone(copy);
}

/** Completed evidence is copied into replacement Workers, never read from a
 * terminated Worker's private memory. At most eight numerical results survive. */
export function createGflAnalysisClient({workerFactory,onEvent}){
 let sequence=0,pending=null,destroyed=false,last=null;
 const cache=new Map(),emit=data=>onEvent(freeze(structuredClone(data)));
 const stop=()=>{const owner=pending;pending=null;owner?.worker.terminate();};
 return {
  get busy(){return pending!==null;},
  start(job){
   if(destroyed)return;
   let payload,identity,rawIdentity;
   try{
    if(!['evaluate','search','apply-check'].includes(job?.kind)||typeof job.requestKey!=='string'||!job.requestKey||!job.payload||typeof job.payload!=='object')throw Error('分析任务须提供种类、请求键和不可变数据。');
    payload=numericalPayload(job.kind,job.payload);canonicalData(payload);identity=gflFingerprint('request',{kind:job.kind,payload});rawIdentity=gflFingerprint('request',{kind:job.kind,payload:job.payload});
    // An explicit repeat is a fresh generation. Only a changed display decoration
    // with identical numerical data is a rendering-only update.
    if(last?.identity===identity&&last.rawIdentity!==rawIdentity){last={identity,rawIdentity};return;}
   }catch(error){stop();++sequence;last=null;emit({type:'error',requestId:sequence,requestKey:job?.requestKey,message:error.message});return;}
   stop();const requestId=++sequence,requestKey=job.requestKey;last={identity,rawIdentity};
   try{
    const worker=workerFactory(),owner={worker,requestId,requestKey};pending=owner;
    const current=data=>!destroyed&&pending===owner&&data.requestId===requestId&&data.requestKey===requestKey;
    worker.onmessage=({data})=>{
     if(!current(data)||!['started','progress','result','error','cancelled'].includes(data.type))return;
     if(data.type==='started')return; // UI publishes start before posting, including synchronous test transports.
     if(data.type==='result'){
      // Only cache entries produced by the current Worker are retained. The
      // evaluator checks their exact scope/evidence again inside the next Worker.
      for(const entry of Array.isArray(data.cacheEntries)?data.cacheEntries:[]){
       if(typeof entry?.key!=='string'||entry.evidence?.solveStatus!=='completed')continue;
       const copy=freeze(structuredClone(entry));cache.delete(copy.key);cache.set(copy.key,copy);
       while(cache.size>8)cache.delete(cache.keys().next().value);
      }
     }
     if(['result','error','cancelled'].includes(data.type))stop();
     const {cacheEntries,result,...event}=data;emit(data.type==='result'?{...event,result}:event);
    };
    worker.onerror=e=>{if(destroyed||pending!==owner)return;stop();emit({type:'error',requestId,requestKey,message:e.message||'分析 Worker 失败'});};
    emit({type:'started',requestId,requestKey});
    if(pending===owner)worker.postMessage({type:'run',kind:job.kind,requestId,requestKey,payload,cacheEntries:structuredClone([...cache.values()])});
   }catch(error){stop();last=null;emit({type:'error',requestId,requestKey,message:error.message});}
   return requestId;
  },
  invalidate(reason='输入已改变，旧分析已过期。'){if(destroyed)return;const requestKey=pending?.requestKey;stop();++sequence;last=null;emit({type:'stale',requestId:sequence,requestKey,message:reason});},
  cancel(){if(destroyed)return;const requestKey=pending?.requestKey,requestId=pending?.requestId;stop();++sequence;last=null;emit({type:'cancelled',requestId:requestId??sequence,requestKey,message:'已取消分析；现有 PI 保持不变。'});},
  destroy(){if(destroyed)return;destroyed=true;stop();++sequence;last=null;cache.clear();}
 };
}
