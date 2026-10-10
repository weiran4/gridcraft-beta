import {readDqSettings,saveDqSettings} from '../project/gfl-dq-settings.js';
import {assertDqApplication} from '../analysis/gfl-dq-analysis.js';
import {listManualCandidates,saveManualCandidate,renameManualCandidate,deleteManualCandidate} from '../project/gfl-manual-candidates.js';
import {manualContextKey} from './gfl-manual-workspace.js';
import {gflModelScope} from './gfl-model-scope.js';
import {readGflModelInput,modelFacts,validateTuningRequest} from '../analysis/gfl-model-input.js';
import {evaluateGfl} from '../analysis/gfl-linear-evaluation.js';
import {gflLinearModels} from '../analysis/gfl-linear-model.js';
import {linearStepMetrics} from '../analysis/gfl-step-metrics.js';
import {createTuningState,previewCandidate,applyCandidate,restoreAppliedGains,tuningSnapshot} from '../project/gfl-tuning-state.js';
import {buildGflAnalysisExport} from '../project/gfl-analysis-export.js';
import {createTuningClient} from './gfl-tuning-client.js';
import {createGflAnalysisClient} from './gfl-analysis-client.js';
import {createGflMainlineApplicationController,readGflApplicationContext} from '../project/gfl-analysis-evidence.js';
import {readGflAnalysisSettings,saveGflAnalysisSettings,resolveGflSnapshot} from '../project/gfl-analysis-settings.js';
import {gflFingerprint,gflNumericalPolicy} from '../analysis/gfl-analysis-contract.js';
import {createGflExperimentDefinitions} from '../analysis/gfl-experiments.js';
import {mountGflTuningPanel} from './gfl-tuning-panel.js?v=dq1';
import {tiFromKi,kiFromTi} from '../analysis/pi-time.js?v=ti1';
import {outerContext,outerModels} from '../analysis/gfl-outer.js?v=scr1';
import {operatingSummary} from './operating-summary.js?v=pq1';
import {inverterOperatingContext,operatingPoint} from '../analysis/operating-point.js?v=pq1';
import {dcCapSummary} from './dc-cap-summary.js?v=scr1';
import {projectStore} from '../project/sync.js?v=sync1';
import {syncGainSlider} from './gain-slider.js?v=transformer-rx3';
import {parseProject,serializeProject} from '../project/model.js?v=transformer-rx3';
import {getGfl,connectedDc,setGflField} from '../project/gfl-settings.js?v=transformer-rx3';
import {designGflPi} from '../analysis/gfl-pi.js?v=ti1';
import {validateGains,frequencySweep,crossings} from '../analysis/gfl-frequency.js?v=scr1';
import {controlDiagram} from './gfl-diagram.js?v=scr1';
import {bodeLoopGrid,bodeLegend} from './bode-plot.js?v=scr1';
import {equationSet,math,mi,mn,mo,sub,sup,frac,sqrt} from './paper-math.js?v=scr1';
import {escapeHtml as esc} from './symbols.js?v=transformer-rx3';
import {filterFields,filterDefaults,measurementFilters} from '../analysis/measurement-filters.js?v=scr1';
const $=id=>document.getElementById(id),fmt=v=>typeof v==='number'&&Number.isFinite(v)?Number(v.toPrecision(8)).toString():v==='Infinity'||v===Infinity?'∞':'—',key='gridcraft-v1';
const defs=[['ratedApparentPowerVA','额定 S','MVA',1e6],['ratedActivePowerW','额定 P','MW',1e6],['ratedReactivePowerVar','额定 Q','Mvar',1e6],['ratedAcVoltageV','额定 VLL','V',1],['activePowerW','运行 P','MW',1e6],['reactivePowerVar','运行 Q','Mvar',1e6],['filterResistanceOhm','滤波 Rf','Ω',1],['filterInductanceH','滤波 Lf','μH',1e-6],['dcVoltage','DC 电压','V',1],['dcResistance','DC 内阻','Ω',1],['frequencyHz','系统频率','Hz',1]];
const targets=[['fs','控制步长 Ts','μs'],['delaySamples','计算 / PWM 纯延时','Ts']];
const settingKeys=['fi','fp',...targets.map(([k])=>k),...filterFields.map(([k])=>k),'dMode','qMode','capSource','customCapUf','considerScr'];
const loadSettings=stored=>({factSources:Object.fromEntries(['fs','delaySamples',...filterFields.map(([k])=>k)].map(k=>[k,stored.factSources?.[k]??(stored[k]===undefined?'legacyDefault':'user')])),considerScr:false,dMode:'P',qMode:'Q',capSource:'applied',customCapUf:null,fs:20000,fi:500,fp:50,delaySamples:0,...filterDefaults,...Object.fromEntries(settingKeys.filter(k=>stored[k]!==undefined).map(k=>[k,stored[k]])),considerScr:stored.considerScr===true});
const shared=projectStore(localStorage,parseProject,serializeProject);
let project,id,settings,gains,manual=false,input,design,recommended,models,gainBank={},valid=false;
let displayedSweep=null,bodeWidth=0,manualBode=null;
function drawBode(){
 const host=$('bodePlot'),preview=$('bodePiSource')?.value==='comparison',e=manualBode?.evaluation;
 const diagnostic=mainlineSelected(project)?currentScalarDiagnostic:null;
 const sweep=preview?(e?{min:e.scan.min,max:e.scan.max,series:$('bodeMode').value==='open'?e.series:e.closedSeries}:null):(diagnostic?{min:diagnostic.scan.min,max:diagnostic.scan.max,series:$('bodeMode').value==='open'?diagnostic.series:diagnostic.closedSeries}:displayedSweep);
 host.innerHTML=bodeLoopGrid(sweep,{P:settings?.dMode??'P',Q:settings?.qMode??'Q'},{width:host.clientWidth||1200,columns:matchMedia('(max-width:900px)').matches?1:2});
 if($('bodeParameterStatus'))$('bodeParameterStatus').textContent=(mainlineSelected(project)?'标量诊断 · ':'')+(preview?('当前展示：'+(manualBode?.name??'手动试调')+'（未应用）。'+(e?'下方控制框图及导出仍为当前 PI。':'正在计算或尚无有效试调。')):'当前展示：当前已应用 PI。');
 const metrics=preview?e:(diagnostic??(displayedSweep?currentEvaluation:null));
 $('bodeMetrics').innerHTML=metrics?'<table><thead><tr><th>'+(preview?'试调控制环':'当前控制环')+'</th><th>全部交越 / Hz</th><th>相位裕度 / °</th><th>模型稳定性</th></tr></thead><tbody>'+Object.entries(metrics.loops).map(([k,l])=>'<tr><td>'+esc(loopLabel(k))+'</td><td>'+(l.crossings.map(x=>fmt(x.frequency)).join(' / ')||'频段内无交越')+'</td><td>'+fmt(l.minMargin)+'</td><td>'+esc(l.stability.status)+'</td></tr>').join('')+'</tbody></table>':'';
}

