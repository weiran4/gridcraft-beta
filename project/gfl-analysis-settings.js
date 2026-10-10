import {dqDefaults,pllParameters} from '../analysis/gfl-dq-model.js';
import {GflAnalysisError} from '../analysis/gfl-analysis-contract.js';

const modelIds=['legacy-scalar','gfl-dq-reference-v1'];
const syncKeys=['fnHz','damping','filterMs','decouplingFrequency'];
const settingKeys=['schemaVersion','modelId','modelVersion','syncMode','sync','dcModel','sources'];
const sourceKeys=['syncMode',...syncKeys.map(k=>'sync.'+k),'dcModel'];
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>isRecord(value)&&Object.hasOwn(value,key)?value[key]:undefined;
const inverterSettings=(project,id)=>own(own(own(project,'extensions'),'gflPi'),id);
const setOwn=(object,key,value)=>Object.defineProperty(object,key,{value,writable:true,enumerable:true,configurable:true});
function ownRecord(object,key){
 const existing=own(object,key);if(isRecord(existing))return existing;
 const value={};setOwn(object,key,value);return value;
}
const copy=value=>structuredClone(value);
const freeze=value=>{
 if(value&&typeof value==='object'){
  for(const child of Object.values(value))freeze(child);
  Object.freeze(value);
 }
 return value;
};
const error=(code,message)=>{throw new GflAnalysisError(code,message);};

function defaults(){
 return {schemaVersion:1,modelId:'legacy-scalar',modelVersion:1,
  syncMode:dqDefaults.pllEnabled?'srf-pll':'fixed-angle',
  sync:{fnHz:dqDefaults.frequencyHz,damping:dqDefaults.damping,filterMs:dqDefaults.pllFilterMs,decouplingFrequency:dqDefaults.decouplingFrequency},
  dcModel:dqDefaults.dcModel,sources:Object.fromEntries(sourceKeys.map(k=>[k,'engineering-default']))};
}

function legacyInitialSettings(project,id){
 const settings=defaults(),old=own(inverterSettings(project,id),'dqAnalysis');
 if(!isRecord(old))return settings;
 for(const [legacy,canonical]of [['frequencyHz','fnHz'],['damping','damping'],['pllFilterMs','filterMs'],['decouplingFrequency','decouplingFrequency']]){
  if(Object.hasOwn(old,legacy)){
   settings.sync[canonical]=copy(old[legacy]);settings.sources['sync.'+canonical]='legacy-dq-setting';
  }
 }
 if(Object.hasOwn(old,'pllEnabled')){
  // Keep malformed legacy values in the untouched old record. A null canonical
  // marker cannot accidentally validate a legacy string such as 'srf-pll'.
  settings.syncMode=old.pllEnabled===true?'srf-pll':old.pllEnabled===false?'fixed-angle':null;settings.sources.syncMode='legacy-dq-setting';
 }
 if(Object.hasOwn(old,'dcModel')){settings.dcModel=copy(old.dcModel);settings.sources.dcModel='legacy-dq-setting';}
 return settings;
}

function isUnknown(settings){
 return !isRecord(settings)||
  (Object.hasOwn(settings,'schemaVersion')&&settings.schemaVersion!==1)||
  (Object.hasOwn(settings,'modelVersion')&&settings.modelVersion!==1)||
  (Object.hasOwn(settings,'modelId')&&(!modelIds.includes(settings.modelId)||settings.schemaVersion!==1||settings.modelVersion!==1));
}

function merge(base,patch){
 return {...base,...copy(patch),
  sync:isRecord(patch.sync)?{...base.sync,...copy(patch.sync)}:Object.hasOwn(patch,'sync')?copy(patch.sync):copy(base.sync),
  sources:isRecord(patch.sources)?{...base.sources,...copy(patch.sources)}:Object.hasOwn(patch,'sources')?copy(patch.sources):copy(base.sources)};
}

