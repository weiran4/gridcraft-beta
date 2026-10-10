/** Named manual snapshots are saved separately from applied PI and auto-search results. */
import {validateGfmGains as validateGains} from '../analysis/gfm-pi.js';
import {readGfmAdvisor,gfmSnapshot,applyGfmCandidate} from './gfm-advisor-state.js';
import {evaluateGfmManualCandidate,gfmManualFacts} from '../analysis/gfm-manual-evaluation.js';
import {tuningSnapshot} from './gfl-tuning-state.js';
const keys=['d','q','P','Q'],modes=['droop','vsg','sync'];
const copyGains=g=>{validateGains(g);return Object.fromEntries(keys.map(k=>[k,{kp:g[k].kp,ki:g[k].ki}]));};
const nameOf=name=>{if(typeof name!=='string'||!name.trim()||name.trim().length>80)throw Error('方案名称须为 1–80 个字符。');return name.trim();};
const safeId=id=>typeof id==='string'&&/^manual-[a-zA-Z0-9-]{1,90}$/.test(id);
export function listGfmManualCandidates(project,ibrId,mode){
 const bank=project.extensions?.gfmPi?.[ibrId]?.manualCandidates;
 if(!bank||typeof bank!=='object'||Array.isArray(bank))return [];
 return Object.entries(bank).flatMap(([id,c])=>{try{
  if(!safeId(id)||c?.id!==id||c.source!=='manual'||!modes.includes(c.mode)||c.mode!==mode)return [];
  // Never trust an imported evaluation/verified flag. Always evaluate on selection.
  return [{id,name:nameOf(c.name),source:'manual',mode:c.mode,gains:copyGains(c.gains),factSnapshot:typeof c.factSnapshot==='string'?c.factSnapshot:null,
   requestSnapshot:typeof c.requestSnapshot==='string'?c.requestSnapshot:null,createdAt:typeof c.createdAt==='string'?c.createdAt:null}];
 }catch{return [];}});
}
function owner(project,id){if(!project.components?.some(c=>c.id===id&&c.type==='gfm'))throw Error('所选 GFM 不存在。');}
export function saveGfmManualCandidate(project,ibrId,{id,name,gains,createdAt=new Date().toISOString()}){
 owner(project,ibrId);if(!safeId(id))throw Error('手动方案 ID 无效。');
 const context=readGfmAdvisor(project,ibrId),mode=context.settings.mode;if(!modes.includes(mode))throw Error('控制模式无效。');
 if(Object.hasOwn(project.extensions?.gfmPi?.[ibrId]?.manualCandidates??{},id))throw Error('方案已存在；请另存为新方案。');
 const record={id,name:nameOf(name),source:'manual',mode,gains:copyGains(gains),factSnapshot:tuningSnapshot(gfmManualFacts(context)),requestSnapshot:tuningSnapshot(context.request),createdAt};
 const next=structuredClone(project);next.extensions??={};next.extensions.gfmPi??={};const dest=next.extensions.gfmPi[ibrId]??={};
 dest.manualCandidates={...(dest.manualCandidates??{}),[id]:record};return next;
}
export function renameGfmManualCandidate(project,ibrId,id,name){
 owner(project,ibrId);const bank=project.extensions?.gfmPi?.[ibrId]?.manualCandidates;
 if(!safeId(id)||!bank||!Object.hasOwn(bank,id))throw Error('该手动方案已被删除。');
 const next=structuredClone(project);next.extensions.gfmPi[ibrId].manualCandidates[id].name=nameOf(name);return next;
}
export function deleteGfmManualCandidate(project,ibrId,id){
 owner(project,ibrId);if(!safeId(id))throw Error('方案 ID 无效。');const next=structuredClone(project);
 if(next.extensions?.gfmPi?.[ibrId]?.manualCandidates)delete next.extensions.gfmPi[ibrId].manualCandidates[id];return next;
}

/** Recompute from current facts; imported/displayed certificates never authorize application. */
export function applyGfmManualCandidate(project,ibrId,candidate,expectedSnapshot){
 const context=readGfmAdvisor(project,ibrId);
 if(gfmSnapshot(context)!==expectedSnapshot)throw Error('模型、成网模式、目标或当前 PI 已变化，试调已过期。');
 const checked=evaluateGfmManualCandidate({...context,gains:candidate.gains,record:candidate});
 const next=applyGfmCandidate(project,ibrId,checked,expectedSnapshot),dest=next.extensions.gfmPi[ibrId];
 dest.manual=true;dest.gainBank[dest.mode].manual=true;dest.advisor.source='manual';return next;
}