function clearBode(){displayedSweep=null;drawBode();}
let analysisSuspended=false,currentKey=null,currentStale=false,currentMessage='',analysisUiError='',currentScalarDiagnostic=null,scalarDiagnosticKey=null,selectedBode=null,comparisonDiagnosticKey=null,comparisonScalarDiagnostic=null;
let context,currentEvaluation=null,advisorResult=null,advisorSelected=null,advisorStale=false,advisorMessage='',request=validateTuningRequest({}).request;
const emptyGains=()=>Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:0,ki:0}]));
const requestFrom=stored=>({...validateTuningRequest({}).request,fi:stored.fi??500,fp:stored.fp??50,...(stored.advisor?.request??{})});
const mainlineSelected=p=>{const a=readGflAnalysisSettings(p,id);return a?.modelId!=='legacy-scalar'||a?.schemaVersion!==1||a?.modelVersion!==1;};
const snapshot=(p=project)=>{if(mainlineSelected(p))return readGflApplicationContext(p,id).requestKey;const stored=p.extensions?.gflPi?.[id]??{},facts=readGflModelInput(p,id,p===project?settings:loadSettings(stored));if(facts.inputStatus!=='valid')throw Error('当前模型输入不足或无效。');return tuningSnapshot({ibrId:id,input:facts.modelInput,gains:p===project?(gains??null):(stored.gains??null),request:p===project?request:requestFrom(stored),dqSettings:readDqSettings(p,id)});};
const client=createTuningClient({workerFactory:()=>new Worker(new URL('./gfl-tuning-worker.js',import.meta.url),{type:'module'}),onEvent:event=>{
 if(event.type==='started'){advisorMessage='正在搜索候选，现有 PI 保持不变…';advisorStale=false;}
 else if(event.type==='progress')advisorMessage='正在搜索：已检查 '+event.progress.evaluations+' 组参数…';
 else if(event.type==='result'){if(event.snapshotKey!==snapshot())return;advisorResult=event.result;advisorSelected=advisorResult.candidates[0]?.id??null;advisorMessage='';advisorStale=false;}
 else if(event.type==='error')advisorMessage='候选搜索失败：'+event.message+'。仍可分析和导出现有 PI。';
 else if(event.type==='stale'||event.type==='cancelled'){advisorStale=Boolean(advisorResult)||event.type==='cancelled';advisorMessage=event.message;}
 renderAdvisor();
}});
const currentClient=createGflAnalysisClient({workerFactory:()=>new Worker(new URL('./gfl-analysis-worker.js',import.meta.url),{type:'module'}),onEvent:event=>{
 if(event.type==='started'){currentEvaluation=null;currentStale=false;currentMessage='正在校核当前 PI 的联立模型…';}
 else if(event.type==='result'){if(event.requestKey!==currentKey||!valid||!mainlineSelected(project))return;currentEvaluation=event.result;currentMessage='';currentStale=false;$('gainMode').textContent='当前 PI · 完整外环 '+event.result.stability.status+'；响应 '+event.result.responseQuality+'；求解 '+event.result.solveStatus;}
 else if(event.type==='error'){currentEvaluation=null;currentStale=true;currentMessage=event.message;}
 else if(event.type==='stale'||event.type==='cancelled'){currentEvaluation=null;currentStale=true;currentMessage=event.message;}
 renderAdvisor();
}});
const scalarDiagnosticClient=createGflAnalysisClient({workerFactory:()=>new Worker(new URL('./gfl-analysis-worker.js',import.meta.url),{type:'module'}),onEvent:event=>{
 if(event.type==='result'&&event.requestKey===scalarDiagnosticKey){currentScalarDiagnostic=event.result.legacyEvaluation??null;drawBode();}
 else if(event.type==='started'||event.type==='error'||event.type==='cancelled'||event.type==='stale'){currentScalarDiagnostic=null;drawBode();}
}});
const comparisonDiagnosticClient=createGflAnalysisClient({workerFactory:()=>new Worker(new URL('./gfl-analysis-worker.js',import.meta.url),{type:'module'}),onEvent:event=>{
 if(event.type==='result'&&event.requestKey===comparisonDiagnosticKey&&selectedBode){comparisonScalarDiagnostic=event.result.legacyEvaluation??null;manualBode={...selectedBode,evaluation:comparisonScalarDiagnostic};drawBode();}
 else if(['error','cancelled','stale'].includes(event.type)){comparisonScalarDiagnostic=null;manualBode=null;drawBode();}
 else if(event.type==='started'){comparisonScalarDiagnostic=null;manualBode=selectedBode?{...selectedBode,evaluation:null}:null;drawBode();}
}});
function clearCurrent(reason='输入已改变，旧主线结果已清除。'){
 currentKey=null;currentEvaluation=null;currentStale=true;currentMessage=reason;currentClient.invalidate(reason);
 scalarDiagnosticKey=null;currentScalarDiagnostic=null;scalarDiagnosticClient.invalidate();comparisonDiagnosticKey=null;comparisonScalarDiagnostic=null;comparisonDiagnosticClient.invalidate();
}
function updateCurrent(){
 if(analysisSuspended)return;
 try{const component=getGfl(project,id),analysis=readGflAnalysisSettings(project,id),resolved=resolveGflSnapshot({...context.modelInput,switchingFrequencyHz:component.extensions?.filterDesign?.fs??null},analysis,{...context.sourceMap,switchingFrequencyHz:'component.extensions.filterDesign.fs'});
  const payload={snapshot:resolved,gains:structuredClone(gains),request:structuredClone(request),experiments:createGflExperimentDefinitions(),policy:gflNumericalPolicy()},requestKey=gflFingerprint('request',{kind:'evaluate',payload});
  if(currentKey!==requestKey){currentKey=requestKey;currentClient.start({kind:'evaluate',requestKey,payload});}
  updateScalarDiagnostics();
 }catch(error){currentEvaluation=null;currentStale=true;currentMessage=error.message;currentKey=null;currentClient.invalidate(error.message);}
}
function updateScalarDiagnostics(){
 if(analysisSuspended||!mainlineSelected(project)||!valid||!gains||analysisUiError)return;
 const payload={snapshot:{modelId:'legacy-scalar',input:context.modelInput},gains:structuredClone(gains),request:{}},requestKey=gflFingerprint('request',{kind:'evaluate',payload});
 if(requestKey!==scalarDiagnosticKey){scalarDiagnosticKey=requestKey;scalarDiagnosticClient.start({kind:'evaluate',requestKey,payload});}
 if($('bodePiSource')?.value==='comparison'&&selectedBode?.gains){const candidatePayload={...payload,gains:structuredClone(selectedBode.gains)},key=gflFingerprint('request',{kind:'evaluate',payload:candidatePayload});
  if(key!==comparisonDiagnosticKey){comparisonDiagnosticKey=key;comparisonScalarDiagnostic=null;comparisonDiagnosticClient.start({kind:'evaluate',requestKey:key,payload:candidatePayload});}
  else if(comparisonScalarDiagnostic)manualBode={...selectedBode,evaluation:comparisonScalarDiagnostic};}
}
function renderAnalysisControls(){
 const a=readGflAnalysisSettings(project,id),known=a?.schemaVersion===1&&a?.modelVersion===1&&['legacy-scalar','gfl-dq-reference-v1'].includes(a?.modelId),selected=mainlineSelected(project);
 const select=$('gflAnalysisModel');select.innerHTML='<option value="legacy-scalar">原标量双环模型（兼容已有项目）</option><option value="gfl-dq-reference-v1">PLL 与 dq 联立工程参考模型</option>'+(!known?'<option value="unsupported">未支持的模型 / 版本（原配置保留）</option>':'');select.value=known?a.modelId:'unsupported';
 $('gflMainlineControls').hidden=!selected;$('gflScalarBodeTitle').textContent=selected?'标量诊断 · 四环 Bode（不替代联立结论）':'波特图 · 解析频率响应';
 for(const [id,path]of [['gflSyncMode','syncMode'],['gflPllFn','sync.fnHz'],['gflPllDamping','sync.damping'],['gflPllFilter','sync.filterMs'],['gflDecoupling','sync.decouplingFrequency'],['gflDcModel','dcModel']]){
  const el=$(id),[key,field]=path.split('.'),value=field?a?.[key]?.[field]:a?.[key];el.disabled=!known;if(document.activeElement!==el)el.value=value??'';
 }
 const delay=$('gflMainlineDelay');if(document.activeElement!==delay)delay.value=settings.delaySamples;delay.disabled=!known;
 $('gflAnalysisStatus').textContent=analysisUiError||(!known?'所选模型或版本未支持；原配置与 PI 已保留。':selected?currentMessage||'主线仅分析声明的单逆变器平衡 LCL 工程参考模型；没有认证或硬件稳定性保证。':'原标量模型；可选 dq 面板只作额外校核。');
}
function saveAnalysisControl(el,path){
 try{const value=el.type==='number'?el.valueAsNumber:el.value,[key,field]=path.split('.'),patch=field?{sync:{[field]:value}}:{[key]:value};
  const next=saveGflAnalysisSettings(shared.read()??project,id,patch);analysisUiError='';el.removeAttribute('aria-invalid');application.invalidate();client.invalidate('分析模型或同步设置已改变，旧候选已过期。');receiveProject(shared.write(next));
 }catch(error){analysisUiError=error.message;el.setAttribute('aria-invalid','true');application.invalidate();client.invalidate(error.message);clearCurrent(error.message);renderAdvisor();}
}
const application=createGflMainlineApplicationController({readProject:()=>shared.read()??project,writeProject:next=>shared.write(next),
 clientFactory:({onEvent})=>createGflAnalysisClient({workerFactory:()=>new Worker(new URL('./gfl-analysis-worker.js',import.meta.url),{type:'module'}),onEvent}),
 onEvent:event=>{
  if(event.type==='started')advisorMessage='正在以最新工程重新校核所选 PI；当前 PI 保持不变。';
  else if(event.type==='applied'){receiveProject(event.project);advisorMessage='候选已明确应用；仅更新 PI 与对应主线证据。';}
  else if(event.type==='error'){advisorMessage=event.message;advisorStale=true;}
  else if(event.type==='cancelled')advisorMessage=event.message;
  renderAdvisor();
 }
});
const advisor=mountGflTuningPanel($('gflAdvisor'),{
 mainlineHost:$('gflMainlineResults'),getRequest:()=>request,
 onRequest:next=>{request=next;analysisSuspended=false;advisor.resume();application.invalidate();client.invalidate('整定目标已改变；现有 PI 不变。');clearCurrent('整定目标已改变，旧可应用结论已清除。');save();if(valid)plot();renderAdvisor();},
 onAnalyze:()=>refresh(false,false),onSearch:generateCandidates,onCancel:()=>{analysisSuspended=true;advisor.suspend('已取消校核；试调草稿保留，点击分析当前 PI 可继续。');application.cancel();client.cancel();currentClient.cancel();scalarDiagnosticClient.cancel();comparisonDiagnosticClient.cancel();advisorStale=true;renderAdvisor();},
 onSelect:value=>{advisorSelected=value;renderAdvisor();},onApply:applySelected,onRestore:restoreSelected,
 onDqSettings:patch=>{application.invalidate();const latest=shared.read()??project;project=shared.write(saveDqSettings(latest,id,patch));client.invalidate('PLL/dq 设置已改变，请重新生成候选；现有 PI 不变。');renderAdvisor();},
 onManualInvalidate:()=>application.invalidate(),
 onManualStart:()=>{const wasSuspended=analysisSuspended;analysisSuspended=false;advisor.resume();if(wasSuspended&&valid&&mainlineSelected(project)){currentKey=null;plot();}application.invalidate();if(client.busy)client.cancel();},
 onManualComparison:value=>{selectedBode=value.active?value:null;manualBode=value.active?{...value,evaluation:value.evaluation?.scalarDiagnostics??value.evaluation}:null;if($('bodePiSource'))$('bodePiSource').value=value.active?'comparison':'current';if(mainlineSelected(project))updateScalarDiagnostics();drawBode();},
 onComparisonSelection:value=>{selectedBode=value;if(mainlineSelected(project))updateScalarDiagnostics();},
 onManualSave:saveNamedManual,onManualRename:renameNamedManual,onManualDelete:deleteNamedManual,onManualApply:applyNamedManual
});
function renderAdvisor(){if(!settings)return;renderAnalysisControls();if($('modelScope'))$('modelScope').textContent=gflModelScope(settings,readGflAnalysisSettings(project,id),context?.modelInput);const stored=project?.extensions?.gflPi?.[id];let coupled={},coupledError=null;
 if(mainlineSelected(project))try{const applicationContext=readGflApplicationContext(project,id);coupled={applicationContext,resolvedSnapshot:applicationContext.snapshot,experiments:applicationContext.experiments,policy:applicationContext.policy};}catch(error){coupledError=error.message;}
 advisor.render({...coupled,mainlineSelected:mainlineSelected(project),currentBusy:currentClient.busy,currentStale,analysisSettings:readGflAnalysisSettings(project,id),dqInput:{...context?.modelInput,switchingFrequencyHz:getGfl(project,id).extensions?.filterDesign?.fs??null},dqSettings:{...readDqSettings(project,id),...(mainlineSelected(project)?{enabled:false}:{})},manualCandidates:listManualCandidates(project,id,modeKey()),modelInput:context?.modelInput,currentGains:gains,request,current:currentEvaluation,result:advisorResult,selectedId:advisorSelected,busy:client.busy||application.busy,message:analysisUiError||coupledError||advisorMessage,stale:advisorStale,invalid:!valid||!!coupledError||!!analysisUiError,canRestore:Boolean(stored?.advisor?.undo&&stored.advisor.undo.mode===modeKey()),diagnostics:context?.diagnostics??[],labels:{P:settings.dMode,Q:settings.qMode}});}
