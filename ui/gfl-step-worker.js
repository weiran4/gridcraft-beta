import {buildStepPreview} from '../analysis/gfl-step-preview.js';
self.onmessage=({data})=>{
 if(data.type!=='preview')return;
 const {requestId,snapshotKey}=data;
 try{self.postMessage({type:'result',requestId,snapshotKey,result:buildStepPreview(data.payload)});}
 catch(error){self.postMessage({type:'error',requestId,snapshotKey,message:error.message});}
};
