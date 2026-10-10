import {mountGflMainlineResults} from './gfl-mainline-results.js';
import {mountGflDqPanel} from './gfl-dq-panel.js';
import {mountManualWorkspace} from './gfl-manual-workspace.js';
import {mountStepPreview} from './gfl-step-preview.js?v=dq1';
import {escapeHtml as esc} from './symbols.js';
const number=(v,d=3)=>typeof v==='number'&&Number.isFinite(v)?Number(v.toPrecision(d)).toString():'—';
const ms=v=>typeof v==='number'&&Number.isFinite(v)?number(v*1000)+' ms':'—';
export function mountGflTuningPanel(host,callbacks){
 const field=(id,key,label,unit,extra='')=>`<label><span id="${id}Label">${label}</span><span><input id="${id}" data-request="${key}" type="number" step="any" ${extra}><small>${unit}</small></span></label>`;
 host.innerHTML=`<div class="advisor-heading"><h2>PI 整定助手</h2><span>事实参数固定 · 候选先比较、后应用</span></div>
 <div class="advisor-options"><label>整定方式<select id="advisorMode" data-request="mode"><option value="automatic">自动推荐（无需填写交越）</option><option value="target">指定交越目标</option></select></label>
 <label>性能侧重<select id="advisorFocus" data-request="focus"><option value="balanced">均衡：时间 / 超调 / 裕度</option><option value="tracking">参考跟踪：稳定时间优先</option><option disabled>扰动恢复（未建模）</option></select></label>
 ${field('advisorMinMargin','minMargin','最低相位裕度','°','min="1" max="179"')}${field('advisorPreferredMargin','preferredMargin','优选相位裕度','°','min="1" max="179"')}${field('advisorSeparation','separationRatio','内 / 外环最小交越比','倍','min="1"')}
 </div><div class="advisor-targets target-only">${field('advisorFi','fi','电流交越目标','Hz')}${field('advisorFp','fp','外环交越目标','Hz')}${field('advisorTolerance','tolerance','交越相对容差','0–0.5')}
 <label class="advisor-check"><input id="advisorAllowReduction" data-request="allowReduction" type="checkbox">允许降低交越（仍显示是否达到原目标）</label>
 ${field('advisorMinimumFi','minimumFi','最低接受电流交越','Hz')}${field('advisorMinimumFp','minimumFp','最低接受外环交越','Hz')}
 </div><details><summary>可选的性能限制与模型范围</summary><div class="advisor-options">
 ${field('advisorMaxOvershoot','maxOvershootPercent','最大超调（空=不设限）','%','min="0"')}${field('advisorMaxSettling','maxSettlingSeconds','最大 ±2% 稳定时间（空=不设限）','s','min="0"')}
 </div><div class="advisor-options mainline-targets" hidden>
 ${field('advisorMaxSteadyError','maxSteadyStateErrorPercent','两外环最大目标相对稳态误差（空=不设限）','%','min="0"')}
 ${field('advisorCurrentMaxOvershoot','currentTargets.maxOvershootPercent','冻结外环电流实验最大超调（空=不设限）','%','min="0"')}
 ${field('advisorCurrentMaxSettling','currentTargets.maxSettlingSeconds','冻结外环电流实验最大 ±2% 稳定时间（空=不设限）','s','min="0"')}
 ${field('advisorCurrentMaxError','currentTargets.maxSteadyStateErrorPercent','冻结外环电流实验最大稳态误差（空=不设限）','%','min="0"')}
 ${field('advisorOuterCrossPeak','crossAxisLimits.outerPeakAbsPu','外环交叉输出峰值上限（空=不设限）','pu','min="0"')}
 ${field('advisorOuterCrossResidual','crossAxisLimits.outerResidualAbsPu','外环交叉输出残余上限（空=不设限）','pu','min="0"')}
 ${field('advisorCurrentCrossPeak','crossAxisLimits.currentPeakAbsPu','电流交叉输出峰值上限（空=不设限）','pu','min="0"')}
 ${field('advisorCurrentCrossResidual','crossAxisLimits.currentResidualAbsPu','电流交叉输出残余上限（空=不设限）','pu','min="0"')}
 </div><p id="advisorLimitScope" class="small-note">主线通用时间与超调限制用于两外环；冻结外环电流、稳态误差和交叉通道限制须显式填写，空白不产生隐藏门槛。标量模式沿用四环限制。</p><p class="small-note">预设裕度和级联间隔是工程策略，不是 IEEE/国标。指标对应额定点、小信号、实际物理输出；未评估扰动抑制、不确定性、限幅及 HIL 实测。标量非零纯延时只显示频域筛查；主线非零显式延时为 Padé 近似，不可应用。电流上限等硬件能力未配置时，不由本助手推断。</p></details>
 <div class="advisor-actions"><button id="advisorAnalyze">分析当前 PI</button><button class="primary" id="advisorGenerate">生成候选</button><button id="advisorCancel" disabled>取消计算</button><button id="advisorRestore" disabled>恢复应用前 PI</button></div>
 <p id="advisorStatus" role="status" aria-live="polite"></p><div id="advisorDiagnostics"></div>
 <div class="advisor-choice"><label>候选<select id="advisorChoice" disabled><option>尚未生成</option></select></label><button id="advisorApply" class="primary" disabled>应用所选候选</button></div>
 <section id="gflScalarDiagnostics"><h3 id="advisorComparisonTitle">当前 / 候选标量指标</h3><div id="advisorCurrent" class="advisor-table"></div><p class="small-note">比较表不修改下方控制框图；控制框图仍对应当前 PI；Bode 的参数来源会明确标出。试调或生成候选不会应用参数。</p><section id="stepPreview"></section><section id="gflDqPanel"></section></section>`;
 const q=id=>host.querySelector('#'+id);
 const preview=mountStepPreview(q('stepPreview'));
 if(callbacks.mainlineHost)q('gflScalarDiagnostics').before(callbacks.mainlineHost);
 const mainline=callbacks.mainlineHost?mountGflMainlineResults(callbacks.mainlineHost):null;
 const originalStepHeading=q('stepPreview').querySelector('.step-heading h3').textContent,originalStepIntro=q('stepPreview').querySelector('.step-heading p').textContent;
 let lastModel=null,suspended=false,mainlineMode=false,manualView=null,dqGate={enabled:false},baseApplyDisabled=true,baseManualDisabled=true;
 function gateButtons(){const mainlineBlocked=mainlineMode&&(lastModel?.invalid||lastModel?.currentStale||lastModel?.currentBusy||lastModel?.current?.solveStatus!=='completed');
 const blocked=suspended||mainlineBlocked||dqGate.enabled&&(dqGate.busy||!dqGate.ready||!dqGate.candidate?.applicationEligible||dqGate.error);
  q('advisorApply').disabled=!!(baseApplyDisabled||blocked);const button=host.querySelector('#manualApply');if(button)button.disabled=!!(baseManualDisabled||blocked);
 }
 const dqPanel=mountGflDqPanel(q('gflDqPanel'),{onSettings:callbacks.onDqSettings,onState:state=>{dqGate=state;gateButtons();}});
 const workspace=mountManualWorkspace(q('stepPreview'),{
  onChange:()=>{if(lastModel)render(lastModel);},onStart:callbacks.onManualStart,onInvalidate:callbacks.onManualInvalidate,
  onComparison:callbacks.onManualComparison,onSelect:callbacks.onSelect,
  onSave:callbacks.onManualSave,onRename:callbacks.onManualRename,onDelete:callbacks.onManualDelete,onApply:callbacks.onManualApply
 },{editorHost:q('stepPreview')});
 host.addEventListener('change',e=>{const el=e.target,key=el.dataset.request;if(key){const raw={...callbacks.getRequest()};const value=el.type==='checkbox'?el.checked:el.tagName==='SELECT'?el.value:el.value===''?null:el.valueAsNumber;
 if(key.includes('.')){const [group,field]=key.split('.');raw[group]={...(raw[group]??{}),[field]:value};if(Object.values(raw[group]).every(v=>v===null))raw[group]=null;}else raw[key]=value;callbacks.onRequest(raw);}else if(el.id==='advisorChoice'){workspace.select();callbacks.onSelect(el.value||null);}});
 for(const [id,fn]of [['advisorAnalyze','onAnalyze'],['advisorGenerate','onSearch'],['advisorCancel','onCancel'],['advisorRestore','onRestore']])q(id).onclick=()=>callbacks[fn]();
 q('advisorApply').onclick=()=>{if(manualView?.active)callbacks.onManualApply(manualView.candidate,manualView.contextKey);else callbacks.onApply();};
 function render(model){
  lastModel=model;mainlineMode=model.mainlineSelected===true||!!model.resolvedSnapshot;
  q('advisorFocus').innerHTML=mainlineMode?'<option value="balanced">均衡：时间 / 超调 / 稳态误差</option><option value="tracking">参考跟踪：稳定时间优先</option><option disabled>扰动恢复（未建模）</option>':'<option value="balanced">均衡：时间 / 超调 / 裕度</option><option value="tracking">参考跟踪：稳定时间优先</option><option disabled>扰动恢复（未建模）</option>';
  host.querySelector('.mainline-targets').hidden=!mainlineMode;q('gflDqPanel').hidden=mainlineMode;
  q('advisorMaxOvershootLabel').textContent=mainlineMode?'两外环最大超调（空=不设限）':'四环最大超调（空=不设限）';
  q('advisorMaxSettlingLabel').textContent=mainlineMode?'两外环最大 ±2% 稳定时间（空=不设限）':'四环最大 ±2% 稳定时间（空=不设限）';
  q('advisorComparisonTitle').textContent=mainlineMode?'标量种子诊断 · 交越 / 裕度 / 级联间隔（不替代联立结论）':'当前 / 候选标量指标';
  q('stepPreview').querySelector('.step-heading h3').textContent=mainlineMode?'标量诊断 · 四环阶跃与手动 PI 编辑':originalStepHeading;
  q('stepPreview').querySelector('.step-heading p').textContent=mainlineMode?'手动 PI 编辑器仍用于全部四环；这些标量曲线仅供诊断，主线响应和排序见联立结果。':originalStepIntro;
  const {request,current,result,selectedId,busy,message,stale,canRestore,labels={P:'P',Q:'Q'}}=model;
  for(const el of host.querySelectorAll('[data-request]')){const [key,field]=el.dataset.request.split('.'),value=field?request[key]?.[field]:request[key];if(el.type==='checkbox')el.checked=Boolean(value);else if(document.activeElement!==el)el.value=value??'';}
  host.querySelector('.target-only').hidden=request.mode!=='target';q('advisorGenerate').disabled=Boolean(busy);q('advisorAnalyze').disabled=Boolean(model.invalid);q('advisorRestore').disabled=!canRestore;
  const autoCandidates=result?.candidates??[],selectedAuto=autoCandidates.find(c=>c.id===selectedId)??(selectedId?.startsWith('manual-')?null:autoCandidates[0]);
  manualView=workspace.sync(model,selectedAuto);q('advisorCancel').disabled=suspended||!(busy||model.currentBusy||manualView.busy);
  const selected=manualView.active?manualView.candidate:selectedAuto;
  const manualCandidates=model.manualCandidates??[],candidates=[...autoCandidates,...manualCandidates];
  if(manualView.active&&!candidates.some(c=>c.id===selected?.id))candidates.push(selected);
  const option=(c,text)=>`<option value="${esc(c.id)}"${c.id===selected?.id?' selected':''}>${esc(text)}</option>`;
  q('advisorChoice').innerHTML=(selected?'':'<option value="">选择候选（不应用）</option>')+
   (autoCandidates.length?'<optgroup label="自动搜索">'+autoCandidates.map(c=>option(c,(c.isBaseline?'原参数基线':c.id)+(c.requirementsMet?(mainlineMode?' · 主线已校核':' · 标量已校核'):' · 要求未全部满足'))).join('')+'</optgroup>':'')+
   (manualCandidates.length?'<optgroup label="手动暂存">'+manualCandidates.map(c=>option(c,c.name+' · 选择后重新校核')).join('')+'</optgroup>':'')+
   (manualView.active&&selected.id==='manual-draft'?option(selected,'手动试调（尚未命名暂存）'):'');
  q('advisorChoice').value=selected?.id??'';
  q('advisorChoice').disabled=!candidates.length||busy;
  const selectedEvidence=selected?.mainlineEvaluation??selected?.evaluation;
  const sharedBlocked=mainlineMode&&(!selectedEvidence?.application?.eligible||selectedEvidence.solveStatus!=='completed'||selectedEvidence.stability?.status!=='stable'||selectedEvidence.responseQuality!=='completed'||(!manualView.active&&result?.completionScope?.complete!==true));
  q('advisorApply').disabled=Boolean(sharedBlocked||model.invalid||busy||(manualView.active?(manualView.busy||manualView.invalid):stale)||!selected?.verified||!selected?.requirementsMet||selected?.incompleteSearch);
  const statusNames={notRun:'搜索未运行，请检查模型诊断',feasibleFound:'候选已生成；尚未应用',targetNotMet:'目标未满足；下列为可比较的备选',noCandidateFound:'本次搜索未找到完成校核的候选',budgetExceeded:'预算耗尽；不能据此断言不可行',cancelled:'已取消',invalidRequest:'整定目标无效',numericalFailure:'数值校核未完成'};
  q('advisorStatus').textContent=message||(stale?'候选已过期，请重新生成。':result?statusNames[result.searchStatus]:'当前 PI 保持原值。选择整定方式后生成候选。');
  q('advisorStatus').className=(stale||model.invalid||['targetNotMet','noCandidateFound','invalidRequest','numericalFailure'].includes(result?.searchStatus))?'note warning':'small-note';
  if(manualView.active)q('advisorStatus').textContent=manualView.invalid?'试调输入无效；当前 PI 保持原值。':manualView.busy?'正在校核手动试调；当前 PI 保持原值。':selected?.requirementsMet?'手动试调已通过当前要求；尚未应用。':'手动试调尚未满足全部要求，可命名暂存后继续比较。';
  if(model.dqSettings?.enabled)q('advisorStatus').textContent+=' 已启用 PLL/dq 约束标量搜索；性能仍按标量指标排序，非 MIMO 优化或稳健性保证。';
  if(result?.dqScreening?.enabled){const d=result.dqScreening;q('advisorStatus').textContent+=` 联立筛选 ${d.evaluated}/${d.maxEvaluations}：通过 ${d.accepted}，不稳定 / 临界 ${d.rejected}，未完成 ${d.unverified}。${stale?'此统计对应旧设置。':''}`;}
  const diagnostics=[...(model.diagnostics??[]),...(manualView.active?[]:(result?.diagnostics??[]))];
  q('advisorDiagnostics').innerHTML=diagnostics.map(d=>`<p class="small-note${d.severity==='error'?' error':''}">${esc(d.field?d.field+'：':'')}${esc(d.message)}</p>`).join('')+(selected?.unmet?.length?`<p class="note warning">${selected.unmet.map(esc).join('；')}</p>`:'');
  const scalarCurrent=mainlineMode?current?.scalarDiagnostics:current,scalarCandidate=mainlineMode?selectedEvidence?.scalarDiagnostics:selected?.evaluation;
  const rows=['d','q','P','Q'].map(k=>{const a=scalarCurrent?.loops?.[k],b=scalarCandidate?.loops?.[k];const hz=l=>l?.crossings?.map(x=>number(x.frequency)).join(' / ')||'—';return `<tr><td>${esc(labels[k]??k)}</td><td>${request.mode==='target'?number(k==='d'||k==='q'?request.fi:request.fp):'自动'}</td><td>${hz(a)}</td><td>${hz(b)}</td><td>${number(a?.minMargin)} / ${number(b?.minMargin)}</td><td>${ms(a?.step?.settlingTimeSeconds)} / ${ms(b?.step?.settlingTimeSeconds)}</td><td>${number(a?.step?.overshootPercent)} / ${number(b?.step?.overshootPercent)}</td><td>${number(a?.bandwidth?.hz)} / ${number(b?.bandwidth?.hz)}</td></tr>`;});
  q('advisorCurrent').innerHTML=`<table><thead><tr><th>环</th><th>目标 Hz</th><th>当前 Hz</th><th>候选 Hz</th><th>PM °<br>当前 / 候选</th><th>±2% 稳定时间<br>当前 / 候选</th><th>超调 %<br>当前 / 候选</th><th>−3 dB Hz<br>当前 / 候选</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  baseApplyDisabled=q('advisorApply').disabled;baseManualDisabled=(host.querySelector('#manualApply')?.disabled??true)||sharedBlocked||busy;
  preview.render({input:model.modelInput,currentGains:model.currentGains,candidateGains:manualView.active?(manualView.invalid?null:selected?.gains):(stale?null:selected?.gains),stale:manualView.active?false:stale,invalid:model.invalid,labels,candidateUnmet:Boolean(selected&&!selected.requirementsMet),comparisonLabel:manualView.active?selected.name:'候选 PI'});
  callbacks.onComparisonSelection?.(!suspended&&!stale&&!manualView.invalid&&!model.invalid&&selected?{name:selected.name??selected.id,gains:selected.gains}:null);
  if(mainline){callbacks.mainlineHost.hidden=!mainlineMode;if(mainlineMode)mainline.render({current,candidate:model.invalid||current?.solveStatus!=='completed'||(manualView.active?manualView.invalid:stale)?null:selected,stale:suspended||model.invalid||model.currentStale,busy:model.currentBusy||busy||manualView.busy});}
  dqPanel.render({input:model.dqInput??model.modelInput,settings:model.dqSettings,currentGains:model.currentGains,candidateGains:manualView.active?(manualView.invalid?null:selected?.gains):(stale?null:selected?.gains),invalid:model.invalid,stale:manualView.active?false:stale});gateButtons();
 }
 return {render,suspend(reason='已取消面板计算；试调草稿保留。'){suspended=true;preview.suspend(reason);workspace.suspend(reason);q('advisorCancel').disabled=true;q('advisorApply').disabled=true;const button=host.querySelector('#manualApply');if(button)button.disabled=true;},resume(){if(!suspended)return;suspended=false;workspace.resume();preview.resume();if(lastModel)render(lastModel);},destroy(){workspace.destroy();preview.destroy();dqPanel.destroy();mainline?.destroy();host.replaceChildren();}};
}