function generateCandidates(){
 const v=validateTuningRequest(request);if(!v.valid){advisorMessage='整定目标无效：'+v.errors.map(e=>e.message).join('；');renderAdvisor();return;}
 if(!valid){advisorMessage='请补齐有效的模型事实参数；目标设置不影响现有 PI 分析。';renderAdvisor();return;}
 const wasSuspended=analysisSuspended;analysisSuspended=false;advisor.resume();if(wasSuspended&&mainlineSelected(project)){currentKey=null;plot();}
 application.invalidate();advisorResult=null;advisorSelected=null;
 try{const coupled=mainlineSelected(project)?readGflApplicationContext(project,id):null;
  client.start({snapshotKey:snapshot(),input:context.modelInput,dqSettings:readDqSettings(project,id),request:v.request,baselineGains:gains?structuredClone(gains):null,
   ...(coupled?{snapshot:coupled.snapshot,experiments:coupled.experiments,policy:coupled.policy}:{})});
 }catch(error){advisorMessage=error.message;renderAdvisor();}
}
function applySelected(){try{
 const candidate=advisorResult?.candidates.find(c=>c.id===advisorSelected)??advisorResult?.candidates[0];if(!candidate||advisorStale||client.busy)throw Error('候选不可应用或已过期。');
 const selectedProject=shared.read()??project;
 if(mainlineSelected(selectedProject)){application.apply({ibrId:id,candidate,contextKey:advisorResult.snapshotKey,searchComplete:advisorResult.completionScope?.complete===true});return;}
 const latest=shared.read()??project,key=snapshot(latest);if(key!==advisorResult.snapshotKey)throw Error('工程或 PI 已改变，候选已过期。');
 const dqCheck=assertDqApplication(context.modelInput,candidate.gains,readDqSettings(latest,id));
 const stored=latest.extensions?.gflPi?.[id]??{dMode:settings.dMode,qMode:settings.qMode},state=previewCandidate(createTuningState(stored),candidate,key);
 const next=applyCandidate(latest,id,state,key);next.extensions.gflPi[id].advisor.dqVerification=dqCheck;next.extensions.gflPi[id].advisor.factSnapshot=tuningSnapshot(context.modelInput);next.extensions.gflPi[id].advisor.request=structuredClone(request);
 receiveProject(shared.write(next));advisorMessage='候选已明确应用；仅更新所选 GFL 的 PI。';renderAdvisor();
 }catch(error){advisorMessage=error.message;advisorStale=true;renderAdvisor();}}
