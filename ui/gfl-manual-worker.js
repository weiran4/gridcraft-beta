import {evaluateManualCandidate} from '../analysis/gfl-manual-evaluation.js';
self.onmessage=({data})=>{
 if(data.type!=='preview')return;
 const {requestId,snapshotKey,payload}=data;
 try{self.postMessage({type:'result',requestId,snapshotKey,result:evaluateManualCandidate(payload.input,payload.gains,payload.request,payload.record)});}
 catch(error){self.postMessage({type:'error',requestId,snapshotKey,message:error.message});}
};
