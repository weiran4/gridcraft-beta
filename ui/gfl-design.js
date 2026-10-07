import {readGflModelInput,modelFacts,validateTuningRequest} from '../analysis/gfl-model-input.js';
import {evaluateGfl} from '../analysis/gfl-linear-evaluation.js';
import {gflLinearModels} from '../analysis/gfl-linear-model.js';
import {linearStepMetrics} from '../analysis/gfl-step-metrics.js';
import {createTuningState,previewCandidate,applyCandidate,restoreAppliedGains,tuningSnapshot,applicationEvidence} from '../project/gfl-tuning-state.js';
import {createTuningClient} from './gfl-tuning-client.js';
import {mountGflTuningPanel} from './gfl-tuning-panel.js';
import {tiFromKi,kiFromTi,piTimeParameters} from '../analysis/pi-time.js?v=ti1';
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
import {bodeSvg,bodeLegend} from './bode-plot.js?v=scr1';
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
let context,currentEvaluation=null,advisorResult=null,advisorSelected=null,advisorStale=false,advisorMessage='',request=validateTuningRequest({}).request;
const emptyGains=()=>Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:0,ki:0}]));
const requestFrom=stored=>({...validateTuningRequest({}).request,fi:stored.fi??500,fp:stored.fp??50,...(stored.advisor?.request??{})});
const snapshot=(p=project)=>{const stored=p.extensions?.gflPi?.[id]??{},facts=readGflModelInput(p,id,p===project?settings:loadSettings(stored));if(facts.inputStatus!=='valid')throw Error('当前模型输入不足或无效。');return tuningSnapshot({ibrId:id,input:facts.modelInput,gains:p===project?(gains??null):(stored.gains??null),request:p===project?request:requestFrom(stored)});};
const client=createTuningClient({workerFactory:()=>new Worker(new URL('./gfl-tuning-worker.js',import.meta.url),{type:'module'}),onEvent:event=>{
 if(event.type==='started'){advisorMessage='正在搜索候选，现有 PI 保持不变…';advisorStale=false;}
 else if(event.type==='progress')advisorMessage='正在搜索：已检查 '+event.progress.evaluations+' 组参数…';
 else if(event.type==='result'){if(event.snapshotKey!==snapshot())return;advisorResult=event.result;advisorSelected=advisorResult.candidates[0]?.id??null;advisorMessage='';advisorStale=false;}
 else if(event.type==='error')advisorMessage='候选搜索失败：'+event.message+'。仍可分析和导出现有 PI。';
 else if(event.type==='stale'||event.type==='cancelled'){advisorStale=Boolean(advisorResult)||event.type==='cancelled';advisorMessage=event.message;}
 renderAdvisor();
}});
const advisor=mountGflTuningPanel($('gflAdvisor'),{
 getRequest:()=>request,
 onRequest:next=>{request=next;client.invalidate('整定目标已改变；现有 PI 不变。');save();renderAdvisor();},
 onAnalyze:()=>refresh(false,false),onSearch:generateCandidates,onCancel:()=>client.cancel(),
 onSelect:value=>{advisorSelected=value;renderAdvisor();},onApply:applySelected,onRestore:restoreSelected
});
function renderAdvisor(){if(!settings)return;const stored=project?.extensions?.gflPi?.[id];advisor.render({request,current:currentEvaluation,result:advisorResult,selectedId:advisorSelected,busy:client.busy,message:advisorMessage,stale:advisorStale,invalid:!valid,canRestore:Boolean(stored?.advisor?.undo&&stored.advisor.undo.mode===modeKey()),diagnostics:context?.diagnostics??[],labels:{P:settings.dMode,Q:settings.qMode}});}
function generateCandidates(){
 const v=validateTuningRequest(request);if(!v.valid){advisorMessage='整定目标无效：'+v.errors.map(e=>e.message).join('；');renderAdvisor();return;}
 if(!valid){advisorMessage='请补齐有效的模型事实参数；目标设置不影响现有 PI 分析。';renderAdvisor();return;}
 advisorResult=null;advisorSelected=null;client.start({snapshotKey:snapshot(),input:context.modelInput,request:v.request,baselineGains:gains?structuredClone(gains):null});
}
function applySelected(){try{
 const candidate=advisorResult?.candidates.find(c=>c.id===advisorSelected)??advisorResult?.candidates[0];if(!candidate||advisorStale||client.busy)throw Error('候选不可应用或已过期。');
 const latest=shared.read()??project,key=snapshot(latest);if(key!==advisorResult.snapshotKey)throw Error('工程或 PI 已改变，候选已过期。');
 const stored=latest.extensions?.gflPi?.[id]??{dMode:settings.dMode,qMode:settings.qMode},state=previewCandidate(createTuningState(stored),candidate,key);
 const next=applyCandidate(latest,id,state,key);next.extensions.gflPi[id].advisor.factSnapshot=tuningSnapshot(context.modelInput);next.extensions.gflPi[id].advisor.request=structuredClone(request);
 receiveProject(shared.write(next));advisorMessage='候选已明确应用；仅更新所选 GFL 的 PI。';renderAdvisor();
 }catch(error){advisorMessage=error.message;advisorStale=true;renderAdvisor();}}