function restoreSelected(){try{application.invalidate();const latest=shared.read()??project,next=restoreAppliedGains(latest,id,createTuningState(latest.extensions.gflPi[id]));receiveProject(shared.write(next));advisorMessage=mainlineSelected(latest)?'已恢复应用前 PI；电气参数未回滚，主线证据需重新评估。':'已恢复应用前 PI；电气参数未回滚。';renderAdvisor();}catch(error){advisorMessage=error.message;renderAdvisor();}}

function manualLatestKey(p){if(mainlineSelected(p))return readGflApplicationContext(p,id).requestKey;const s=p.extensions?.gflPi?.[id]??{};return manualContextKey({modelInput:readGflModelInput(p,id,loadSettings(s)).modelInput,currentGains:s.gains??null,request:requestFrom(s)});}
function saveNamedManual(value){
 const latest=shared.read()??project;
 if(value.contextKey!==manualLatestKey(latest))throw Error('模型或当前 PI 已变化，请刷新试调后再保存。');
 const candidateId='manual-'+crypto.randomUUID();
 const coupled=mainlineSelected(latest)?readGflApplicationContext(latest,id):null;
 const next=saveManualCandidate(latest,id,{id:candidateId,name:value.name,gains:value.gains,input:coupled?.snapshot.input??context.modelInput,request:coupled?.request??request,
  ...(coupled?{snapshot:coupled.snapshot,experiments:coupled.experiments,policy:coupled.policy}:{})});
 project=shared.write(next);renderAdvisor();return candidateId;
}
function renameNamedManual(candidateId,name){project=shared.write(renameManualCandidate(shared.read()??project,id,candidateId,name));renderAdvisor();}
function deleteNamedManual(candidateId){project=shared.write(deleteManualCandidate(shared.read()??project,id,candidateId));renderAdvisor();}
function applyNamedManual(candidate,key){try{
 const selectedProject=shared.read()??project;
 if(mainlineSelected(selectedProject)){application.apply({ibrId:id,candidate,contextKey:key,searchComplete:true});return;}
 const latest=shared.read()??project;if(key!==manualLatestKey(latest))throw Error('模型、目标或当前 PI 已改变；试调校核已过期。');
 if(!candidate?.verified||!candidate?.requirementsMet)throw Error('试调参数未满足当前模型或目标约束，只能暂存比较。');
 const dqCheck=assertDqApplication(context.modelInput,candidate.gains,readDqSettings(latest,id));
 const applicationKey=snapshot(latest),stored=latest.extensions?.gflPi?.[id]??{dMode:settings.dMode,qMode:settings.qMode};
 const state=previewCandidate(createTuningState(stored),candidate,applicationKey),next=applyCandidate(latest,id,state,applicationKey);
 next.extensions.gflPi[id].advisor.dqVerification=dqCheck;next.extensions.gflPi[id].advisor.factSnapshot=tuningSnapshot(context.modelInput);next.extensions.gflPi[id].advisor.request=structuredClone(request);
 receiveProject(shared.write(next));advisorMessage='已明确应用手动方案；控制框图、当前响应与参数导出已同步。';renderAdvisor();
 }catch(error){advisorMessage=error.message;renderAdvisor();}}

