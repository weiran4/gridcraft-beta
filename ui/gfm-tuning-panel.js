import {mountManualWorkspace} from './gfl-manual-workspace.js';
import {gfmSnapshot} from '../project/gfm-advisor-state.js';
import {tuningSnapshot} from '../project/gfl-tuning-state.js';
import {mountStepPreview} from './gfl-step-preview.js?v=dq1';
import {escapeHtml as esc} from './symbols.js';
const n=v=>Number.isFinite(v)?Number(v.toPrecision(4)).toString():'—';
const ms=v=>Number.isFinite(v)?n(v*1000)+' ms':'—';
const field=(id,key,label,unit,extra='')=>`<label>${label}<span><input id="${id}" data-gfm-request="${key}" type="number" step="any" ${extra}><small>${unit}</small></span></label>`;
export function gfmAdvisorMarkup(){return `<div class="gfm-advisor-heading"><h2>GFM PI 整定助手</h2><span>先比较、后应用 · 不修改成网参数</span></div>
 <div class="gfm-advisor-options"><label>整定方式<select id="gfmAdvisorMode" data-gfm-request="mode"><option value="automatic">自动推荐（无需指定交越）</option><option value="target">指定交越目标</option></select></label>
 <label>性能侧重<select id="gfmAdvisorFocus" data-gfm-request="focus"><option value="balanced">均衡：内环响应 / 超调 / 裕度</option><option value="tracking">参考跟踪：内环稳定时间优先</option></select></label>
 ${field('gfmMinMargin','minMargin','最低相位裕度','°','min="1" max="179"')}${field('gfmPreferredMargin','preferredMargin','优选相位裕度','°','min="1" max="179"')}${field('gfmSeparation','separationRatio','内/外环最小交越比','倍','min="1"')}
 </div><div class="gfm-target-only gfm-advisor-options">
 ${field('gfmFi','fi','电流交越目标','Hz')}${field('gfmFv','fp','电压交越目标','Hz')}${field('gfmTolerance','tolerance','交越相对容差','0–0.5')}
 <label class="gfm-check"><input id="gfmReduction" data-gfm-request="allowReduction" type="checkbox">允许降低交越（不冒充原目标满足）</label>
 ${field('gfmMinimumFi','minimumFi','最低接受电流交越','Hz')}${field('gfmMinimumFv','minimumFp','最低接受电压交越','Hz')}
 </div><details><summary>可选内环性能限制与模型说明</summary><div class="gfm-advisor-options">
 ${field('gfmOvershoot','maxOvershootPercent','最大内环超调（空=不设限）','%','min="0"')}${field('gfmSettling','maxSettlingSeconds','最大 ±2% 稳定时间（空=不设限）','s','min="0"')}
 </div><p class="small-note">P/Q 内部键在 GFM 中表示电压 d/q 控制环。表中阶跃指标固定成网角度和幅值指令，不是 P/f、Q/V 成网外环响应；所选成网模式另作耦合极点检查。最低裕度与交越间隔是工程策略，不是 IEEE 标准要求。允许降频但最低值留空时没有明确的速度底线。</p></details>
 <div class="gfm-advisor-actions"><button id="gfmAnalyze" class="secondary">分析当前 PI</button><button id="gfmGenerate" class="primary">生成候选</button><button id="gfmCancel" class="secondary" disabled>取消搜索</button><button id="gfmRestore" class="secondary" disabled>恢复应用前 PI</button></div>
 <p id="gfmAdvisorStatus" role="status" aria-live="polite"></p><div id="gfmAdvisorDiagnostics"></div>
 <div class="gfm-advisor-choice"><label>所选候选<select id="gfmChoice" disabled><option>尚未生成</option></select></label><button id="gfmApply" class="primary" disabled>应用所选候选</button></div>
 <div id="gfmCompare" class="result-scroll"></div><div id="gfmCoupledCompare"></div><section id="gfmStepPreview"></section>
 <p class="small-note">当前 PI 和下方框图不因生成候选或试调而改变；Bode 参数来源单独标明。候选仅调整电流与电压 PI，Droop/VSG/Synchronverter 参数固定。仅对本次模型与工作点的线性检查负责，不代表 HIL 或限流大扰动通过。</p>`;}
