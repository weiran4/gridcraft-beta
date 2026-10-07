import {searchGflCandidates} from '../analysis/gfl-tuning-search.js';
self.onmessage=({data})=>{
 if(data.type!=='search')return;
 const {requestId,snapshotKey,input,request,baselineGains}=data;
 try{const result=searchGflCandidates(input,request,baselineGains,{onProgress:progress=>self.postMessage({type:'progress',requestId,snapshotKey,progress})});
  result.snapshotKey=snapshotKey;self.postMessage({type:'result',requestId,snapshotKey,result});
 }catch(error){self.postMessage({type:'error',requestId,snapshotKey,message:error.message});}
};