const modeKey=()=>settings.dMode+'/'+settings.qMode;
const loopLabel=k=>k==='P'?settings.dMode:k==='Q'?settings.qMode:k;
function rememberGains(){if(gains)gainBank[modeKey()]={gains:structuredClone(gains),manual};}
function save(){project.extensions??={};project.extensions.gflPi??={};const previous=project.extensions.gflPi[id]??{};
 const stored={...previous,...settings,manual,gainBank,advisor:{...(previous.advisor??{}),request:structuredClone(request)}};
 if(gains)stored.gains=structuredClone(gains);else delete stored.gains;project.extensions.gflPi[id]=stored;
 const merged=shared.write(project);if(serializeProject(merged)!==serializeProject(project))queueMicrotask(()=>receiveProject(shared.read()));
 $('saveStatus').textContent=getGfl(project,id).name+' · '+id+' · '+(valid?'已同步至电路':'配置已保存，模型待补齐');}
function readInput(){context=readGflModelInput(project,id,settings);if(context.inputStatus!=='valid')throw Error(context.diagnostics.filter(x=>['error','incomplete'].includes(x.severity)).map(x=>x.message).join('；'));return modelFacts(context.modelInput);}
function drawTables(){$('considerScr').checked=settings.considerScr===true;const p=getGfl(project,id).parametersSI,dc=connectedDc(project,id).parametersSI;
 const row=(k,label,unit,value,attr)=>'<tr><td><label for="field-'+k+'">'+label+'</label></td><td><input id="field-'+k+'" type="number" step="any" '+attr+'="'+k+'" value="'+value+'" aria-label="'+label+'"></td><td>'+unit+'</td></tr>';
 $('parameterTables').innerHTML='<table><thead><tr><th colspan="3">元件与运行参数</th></tr></thead><tbody>'+defs.map(([k,l,u,f])=>row(k,l,u,fmt((k==='frequencyHz'?project.frequencyHz:k==='dcVoltage'?dc.voltageV:k==='dcResistance'?dc.resistanceOhm:p[k])/f),'data-field')).join('')+'</tbody></table><table><thead><tr><th colspan="3">控制执行与延时</th></tr></thead><tbody>'+targets.map(([k,l,u])=>row(k,l,u,k==='fs'?fmt(1e6/settings.fs):settings[k],'data-setting')).join('')+'</tbody></table>';
 const select=(key,label,options)=>'<label>'+label+'<select data-mode="'+key+'" aria-label="'+label+'">'+options.map(([v,l])=>'<option value="'+v+'"'+(settings[key]===v?' selected':'')+'>'+l+'</option>').join('')+'</select></label>';
 $('parameterTables').insertAdjacentHTML('afterbegin','<section class="outer-settings"><h3>外环控制模式</h3>'+select('dMode','d 轴外环',[['P','有功 P'],['Vdc','直流电压 Vdc']])+select('qMode','q 轴外环',[['Q','无功 Q'],['Vac','交流电压 Vac']])+(settings.dMode==='Vdc'||mainlineSelected(project)&&readGflAnalysisSettings(project,id).dcModel==='capacitor'?select('capSource','DC 分析电容来源',[['applied','跟随已应用 DC 电容'],['custom','独立分析电容']])+(settings.capSource==='custom'?'<label>总等效 Cbus / μF<input type="number" min="0" step="any" data-setting="customCapUf" aria-label="总等效 Cbus" value="'+(settings.customCapUf??'')+'"></label>':''):'')+'<div id="outerModelSummary"></div></section>');
 $('parameterTables').insertAdjacentHTML('beforeend','<p class="small-note">Ts 为控制模块执行周期；每个仿真步执行一次时，等于该模块仿真步长。独立执行周期应按实际值填写。此处不代表 PWM 开关周期。</p><div id="controlStepSummary" class="small-note"></div>');
 $('parameterTables').insertAdjacentHTML('beforeend','<section class="measurement-settings"><h3>测量滤波</h3><p class="small-note">一阶低通 H(s) = 1 / (1 + sT)，增益为 1。时间常数单位 ms；0 为旁路。</p><table><tbody>'+filterFields.map(([k,l])=>row(k,l+'时间常数','ms',settings[k],'data-setting')).join('')+'</tbody></table><div id="measurementSummary"></div></section>');
 $('parameterTables').insertAdjacentHTML('beforeend','<div id="operatingPointSummary"></div><div id="dcCapSummary"></div>');
 // Keep all editable controls in the first responsive row; explanations follow it.
 const host=$('parameterTables'),tables=Array.from(host.children).filter(e=>e.tagName==='TABLE');
 const group=(node,kind)=>{const box=document.createElement('section');box.className='input-group '+kind;box.append(node);return box;};
 const outer=host.querySelector('.outer-settings'),filters=host.querySelector('.measurement-settings');
 $('parameterDetails').replaceChildren($('baseTable'),$('outerModelSummary'),$('measurementSummary'),$('operatingPointSummary'),$('dcCapSummary'));
 const step=group(tables[1],'step-inputs');step.append(host.querySelector(':scope > p.small-note'),$('controlStepSummary'));
 outer.classList.add('input-group');filters.classList.add('input-group');
 const inputRow=document.createElement('div');inputRow.className='parameter-input-grid';inputRow.append(outer,group(tables[0],'electrical-inputs'),step,filters);host.replaceChildren(inputRow);
 $('parameterTables').onchange=e=>{
  const el=e.target,mode=el.dataset.mode,k=el.dataset.field||el.dataset.setting;
  if(mode){
   rememberGains();settings[mode]=el.value;
   if(mode==='dMode'||mode==='qMode'){
    const bank=gainBank[modeKey()];gains=bank?.gains?structuredClone(bank.gains):null;manual=bank?.manual===true;
   }
   drawTables();refresh(false,false);save();return;
  }
  if(!k)return;
  try{el.setCustomValidity('');if(k==='customCapUf'&&el.value===''){settings.customCapUf=null;refresh(false,false);save();return;}if(!Number.isFinite(el.valueAsNumber))throw Error('请输入有效数值。');
   if(el.dataset.field){const f=defs.find(a=>a[0]===k)[3];setGflField(project,id,k,el.valueAsNumber*f);}
   else {if((k==='fs'||k==='customCapUf'||k==='fi'||k==='fp')&&el.valueAsNumber<=0)throw Error('此参数必须大于 0。');if((k.startsWith('filter')||k==='delaySamples')&&el.valueAsNumber<0)throw Error('此参数不能小于 0。');settings[k]=k==='fs'?1e6/el.valueAsNumber:el.valueAsNumber;if(settings.factSources&&k in settings.factSources)settings.factSources[k]='user';}
   refresh(false,false);save();
  }catch(error){el.setCustomValidity(error.message);invalidate(error);}
 };

}
function renderOuter(){
 if(mainlineSelected(project)){
  const a=readGflAnalysisSettings(project,id);$('scrScope').textContent=settings.considerScr?(input.gridError||'已启用联立工程参考模型所需的电网 R/L 与 RC；运行 PCC P/Q、高电压支路工作点和所选同步模型共同线性化。'):'联立工程参考模型需要启用 SCR 并具有支持的单逆变器 LCL 拓扑；未启用时明确不支持，不以理想电网替代。';
  document.querySelector('.design-title h1').textContent='GFL · '+settings.dMode+' / '+settings.qMode+' 联立主线分析';
  $('outerModelSummary').innerHTML='<p class="small-note">参考端口 '+esc(settings.dMode)+'* / '+esc(settings.qMode)+'* 对应实际物理输出；完整外环实验保留两外环，电流实验冻结外环输出增量。DC 选择 '+esc(a.dcModel)+'；Vdc 模式必须使用有效的独立电容能量模型，恒输入功率。Vac 输出是运行点 PCC 线电压 RMS 幅值；不使用静态单轴灵敏度替代主线响应。</p>';return;
 }
 $('scrScope').textContent=settings.considerScr?(input.gridError||('已启用 · '+input.pccName+' · SCR = '+fmt(input.scr)+'；电网 R/L 与 RC、滤波电压前馈参与标量内环。P/Q/Vac 采用送网电流通道；Vdc 保留桥侧电流功率近似。不含 PLL 和 dq 交叉耦合。')):'未启用：本地 RL 电流对象及理想电压前馈；不使用电网阻抗。Vac 需要勾选本项。';
 document.querySelector('.design-title h1').textContent='GFL · '+settings.dMode+' / '+settings.qMode+' 双环整定';
 const parts=['现有 PI 与候选搜索独立。自动推荐不要求交越目标；指定目标未达到时明确提示。候选只调整 PI，物理参数保持固定，点击应用后才写入。'];
 if(settings.dMode==='Vdc')parts.push('总等效 Cbus = '+(input.dcCapacitanceF>0?fmt(input.dcCapacitanceF*1e6)+' μF':'尚未设置')+'；Vdc 基准 = '+fmt(input.dcVoltage)+' V。采用 Cbus·Vdc·dVdc/dt = Pdc − Pac，假设 DC 输入功率恒定。此分析不把母线钳位于理想电压源；独立电容不修改电路。');
 if(settings.qMode==='Vac')parts.push(input.gridError||('并网点 '+input.pccName+'：Rth = '+fmt(input.gridROhm)+' Ω，Xth = '+fmt(input.gridXOhm)+' Ω；Kvac = Xth / Zb = '+fmt(input.gridXOhm*input.ratedVA/input.voltageLL**2)+'。Vac 为额定点的低频电压灵敏度近似，另一通道保持不变；已启用的电网/RC 动态仍参与标量通道，未包含 PLL、完整 dq 及外环耦合，不能据此认定完整弱网稳定。'));
 $('outerModelSummary').innerHTML=parts.map(t=>'<p class="small-note">'+esc(t)+'</p>').join('');
}
function renderFilters(){
 const filters=measurementFilters(settings);
 for(const [key] of filterFields){const el=$('field-'+key);el.min='0';el.setAttribute('aria-invalid','false');}
 $('measurementSummary').innerHTML=filterFields.map(([key,label,group])=>{const f=filters[group];return '<p class="small-note">'+label+'：'+(f.seconds===0?'旁路':('T = '+fmt(f.seconds)+' s；fc = 1 / (2πT) = '+fmt(f.cutoffHz)+' Hz'))+'</p>';}).join('')+'<p class="small-note">P/Q 共用一组，vd/vq 与交流电压幅值共用一组，id/iq 共用一组。所选外环启用对应反馈滤波；未选通道的时间常数保留。</p>';
}
function bases(){const b=design.base;
 $('controlStepSummary').textContent='Ts = '+fmt(1e6/settings.fs)+' μs = '+fmt(1/settings.fs)+' s；fs = 1/Ts = '+fmt(settings.fs)+' Hz；Td = '+fmt(settings.delaySamples)+' × Ts = '+fmt(settings.delaySamples*1e6/settings.fs)+' μs。';
 const values=[['Vb',b.Vdq,'V',sqrt(frac(mn(2),mn(3)))+sub('V','LL')],['Ib',b.Idq,'A',frac(sqrt(mn(2))+sub('S','b'),sqrt(mn(3))+sub('V','LL'))],['Zb',b.Z,'Ω',frac(sup(sub('V','LL'),2),sub('S','b'))],['Lb',b.L,'H',frac(sub('Z','b'),sub('ω','b'))],['Rf,pu',design.Rpu,'pu',frac(sub('R','f'),sub('Z','b'))],['Lf,pu',design.Lpu,'pu',frac(sub('ω','b')+sub('L','f'),sub('Z','b'))]];
 $('baseTable').innerHTML='<table><thead><tr><th colspan="3">额定标幺基准 · 派生值</th></tr></thead><tbody>'+values.map(([n,v,u,f])=>'<tr><td>'+n+'<span class="base-formula">'+math(f)+'</span></td><td class="base-value">'+fmt(v)+'</td><td>'+u+'</td></tr>').join('')+'</tbody></table>';
}
function invalidate(error){valid=false;clearCurrent(error.message);application.invalidate();client.invalidate('模型输入无效，旧候选已过期。');currentEvaluation=null;for(const [k] of filterFields){const el=$('field-'+k);if(el)el.setAttribute('aria-invalid',String(!Number.isFinite(el.valueAsNumber)||el.valueAsNumber<0));}$('designError').textContent=error.message;if($('tuningSummary'))$('tuningSummary').innerHTML='';for(const n of ['bodePlot','bodeMetrics','gainSummary','baseTable','diagramHost','designWarnings','bodeLegend','paperEquations','gainMode'])$(n).innerHTML='';$('saveStatus').textContent='当前输入无效，请修正后继续';clearBode();if(settings?.qMode==='Vac'&&!settings.considerScr){const button=document.createElement('button');button.className='primary';button.textContent='启用 SCR 并计算 Vac / Bode';button.onclick=()=>{$('considerScr').checked=true;$('considerScr').onchange();};$('bodePlot').append(button);}}
function plot(){
 if(!gains){currentEvaluation=null;clearBode();for(const n of ['bodeMetrics','gainSummary'])$(n).innerHTML='';$('gainMode').textContent='未应用参数 · 框图中 0 为未配置值';renderAdvisor();return;}
 validateGains(gains);if(mainlineSelected(project)){
  if(!analysisUiError)updateCurrent();displayedSweep=null;drawBode();
  $('gainSummary').innerHTML='<p>当前 PI 原值保留；数值响应在共享 Worker 内校核。标量 Bode 仅用于诊断。</p>';
  $('gainMode').textContent='当前 PI · '+(currentClient.busy?'主线正在校核；旧结论已清除。':currentEvaluation?'完整外环 '+currentEvaluation.stability.status+'；响应 '+currentEvaluation.responseQuality:'主线尚未完成校核。');
  $('tuningSummary').innerHTML='<p class="small-note">标量搜索生成 PI 种子，联立参考实验提供响应、目标与排序证据。PLL 参数仅由用户显式编辑。</p>';renderAdvisor();return;
 }const full=evaluateGfl(input,gains,{includeSeries:true});const {series,closedSeries,...evaluated}=full;
 currentEvaluation={...evaluated,modelId:'legacy-scalar',modelFingerprint:gflFingerprint('model',{modelId:'legacy-scalar',input:context.modelInput,gains})};
 if(input.delaySamples===0){const rational=gflLinearModels(input,gains);for(const k of ['d','q','P','Q'])currentEvaluation.loops[k].step=linearStepMetrics(rational[k],{includePoints:false});}
 displayedSweep={min:full.scan.min,max:full.scan.max,series:$('bodeMode').value==='open'?series:closedSeries};drawBode();
 $('gainSummary').innerHTML='<table><thead><tr><th>当前 PI</th><th>Kp · pu/pu</th><th>Ti · s</th><th>Ts / Ti</th></tr></thead><tbody>'+Object.entries(gains).map(([k,v])=>'<tr><td>'+loopLabel(k)+'</td><td>'+fmt(v.kp)+'</td><td>'+(v.ki===0?'∞（积分关闭）':fmt(tiFromKi(v.ki)))+'</td><td>'+fmt(v.ki/settings.fs)+'</td></tr>').join('')+'</tbody></table>';
 $('gainMode').textContent=(manual?'当前手动 PI。':'当前已保存 PI，导入时不重新生成。')+' '+(input.delaySamples!==0?'含纯延时：仅频域筛查，稳定性/时域未验证。':currentEvaluation.stability.status==='stable'?'当前零延时标量模型极点校核通过。':'当前模型稳定性：'+currentEvaluation.stability.status+'。');
 $('tuningSummary').innerHTML='<p class="small-note">旧固定零点比算法保留作回归参考，不在页面刷新时覆盖增益。新建议见 PI 整定助手。</p>';
 renderAdvisor();drawBode();
}
function refresh(force=false,persist=true){try{
 analysisSuspended=false;advisor.resume();
 application.invalidate();clearCurrent();
 client.invalidate(advisorResult?'输入/参数已变化，候选已过期。':'当前 PI 保持原值。');
 const opCtx={...inverterOperatingContext(project,getGfl(project,id)),dcVoltage:connectedDc(project,id).parametersSI.voltageV},op=operatingPoint(opCtx);
 $('operatingPointSummary').innerHTML=operatingSummary(opCtx)+'<p class="small-note">运行点所需桥侧相电压 RMS：'+fmt(op.converterRms)+' V；调制比 m = '+fmt(op.modulation)+'。采用已应用 Lf，忽略 Rf 与电容基波电流。</p>'+(op.modulation>2/Math.sqrt(3)?'<p class="note error">运行点所需调制比超过 SVPWM 线性上限。</p>':'');
 $('dcCapSummary').innerHTML=dcCapSummary(project,getGfl(project,id));
 if(!Array.from(document.querySelectorAll('#parameterTables input')).every(e=>e.checkValidity()))throw Error('请修正模型参数表中的无效输入。');
 input=readInput();design=designGflPi({...input,fi:input.fs/20,fp:input.fs/200});models=outerModels(input);recommended=gains??emptyGains();
 renderOuter();renderFilters();bases();$('paperEquations').innerHTML=mainlineSelected(project)?'<p>主线使用声明的 dq / PLL / 外环运行点 Jacobian。下列原标量公式仅为标量诊断与 PI 种子方法，不替代主线方程。</p>'+equationSet(settings):settings.considerScr?'<p>SCR 模型：Zp = Zc·Zg/(Zc+Zg)，A = [ZL + (1−D·Hv)Zp]/Zb，Li = Ci·D·Hi/A。不含 PLL 和 dq 交叉耦合。</p>':equationSet(settings);
 $('bodeLegend').innerHTML=bodeLegend({P:settings.dMode,Q:settings.qMode});$('diagramHost').innerHTML=controlDiagram(gains??emptyGains(),recommended,{...settings,analysis:readGflAnalysisSettings(project,id)});
 $('designWarnings').innerHTML=mainlineSelected(project)?'<p class="small-note">运行点联立工程参考模型；完整外环为主稳定性，冻结外环电流实验为诊断。无 EMT / HIL / 认证保证；显式非零延时仅为 Padé 近似，不可应用。</p>':'<p class="small-note">额定点标量线性化；未计 PLL、dq / 外环耦合、饱和或限流。控制周期不等于开关周期；零显式延时不证明真实硬件无延时。</p>';
 if(connectedDc(project,id).parametersSI.resistanceOhm!==0)$('designWarnings').innerHTML+='<p class="note warning">DC 含内阻；本页仍按刚性 DC 电压估算调制上限。</p>';
 $('designError').textContent='';valid=true;plot();if(persist)save();renderAdvisor();
 }catch(e){invalidate(e);renderAdvisor();}}
