import {convertPi} from './design-snapshot.js';
import {evaluateOfflineDesign} from '../analysis/gfl-offline-evaluation.js';
import {buildDesignScenarios,assessDesignScenarios} from '../analysis/design-scenarios.js';
export function exportDesignPackage(snapshot,design){
 const digits=design.decimalPlaces??8;if(!Number.isInteger(digits)||digits<0||digits>14)throw Error('导出小数位无效');
 const gains=Object.fromEntries(Object.entries(design.gains).map(([k,g])=>[k,{kp:Number(g.kp.toFixed(digits)),ki:Number(g.ki.toFixed(digits))}]));
 const assessment=evaluateOfflineDesign({snapshot,gains,policy:{frequencyPoints:321}}),scenarios=assessDesignScenarios(snapshot,gains,buildDesignScenarios(snapshot,design.ranges??{}));
 const pack={schema:'gridcraft.design-package',schemaVersion:1,metadata:{modelVersion:snapshot.modelVersion,policyId:assessment.policyId},requirements:snapshot.requirements,conventions:{bases:snapshot.bases,currentDirection:'bridge-to-grid',park:'d=cos q=-sin',pi:'Kp + Ki/s'},physicalDesign:assessment.operatingPoint?.finalSnapshot?.resolvedModel.input??snapshot.resolvedModel.input,requestedPhysicalInputs:snapshot.resolvedModel.input,implementation:snapshot.implementation,controllers:{internal:structuredClone(design.gains),output:Object.fromEntries(Object.entries(gains).map(([k,g])=>[k,convertPi(g)])),decimalPlaces:digits},analyticalAssessment:assessment,scenarioCoverage:scenarios,qualification:scenarios.allRecommended&&assessment.eligibility==='recommended'?'specified-points-passed':'not-fully-qualified',assumptionsAndLimits:assessment.assumptions,applied:false};
 const clean=v=>{if(typeof v==='number'&&!Number.isFinite(v))throw Error('导出包含非有限数');if(v&&typeof v==='object')Object.values(v).forEach(clean);};clean(pack);return JSON.parse(JSON.stringify(pack));
}
