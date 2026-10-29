/** Opt-in offline design contract. Never changes the source project. */
import {readGflModelInput} from '../analysis/gfl-model-input.js';
import {readGflAnalysisSettings,resolveGflSnapshot} from './gfl-analysis-settings.js';
import {gflFingerprint} from '../analysis/gfl-analysis-contract.js';
export function freezeDesign(v){if(v&&typeof v==='object'){Object.values(v).forEach(freezeDesign);Object.freeze(v);}return v;}
export function convertPi({kp,ki,ti,form='parallel',enabled=true}){
 if(!Number.isFinite(kp)||kp<0||!['parallel','series'].includes(form)||typeof enabled!=='boolean')throw Error('PI 形式或增益无效');
 if(!enabled)return {kp,ki:0,enabled:false,ti:null,form};
 if(ki!==undefined&&ti!==undefined&&(!Number.isFinite(ti)||ti<=0||Math.abs(ki*ti-(form==='parallel'?1:kp))>1e-10*Math.max(1,Math.abs(ki*ti))))throw Error('Ki 与 Ti 不一致');
 if(ki===undefined){if(!Number.isFinite(ti)||ti<=0)throw Error('Ti 必须为正数');ki=(form==='parallel'?1:kp)/ti;}
 if(!Number.isFinite(ki)||ki<0)throw Error('Ki 必须为非负有限数');
 if(form==='series'&&kp===0&&ki>0)throw Error('串联形式 Kp=0 不能表达非零积分增益');
 return {kp,ki,enabled:ki>0,ti:ki===0?null:(form==='parallel'?1:kp)/ki,form};
}
export function sealDesign(snapshot){const s=structuredClone(snapshot);delete s.identity;s.identity=gflFingerprint('offline-design',s);return freezeDesign(s);}
export function resolveDesignSnapshot(project,request={}){
 const allowed=['ibrId','pointPolicy','vacRefPu','pdcW','lockedQVar','limits','targets','implementation'];if(Object.keys(request).some(k=>!allowed.includes(k)))throw Error('未知设计输入字段');
 const id=request.ibrId??'PV1',stored=project.extensions?.gflPi?.[id];
 if(!stored||!project.components.some(c=>c.id===id&&c.type==='gfl'))throw Error('请选择 GFL 元件');
 const facts=readGflModelInput(project,id,{...stored,considerScr:true});
 if(facts.inputStatus!=='valid')throw Error(facts.diagnostics.map(x=>x.message).join('；'));
 const analysis=readGflAnalysisSettings(project,id),component=project.components.find(c=>c.id===id);
 const resolvedModel=resolveGflSnapshot({...facts.modelInput,switchingFrequencyHz:component.extensions?.filterDesign?.fs??null},analysis,facts.sourceMap);
 const requirements={pointPolicy:'historical-pq',vacRefPu:null,pdcW:null,lockedQVar:null,limits:{currentPu:null,modulation:null},targets:{},...structuredClone(request)};
 delete requirements.ibrId;requirements.limits={currentPu:null,modulation:null,...request.limits};requirements.targets={...request.targets};
 if(!['historical-pq','mode-reference'].includes(requirements.pointPolicy))throw Error('未知工作点策略');
 for(const k of ['vacRefPu','pdcW','lockedQVar'])if(requirements[k]!==null&&!Number.isFinite(requirements[k]))throw Error(k+' 必须为有限数或未知');
 if(requirements.vacRefPu!==null&&requirements.vacRefPu<=0)throw Error('VacRef 必须为正数');
 for(const [k,v]of Object.entries(requirements.limits))if(!['currentPu','modulation','gridCurrentPu','qAxisCurrentPu'].includes(k)||v!==null&&(!Number.isFinite(v)||v<=0))throw Error('能力限值无效：'+k);
 for(const [k,v]of Object.entries(requirements.targets))if(!['minimumDecayRate','maxTrackingPeak','maxCrossGain','maxLowFrequencyError','scalarMinMargin','separationRatio','maxOvershootPercent','maxSettlingSeconds'].includes(k)||v!==null&&(!Number.isFinite(v)||v<0))throw Error('目标无效：'+k);
 if(Object.keys(request.implementation??{}).some(k=>!['operatingBias','pllDetector','piForm','dcPort','actuator'].includes(k)))throw Error('未知实现字段');
 const implementation={operatingBias:'initialized-equilibrium',pllDetector:'dynamic-magnitude',piForm:'parallel',dcPort:'constant-input-power',actuator:'ideal-voltage-command',...request.implementation};
 delete requirements.implementation;
 if(!['dynamic-magnitude','rated-magnitude'].includes(implementation.pllDetector))throw Error('PLL 检相方式未支持');
 const p=resolvedModel.input;
 const snapshot=sealDesign({schemaVersion:1,modelVersion:'gfl-offline-v1',ibrId:id,resolvedModel,requirements,implementation,
 bases:{power:p.ratedVA,voltagePeak:Math.sqrt(2/3)*p.voltageLL,currentPeak:Math.sqrt(2/3)*p.ratedVA/p.voltageLL,impedance:p.voltageLL**2/p.ratedVA},
 provenance:{...resolvedModel.parameterSources,pointPolicy:Object.hasOwn(request,'pointPolicy')?'user':'legacy-preserved',operatingBias:'declared-model-assumption',grid:'project-network; explicitly included by offline strategy'}});
 return {snapshot,diagnostics:['离线策略显式纳入电网，未修改工程 SCR 开关。','固定平衡偏置增量模型；不包含限流、饱和或开关波形。']};
}