function diagramFilterEdit(e){
 const el=e.target,key=el.dataset.filterSetting;
 if(!key||e.type!=='change')return;
 application.invalidate();
 if(!Number.isFinite(el.valueAsNumber)||el.valueAsNumber<0){
  el.setCustomValidity('滤波时间常数必须为非负有限数，0 表示旁路。');el.setAttribute('aria-invalid','true');
  valid=false;$('designError').textContent=el.validationMessage;$('saveStatus').textContent='滤波输入无效，请修正；尚未保存';
  for(const n of ['bodeMetrics','gainSummary'])$(n).innerHTML='';clearBode();renderAdvisor();return;
 }
 el.setCustomValidity('');el.removeAttribute('aria-invalid');
 const other=$('diagramHost').querySelector('[data-filter-setting][aria-invalid="true"], [data-gain][aria-invalid="true"]');
 if(other){$('designError').textContent='请先修正其余标红的图内输入。';return;}
 const field=$('field-'+key);field.value=el.value;
 // Route through the same validation, tuning and persistence path as the top inputs.
 field.dispatchEvent(new Event('change',{bubbles:true}));
}

function gainEdit(e){
 const el=e.target,tag=el.dataset.gain||el.dataset.slider;if(!tag)return;if(e.type==='input'&&!el.dataset.slider)return;
 application.invalidate();
 if($('diagramHost').querySelector('[data-filter-setting][aria-invalid="true"]')){$('designError').textContent='请先修正标红的滤波输入。';return;}
 try{
  if(!Array.from(document.querySelectorAll('#parameterTables input')).every(e=>e.checkValidity()))throw Error('请先修正参数表中的无效输入。');
  readInput();application.invalidate();client.invalidate('当前手动 PI 已改变，旧候选已过期。');gains??=emptyGains();recommended??=gains;const [loop,k]=tag.split('.');
  const value=k==='ti'?kiFromTi(el.value):el.valueAsNumber;
  if(!Number.isFinite(value)||value<0)throw Error('Kp 必须为非负有限数。');
  el.removeAttribute('aria-invalid');
  if($('diagramHost').querySelector('[data-gain][aria-invalid="true"]')){const previous=k==='ti'?tiFromKi(gains[loop].ki):gains[loop][k];el.value=Number.isFinite(previous)?fmt(previous):'∞';$('designError').textContent='请先修正标红的 PI 输入。';return;}
  gains[loop][k==='ti'?'ki':k]=value;manual=true;
  const number=$('diagramHost').querySelector('[data-gain="'+tag+'"]'),slider=$('diagramHost').querySelector('[data-slider="'+tag+'"]');
  const display=k==='ti'?tiFromKi(value):value,rec=k==='ti'?tiFromKi(recommended[loop].ki):recommended[loop][k];
  // Preserve the user's full-precision text. Reformatting the focused input
  // schedules a second change on blur, which used to round the saved gain
  // when Generate was clicked. Only a separate slider updates this field.
  if(el.dataset.slider)number.value=Number.isFinite(display)?String(display):'∞';
  number.removeAttribute('aria-invalid');
  slider.disabled=!Number.isFinite(display);
  if(Number.isFinite(display)){if(k==='ti'&&!el.dataset.slider)slider.min=Math.max(Number.MIN_VALUE,display*1e-6);syncGainSlider(slider,display,Number.isFinite(rec)?rec:0,Boolean(el.dataset.slider));}
  $('designError').textContent='';valid=true;plot();rememberGains();save();
 }catch(error){valid=false;el.setAttribute('aria-invalid','true');$('designError').textContent=error.message;$('saveStatus').textContent='PI 输入无效，请修正；尚未保存';for(const n of ['bodeMetrics','gainSummary'])$(n).innerHTML='';clearBode();renderAdvisor();}
}