function restoreSelected(){try{const latest=shared.read()??project,next=restoreAppliedGains(latest,id,createTuningState(latest.extensions.gflPi[id]));receiveProject(shared.write(next));advisorMessage='已恢复应用前 PI；电气参数未回滚。';renderAdvisor();}catch(error){advisorMessage=error.message;renderAdvisor();}}

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
 $('parameterTables').insertAdjacentHTML('afterbegin','<section class="outer-settings"><h3>外环控制模式</h3>'+select('dMode','d 轴外环',[['P','有功 P'],['Vdc','直流电压 Vdc']])+select('qMode','q 轴外环',[['Q','无功 Q'],['Vac','交流电压 Vac']])+(settings.dMode==='Vdc'?select('capSource','Vdc 电容来源',[['applied','跟随已应用 DC 电容'],['custom','独立分析电容']])+(settings.capSource==='custom'?'<label>总等效 Cbus / μF<input type="number" min="0" step="any" data-setting="customCapUf" aria-label="总等效 Cbus" value="'+(settings.customCapUf??'')+'"></label>':''):'')+'<div id="outerModelSummary"></div></section>');
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
 $('scrScope').textContent=settings.considerScr?(input.gridError||('已启用 · '+input.pccName+' · SCR = '+fmt(input.scr)+'；电网 R/L 与 RC、滤波电压前馈参与标量内环。P/Q/Vac 采用送网电流通道；Vdc 保留桥侧电流功率近似。不含 PLL 和 dq 交叉耦合。')):'未启用：本地 RL 电流对象及理想电压前馈；不使用电网阻抗。Vac 需要勾选本项。';
 document.querySelector('.design-title h1').textContent='GFL · '+settings.dMode+' / '+settings.qMode+' 双环整定';
 const parts=['现有 PI 与候选搜索独立。自动推荐不要求交越目标；指定目标未达到时明确提示。候选只调整 PI，物理参数保持固定，点击应用后才写入。'];
 if(settings.dMode==='Vdc')parts.push('总等效 Cbus = '+(input.dcCapacitanceF>0?fmt(input.dcCapacitanceF*1e6)+' μF':'尚未设置')+'；Vdc 基准 = '+fmt(input.dcVoltage)+' V。采用 Cbus·Vdc·dVdc/dt = Pdc − Pac，假设 DC 输入功率恒定。此分析不把母线钳位于理想电压源；独立电容不修改电路。');
 if(settings.qMode==='Vac')parts.push(input.gridError||('并网点 '+input.pccName+'：Rth = '+fmt(input.gridROhm)+' Ω，Xth = '+fmt(input.gridXOhm)+' Ω；Kvac = Xth / Zb = '+fmt(input.gridXOhm*input.ratedVA/input.voltageLL**2)+'。Vac 为额定点的低频电压灵敏度近似，另一通道保持不变；不含 PLL、网络谐振及 P/Q 耦合，不能据此认定弱网稳定。'));
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
function invalidate(error){valid=false;client.invalidate('模型输入无效，旧候选已过期。');currentEvaluation=null;for(const [k] of filterFields){const el=$('field-'+k);if(el)el.setAttribute('aria-invalid',String(!Number.isFinite(el.valueAsNumber)||el.valueAsNumber<0));}$('designError').textContent=error.message;if($('tuningSummary'))$('tuningSummary').innerHTML='';for(const n of ['bodePlot','bodeMetrics','gainSummary','baseTable','diagramHost','designWarnings','bodeLegend','paperEquations','gainMode'])$(n).innerHTML='';$('saveStatus').textContent='当前输入无效，请修正后继续';$('bodePlot').innerHTML='<div class="note error"><strong>尚未生成 Bode 图</strong><p>'+esc(error.message)+'</p></div>';if(settings?.qMode==='Vac'&&!settings.considerScr){const button=document.createElement('button');button.className='primary';button.textContent='启用 SCR 并计算 Vac / Bode';button.onclick=()=>{$('considerScr').checked=true;$('considerScr').onchange();};$('bodePlot').append(button);}}
function plot(){
 if(!gains){currentEvaluation=null;$('bodePlot').innerHTML='<p class="note">当前模式尚无已保存 PI。请生成候选后明确应用，或在框图中手动填写。</p>';for(const n of ['bodeMetrics','gainSummary'])$(n).innerHTML='';$('gainMode').textContent='未应用参数 · 框图中 0 为未配置值';renderAdvisor();return;}
 validateGains(gains);const full=evaluateGfl(input,gains,{includeSeries:true});const {series,closedSeries,...evaluated}=full;currentEvaluation=evaluated;
 if(input.delaySamples===0){const rational=gflLinearModels(input,gains);for(const k of ['d','q','P','Q'])currentEvaluation.loops[k].step=linearStepMetrics(rational[k],{includePoints:false});}
 $('bodePlot').innerHTML=bodeSvg({min:full.scan.min,max:full.scan.max,series:$('bodeMode').value==='open'?series:closedSeries});
 $('bodeMetrics').innerHTML='<table><thead><tr><th>当前控制环</th><th>全部开环交越 / Hz</th><th>相位裕度 / °</th><th>模型稳定性</th></tr></thead><tbody>'+Object.entries(currentEvaluation.loops).map(([k,l])=>'<tr><td>'+loopLabel(k)+'</td><td>'+(l.crossings.map(x=>fmt(x.frequency)).join(' / ')||'频段内无交越')+'</td><td>'+(l.crossings.map(x=>fmt(x.margin)).join(' / ')||'—')+'</td><td>'+esc(l.stability.status)+'</td></tr>').join('')+'</tbody></table>';
 $('gainSummary').innerHTML='<table><thead><tr><th>当前 PI</th><th>Kp · pu/pu</th><th>Ti · s</th><th>Ts / Ti</th></tr></thead><tbody>'+Object.entries(gains).map(([k,v])=>'<tr><td>'+loopLabel(k)+'</td><td>'+fmt(v.kp)+'</td><td>'+(v.ki===0?'∞（积分关闭）':fmt(tiFromKi(v.ki)))+'</td><td>'+fmt(v.ki/settings.fs)+'</td></tr>').join('')+'</tbody></table>';
 $('gainMode').textContent=(manual?'当前手动 PI。':'当前已保存 PI，导入时不重新生成。')+' '+(input.delaySamples!==0?'含纯延时：仅频域筛查，稳定性/时域未验证。':currentEvaluation.stability.status==='stable'?'当前零延时标量模型极点校核通过。':'当前模型稳定性：'+currentEvaluation.stability.status+'。');
 $('tuningSummary').innerHTML='<p class="small-note">旧固定零点比算法保留作回归参考，不在页面刷新时覆盖增益。新建议见 PI 整定助手。</p>';
 renderAdvisor();
}
function refresh(force=false,persist=true){try{
 client.invalidate(advisorResult?'输入/参数已变化，候选已过期。':'当前 PI 保持原值。');
 const opCtx={...inverterOperatingContext(project,getGfl(project,id)),dcVoltage:connectedDc(project,id).parametersSI.voltageV},op=operatingPoint(opCtx);
 $('operatingPointSummary').innerHTML=operatingSummary(opCtx)+'<p class="small-note">运行点所需桥侧相电压 RMS：'+fmt(op.converterRms)+' V；调制比 m = '+fmt(op.modulation)+'。采用已应用 Lf，忽略 Rf 与电容基波电流。</p>'+(op.modulation>2/Math.sqrt(3)?'<p class="note error">运行点所需调制比超过 SVPWM 线性上限。</p>':'');
 $('dcCapSummary').innerHTML=dcCapSummary(project,getGfl(project,id));
 if(!Array.from(document.querySelectorAll('#parameterTables input')).every(e=>e.checkValidity()))throw Error('请修正模型参数表中的无效输入。');
 input=readInput();design=designGflPi({...input,fi:input.fs/20,fp:input.fs/200});models=outerModels(input);recommended=gains??emptyGains();
 renderOuter();renderFilters();bases();$('paperEquations').innerHTML=settings.considerScr?'<p>SCR 模型：Zp = Zc·Zg/(Zc+Zg)，A = [ZL + (1−D·Hv)Zp]/Zb，Li = Ci·D·Hi/A。不含 PLL 和 dq 交叉耦合。</p>':equationSet(settings);
 $('bodeLegend').innerHTML=bodeLegend({P:settings.dMode,Q:settings.qMode});$('diagramHost').innerHTML=controlDiagram(gains??emptyGains(),recommended,settings);
 $('designWarnings').innerHTML='<p class="small-note">额定点标量线性化；未计 PLL、dq / 外环耦合、饱和或限流。控制周期不等于开关周期；零显式延时不证明真实硬件无延时。</p>';
 if(connectedDc(project,id).parametersSI.resistanceOhm!==0)$('designWarnings').innerHTML+='<p class="note warning">DC 含内阻；本页仍按刚性 DC 电压估算调制上限。</p>';
 $('designError').textContent='';valid=true;plot();if(persist)save();renderAdvisor();
 }catch(e){invalidate(e);renderAdvisor();}}
