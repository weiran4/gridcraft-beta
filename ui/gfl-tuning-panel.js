import {escapeHtml as esc} from './symbols.js';
const number=(v,d=3)=>typeof v==='number'&&Number.isFinite(v)?Number(v.toPrecision(d)).toString():'—';
const ms=v=>typeof v==='number'&&Number.isFinite(v)?number(v*1000)+' ms':'—';
export function mountGflTuningPanel(host,callbacks){
 const field=(id,key,label,unit,extra='')=>`<label>${label}<span><input id="${id}" data-request="${key}" type="number" step="any" ${extra}><small>${unit}</small></span></label>`;
 host.innerHTML=`<div class="advisor-heading"><h2>PI 整定助手</h2><span>事实参数固定 · 候选先比较、后应用</span></div>
 <div class="advisor-options"><label>整定方式<select id="advisorMode" data-request="mode"><option value="automatic">自动推荐（无需填写交越）</option><option value="target">指定交越目标</option></select></label>
 <label>性能侧重<select id="advisorFocus" data-request="focus"><option value="balanced">均衡：时间 / 超调 / 裕度</option><option value="tracking">参考跟踪：稳定时间优先</option><option disabled>扰动恢复（未建模）</option></select></label>
 ${field('advisorMinMargin','minMargin','最低相位裕度','°','min="1" max="179"')}${field('advisorPreferredMargin','preferredMargin','优选相位裕度','°','min="1" max="179"')}${field('advisorSeparation','separationRatio','内 / 外环最小交越比','倍','min="1"')}
 </div><div class="advisor-targets target-only">${field('advisorFi','fi','电流交越目标','Hz')}${field('advisorFp','fp','外环交越目标','Hz')}${field('advisorTolerance','tolerance','交越相对容差','0–0.5')}
 <label class="advisor-check"><input id="advisorAllowReduction" data-request="allowReduction" type="checkbox">允许降低交越（仍显示是否达到原目标）</label>
 ${field('advisorMinimumFi','minimumFi','最低接受电流交越','Hz')}${field('advisorMinimumFp','minimumFp','最低接受外环交越','Hz')}
 </div><details><summary>可选的性能限制与模型范围</summary><div class="advisor-options">
 ${field('advisorMaxOvershoot','maxOvershootPercent','最大超调（空=不设限）','%','min="0"')}${field('advisorMaxSettling','maxSettlingSeconds','最大 ±2% 稳定时间（空=不设限）','s','min="0"')}
 </div><p class="small-note">预设裕度和级联间隔是工程策略，不是 IEEE/国标。指标对应额定点、小信号、实际物理输出；未评估扰动抑制、不确定性、限幅及 HIL 实测。非零纯延时只显示频域筛查。电流上限等硬件能力未配置时，不由本助手推断。</p></details>
 <div class="advisor-actions"><button id="advisorAnalyze">分析当前 PI</button><button class="primary" id="advisorGenerate">生成候选</button><button id="advisorCancel" disabled>取消搜索</button><button id="advisorRestore" disabled>恢复应用前 PI</button></div>
 <p id="advisorStatus" role="status" aria-live="polite"></p><div id="advisorDiagnostics"></div>
 <div class="advisor-choice"><label>候选<select id="advisorChoice" disabled><option>尚未生成</option></select></label><button id="advisorApply" class="primary" disabled>应用所选候选</button></div>
 <div id="advisorCurrent" class="advisor-table"></div><p class="small-note">比较表不修改下方控制框图；框图和 Bode 始终对应当前 PI。生成候选不会改变电路或已有增益。</p>`;
 const q=id=>host.querySelector('#'+id);
 host.addEventListener('change',e=>{const el=e.target,key=el.dataset.request;if(key){const raw={...callbacks.getRequest()};raw[key]=el.type==='checkbox'?el.checked:el.tagName==='SELECT'?el.value:el.value===''?null:el.valueAsNumber;callbacks.onRequest(raw);}else if(el.id==='advisorChoice')callbacks.onSelect(el.value);});
 for(const [id,fn]of [['advisorAnalyze','onAnalyze'],['advisorGenerate','onSearch'],['advisorCancel','onCancel'],['advisorApply','onApply'],['advisorRestore','onRestore']])q(id).onclick=()=>callbacks[fn]();
 return {render(model){
  const {request,current,result,selectedId,busy,message,stale,canRestore,labels={P:'P',Q:'Q'}}=model;
  for(const el of host.querySelectorAll('[data-request]')){const value=request[el.dataset.request];if(el.type==='checkbox')el.checked=Boolean(value);else if(document.activeElement!==el)el.value=value??'';}
  host.querySelector('.target-only').hidden=request.mode!=='target';q('advisorGenerate').disabled=Boolean(busy);q('advisorCancel').disabled=!busy;q('advisorAnalyze').disabled=Boolean(model.invalid);q('advisorRestore').disabled=!canRestore;
  const candidates=result?.candidates??[],selected=candidates.find(c=>c.id===selectedId)??candidates[0];
  q('advisorChoice').innerHTML=candidates.length?candidates.map(c=>`<option value="${esc(c.id)}"${c===selected?' selected':''}>${esc(c.isBaseline?'原参数基线':c.id)} · ${c.verified?'零延时模型已校核':'仅频域筛查'}${c.requirementsMet?'':' · 要求未全部满足'}</option>`).join(''):'<option>尚无可比较的候选</option>';
  q('advisorChoice').disabled=!candidates.length||busy;
  q('advisorApply').disabled=Boolean(model.invalid||busy||stale||!selected?.verified||!selected?.requirementsMet||selected?.incompleteSearch);
  const statusNames={feasibleFound:'候选已生成；尚未应用',targetNotMet:'目标未满足；下列为可比较的备选',noCandidateFound:'本次搜索未找到完成校核的候选',budgetExceeded:'预算耗尽；不能据此断言不可行',cancelled:'已取消',invalidRequest:'整定目标无效',numericalFailure:'数值校核未完成'};
  q('advisorStatus').textContent=message||(stale?'候选已过期，请重新生成。':result?statusNames[result.searchStatus]:'当前 PI 保持原值。选择整定方式后生成候选。');
  q('advisorStatus').className=(stale||model.invalid||['targetNotMet','noCandidateFound','invalidRequest','numericalFailure'].includes(result?.searchStatus))?'note warning':'small-note';
  const diagnostics=[...(model.diagnostics??[]),...(result?.diagnostics??[])];
  q('advisorDiagnostics').innerHTML=diagnostics.map(d=>`<p class="small-note${d.severity==='error'?' error':''}">${esc(d.field?d.field+'：':'')}${esc(d.message)}</p>`).join('')+(selected?.unmet?.length?`<p class="note warning">${selected.unmet.map(esc).join('；')}</p>`:'');
  const rows=['d','q','P','Q'].map(k=>{const a=current?.loops?.[k],b=selected?.evaluation?.loops?.[k];const hz=l=>l?.crossings?.map(x=>number(x.frequency)).join(' / ')||'—';return `<tr><td>${esc(labels[k]??k)}</td><td>${request.mode==='target'?number(k==='d'||k==='q'?request.fi:request.fp):'自动'}</td><td>${hz(a)}</td><td>${hz(b)}</td><td>${number(a?.minMargin)} / ${number(b?.minMargin)}</td><td>${ms(a?.step?.settlingTimeSeconds)} / ${ms(b?.step?.settlingTimeSeconds)}</td><td>${number(a?.step?.overshootPercent)} / ${number(b?.step?.overshootPercent)}</td><td>${number(a?.bandwidth?.hz)} / ${number(b?.bandwidth?.hz)}</td></tr>`;});
  q('advisorCurrent').innerHTML=`<table><thead><tr><th>环</th><th>目标 Hz</th><th>当前 Hz</th><th>候选 Hz</th><th>PM °<br>当前 / 候选</th><th>±2% 稳定时间<br>当前 / 候选</th><th>超调 %<br>当前 / 候选</th><th>−3 dB Hz<br>当前 / 候选</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
 },destroy(){host.replaceChildren();}};
}