$('gflAnalysisModel').onchange=()=>saveAnalysisControl($('gflAnalysisModel'),'modelId');
for(const [id,path]of [['gflSyncMode','syncMode'],['gflPllFn','sync.fnHz'],['gflPllDamping','sync.damping'],['gflPllFilter','sync.filterMs'],['gflDecoupling','sync.decouplingFrequency'],['gflDcModel','dcModel']])$(id).onchange=()=>saveAnalysisControl($(id),path);
$('gflMainlineDelay').onchange=()=>{const el=$('gflMainlineDelay');if(!Number.isFinite(el.valueAsNumber)||el.valueAsNumber<0){analysisUiError='显式延时须为非负有限数。';el.setAttribute('aria-invalid','true');application.invalidate();client.invalidate(analysisUiError);clearCurrent(analysisUiError);renderAdvisor();return;}analysisUiError='';el.removeAttribute('aria-invalid');settings.delaySamples=el.valueAsNumber;settings.factSources.delaySamples='user';refresh(false,false);save();renderAdvisor();};
const bodeObserver=typeof ResizeObserver!=='undefined'?new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width??0;if(width>0&&Math.abs(width-bodeWidth)>.5){bodeWidth=width;drawBode();}}):null;bodeObserver?.observe($('bodePlot'));
try{const raw=localStorage.getItem(key);if(!raw)throw Error('请先返回电路并选择 GFL 元件。');project=parseProject(raw);shared.accept(project);id=new URLSearchParams(location.search).get('ibr');const c=getGfl(project,id);$('selectedIdentity').textContent=c.name+' · '+id;const stored=project.extensions?.gflPi?.[id]||{};settings=loadSettings(stored);request=requestFrom(stored);gainBank=structuredClone(stored.gainBank||{});gains=stored.gains?structuredClone(stored.gains):null;manual=stored.manual===true;drawTables();$('paperEquations').innerHTML=equationSet();$('bodeLegend').innerHTML=bodeLegend();refresh(false,false);}catch(e){invalidate(e);}
$('diagramHost').addEventListener('change',diagramFilterEdit);
$('diagramHost').addEventListener('input',gainEdit);$('diagramHost').addEventListener('change',gainEdit);
$('considerScr').onchange=()=>{settings.considerScr=$('considerScr').checked;refresh(false,false);save();};
$('bodePiSource').onchange=()=>{if(mainlineSelected(project))updateScalarDiagnostics();if($('bodePiSource').value==='current'&&valid)plot();else drawBode();};
$('retune').onclick=generateCandidates;$('bodeMode').onchange=()=>{if(valid)plot();};
$('exportPi').onclick=()=>{
 if(!project||!id)return;
 const latest=shared.read()??project;
 const data=buildGflAnalysisExport({project:latest,ibrId:id,evaluation:currentEvaluation,
  search:advisorResult?{...advisorResult,candidateStatus:advisorStale?'stale':'preview',selectedId:advisorSelected}:null,exportedAt:new Date().toISOString()});
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');
 a.href=url;a.download='gfl-pi-'+id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function receiveProject(p){
 if(!p||serializeProject(p)===serializeProject(project))return;
 project=p;shared.accept(p);
 try{const c=getGfl(project,id),stored=project.extensions?.gflPi?.[id]||{};
  $('selectedIdentity').textContent=c.name+' · '+id;
  settings=loadSettings(stored);request=requestFrom(stored);gainBank=structuredClone(stored.gainBank||{});
  gains=stored.gains?structuredClone(stored.gains):null;manual=stored.manual===true;advisorResult=null;advisorSelected=null;advisorStale=false;
  drawTables();refresh(false,false);
  if(valid)$('saveStatus').textContent=c.name+' · '+id+' · 已接收最新电路参数';
 }catch(e){$('parameterTables').innerHTML='';invalidate(e);}
}
window.addEventListener('storage',e=>{if(e.key===key)try{receiveProject(shared.read());}catch(e){invalidate(e);}});
window.addEventListener('pageshow',()=>{try{analysisSuspended=false;receiveProject(shared.read());advisor.resume();if(valid&&mainlineSelected(project)&&currentStale&&currentKey===null)plot();}catch(e){invalidate(e);}});
window.addEventListener('pagehide',()=>{analysisSuspended=true;advisor.suspend('页面已暂停；试调草稿保留。');application.cancel();client.cancel();clearCurrent('页面已暂停；旧主线结果已清除。');});
