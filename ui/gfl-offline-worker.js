import {evaluateOfflineDesign} from '../analysis/gfl-offline-evaluation.js';
import {searchOfflineDesign} from '../analysis/gfl-offline-search.js';
import {exportDesignPackage} from '../project/design-package.js';
import {buildDesignScenarios,assessDesignScenarios} from '../analysis/design-scenarios.js';
self.onmessage=({data})=>{const {key,kind,snapshot,gains,request,ranges}=data;try{
 const result=kind==='search'?searchOfflineDesign(snapshot,{...request,initialGains:gains},{onProgress:p=>self.postMessage({key,type:'progress',progress:p})}):kind==='export'?exportDesignPackage(snapshot,{gains,ranges,decimalPlaces:request.decimalPlaces}):{assessment:evaluateOfflineDesign({snapshot,gains,policy:{frequencyPoints:161}}),coverage:assessDesignScenarios(snapshot,gains,buildDesignScenarios(snapshot,ranges))};
 self.postMessage({key,type:'result',result});
}catch(error){self.postMessage({key,type:'error',message:error.message});}};
