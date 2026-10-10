/** Reference-step experiments on the same averaged dq physical equations.
 * The current experiment changes the feedback connection, not the model family.
 */
import {buildGflReferenceModel} from './gfl-model-contract.js';
import {GflAnalysisError,gflFingerprint,gflNumericalPolicy,gflCanonicalSnapshot} from './gfl-analysis-contract.js';

const closedId='outer-reference-closed',currentId='current-reference-frozen-outer';
const fail=(code,message)=>{throw new GflAnalysisError(code,message);};
const freeze=value=>{
 if(value&&typeof value==='object'){
  for(const child of Object.values(value))freeze(child);
  Object.freeze(value);
 }
 return value;
};

// Fingerprint policy data must survive JSON exactly. Reject values canonical
// JSON would omit, collapse or turn into null, as well as recursive records.
function policyData(value,seen=new Set()){
 if(value===null||typeof value==='string'||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)))return;
 if(!value||typeof value!=='object'||(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype)||seen.has(value))
  fail('invalidInput','响应数值策略须为有限、无循环的 JSON 数据。');
 seen.add(value);
 for(const child of Array.isArray(value)?Array.from(value):Object.values(value))policyData(child,seen);
 seen.delete(value);
}

/** @returns {import('./gfl-analysis-contract.js').ExperimentDefinition[]} */
export function createGflExperimentDefinitions(){
 return [closedId,currentId].map(id=>({id,amplitudePu:.01,windowSeconds:null}));
}

/** Ordered descriptors are authoritative. No guessed indices or invalid ports.
 * @param {import('./gfl-analysis-contract.js').Descriptor[]} descriptors
 * @param {string} id
 * @returns {number}
 */
export function findPortIndex(descriptors,id){
 if(!Array.isArray(descriptors)||typeof id!=='string'||!id)fail('invalidInput','端口选择须提供描述符数组和明确 ID。');
 const matches=descriptors.map((port,i)=>port?.id===id?i:-1).filter(i=>i>=0);
 if(matches.length!==1)fail('invalidInput',matches.length?'端口 ID 不唯一：'+id:'未找到端口：'+id);
 if(descriptors[matches[0]].applicable!==true)fail('invalidInput','端口不适用于所选模型：'+id);
 return matches[0];
}

/** @param {import('./gfl-analysis-contract.js').ResolvedSnapshot} snapshot
 * @param {import('./gfl-analysis-contract.js').Gains} gains
 * @param {import('./gfl-analysis-contract.js').ExperimentDefinition} definition
 * @param {import('./gfl-analysis-contract.js').NumericalPolicy|import('./gfl-analysis-contract.js').ResponseNumericalPolicy} policy
 * @returns {import('./gfl-analysis-contract.js').ExperimentRecord}
 */
export function buildGflExperiment(snapshot,gains,definition,policy=gflNumericalPolicy()){
 if(!definition||![closedId,currentId].includes(definition.id))fail('unsupported','未支持的 dq 实验：'+definition?.id);
 const {id,amplitudePu,windowSeconds}=definition;
 if(!Number.isFinite(amplitudePu)||amplitudePu===0)fail('invalidInput','参考扰动幅值须为非零有限数。');
 if(windowSeconds!==null&&(!Number.isFinite(windowSeconds)||windowSeconds<=0))fail('invalidInput','响应窗口须为正的有限秒数或自动窗口 null。');
 if(policy?.model&&gflCanonicalSnapshot(policy.model)!==gflCanonicalSnapshot(gflNumericalPolicy().model))
  fail('unsupported','未支持的 dq 线性化数值策略。');
 const selectedPolicy=policy?.response??policy;
 if(selectedPolicy?.id!=='gfl-dq-response-v1')fail('unsupported','未支持的 dq 响应数值策略。');
 policyData(selectedPolicy);
 let responsePolicy;
 try{responsePolicy=structuredClone({...selectedPolicy,windowSeconds});}catch{fail('invalidInput','响应数值策略须为可序列化数据。');}
 const model=buildGflReferenceModel(snapshot,gains,{experimentId:id}),frozenOuter=id===currentId;
 const feedback={outer:frozenOuter?'frozen-output-increments':'closed',current:'closed',
  freezeLocation:frozenOuter?'outer-controller-current-command-output':null,controllerFrame:'controller-dq',
  operatingCurrentBiasPu:[...model.operatingPoint.op.il],frozenOuterOutputIncrementsPu:frozenOuter?[0,0]:null,
  trackedQuantity:frozenOuter?'bridge-current':'selected-outer-physical-output',
  retainedStateIds:model.states.map(state=>state.id),stabilityScope:frozenOuter?'experiment-diagnostic':'outer-reference-closed'};
 const inputIds=frozenOuter?['reference.current.d','reference.current.q']:model.inputs.slice(0,2).map(port=>port.id);
 const outputIds=frozenOuter?['current.bridge.d','current.bridge.q']:model.outputs.slice(0,2).map(port=>port.id);
 const steps=inputIds.map((inputId,i)=>{
  const targetOutputId=outputIds[i];findPortIndex(model.inputs,inputId);findPortIndex(model.outputs,targetOutputId);
  return {inputId,targetOutputId,amplitudePu};
 });
 const modelFingerprint=model.modelFingerprint,experimentFingerprint=gflFingerprint('experiment',{
  modelFingerprint,feedback,inputIds:model.inputs.map(port=>port.id),outputIds:model.outputs.map(port=>port.id),steps,windowSeconds,policy:responsePolicy,
  realization:{id:model.realizationId,stateIds:model.states.map(state=>state.id),A:model.A,B:model.B,C:model.C,D:model.D}
 });
 return freeze({id,model,modelFingerprint,experimentFingerprint,feedback,steps,policy:responsePolicy});
}
