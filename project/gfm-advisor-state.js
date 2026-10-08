/** Current GFM gains are never changed by loading, analysis or candidate search. */
import {gfmContext,gfmSettings,gfmModes} from './gfm-settings.js';
import {tuningSnapshot} from './gfl-tuning-state.js';
import {validateGfmGains} from '../analysis/gfm-pi.js';
import {validateTuningRequest} from '../analysis/gfl-model-input.js';
export const gfmFactKeys=['fs','delaySamples','filterPqMs','filterVdcMs','filterVoltageMs','filterCurrentMs','feedforwardCurrent','feedforwardVoltage'];
export function gfmAdvisorRequest(stored={}){
 return {...validateTuningRequest({}).request,fi:stored.fi??500,fp:stored.fv??50,minMargin:stored.pm??60,preferredMargin:stored.pm??60,...(stored.advisor?.request??{})};
}
export function readGfmAdvisor(project,id){
 const settings=gfmSettings(project,id),stored=project.extensions?.gfmPi?.[id]??{};
 return {settings,gains:settings.gains??null,request:gfmAdvisorRequest(stored),
  input:{...gfmContext(project,id),considerScr:settings.considerScr,...Object.fromEntries(gfmFactKeys.map(k=>[k,settings[k]]))}};
}
export function gfmSnapshot({input,settings,gains,request}){
 return tuningSnapshot({input,mode:settings.mode,modeParameters:settings.modes[settings.mode],gains:gains??null,request});
}
function owner(project,id){if(!project.components.some(c=>c.id===id&&c.type==='gfm'))throw Error('所选 GFM 不存在。');}
export function saveGfmAdvisorSettings(project,id,settings,gains,request){
 owner(project,id);if(gains)validateGfmGains(gains);
 const next=structuredClone(project);next.extensions??={};next.extensions.gfmPi??={};const old=next.extensions.gfmPi[id]??{};
 const dest=next.extensions.gfmPi[id]={...old,...structuredClone(settings),advisor:{...(old.advisor??{}),request:structuredClone(request)}};
 if(gains){dest.gains=structuredClone(gains);dest.gainBank={...(dest.gainBank??{}),[dest.mode]:{gains:structuredClone(gains),manual:dest.manual===true}};}
 else delete dest.gains;
 return next;
}
export function switchGfmMode(project,id,mode){
 if(!Object.hasOwn(gfmModes,mode))throw Error('未知 GFM 模式。');
 const a=readGfmAdvisor(project,id),s=structuredClone(a.settings);s.gainBank??={};
 if(a.gains)s.gainBank[s.mode]={gains:structuredClone(a.gains),manual:s.manual};
 s.mode=mode;const bank=s.gainBank[mode];s.manual=bank?.manual===true;
 return saveGfmAdvisorSettings(project,id,s,bank?.gains??null,a.request);
}
export function applyGfmCandidate(project,id,candidate,expectedSnapshot){
 const a=readGfmAdvisor(project,id);if(gfmSnapshot(a)!==expectedSnapshot)throw Error('GFM 模型、目标或现有 PI 已变化，候选已过期。');
 if(candidate?.mode!==a.settings.mode)throw Error('成网模式不一致，候选已过期。');
 if(!candidate.verified||!candidate.requirementsMet||candidate.incompleteSearch)throw Error('候选未完成全部模型校核与要求，不能应用。');
 validateGfmGains(candidate.gains);
 const next=saveGfmAdvisorSettings(project,id,{...a.settings,manual:false},candidate.gains,a.request),dest=next.extensions.gfmPi[id];
 dest.advisor={...dest.advisor,policyId:'gfm-tuning-advisor-v1',candidateId:candidate.id,applicationStatus:'applied',appliedMode:a.settings.mode,
  appliedGains:structuredClone(candidate.gains),snapshotKey:expectedSnapshot,targetStatus:candidate.targetStatus,
  evaluation:structuredClone(candidate.evaluation??null),undo:{mode:a.settings.mode,gains:structuredClone(a.gains),manual:a.settings.manual}};
 if(dest.advisor.evaluation){delete dest.advisor.evaluation.series;delete dest.advisor.evaluation.closedSeries;}
 return next;
}
export function restoreGfmCandidate(project,id){
 const a=readGfmAdvisor(project,id),record=project.extensions?.gfmPi?.[id]?.advisor,undo=record?.undo;
 if(!undo||undo.mode!==a.settings.mode)throw Error('当前 GFM 模式无可恢复记录。');
 if(tuningSnapshot(a.gains)!==tuningSnapshot(record.appliedGains))throw Error('应用后 PI 已被手动修改，不能直接覆盖恢复。');
 const next=saveGfmAdvisorSettings(project,id,{...a.settings,manual:undo.manual},undo.gains,a.request),dest=next.extensions.gfmPi[id];
 if(undo.gains===null)delete dest.gainBank?.[a.settings.mode];
 dest.advisor={...dest.advisor,applicationStatus:'restored',appliedGains:null,undo:null};return next;
}