function diagramFilterEdit(e){
 const el=e.target,key=el.dataset.filterSetting;
 if(!key||e.type!=='change')return;
 if(!Number.isFinite(el.valueAsNumber)||el.valueAsNumber<0){
  el.setCustomValidity('滤波时间常数必须为非负有限数，0 表示旁路。');el.setAttribute('aria-invalid','true');
  valid=false;$('designError').textContent=el.validationMessage;$('saveStatus').textContent='滤波输入无效，请修正；尚未保存';
  for(const n of ['bodePlot','bodeMetrics','gainSummary'])$(n).innerHTML='';return;
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
 if($('diagramHost').querySelector('[data-filter-setting][aria-invalid="true"]')){$('designError').textContent='请先修正标红的滤波输入。';return;}
 try{
  if(!Array.from(document.querySelectorAll('#parameterTables input')).every(e=>e.checkValidity()))throw Error('请先修正参数表中的无效输入。');
  readInput();client.invalidate('当前手动 PI 已改变，旧候选已过期。');gains??=emptyGains();recommended??=gains;const [loop,k]=tag.split('.');
  const value=k==='ti'?kiFromTi(el.value):el.valueAsNumber;
  if(!Number.isFinite(value)||value<0)throw Error('Kp 必须为非负有限数。');
  el.removeAttribute('aria-invalid');
  if($('diagramHost').querySelector('[data-gain][aria-invalid="true"]')){const previous=k==='ti'?tiFromKi(gains[loop].ki):gains[loop][k];el.value=Number.isFinite(previous)?fmt(previous):'∞';$('designError').textContent='请先修正标红的 PI 输入。';return;}
  gains[loop][k==='ti'?'ki':k]=value;manual=true;
  const number=$('diagramHost').querySelector('[data-gain="'+tag+'"]'),slider=$('diagramHost').querySelector('[data-slider="'+tag+'"]');
  const display=k==='ti'?tiFromKi(value):value,rec=k==='ti'?tiFromKi(recommended[loop].ki):recommended[loop][k];
  number.value=Number.isFinite(display)?fmt(display):'∞';number.removeAttribute('aria-invalid');
  slider.disabled=!Number.isFinite(display);
  if(Number.isFinite(display)){if(k==='ti'&&!el.dataset.slider)slider.min=Math.max(Number.MIN_VALUE,display*1e-6);syncGainSlider(slider,display,Number.isFinite(rec)?rec:0,Boolean(el.dataset.slider));}
  $('designError').textContent='';plot();valid=true;rememberGains();save();
 }catch(error){valid=false;el.setAttribute('aria-invalid','true');$('designError').textContent=error.message;$('saveStatus').textContent='PI 输入无效，请修正；尚未保存';for(const n of ['bodePlot','bodeMetrics','gainSummary'])$(n).innerHTML='';}
}

try{const raw=localStorage.getItem(key);if(!raw)throw Error('请先返回电路并选择 GFL 元件。');project=parseProject(raw);shared.accept(project);id=new URLSearchParams(location.search).get('ibr');const c=getGfl(project,id);$('selectedIdentity').textContent=c.name+' · '+id;const stored=project.extensions?.gflPi?.[id]||{};settings=loadSettings(stored);request=requestFrom(stored);gainBank=structuredClone(stored.gainBank||{});gains=stored.gains?structuredClone(stored.gains):null;manual=stored.manual===true;drawTables();$('paperEquations').innerHTML=equationSet();$('bodeLegend').innerHTML=bodeLegend();refresh(false,false);}catch(e){invalidate(e);}
$('diagramHost').addEventListener('change',diagramFilterEdit);
$('diagramHost').addEventListener('input',gainEdit);$('diagramHost').addEventListener('change',gainEdit);
$('considerScr').onchange=()=>{settings.considerScr=$('considerScr').checked;refresh(false,false);save();};
$('retune').onclick=generateCandidates;$('bodeMode').onchange=()=>{if(valid)plot();};
$('exportPi').onclick=()=>{if(!valid||!gains)return;const data={schema:'gridcraft-gfl-pi-v8',ibrId:id,inputs:{...context.modelInput,controlStepSeconds:1/input.fs},factSources:context.sourceMap,request,currentEvaluation,controlConvention:{currentPositive:'converter-to-grid',park:'d=cos, q=-sin; amplitude-invariant',powerPositive:'injection-to-grid',currentError:'reference-minus-filtered-measurement',currentPiVoltageSign:1,decoupling:{d:'-omega*L*iq',q:'+omega*L*id'},outerPolarity:{P:1,Q:-1,Vdc:-1,Vac:-1}},piForm:'Kp + 1/(Ti*s)',tiUnit:'s',parameters:Object.fromEntries(Object.entries(gains).map(([k,v])=>[loopLabel(k),piTimeParameters(v)])),manual,autoTuning:{...(project.extensions?.gflPi?.[id]?.advisor??{}),searchStatus:advisorResult?.searchStatus??'notRun',candidateStatus:advisorResult?(advisorStale?'stale':'preview'):'notRun',applicationEvidence:applicationEvidence(project.extensions?.gflPi?.[id],context.modelInput),modelCoverage:currentEvaluation?.modelCoverage,storedGainsPreserved:true},zeroDelayStability:input.delaySamples===0?Object.fromEntries(Object.entries(currentEvaluation.loops).map(([k,l])=>[loopLabel(k),l.stability.status==='stable'])):null,outerModels:Object.fromEntries(Object.entries(models).map(([k,v])=>[loopLabel(k),{label:v.label,sign:v.sign,gain:v.gain,integrator:v.integrator,filter:v.filter}])),base:design.base,assumptions:'Perfect PLL; rated-point scalar linearization; ideal dq decoupling; selected first-order feedback filters; Vdc uses capacitor energy balance with constant DC input power, not a voltage-clamped ideal source; Vac uses static Xth/Zb sensitivity with other channel held fixed; no PLL or cross-channel dynamics; considerScr enables scalar RC/grid dynamics and filtered PCC feedforward, otherwise local RL only; continuous parallel PI; pure delay; small-signal physical-output linear steps only at zero delay; no EMT or HIL validation.'};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='gfl-pi-'+id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
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
window.addEventListener('pageshow',()=>{try{receiveProject(shared.read());}catch(e){invalidate(e);}});