function canonicalDefaults(stored){
 const settings=merge(defaults(),stored);
 if(isRecord(settings.sources))for(const key of sourceKeys){
  const [root,field]=key.split('.'),explicit=field?isRecord(stored[root])&&Object.hasOwn(stored[root],field):Object.hasOwn(stored,root);
  if(explicit&&!Object.hasOwn(stored.sources??{},key))settings.sources[key]='stored-unknown';
 }
 return settings;
}

/** Read only; legacy enabled is never a mainline opt-in. Unknown records are
 * cloned without defaults, normalization or writes so JSON export is lossless.
 * @returns {import('../analysis/gfl-analysis-contract.js').StoredAnalysisSettings}
 */
export function readGflAnalysisSettings(project,id){
 const stored=own(inverterSettings(project,id),'analysis');
 if(stored===undefined)return freeze(legacyInitialSettings(project,id));
 if(isUnknown(stored))return freeze(copy(stored));
 // Once canonical settings exist, old dqAnalysis fields no longer supply values.
 return freeze(canonicalDefaults(stored));
}

function validate(settings){
 if(isUnknown(settings)||settings.schemaVersion!==1||settings.modelVersion!==1||!modelIds.includes(settings.modelId))error('unsupported','未支持的 GFL 分析模型或设置版本。');
 for(const key of Object.keys(settings))if(!settingKeys.includes(key))error('invalidInput','未知 GFL 分析设置项：'+key);
 if(!['srf-pll','fixed-angle'].includes(settings.syncMode)||!isRecord(settings.sync))error('invalidInput','同步设置无效。');
 for(const key of Object.keys(settings.sync))if(!syncKeys.includes(key))error('invalidInput','未知同步设置项：'+key);
 if(!isRecord(settings.sources)||Object.values(settings.sources).some(v=>typeof v!=='string'))error('invalidInput','参数来源须为字符串记录。');
 try{
  pllParameters({frequencyHz:settings.sync.fnHz,damping:settings.sync.damping,pllFilterMs:settings.sync.filterMs,
   pllEnabled:settings.syncMode==='srf-pll',dcModel:settings.dcModel,decouplingFrequency:settings.sync.decouplingFrequency});
 }catch(e){error('invalidInput',e.message);}
 return settings;
}

/** Explicit save changes canonical analysis only, never PI or legacy dqAnalysis.
 * Unknown records require an explicit supported model choice before replacement.
 */
export function saveGflAnalysisSettings(project,id,patch){
 if(!project.components?.some(c=>c.id===id&&c.type==='gfl'))error('invalidInput','所选 GFL 不存在。');
 if(!isRecord(patch))error('invalidInput','分析设置变更须为对象。');
 for(const key of Object.keys(patch))if(!settingKeys.includes(key))error('invalidInput','未知 GFL 分析设置项：'+key);
 if(Object.hasOwn(patch,'sync')){
  if(!isRecord(patch.sync))error('invalidInput','同步设置须为对象。');
  for(const key of Object.keys(patch.sync))if(!syncKeys.includes(key))error('invalidInput','未知同步设置项：'+key);
 }
 for(const [key,allowed]of [['schemaVersion',[1]],['modelVersion',[1]],['modelId',modelIds]])
  if(Object.hasOwn(patch,key)&&!allowed.includes(patch[key]))error('unsupported','未支持的 GFL 分析模型或设置版本。');
 const stored=own(inverterSettings(project,id),'analysis');
 if(stored!==undefined&&isUnknown(stored)&&(!Object.hasOwn(patch,'modelId')||!modelIds.includes(patch.modelId)))error('unsupported','未知版本设置须明确选择支持的模型后才能替换。');
 const base=stored===undefined||isUnknown(stored)?legacyInitialSettings(project,id):readGflAnalysisSettings(project,id);
 const settings=merge(base,patch);
 validate(settings);
 // Saving a field is an explicit user edit; caller-supplied provenance can refine it.
 for(const key of ['syncMode','dcModel'])if(Object.hasOwn(patch,key)&&!Object.hasOwn(patch.sources??{},key))settings.sources[key]='user';
 for(const key of Object.keys(patch.sync??{}))if(!Object.hasOwn(patch.sources??{},'sync.'+key))settings.sources['sync.'+key]='user';
 const next=copy(project),extensions=ownRecord(next,'extensions'),dictionary=ownRecord(extensions,'gflPi'),selected=ownRecord(dictionary,id);
 setOwn(selected,'analysis',settings);
 return next;
}

