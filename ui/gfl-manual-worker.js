import {evaluateManualCandidate} from '../analysis/gfl-manual-evaluation.js';
import {createGflAnalysisDispatcher,createGflWorkerRuntime} from './gfl-analysis-worker.js';
const dispatch=createGflAnalysisDispatcher({postMessage:message=>self.postMessage(message)});
self.onmessage=({data})=>{
 if(data.type==='run'){dispatch(data);return;}
 if(data.type!=='preview')return;
 const {requestId,snapshotKey,payload}=data;
 // The legacy preview transport is result-only; modern run jobs stream progress.
 const runtime=createGflWorkerRuntime();
 try{self.postMessage({type:'result',requestId,snapshotKey,result:evaluateManualCandidate(payload.input??payload.snapshot?.input,payload.gains,payload.request,payload.record,
  {snapshot:payload.snapshot,experiments:payload.experiments,policy:payload.policy,runtime})});}
 catch(error){self.postMessage({type:'error',requestId,snapshotKey,message:error.message});}
};
