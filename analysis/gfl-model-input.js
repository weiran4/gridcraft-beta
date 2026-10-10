/** Facts are distinct from tuning goals. No mutation of the imported project. */
import {getGfl,connectedDc} from '../project/gfl-settings.js';
import {outerContext,outerModels} from './gfl-outer.js';
import {filterDefaults,measurementFilters} from './measurement-filters.js';
import {validateGflGrid} from './gfl-grid.js';

// The legacy outerModels helper also produces initial PI suggestions. These two
// constants are compatibility inputs ONLY; they never represent user targets.
export const modelFacts=p=>({...p,fi:500,fp:50});
export function validateModelFacts(p){
 for(const k of ['ratedVA','voltageLL','frequencyHz','L','dcVoltage','fs'])
  if(!Number.isFinite(p[k])||p[k]<=0)throw Error(k+' 必须为正的有限数。');
 for(const k of ['R','delaySamples'])if(!Number.isFinite(p[k])||p[k]<0)throw Error(k+' 必须为非负有限数。');
 if(!Number.isFinite(p.voltageLL**2/p.ratedVA))throw Error('标幺基准超出数值范围。');
 measurementFilters(p);if(p.considerScr)validateGflGrid(p);outerModels(modelFacts(p));
 return p;
}
export function readGflModelInput(project,ibrId,settings={}){
 const diagnostics=[],sourceMap={};let modelInput={};
 const note=(code,severity,field,message)=>diagnostics.push({code,severity,field,message});
 try{
  const c=getGfl(project,ibrId),e=c.parametersSI,dc=connectedDc(project,ibrId),s=settings;
  modelInput={ratedVA:e.ratedApparentPowerVA,voltageLL:e.ratedAcVoltageV,frequencyHz:project.frequencyHz,R:e.filterResistanceOhm,L:e.filterInductanceH,
   dcVoltage:dc.parametersSI.voltageV,dcResistanceOhm:dc.parametersSI.resistanceOhm,activePowerW:e.activePowerW,reactivePowerVar:e.reactivePowerVar,
   dMode:s.dMode??'P',qMode:s.qMode??'Q',considerScr:s.considerScr===true,...outerContext(project,ibrId)};
  for(const k of Object.keys(modelInput))sourceMap[k]='project';
  for(const [k,v]of Object.entries({fs:20000,delaySamples:0,...filterDefaults})){
   modelInput[k]=s[k]===undefined?v:s[k];sourceMap[k]=s.factSources?.[k]??(s[k]===undefined?'legacyDefault':'user');
   if(sourceMap[k]==='legacyDefault')note('legacy-default','warning',k,`${k} 未保存，沿用旧版默认 ${v}；不是实测值。`);
   if(s[k]===null)note('missing-fact','incomplete',k,`${k} 尚未配置；未知不等于 0。`);
  }
  if(s.capSource==='custom'){
   modelInput.dcCapacitanceF=Number.isFinite(s.customCapUf)?s.customCapUf*1e-6:null;
   sourceMap.dcCapacitanceF='independent-analysis';
  }
  if(modelInput.dMode==='Vdc'){
   if(modelInput.dcCapacitanceF===null)note('missing-capacitance','incomplete','dcCapacitanceF','Vdc 模型需要已应用或独立分析的总电容。');
   if(dc.parametersSI.resistanceOhm===0)note('dc-model-difference','warning','dcCapacitanceF','画布为理想 DC 源；本分析使用独立电容能量模型及恒定输入功率，不是电压钳位电路响应。');
  }
  if(modelInput.considerScr&&modelInput.filterVoltageMs>0)note('shared-voltage-filter','info','filterVoltageMs','交流电压滤波同时影响 SCR 模型的前馈残余和 Vac 反馈。');
  note('model-coverage','info',null,'额定点标量模型，不含 PLL、dq 交叉耦合、限幅或 HIL 实测验证。');
  if(!diagnostics.some(x=>x.severity==='incomplete'))validateModelFacts(modelInput);
 }catch(e){note('invalid-model','error',null,e.message);}
 return {inputStatus:diagnostics.some(x=>x.severity==='error')?'invalid':diagnostics.some(x=>x.severity==='incomplete')?'incomplete':'valid',modelInput,sourceMap,diagnostics};
}
export function validateTuningRequest(raw={}){
 const request={mode:'automatic',focus:'balanced',minMargin:60,preferredMargin:60,separationRatio:5,tolerance:.05,allowReduction:false,
  fi:null,fp:null,minimumFi:null,minimumFp:null,maxOvershootPercent:null,maxSettlingSeconds:null,...raw},errors=[];
 const bad=(field,message)=>errors.push({field,message});
 if(!['automatic','target'].includes(request.mode))bad('mode','选择自动推荐或指定交越。');
 if(!['balanced','tracking'].includes(request.focus))bad('focus','本版未定义扰动注入模型，仅支持均衡或参考跟踪。');
 for(const k of ['minMargin','preferredMargin'])if(!Number.isFinite(request[k])||request[k]<=0||request[k]>=180)bad(k,'裕度须在 0° 与 180° 之间。');
 if(request.minMargin>request.preferredMargin)bad('minMargin','最低裕度不得高于优选裕度。');
 if(!Number.isFinite(request.separationRatio)||request.separationRatio<1)bad('separationRatio','级联间隔须不小于 1。');
 if(!Number.isFinite(request.tolerance)||request.tolerance<0||request.tolerance>.5)bad('tolerance','交越容差须为 0～50%。');
 if(typeof request.allowReduction!=='boolean')bad('allowReduction','降频授权须为布尔值。');
 if(request.mode==='target')for(const [k,min]of [['fi','minimumFi'],['fp','minimumFp']]){
  if(!Number.isFinite(request[k])||request[k]<=0)bad(k,'指定目标须为正 Hz。');
  if(request[min]!==null&&(!Number.isFinite(request[min])||request[min]<=0||request[min]>request[k]))bad(min,'最低接受频率须大于 0 且不超过目标。');
 }
 for(const k of ['maxOvershootPercent','maxSettlingSeconds'])if(request[k]!==null&&(!Number.isFinite(request[k])||request[k]<0||(k==='maxSettlingSeconds'&&request[k]===0)))bad(k,'性能限制应为空或有效非负数；稳定时间须大于 0。');
 return {valid:errors.length===0,errors,request};
}