// Physical input names used by readGflModelInput / the existing dq equations.
// A caller's tuning targets or presentation state cannot contaminate model identity.
const inputKeys=['ratedVA','voltageLL','frequencyHz','R','L','dcVoltage','dcResistanceOhm','activePowerW','reactivePowerVar',
 'dMode','qMode','considerScr','dcCapacitanceF','gridXOhm','gridROhm','gridError','gridCapacitanceF','gridCapResistanceOhm',
 'pccName','scr','fs','delaySamples','filterCurrentMs','filterVoltageMs','filterPqMs','filterVdcMs','gridVoltagePu','switchingFrequencyHz'];

/** Resolve immutable physical/sync facts, independent of gains and targets.
 * The caller enriches switchingFrequencyHz from filterDesign.fs and supplies its
 * separate source entry. This function has no project lookup and never infers PWM.
 * @returns {import('../analysis/gfl-analysis-contract.js').ResolvedSnapshot}
 */
export function resolveGflSnapshot(input,settings,sourceMap={}){
 if(!isRecord(input)||!isRecord(sourceMap))error('invalidInput','模型输入与参数来源须为对象。');
 if(Object.values(sourceMap).some(v=>typeof v!=='string'))error('invalidInput','参数来源须为字符串记录。');
 if(isUnknown(settings)||settings.schemaVersion!==1||settings.modelVersion!==1||!modelIds.includes(settings.modelId))error('unsupported','未支持的 GFL 分析模型或设置版本。');
 const analysis=validate(canonicalDefaults(settings));
 const facts=Object.fromEntries(inputKeys.filter(k=>Object.hasOwn(input,k)).map(k=>[k,copy(input[k])]));
 for(const key of ['fs','frequencyHz'])if(!Number.isFinite(facts[key])||facts[key]<=0)error('invalidInput',key+' 必须为正的有限数。');
 for(const key of ['filterCurrentMs','filterVoltageMs','filterPqMs','filterVdcMs']){
  if(Object.hasOwn(facts,key)&&(!Number.isFinite(facts[key])||facts[key]<0))error('invalidInput',key+' 必须为非负有限数；未知不等于零。');
 }
 const switching=facts.switchingFrequencyHz??null;
 if(switching!==null&&(!Number.isFinite(switching)||switching<=0))error('invalidInput','PWM 频率必须为正的有限数，或未知 null。');
 if(analysis.syncMode==='srf-pll'&&analysis.sync.fnHz>=facts.fs/2)error('invalidInput','PLL 特征频率须低于控制 Nyquist 频率。');
 facts.switchingFrequencyHz=switching;
 const controlStepSeconds=1/facts.fs,pwmPeriodSeconds=switching===null?null:1/switching;
 if(!Number.isFinite(controlStepSeconds)||(pwmPeriodSeconds!==null&&!Number.isFinite(pwmPeriodSeconds)))error('invalidInput','控制或 PWM 周期超出可表示数值范围。');
 // Stored settings provenance belongs only to sync/DC settings. Even an imported
 // colliding source key cannot replace (or invent) a physical input's provenance.
 const settingSources=Object.fromEntries(sourceKeys.filter(k=>Object.hasOwn(analysis.sources,k)).map(k=>[k,copy(analysis.sources[k])]));
 const parameterSources={...settingSources,...Object.fromEntries(inputKeys.filter(k=>Object.hasOwn(sourceMap,k)).map(k=>[k,copy(sourceMap[k])]))};
 return freeze({modelId:analysis.modelId,modelVersion:analysis.modelVersion,
  equationVersion:analysis.modelId==='gfl-dq-reference-v1'?'gfl-dq-srf-pll-v1':'legacy-scalar-v1',
  input:facts,analysis,nominalFrequencyHz:facts.frequencyHz,parameterSources,
  controlStepSeconds,pwmPeriodSeconds});
}