export function mountGfmTuningPanel(host,callbacks){
 host.classList.add('gfm-advisor');host.innerHTML=gfmAdvisorMarkup();const q=id=>host.querySelector('#'+id);
 const preview=mountStepPreview(q('gfmStepPreview'),{workerFactory:()=>new Worker(new URL('./gfm-step-worker.js',import.meta.url),{type:'module'})});
 let lastModel=null,manualView=null;
 const workspace=mountManualWorkspace(q('gfmStepPreview'),{
  onChange:()=>{if(lastModel)render(lastModel);},onStart:callbacks.onManualStart,onComparison:callbacks.onManualComparison,
  onSave:callbacks.onManualSave,onRename:callbacks.onManualRename,onDelete:callbacks.onManualDelete,onSelect:callbacks.onSelect,onApply:callbacks.onManualApply
 },{
  workerFactory:()=>new Worker(new URL('./gfm-manual-worker.js',import.meta.url),{type:'module'}),
  contextKey:m=>gfmSnapshot({input:m.modelInput,settings:m.settings,gains:m.currentGains,request:m.request}),
  factsKey:m=>tuningSnapshot({input:m.modelInput,settings:m.settings,currentGains:m.currentGains}),
  payload:(m,gains,record)=>({input:m.modelInput,settings:m.settings,gains,request:m.request,record})
 });
 host.addEventListener('change',e=>{const el=e.target,key=el.dataset.gfmRequest;if(key){const next={...callbacks.getRequest(),[key]:el.type==='checkbox'?el.checked:el.tagName==='SELECT'?el.value:el.value===''?null:el.valueAsNumber};callbacks.onRequest(next);}else if(el.id==='gfmChoice'){workspace.select();callbacks.onSelect(el.value);}});
 for(const [id,fn]of [['gfmAnalyze','onAnalyze'],['gfmGenerate','onSearch'],['gfmCancel','onCancel'],['gfmRestore','onRestore'],['gfmApply','onApply']])q(id).onclick=()=>callbacks[fn]();
 q('gfmApply').onclick=()=>manualView?.active?callbacks.onManualApply(manualView.candidate,manualView.contextKey):callbacks.onApply();
 function render(model){
  lastModel=model;const {request,current,result,selectedId,busy,stale,message,invalid,canRestore,modeName,input,currentGains,diagnostics=[]}=model;
  host.dataset.busy=String(Boolean(busy));
  for(const el of host.querySelectorAll('[data-gfm-request]')){const value=request[el.dataset.gfmRequest];if(el.type==='checkbox')el.checked=Boolean(value);else if(document.activeElement!==el)el.value=value??'';}
  host.querySelector('.gfm-target-only').hidden=request.mode!=='target';
  q('gfmGenerate').disabled=Boolean(busy||invalid);q('gfmCancel').disabled=!busy;q('gfmAnalyze').disabled=Boolean(invalid);q('gfmRestore').disabled=!canRestore;
  const autoCandidates=result?.candidates??[],selectedAuto=autoCandidates.find(c=>c.id===selectedId)??(selectedId?.startsWith('manual-')?null:autoCandidates[0]);
  manualView=workspace.sync({...model,modelInput:input},selectedAuto);
  const selected=manualView.active?manualView.candidate:selectedAuto,candidates=[...autoCandidates,...(model.manualCandidates??[])];
  if(manualView.active&&!candidates.some(c=>c.id===selected?.id))candidates.push(selected);
  const previewStale=manualView.active?manualView.invalid:stale;
  q('gfmChoice').innerHTML=candidates.length?candidates.map(c=>`<option value="${esc(c.id)}"${selected?.id===c.id?' selected':''}>${esc(c.name??(c.isBaseline?'原参数基线':c.id))} · ${c.requirementsMet?'满足本次要求':'要求未全部满足'}</option>`).join(''):'<option>尚无可比较的候选</option>';
  q('gfmChoice').disabled=!candidates.length||busy;
  q('gfmApply').disabled=Boolean(invalid||busy||manualView.busy||previewStale||!selected?.verified||!selected?.requirementsMet||selected?.incompleteSearch);
  const names={feasibleFound:'候选已生成，尚未应用',targetNotMet:'目标未满足；下列为可比较的备选',noCandidateFound:'本次搜索未找到完成校核的候选',invalidRequest:'整定目标无效',invalidInput:'模型输入无效',budgetExceeded:'搜索预算耗尽；不能据此断言物理不可行',cancelled:'已取消搜索',numericalFailure:'数值校核未完成'};
  q('gfmAdvisorStatus').textContent=message||(stale?'候选已过期，请重新生成。':names[result?.searchStatus]??'当前 PI 保持原值；生成候选不会覆盖。');
  q('gfmAdvisorStatus').className=stale||result?.searchStatus==='targetNotMet'?'warning':'small-note';
  q('gfmAdvisorDiagnostics').innerHTML=[...diagnostics,...(result?.diagnostics??[])].map(d=>`<p class="small-note">${esc(d.message)}</p>`).join('')+(selected?.unmet?.length?`<p class="warning">${selected.unmet.map(esc).join('；')}</p>`:'');
  const labels={d:'电流 d',q:'电流 q',P:'电压 d',Q:'电压 q'},hz=l=>l?.crossings?.map(x=>n(x.frequency)).join(' / ')||'—';
  q('gfmCompare').innerHTML=`<table><thead><tr><th>环</th><th>目标 Hz</th><th>当前 Hz</th><th>候选 Hz</th><th>PM °<br>当前 / 候选</th><th>±2% 稳定时间<br>当前 / 候选</th><th>超调 %<br>当前 / 候选</th></tr></thead><tbody>${Object.entries(labels).map(([k,label])=>{const a=current?.loops[k],b=selected?.evaluation?.loops[k];return `<tr><td>${label}</td><td>${request.mode==='target'?n(k==='d'||k==='q'?request.fi:request.fp):'自动'}</td><td>${hz(a)}</td><td>${hz(b)}</td><td>${n(a?.minMargin)} / ${n(b?.minMargin)}</td><td>${ms(a?.step?.settlingTimeSeconds)} / ${ms(b?.step?.settlingTimeSeconds)}</td><td>${n(a?.step?.overshootPercent)} / ${n(b?.step?.overshootPercent)}</td></tr>`;}).join('')}</tbody></table>`;
  const summary=e=>{if(!e)return '尚未评估';if(e.coupled.status==='notIncluded')return 'SCR 未启用，仅本地标量校核';const c=e.coupled;return `${c.delayModel==='first-order-pade'?'Padé 近似 · ':''}${c.status==='stable'?'耦合极点稳定':c.status==='unstable'?'耦合极点不稳定':c.message||'耦合校核未完成'}；最大实部 ${n(c.alpha)} s⁻¹`;};
  q('gfmCoupledCompare').innerHTML=`<strong>所选 ${esc(modeName)} 成网模式 · 耦合校核</strong><p>当前：${esc(summary(current))}</p><p>候选：${esc(summary(selected?.evaluation))}</p>`;
  preview.render({input,currentGains,candidateGains:previewStale?null:selected?.gains,stale:previewStale,invalid,comparisonLabel:manualView.active?'试调 PI':'候选 PI',
   candidateUnmet:!!(selected&&!selected.requirementsMet),titles:{d:'d 轴电流环',q:'q 轴电流环',P:'d 轴电压环',Q:'q 轴电压环'},
   boundary:'GFM 零延时标量内环阶跃：固定成网角度/幅值指令。不是 P/f、Q/V 或完整成网动态；所选成网模式另看耦合极点。不含限流、饱和、开关及直流能量动态，不等同于 EMT / HIL 实测。'});
 }
 return {render,destroy(){workspace.destroy();preview.destroy();host.replaceChildren();}};
}
