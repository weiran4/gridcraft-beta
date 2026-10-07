/** Candidate transactions never rewrite electrical facts or unrelated extensions. */
import {validateGains} from '../analysis/gfl-frequency.js';
const copy=v=>v===undefined?undefined:structuredClone(v);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const mode=s=>`${s.dMode??'P'}/${s.qMode??'Q'}`;
export function tuningSnapshot(value){
 const stable=v=>v&&typeof v==='object'?(Array.isArray(v)?v.map(stable):Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]))):v;
 return JSON.stringify(stable(value)); // exact canonical input, no hash collision
}
export function createTuningState(stored={}){
 return {mode:mode(stored),baselineGains:copy(stored.gains)??null,baselineManual:stored.manual===true,
  advisor:copy(stored.advisor)??{},candidate:null,snapshotKey:null,
  applicationStatus:stored.gains?(stored.advisor?.appliedMode===mode(stored)&&equal(stored.advisor?.appliedGains,stored.gains)?'applied':'baseline'):'unapplied'};
}
export function previewCandidate(state,candidate,snapshotKey){return {...copy(state),candidate:copy(candidate),snapshotKey,applicationStatus:'preview'};}
export function applyCandidate(project,ibrId,state,currentSnapshotKey){
 if(state.snapshotKey!==currentSnapshotKey)throw Error('候选已过期，请重新生成。');
 const stored=project.extensions?.gflPi?.[ibrId]??{};
 if(mode(stored)!==state.mode)throw Error('控制模式已改变，请重新生成。');
 if(!equal(stored.gains??null,state.baselineGains))throw Error('现有 PI 已改变，不能应用旧候选。');
 const c=state.candidate;if(!c||!c.verified||!c.requirementsMet||c.incompleteSearch)throw Error('候选尚未完成全部要求的验证，不能作为推荐自动应用。');
 validateGains(c.gains);
 const next=copy(project);next.extensions??={};next.extensions.gflPi??={};
 const dest=next.extensions.gflPi[ibrId]??={};
 const undo={mode:state.mode,gains:copy(stored.gains)??null,manual:stored.manual===true};
 Object.assign(dest,{gains:copy(c.gains),manual:false,gainBank:{...(dest.gainBank??{}),[state.mode]:{gains:copy(c.gains),manual:false}}});
 dest.advisor={...(dest.advisor??{}),policyId:'gfl-tuning-advisor-v1',policyVersion:1,applicationStatus:'applied',appliedMode:state.mode,
  appliedGains:copy(c.gains),snapshotKey:currentSnapshotKey,candidateId:c.id,evaluation:copy(c.evaluation),targetStatus:c.targetStatus,undo};
 return next;
}
export function restoreAppliedGains(project,ibrId,state){
 const stored=project.extensions?.gflPi?.[ibrId],a=stored?.advisor,undo=a?.undo;
 if(!undo||undo.mode!==mode(stored))throw Error('当前模式没有可恢复的应用记录。');
 if(!equal(stored.gains,a.appliedGains))throw Error('应用后 PI 已改变；为避免覆盖手动修改，不能直接恢复。');
 if(state&&state.mode!==mode(stored))throw Error('模式已改变。');
 const next=copy(project),dest=next.extensions.gflPi[ibrId];
 if(undo.gains===null){delete dest.gains;delete dest.gainBank?.[undo.mode];}else{
  dest.gains=copy(undo.gains);dest.gainBank={...(dest.gainBank??{}),[undo.mode]:{gains:copy(undo.gains),manual:undo.manual}};
 }
 dest.manual=undo.manual;dest.advisor={...a,applicationStatus:'restored',appliedGains:null,undo:null};
 return next;
}
export function applicationEvidence(stored={},facts){
 const a=stored.advisor;if(!a?.appliedGains)return {status:stored.gains?'baseline':'unapplied',evaluationCurrent:false};
 const current=a.appliedMode===mode(stored)&&equal(stored.gains,a.appliedGains)&&a.factSnapshot===tuningSnapshot(facts);
 return {status:current?'applied':'stale',evaluationCurrent:current};
}
