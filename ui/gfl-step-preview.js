import {createStepClient} from './gfl-step-client.js';
import {stepResponseSvg} from './gfl-step-plot.js';
const keys=['d','q','P','Q'];
const finite=Number.isFinite,number=x=>finite(x)?Number(x.toPrecision(3)).toString():'—';
const time=x=>finite(x)?number(x<2?x*1000:x)+(x<2?' ms':' s'):'—';
const reasons={missingGains:'尚无已保存的 PI',unsupportedDelay:'非零纯延时：本版本不提供相应时域预览，不用零延时曲线替代。',unstable:'当前模型不稳定，未绘制稳定曲线。',marginal:'存在临界极点，稳定响应未确认。',numericalFailure:'数值计算未完成，暂不提供响应结论。',resolutionLimited:'采样精度未收敛，暂不绘制响应。',windowExceeded:'允许观察窗内未确认稳定。',undefinedDcGain:'没有有限非零最终增益可供此阶跃评价。',invalidInput:'模型输入不足或无效。'};
const fields=[['rise','10–90% 上升时间'],['overshoot','超调'],['settling','±2% 稳定时间'],['error','最终误差']];

/** Persistent panel slots: data loading never removes geometry above PI inputs. */
export function mountStepPreview(host,{workerFactory=()=>new Worker(new URL('./gfl-step-worker.js',import.meta.url),{type:'module'})}={}){
 host.classList.add('step-preview');host.setAttribute('aria-label','动态响应预览');
 host.innerHTML=`<div class="step-heading"><div><h3>动态响应预览 · 四环对比</h3><p>每格一个控制环，直接比较跟踪速度、超调和稳定过程。</p></div><span class="step-test-label">参考阶跃 · 归一化</span></div>
 <div class="step-toolbar"><div class="step-legends">
 <label class="step-current"><input id="stepShowCurrent" type="checkbox" checked><span class="step-line-key"></span>当前 PI</label>
 <label class="step-candidate"><input id="stepShowCandidate" type="checkbox" checked><span class="step-line-key dashed"></span>候选 PI</label>
 <span><i class="step-reference-key"></i>目标</span></div><label class="step-window"><input id="stepFullWindow" type="checkbox">完整观察窗</label></div>
 <p id="stepPreviewNotice" class="step-notice" role="status" aria-live="polite"></p>
 <div id="stepPreviewPlot" class="step-loop-grid">${keys.map(k=>`<section class="step-loop-card" data-step-loop="${k}"><h4 id="stepTitle-${k}"></h4>
 <div id="stepPlot-${k}" class="step-plot" aria-label="${k} 响应图"></div>
 <div class="step-metric-slot" data-step-metrics="${k}"><table class="step-comparison"><thead><tr><th>指标</th><th class="step-current">当前 PI</th><th class="step-candidate"><span class="step-comparison-name">候选 PI</span></th></tr></thead><tbody>${fields.map(([key,label])=>`<tr><th>${label}</th><td data-step-metric="${k}-current-${key}">—</td><td data-step-metric="${k}-candidate-${key}">—</td></tr>`).join('')}</tbody></table></div>
 <p id="stepNotice-${k}" class="step-loop-notice"></p></section>`).join('')}</div>
 <p class="step-caption">每格内两条曲线共用时间和幅值坐标；不同环的自动视窗可不同。0→1 是小扰动的归一化增量，不是从零电压启动或满功率阶跃。</p>
 <details class="step-scope"><summary>曲线和指标怎样读？</summary><p>实线为当前 PI，虚线为候选；圆点标峰值，竖虚线标稳定时间。浅色带是目标 1±2%。上升时间按最终变化量的 10%→90% 计算；超调和稳定时间以各自解析最终值为基准。最终误差为 1−最终值，以单位参考增量的百分比显示。</p><p>若最终值不等于 1，另画该最终值的 ±2% 带，并保留最终误差，不把每条输出强行缩放到 1。自动视窗聚焦该格较慢响应；完整观察窗显示已计算尾部，不外推未计算的波形。</p></details>
 <p class="step-boundary">零延时、小信号线性预览；不含 PLL、完整 dq 耦合、限流、饱和或故障过程，不等同于 EMT / HIL 实测。</p>`;
 const q=id=>host.querySelector('#'+id),plots=Object.fromEntries(keys.map(k=>[k,q('stepPlot-'+k)]));
 let model=null,data=null,loading=false,error='',destroyed=false,resizeFrame=null;
 function status(r,label){
  if(!r)return '';
  if(r.status!=='ok')return label+'：'+(reasons[r.status]||'响应未评估')+(r.message?' '+r.message:'');
  if(Math.abs(r.finalError)>.00001)return label+'最终值 ≠ 目标；已稳定不代表跟踪无误差。';
  return '';
 }
 function drawCharts(){
  if(destroyed)return;
  for(const k of keys){const plot=plots[k],response=data?.loops?.[k];
   plot.innerHTML=loading?'<div class="step-empty">正在重算，旧曲线已隐藏…</div>':response?stepResponseSvg(response,{width:Math.max(260,plot.clientWidth||540),height:270,clipId:'step-clip-'+k,showCurrent:q('stepShowCurrent').checked,showCandidate:q('stepShowCandidate').checked,fullWindow:q('stepFullWindow').checked}):'<div class="step-empty">暂无有效响应</div>';
  }
 }
 function draw(){
  if(destroyed)return;
  const some=side=>keys.some(k=>data?.loops?.[k]?.[side]?.status==='ok');
  q('stepShowCurrent').disabled=!some('current');q('stepShowCandidate').disabled=!some('candidate');
  host.dataset.state=loading?'loading':data?'ready':'empty';host.setAttribute('aria-busy',String(loading));
  const note=model?.stale?'候选已过期，四格候选曲线已隐藏；当前 PI 按当前条件预览。':model?.candidateUnmet?'候选尚未全部满足整定要求；波形仅用于比较。':!model?.candidateGains?'尚无有效候选，先看当前 PI；生成候选后四格将同时叠加比较。':'四个环同时显示；蓝色实线为当前 PI，绿色虚线为所选候选。';
  q('stepPreviewNotice').textContent=error||(loading?'正在更新四个环的响应，图表位置保持不变…':note);
  for(const k of keys){const r=data?.loops?.[k];
   for(const side of ['current','candidate']){const value=r?.[side],ok=value?.status==='ok';const vals=ok?{rise:time(value.riseTimeSeconds),overshoot:number(value.overshootPercent)+'%',settling:time(value.settlingTimeSeconds),error:number(value.finalError*100)+'%'}:{};
    for(const [key]of fields)host.querySelector(`[data-step-metric="${k}-${side}-${key}"]`).textContent=vals[key]??'—';
   }
   const messages=loading?['正在重算；指标将在计算完成后更新。']:error?[error]:[status(r?.current,'当前'),model?.candidateGains?status(r?.candidate,'候选'):'尚无有效候选。'].filter(Boolean);
   q('stepNotice-'+k).textContent=messages.join(' ');q('stepNotice-'+k).title=messages.join(' ');
  }
  drawCharts();
 }
 const client=createStepClient({workerFactory,onEvent:event=>{
  if(event.type==='loading'){data=null;loading=true;error='';}
  else if(event.type==='result'){data=event.result;loading=false;error='';}
  else{data=null;loading=false;error=event.message||'';}draw();
 }});
 function update(){
  if(!model||model.invalid||!model.input){client.clear('输入无效或未配置；旧响应已清除。');return;}
  client.update({layout:'grid',input:model.input,currentGains:model.currentGains??null,candidateGains:model.stale?null:model.candidateGains??null});draw();
 }
 for(const id of ['stepShowCurrent','stepShowCandidate','stepFullWindow'])q(id).onchange=drawCharts;
 // Observe width only. Replacing SVG height must not trigger a resize/redraw loop.
 const widths=new WeakMap();
 const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(entries=>{
  const changed=entries.some(({target,contentRect})=>{const last=widths.get(target);widths.set(target,contentRect.width);return last===undefined||Math.abs(last-contentRect.width)>.5;});
  if(changed&&resizeFrame===null)resizeFrame=requestAnimationFrame(()=>{resizeFrame=null;drawCharts();});
 }):null;
 Object.values(plots).forEach(p=>observer?.observe(p));
 return {render(next){
  model=next;const labels=next.labels??{P:'P',Q:'Q'},names=next.titles??{d:'d 轴电流环',q:'q 轴电流环',P:labels.P+' 外环',Q:labels.Q+' 外环'};
  if(next.boundary)host.querySelector('.step-boundary').textContent=next.boundary;
  for(const k of keys)q('stepTitle-'+k).textContent=names[k];host.querySelectorAll('.step-comparison-name').forEach(el=>{el.textContent=next.comparisonLabel??'候选 PI';el.title=el.textContent;});update();
 },destroy(){destroyed=true;observer?.disconnect();if(resizeFrame!==null)cancelAnimationFrame(resizeFrame);client.destroy();host.replaceChildren();}};
}
