import {analyzeGflDq} from '../analysis/gfl-dq-analysis.js';
self.onmessage=({data})=>{
 if(data.type!=='preview')return;
 const {requestId,snapshotKey,payload}=data;
 const evaluate=gains=>{if(!gains)return {status:'missingGains'};try{return analyzeGflDq(payload.input,gains,payload.settings);}catch(error){return {status:'unassessed',message:error.message};}};
 try{self.postMessage({type:'result',requestId,snapshotKey,result:{current:evaluate(payload.currentGains),candidate:evaluate(payload.candidateGains)}});}
 catch(error){self.postMessage({type:'error',requestId,snapshotKey,message:error.message});}
};
