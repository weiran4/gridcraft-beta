/** Debounced, latest-snapshot-only response preview. Owns no saved PI state. */
export function createStepClient({workerFactory,onEvent,delay=160,setTimer=setTimeout,clearTimer=clearTimeout}){
 let sequence=0,signature=null,timer=null,worker=null,destroyed=false;const cache=new Map();
 const stop=()=>{if(timer!==null)clearTimer(timer);timer=null;if(worker)worker.terminate();worker=null;};
 return {
  update(payload){
   if(destroyed)return;const snapshotKey=JSON.stringify(payload);if(snapshotKey===signature)return;
   stop();signature=snapshotKey;const requestId=++sequence;
   if(cache.has(snapshotKey)){onEvent({type:'result',result:cache.get(snapshotKey)});return;}
   onEvent({type:'loading'});
   const copy=JSON.parse(snapshotKey);
   timer=setTimer(()=>{timer=null;
    try{const w=workerFactory();worker=w;
     w.onmessage=({data})=>{if(destroyed||sequence!==requestId||data.requestId!==requestId||data.snapshotKey!==snapshotKey)return;
      stop();if(data.type==='result'){cache.set(snapshotKey,data.result);if(cache.size>8)cache.delete(cache.keys().next().value);}
      else signature=null;onEvent(data);};
     w.onerror=e=>{if(destroyed||sequence!==requestId)return;stop();signature=null;onEvent({type:'error',message:e.message||'响应预览 Worker 失败'});};
     w.postMessage({type:'preview',requestId,snapshotKey,payload:copy});
    }catch(error){stop();signature=null;onEvent({type:'error',message:error.message});}
   },delay);
  },
  clear(message=''){stop();++sequence;signature=null;onEvent({type:'empty',message});},
  destroy(){destroyed=true;stop();++sequence;cache.clear();}
 };
}
