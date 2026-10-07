/** UI-side worker lifecycle. Does not own project storage or apply gains. */
export function createTuningClient({workerFactory,onEvent}){
 let sequence=0,pending=null;
 const stop=()=>{if(pending){pending.worker.terminate();pending=null;}};
 return {
  get busy(){return pending!==null;},
  start(payload){stop();const requestId=++sequence;
   try{const worker=workerFactory(),snapshotKey=payload.snapshotKey;pending={requestId,snapshotKey,worker};
    worker.onmessage=({data})=>{if(!pending||pending.requestId!==requestId||data.requestId!==requestId||data.snapshotKey!==snapshotKey)return;
     if(data.type==='result'||data.type==='error')stop();onEvent(data);};
    worker.onerror=e=>{if(pending?.requestId!==requestId)return;stop();onEvent({type:'error',message:e.message||'搜索 Worker 失败',requestId,snapshotKey});};
    worker.postMessage({...payload,type:'search',requestId});onEvent({type:'started',requestId,snapshotKey});
   }catch(error){stop();onEvent({type:'error',message:error.message,requestId});}
  },
  invalidate(message='输入已改变，旧候选已过期。'){stop();sequence++;onEvent({type:'stale',message});},
  cancel(){stop();sequence++;onEvent({type:'cancelled',message:'已取消搜索；现有 PI 保持不变。'});},
  destroy(){stop();sequence++;}
 };
}
