import {buildGfmStepPreview} from '../analysis/gfm-step-preview.js';
self.onmessage=({data})=>{
 if(data.type!=='preview')return;
 const {requestId,snapshotKey,payload}=data;
 try{self.postMessage({type:'result',requestId,snapshotKey,result:buildGfmStepPreview(payload)});}
 catch(error){self.postMessage({type:'error',requestId,snapshotKey,message:error.message});}
};
