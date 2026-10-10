import {createGflAnalysisClient} from './gfl-analysis-client.js';
/** UI-side worker lifecycle. Does not own project storage or apply gains. */
export function createTuningClient({workerFactory,onEvent}){
 let sequence=0,pending=null,destroyed=false,mainline=false;
 const analysis=createGflAnalysisClient({workerFactory,onEvent:event=>{const snapshotKey=event.requestKey;onEvent(Object.freeze({...event,snapshotKey,...(event.type==='result'?{result:Object.freeze({...event.result,snapshotKey})}:{})}));}});
 const stop=()=>{if(pending){pending.worker.terminate();pending=null;}};
 return {
  get busy(){return pending!==null||analysis.busy;},
  start(payload){if(destroyed)return;stop();if(payload.snapshot){mainline=true;analysis.start({kind:'search',requestKey:payload.snapshotKey,payload});return;}if(mainline){analysis.invalidate();mainline=false;}const requestId=++sequence;
   try{const worker=workerFactory(),snapshotKey=payload.snapshotKey;pending={requestId,snapshotKey,worker};
    worker.onmessage=({data})=>{if(!pending||pending.requestId!==requestId||data.requestId!==requestId||data.snapshotKey!==snapshotKey)return;
     if(data.type==='result'||data.type==='error')stop();onEvent(data);};
    worker.onerror=e=>{if(pending?.requestId!==requestId)return;stop();onEvent({type:'error',message:e.message||'搜索 Worker 失败',requestId,snapshotKey});};
    onEvent({type:'started',requestId,snapshotKey});if(pending?.requestId===requestId)worker.postMessage({...structuredClone(payload),type:'search',requestId});
   }catch(error){stop();onEvent({type:'error',message:error.message,requestId});}
  },
  invalidate(message='输入已改变，旧候选已过期。'){if(destroyed)return;if(mainline){analysis.invalidate(message);return;}stop();sequence++;onEvent({type:'stale',message});},
  cancel(){if(destroyed)return;if(mainline){analysis.cancel();return;}stop();sequence++;onEvent({type:'cancelled',message:'已取消搜索；现有 PI 保持不变。'});},
  destroy(){if(destroyed)return;destroyed=true;stop();analysis.destroy();sequence++;}
 };
}
