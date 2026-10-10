import {createGflAnalysisDispatcher} from './gfl-analysis-worker.js';
const dispatch=createGflAnalysisDispatcher({postMessage:message=>{
 if(message.type==='started')return;
 const snapshotKey=message.requestKey,result=message.type==='result'?{...message.result,snapshotKey}:undefined;
 self.postMessage({...message,snapshotKey,...(result?{result}:{})});
}});
self.onmessage=({data})=>{
 if(data.type==='run'){dispatch(data);return;}
 if(data.type!=='search')return;
 const {requestId,snapshotKey,input,request,baselineGains,dqSettings,snapshot,experiments,policy,options}=data;
 dispatch({type:'run',kind:'search',requestId,requestKey:snapshotKey,payload:{input,request,baselineGains,dqSettings,snapshot,experiments,policy,options},cacheEntries:data.cacheEntries});
};
