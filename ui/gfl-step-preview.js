import {createStepClient} from './gfl-step-client.js';
import {stepResponseSvg} from './gfl-step-plot.js';
import {escapeHtml as esc} from './symbols.js';
const finite=Number.isFinite,number=x=>finite(x)?Number(x.toPrecision(3)).toString():'—';
const time=x=>finite(x)?number(x<2?x*1000:x)+(x<2?' ms':' s'):'—';
const reasons={missingGains:'尚无已保存的 PI',unsupportedDelay:'含非零纯延时：当前版本尚不支持相应时域预览，不以零延时曲线替代。',unstable:'当前线性模型不稳定，未绘制可能误导的稳定曲线。',marginal:'当前模型存在临界稳定极点，稳定响应未确认。',numericalFailure:'数值计算未完成，未提供响应结论。',resolutionLimited:'采样精度未收敛，暂不绘制响应。',windowExceeded:'在允许观察窗内未确认稳定，暂不绘制响应。',undefinedDcGain:'没有可用于此阶跃评价的非零有限最终增益。',invalidInput:'模型输入不足或无效。'};
export function mountStepPreview(host,{workerFactory=()=>new Worker(new URL('./gfl-step-worker.js',import.meta.url),{type:'module'})}={}){
 host.classList.add('step-preview');host.setAttribute('aria-label','动态响应预览');
 host.innerHTML=`<div class="step-heading"><div><h3>动态响应预览</h3><p>看曲线比较：多久跟上、冲过头多少、多久稳住。</p></div><span class="step-test-label">参考阶跃 · 归一化</span></div>
 <div class="step-toolbar"><label>控制环 <select id="stepLoop" aria-label="响应预览控制环"></select></label><div class="step-legends">
 <label class="step-current"><input id="stepShowCurrent" type="checkbox" checked><span class="step-line-key"></span>当前 PI</label>
 <label class="step-candidate"><input id="stepShowCandidate" type="checkbox" checked><span class="step-line-key dashed"></span>候选 PI</label>
 <span><i class="step-reference-key"></i>目标</span></div><label class="step-window"><input id="stepFullWindow" type="checkbox">完整观察窗</label></div>
 <p id="stepPreviewNotice" class="step-notice" role="status" aria-live="polite"></p><div id="stepPreviewPlot" class="step-plot"></div>
 <div id="stepPreviewMetrics" class="step-metrics"></div>
 <p class="step-caption">0→1 表示参考量小扰动的归一化增量，不是从零电压启动，也不是实际满功率阶跃。实线为当前 PI，虚线为候选；圆点标峰值，竖虚线标稳定时间。</p>
 <details class="step-scope"><summary>曲线和指标怎样读？</summary><p>浅色带是目标 1±2%。上升时间按最终变化量的 10%→90% 计算；超调和稳定时间均以各自解析最终值为基准。最终误差为 1−最终值，以单位参考增量的百分比显示。若最终值不等于 1，另外显示该曲线最终值的 ±2% 带，不能将“已稳定”误认成“跟踪目标无误差”。</p><p>自动视窗聚焦较慢曲线的稳定过程；勾选完整观察窗可查看已计算尾部。曲线只连接求解器实际采样点，不外推未计算的尾部。两条曲线共用时间轴和纵轴，保持真实增益，不各自缩放至 1。</p></details>
 <p class="step-boundary">零延时、小信号线性预览；不含 PLL、完整 dq 耦合、限流、饱和或故障过程，不等同于 EMT / HIL 实测。</p>`;
 const q=id=>host.querySelector('#'+id);let model=null,data=null,mode=null,loop='d',loading=false,error='',destroyed=false;
 function card(id,label,r){
  if(!r||r.status!=='ok')return `<section class="step-metric-card ${id}"><h4>${label}</h4><p>${esc(reasons[r?.status]||'暂无可比较数据')}${r?.message?' '+esc(r.message):''}</p></section>`;
  const metrics=[['rise','10–90% 上升时间',time(r.riseTimeSeconds)],['overshoot','超调',number(r.overshootPercent)+'%'],['settling','±2% 稳定时间',time(r.settlingTimeSeconds)],['error','最终误差',number(r.finalError*100)+'%']];
  return `<section class="step-metric-card ${id}"><h4>${label}</h4><div class="step-metric-grid">${metrics.map(([key,name,val])=>`<div><span>${name}</span><strong data-step-metric="${id}-${key}">${val}</strong></div>`).join('')}</div>${Math.abs(r.finalError)>.00001?'<p class="step-warning">最终值 ≠ 目标；已稳定不代表进入目标误差带。</p>':''}</section>`;
 }
 function draw(){
  if(destroyed)return;const hasCurrent=data?.current?.status==='ok',hasCandidate=data?.candidate?.status==='ok';
  q('stepShowCurrent').disabled=!hasCurrent;q('stepShowCandidate').disabled=!hasCandidate;
  host.dataset.state=loading?'loading':data?'ready':'empty';
  const note=model?.stale?'候选已过期，已隐藏；当前 PI 按当前条件预览。':model?.candidateUnmet?'候选尚未全部满足整定要求；曲线仅用于比较，不表示可直接应用。':!model?.candidateGains?'尚无有效候选，先看当前 PI；生成候选后可叠加比较。':'当前与所选候选使用相同参考阶跃、时间轴和幅值尺度。';
  q('stepPreviewNotice').textContent=error|| (loading?'正在更新响应曲线…':note);
  q('stepPreviewPlot').innerHTML=loading?'<div class="step-empty">参数已变化，正在重算；不会继续显示旧曲线。</div>':data?stepResponseSvg(data,{width:Math.max(340,q('stepPreviewPlot').clientWidth||900),showCurrent:q('stepShowCurrent').checked,showCandidate:q('stepShowCandidate').checked,fullWindow:q('stepFullWindow').checked}):'<div class="step-empty">请补齐有效输入后查看响应。</div>';
  q('stepPreviewMetrics').innerHTML=data?card('step-current','当前 PI',data.current)+(model?.candidateGains?card('step-candidate','所选候选 PI',data.candidate):''):'';
 }
 const client=createStepClient({workerFactory,onEvent:event=>{
  if(event.type==='loading'){data=null;loading=true;error='';}
  else if(event.type==='result'){data=event.result;loading=false;error='';}
  else{data=null;loading=false;error=event.message||'';}draw();
 }});
 function update(){if(!model||model.invalid||!model.input){client.clear('输入无效或未配置；旧响应已清除。');return;}
  client.update({input:model.input,currentGains:model.currentGains??null,candidateGains:model.stale?null:model.candidateGains??null,loop});
  draw();
 }
 q('stepLoop').onchange=e=>{loop=e.target.value;update();};
 for(const id of ['stepShowCurrent','stepShowCandidate','stepFullWindow'])q(id).onchange=draw;
 const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>draw()):null;observer?.observe(q('stepPreviewPlot'));
 return {render(next){
  model=next;const labels=next.labels??{P:'P',Q:'Q'},newMode=labels.P+'/'+labels.Q;
  if(mode!==newMode){mode=newMode;loop=labels.P==='Vdc'?'P':'d';q('stepLoop').innerHTML=[['d','d 轴电流'],['q','q 轴电流'],['P',labels.P+' 外环'],['Q',labels.Q+' 外环']].map(([key,label])=>`<option value="${key}">${esc(label)}</option>`).join('');q('stepLoop').value=loop;}
  update();
 },destroy(){destroyed=true;observer?.disconnect();client.destroy();host.replaceChildren();}};
}
