/** Named manual snapshots are saved separately from applied PI and auto-search results. */
import {validateGains} from '../analysis/gfl-frequency.js';
import {kiFromTi} from '../analysis/pi-time.js';
import {tuningSnapshot} from './gfl-tuning-state.js';
const keys=['d','q','P','Q'],modes=['P/Q','P/Vac','Vdc/Q','Vdc/Vac'];
const modeOf=p=>`${p.dMode??'P'}/${p.qMode??'Q'}`;
const copyGains=g=>{validateGains(g);return Object.fromEntries(keys.map(k=>[k,{kp:g[k].kp,ki:g[k].ki}]));};
const nameOf=name=>{if(typeof name!=='string'||!name.trim()||name.trim().length>80)throw Error('方案名称须为 1–80 个字符。');return name.trim();};
const safeId=id=>typeof id==='string'&&/^manual-[a-zA-Z0-9-]{1,90}$/.test(id);
export function editManualGains(gains,loop,key,raw,{linkedDq=false}={}){
 if(!keys.includes(loop)||!['kp','ki','ti'].includes(key))throw Error('未知控制环或 PI 参数。');
 if(raw===null||raw===undefined||String(raw).trim()==='')throw Error('请填写有效参数。');
 const value=key==='ti'?kiFromTi(raw):Number(raw);
 if(!Number.isFinite(value)||value<0)throw Error('Kp、Ki 必须是非负有限数；Ti 为正数或 ∞。');
 const next=copyGains(gains),field=key==='ti'?'ki':key;next[loop][field]=value;
 if(linkedDq&&(loop==='d'||loop==='q'))next[loop==='d'?'q':'d'][field]=value;
 return next;
}
export function listManualCandidates(project,ibrId,mode){
 const bank=project.extensions?.gflPi?.[ibrId]?.manualCandidates;
 if(!bank||typeof bank!=='object'||Array.isArray(bank))return [];
 return Object.entries(bank).flatMap(([id,c])=>{try{
  if(!safeId(id)||c?.id!==id||c.source!=='manual'||!modes.includes(c.mode)||c.mode!==mode)return [];
  // Never trust an imported evaluation/verified flag. Always evaluate on selection.
  return [{id,name:nameOf(c.name),source:'manual',mode:c.mode,gains:copyGains(c.gains),factSnapshot:typeof c.factSnapshot==='string'?c.factSnapshot:null,
   requestSnapshot:typeof c.requestSnapshot==='string'?c.requestSnapshot:null,createdAt:typeof c.createdAt==='string'?c.createdAt:null}];
 }catch{return [];}});
}
function owner(project,id){if(!project.components?.some(c=>c.id===id&&c.type==='gfl'))throw Error('所选 GFL 不存在。');}
export function saveManualCandidate(project,ibrId,{id,name,gains,input,request={},createdAt=new Date().toISOString()}){
 owner(project,ibrId);if(!safeId(id))throw Error('手动方案 ID 无效。');
 const mode=modeOf(input);if(!modes.includes(mode))throw Error('控制模式无效。');
 if(Object.hasOwn(project.extensions?.gflPi?.[ibrId]?.manualCandidates??{},id))throw Error('方案已存在；请另存为新方案。');
 const record={id,name:nameOf(name),source:'manual',mode,gains:copyGains(gains),factSnapshot:tuningSnapshot(input),requestSnapshot:tuningSnapshot(request),createdAt};
 const next=structuredClone(project);next.extensions??={};next.extensions.gflPi??={};const dest=next.extensions.gflPi[ibrId]??={};
 dest.manualCandidates={...(dest.manualCandidates??{}),[id]:record};return next;
}
export function renameManualCandidate(project,ibrId,id,name){
 owner(project,ibrId);const bank=project.extensions?.gflPi?.[ibrId]?.manualCandidates;
 if(!safeId(id)||!bank||!Object.hasOwn(bank,id))throw Error('该手动方案已被删除。');
 const next=structuredClone(project);next.extensions.gflPi[ibrId].manualCandidates[id].name=nameOf(name);return next;
}
export function deleteManualCandidate(project,ibrId,id){
 owner(project,ibrId);if(!safeId(id))throw Error('方案 ID 无效。');const next=structuredClone(project);
 if(next.extensions?.gflPi?.[ibrId]?.manualCandidates)delete next.extensions.gflPi[ibrId].manualCandidates[id];return next;
}
