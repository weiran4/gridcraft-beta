import {searchGfmCandidates} from '../analysis/gfm-tuning-advisor.js';
self.onmessage=({data})=>{
 if(data.type!=='search')return;const {requestId,snapshotKey}=data;
 try{const result=searchGfmCandidates(data.input,data.request,data.baselineGains,data.mode,data.modeParameters,{onProgress:progress=>self.postMessage({type:'progress',requestId,snapshotKey,progress})});result.snapshotKey=snapshotKey;self.postMessage({type:'result',requestId,snapshotKey,result});}
 catch(error){self.postMessage({type:'error',requestId,snapshotKey,message:error.message});}
};
