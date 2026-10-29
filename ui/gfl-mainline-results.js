/** Pure presentation of shared Worker evidence. No solver, matrix or target work. */
import {bodeSvg} from './bode-plot.js';
import {escapeHtml as esc} from './symbols.js';
const outer='outer-reference-closed',inner='current-reference-frozen-outer';
const names={[outer]:'完整外环参考实验',[inner]:'电流参考实验 · 冻结外环输出增量'};
const fmt=v=>Number.isFinite(v)?Number(v.toPrecision(6)).toString():'—';
const normalizeDisplay=value=>({units:value?.units==='si'?'si':'pu',amplitude:value?.amplitude==='normalized'?'normalized':'actual',quantity:value?.amplitude==='normalized'?'increment':value?.quantity==='absolute'?'absolute':'increment'});
const resultOf=value=>value?.mainlineEvaluation??value?.evaluation??value;
const valid=e=>e?.modelId==='gfl-dq-reference-v1'&&e.solveStatus==='completed'&&e.model;
const descriptors=(experiment,id,kind)=>experiment?.model?.[kind]?.find(p=>p.id===id);
const label=(experiment,id,kind)=>descriptors(experiment,id,kind)?.labelZh??id;
const attrs=(e,experimentId,inputId,outputId)=>`data-experiment-id="${esc(experimentId)}" data-input-id="${esc(inputId)}" data-output-id="${esc(outputId)}" data-evaluation-fingerprint="${esc(e.evaluationFingerprint)}" data-experiment-fingerprint="${esc(e.experimentFingerprints?.[experimentId])}"`;

/** Only increments can be normalized. SI conversion uses the output's declared
 * base after adding its corresponding y0, never a guessed current/voltage base.
 * Normalized views are pu output / requested pu reference, independently of SI.
 */
export function projectGflResponse(experiment,response,outputId,display={}){
 const d=normalizeDisplay(display),model=experiment?.model,index=model?.outputs?.findIndex(p=>p.id===outputId)??-1,port=model?.outputs?.[index],channel=response?.channels?.find(c=>c.outputId===outputId);
 const bad=reason=>({available:false,reason,points:[],quantity:d.quantity,unit:null});
 if(!port||!channel||port.applicable===false||!Number.isFinite(response.amplitudePu)||response.amplitudePu===0)return bad('通道或请求幅值无效。');
 const normalized=d.amplitude==='normalized',si=d.units==='si'&&!normalized;
 if(si&&(!Number.isFinite(port.baseSI)||port.baseSI<=0||!port.baseUnit))return bad('此通道无已声明 SI 换算基准。');
 const bias=d.quantity==='absolute'?model.operatingPoint?.y0?.[index]:0;
 if(!Number.isFinite(bias))return bad('此通道工作点输出未知。');
 const scale=normalized?1/response.amplitudePu:si?port.baseSI:1;
 const samples=response.points??[];
 if(!Array.isArray(samples)||samples.some(p=>!Number.isFinite(p?.t)||!Number.isFinite(p?.y?.[index])))return bad('此通道响应含无效数值。');
 const points=samples.map(p=>{const y=(p.y[index]+bias)*scale;return {t:p.t,y:y===0?0:y};});
 if(points.some(p=>!Number.isFinite(p.t)||!Number.isFinite(p.y)))return bad('此通道响应含非有限数值。');
 const target=Number.isFinite(channel.targetDelta)?(bias+channel.targetDelta)*scale:null;
 return {available:points.length>0,points,target,bandHalfWidth:channel.role==='tracking'?.02*Math.abs(response.amplitudePu*scale):null,
  unit:normalized?'pu / 请求参考 pu':si?port.baseUnit:port.unit??'pu',quantity:d.quantity,role:channel.role,amplitudePu:response.amplitudePu,bias};
}

/** Closed physical output / reference, row=output and column=input. */
export function projectGflFrequency(evaluation,outputId,inputId,units='pu'){
 const f=evaluation?.frequencyResponse,experiment=evaluation?.experiments?.[outer]?.experiment,row=f?.outputIds?.indexOf(outputId)??-1,col=f?.inputIds?.indexOf(inputId)??-1;
 if(row<0||col<0||f?.scope!=='closed-reference'||f.experimentFingerprint!==evaluation.experimentFingerprints?.[outer])return {available:false,series:[],reason:'闭合参考频响或指纹无效。'};
 const input=descriptors(experiment,inputId,'inputs'),output=descriptors(experiment,outputId,'outputs');
 if(units==='si'&&(!Number.isFinite(input?.baseSI)||input.baseSI<=0||!Number.isFinite(output?.baseSI)||output.baseSI<=0))return {available:false,series:[],reason:'频响 SI 换算基准未知。'};
 const offset=units==='si'?20*Math.log10(output.baseSI/input.baseSI):0;
 const series=(f.series?.[row]?.[col]??[]).map(p=>({...p,db:p.db+offset}));
 return {available:series.length>0,series,unit:units==='si'?`${output.baseUnit}/${input.baseUnit}`:'pu/pu',outputId,inputId};
}
function responseSvg(traces,title){
 const W=660,H=300,left=66,right=638,top=30,bottom=255;
 let lo=0,hi=0,end=0;for(const {view}of traces){for(const p of view.points){lo=Math.min(lo,p.y);hi=Math.max(hi,p.y);end=Math.max(end,p.t);}if(view.target!==null){lo=Math.min(lo,view.target-(view.bandHalfWidth??0));hi=Math.max(hi,view.target+(view.bandHalfWidth??0));}}
 if(!(end>0))end=1;if(lo===hi)hi=lo+1;const pad=(hi-lo)*.08;lo-=pad;hi+=pad;
 const x=t=>left+t/end*(right-left),y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top);
 let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><rect width="${W}" height="${H}" fill="white"/>`;
 for(let i=0;i<=4;i++){const t=end*i/4,v=lo+(hi-lo)*i/4;s+=`<path d="M${left} ${y(v)}H${right} M${x(t)} ${top}V${bottom}" stroke="#e5eaed"/><text x="${left-8}" y="${y(v)+4}" text-anchor="end" font-size="12">${fmt(v)}</text><text x="${x(t)}" y="${bottom+19}" text-anchor="middle" font-size="12">${fmt(t)}</text>`;}
 for(const trace of traces){const {view}=trace,color=trace.side==='current'?'#316caa':'#137b70';
  if(view.target!==null)s+=`<path d="M${left} ${y(view.target)}H${right}" stroke="${color}" stroke-dasharray="2 5"/>`;
  if(view.bandHalfWidth!==null)s+=`<rect x="${left}" y="${y(view.target+view.bandHalfWidth)}" width="${right-left}" height="${Math.abs(y(view.target+view.bandHalfWidth)-y(view.target-view.bandHalfWidth))}" fill="${color}" opacity=".06"/>`;
  s+=`<g ${attrs(trace.evaluation,trace.experimentId,trace.inputId,trace.outputId)}><path data-response-trace="${trace.side}" d="${view.points.map((p,i)=>(i?'L':'M')+x(p.t).toFixed(2)+' '+y(p.y).toFixed(2)).join(' ')}" fill="none" stroke="${color}" stroke-width="2"${trace.side==='candidate'?' stroke-dasharray="7 4"':''}/></g>`;
 }
 return s+`<text x="${left}" y="18" font-size="12">${esc(traces[0]?.view.unit??'')}</text><text x="${(left+right)/2}" y="296" text-anchor="middle" font-size="13">时间 / s</text></svg>`;
}
function summary(e,identity){
 if(!valid(e))return `<section class="mainline-summary" data-eligible="false"><h3>${esc(identity)}</h3><p>主线尚未完成：${esc(e?.solveStatus??'notEvaluated')}</p>${(e?.diagnostics??[]).map(d=>`<p>${esc(d.message)}</p>`).join('')}</section>`;
 const a=e.model.configurationSnapshot?.analysis,approx=e.model.delayRepresentation?.approximate;
 const states={stable:'稳定',unstable:'不稳定',marginal:'临界',notEvaluated:'未评估'};
 const permitted=e.application?.eligible===true&&!approx&&e.responseQuality==='completed'&&e.stability?.status==='stable';
 const y0=e.model.operatingPoint?.y0??[];
 return `<section class="mainline-summary" data-eligible="${permitted}" data-evaluation-fingerprint="${esc(e.evaluationFingerprint)}"><h3>${esc(identity)} · PLL 与 dq 联立工程参考模型</h3>
 <p>完整外环稳定性：${esc(states[e.stability?.status]??e.stability?.status)}；最大极点实部 ${fmt(e.stability?.alpha)} s⁻¹</p>
 <p>动态目标：${e.targetResult?.group==='satisfied'?'满足':e.targetResult?.group==='reduced'?'降频后满足':'未满足'}；时域数值质量：${e.responseQuality==='completed'?'已完成':esc(e.responseQuality)}。稳定不等于全部要求达标。</p>
 <p>求解 ${esc(e.solveStatus)} · 响应 ${esc(e.responseQuality)} · 目标 ${esc(e.targetResult?.group)} · ${permitted?'当前评估可应用':'未满足推荐应用条件'}${approx?' · 非零显式延时 Padé 近似':''}</p>
 ${e.responseQuality==='resolutionLimited'?'<p class="mainline-warning">采样分辨率尚未确认；可在整定助手选择“继续精算 · 60,000 点”。这不是系统不稳定的判定。</p>':''}
 <p>T = ${fmt(e.performance?.T)} s · O = ${fmt(e.performance?.O)} % · E = ${fmt(e.performance?.E)} %（同一主线排序证据）</p>
 <p>工作点：${e.model.outputs.slice(0,2).map((p,i)=>`${esc(p.labelZh)} = ${fmt(y0[i])} ${esc(p.unit)}`).join('；')}。${a?.syncMode==='fixed-angle'?'固定同步角，不跟踪 PCC。':`SRF PLL；fn = ${fmt(a?.sync?.fnHz)} Hz（特征频率）；ζ = ${fmt(a?.sync?.damping)}；独立滤波 ${fmt(a?.sync?.filterMs)} ms；fn 来源 ${esc(a?.sources?.['sync.fnHz']??'未声明')}。`}</p>
 <p>显式延时 Td = ${fmt(e.model.delayRepresentation?.seconds)} s；控制 Ts = ${fmt(e.model.configurationSnapshot?.controlStepSeconds)} s；PWM 周期 = ${fmt(e.model.configurationSnapshot?.pwmPeriodSeconds)} s（— 表示未知）；响应采样见各实验数值策略，与两者独立。</p>
 ${(e.application?.reasons??[]).map(reason=>`<p class="mainline-warning">${esc(reason)}</p>`).join('')}</section>`;
}
function metrics(traces,display){
 return '<table class="mainline-channel-metrics"><thead><tr><th>对象 / 通道</th><th>原始主线指标（不随图形缩放重算）</th></tr></thead><tbody>'+traces.map(t=>{
  const channel=t.response.channels.find(c=>c.outputId===t.outputId),m=channel.metrics??{},port=descriptors(t.experiment,t.outputId,'outputs'),si=display.units==='si',base=si?port?.baseSI:1,unit=si?port?.baseUnit:port?.unit??'pu';
  const value=channel.role==='tracking'?`超调 ${fmt(m.overshootPercent)} %；±2% 稳定时间 ${fmt(m.settlingTimeSeconds)} s；目标相对稳态误差 ${fmt(m.steadyStateErrorPercent)} %`:
   `交叉峰值 ${fmt(Number.isFinite(base)&&Number.isFinite(m.peakAbsPu)?m.peakAbsPu*base:null)} ${esc(unit)}；残余偏置 ${fmt(Number.isFinite(base)&&Number.isFinite(m.residualOffsetPu)?m.residualOffsetPu*base:null)} ${esc(unit)}`;
  return `<tr data-channel-role="${esc(channel.role)}"><th>${esc(t.identity)} · ${channel.role==='tracking'?'跟踪':'交叉'}</th><td>${value}</td></tr>`;
 }).join('')+'</tbody></table>';
}

export function gflMainlineResultsHtml({current,candidate,selection={},display={},stale=false,busy=false}={}){
 const d=normalizeDisplay(display),experimentId=selection.experimentId===inner?inner:outer;
 if(stale||busy)return `<p class="mainline-warning" data-eligible="false">${busy?'正在校核，旧曲线与可应用结论已清除。':'输入已改变，旧曲线与可应用结论已清除。'}</p>`;
 const sides=[{side:'current',identity:'当前 PI',evaluation:resultOf(current)},{side:'candidate',identity:candidate?.name??'所选候选 / 手动试调（未应用）',evaluation:resultOf(candidate)}];
 let s=sides.filter(t=>t.evaluation||t.side==='current').map(t=>summary(t.evaluation,t.identity)).join('');
 s+=`<h3>${names[experimentId]}</h3><p class="small-note">每次独立施加一个参考增量，其他输入增量为零。${experimentId===inner?'外环输出增量被冻结，保留工作点偏置；本实验极点仅为诊断，不能替代完整外环稳定性。':'保留两外环、dq、电网和所选同步动态。'} ±2% 带围绕请求目标；不按测得最终增益归一化。</p>`;
 const live=sides.filter(t=>valid(t.evaluation)),reference=live.find(t=>t.evaluation.experiments?.[experimentId])?.evaluation.experiments[experimentId]?.experiment;
 if(!reference)return s+'<p>该参考实验暂无有效响应。</p>';
 const inputIds=reference.steps.map(p=>p.inputId),outputIds=reference.steps.map(p=>p.targetOutputId);
 s+='<div class="gfl-mainline-grid">';
 for(const inputId of inputIds)for(const outputId of outputIds){
  const title=`${label(reference,outputId,'outputs')} ← ${label(reference,inputId,'inputs')}`,traces=[],messages=[];
  for(const side of live){const item=side.evaluation.experiments?.[experimentId],response=item?.responses?.find(r=>r.inputId===inputId);if(!response)continue;
   if(response.experimentFingerprint!==side.evaluation.experimentFingerprints?.[experimentId]){messages.push(`${side.identity}：响应指纹不一致。`);continue;}
   const view=projectGflResponse(item.experiment,response,outputId,d);
   if(!['completed','approximateDelay'].includes(response.status)||!view.available){messages.push(`${side.identity}：${view.reason??response.status}，不绘制未验证曲线。`);continue;}
   traces.push({...side,view,experiment:item.experiment,response,inputId,outputId,experimentId});
  }
  const first=traces[0];s+=`<section class="mainline-plot-card"${first?' '+attrs(first.evaluation,experimentId,inputId,outputId):''}><h4>${esc(title)}</h4><p>${traces.map(t=>`${esc(t.identity)}（${t.side==='current'?'实线':'虚线'}）：请求 ${fmt(t.response.amplitudePu)} pu${t.response.status==='approximateDelay'?' · Padé 近似':''}`).join('；')}</p>${traces.length?responseSvg(traces,title):'<p>暂无有效曲线。</p>'}${metrics(traces,d)}${messages.map(m=>`<p>${esc(m)}</p>`).join('')}</section>`;
 }
 s+='</div><h3>完整外环 · 闭合参考 2×2 频率响应</h3><p class="small-note">物理输出 / 所选参考；相位是闭环相位，交叉通道以实际端口 ID 映射。</p>';
 for(const side of live){const e=side.evaluation,f=e.frequencyResponse,exp=e.experiments?.[outer]?.experiment;if(!f||!exp)continue;s+=`<h4>${esc(side.identity)}</h4><div class="gfl-mainline-grid">`;
  for(const outputId of f.outputIds)for(const inputId of f.inputIds){const v=projectGflFrequency(e,outputId,inputId,d.units),title=`${label(exp,outputId,'outputs')} ← ${label(exp,inputId,'inputs')}`;
   const sweep=v.available?{min:v.series[0].f,max:v.series.at(-1).f,series:{d:v.series}}:null;
   s+=`<section class="mainline-plot-card" data-frequency-channel="${esc(outputId+'<-'+inputId)}" ${attrs(e,outer,inputId,outputId)}><h4>${esc(title)}</h4><p>幅值 dB：20lg|${esc(v.unit??'')}|${e.model.delayRepresentation?.approximate?' · Padé 近似':''}</p>${sweep&&sweep.max>sweep.min?bodeSvg(sweep,{compact:true,width:600,label:side.identity+' '+title+' 闭合参考幅频及相频'}):`<p>${esc(v.reason??'频响暂无有效曲线。')}</p>`}</section>`;
  }s+='</div>';
 }
 return s;
}

export function mountGflMainlineResults(host){
 host.classList.add('gfl-mainline-results');host.innerHTML=`<h2>PLL 与 dq 联立主线结果</h2><div class="mainline-display-controls">
 <label for="gflExperiment">参考实验<select id="gflExperiment"><option value="${outer}">完整外环参考实验</option><option value="${inner}">电流参考 · 冻结外环输出增量</option></select></label>
 <label for="gflResponseScale">响应幅值<select id="gflResponseScale"><option value="actual">实际请求幅值</option><option value="normalized">按请求幅值归一化</option></select></label>
 <label for="gflResponseUnits">物理单位<select id="gflResponseUnits"><option value="pu">pu</option><option value="si">SI（各输出声明基准）</option></select></label>
 <label for="gflResponseQuantity">响应量<select id="gflResponseQuantity"><option value="increment">增量</option><option value="absolute">工作点 + 增量</option></select></label></div>
 <p id="gflMainlineStatus" role="status" aria-live="polite"></p><div id="gflMainlineCharts"></div>`;
 const q=id=>host.querySelector('#'+id);let last=null,display=normalizeDisplay(),selection={experimentId:outer},dead=false;
 function draw(){if(dead||!last)return;for(const [id,key]of [['gflResponseScale','amplitude'],['gflResponseUnits','units'],['gflResponseQuantity','quantity']])q(id).value=display[key];q('gflExperiment').value=selection.experimentId;
  q('gflResponseQuantity').disabled=display.amplitude==='normalized';q('gflResponseUnits').disabled=display.amplitude==='normalized';
  host.setAttribute('aria-busy',String(!!last.busy));q('gflMainlineStatus').textContent=last.stale?'结果已过期；不能应用。':last.busy?'正在获取最新 Worker 校核；不能应用旧结果。':display.amplitude==='normalized'?'归一化仅显示增量，单位为 pu 输出 / 请求 pu 参考；SI 选项保留供实际幅值视图使用。':'实际幅值视图；曲线与排序共用同一 Worker 证据。';
  q('gflMainlineCharts').innerHTML=gflMainlineResultsHtml({...last,display,selection});
 }
 for(const [id,key]of [['gflResponseScale','amplitude'],['gflResponseUnits','units'],['gflResponseQuantity','quantity']])q(id).onchange=()=>{display=normalizeDisplay({...display,[key]:q(id).value});draw();};
 q('gflExperiment').onchange=()=>{selection={experimentId:q('gflExperiment').value};draw();};
 return {render(next){if(!last||next.display)display=normalizeDisplay(next.display);if(!last||next.selection)selection={experimentId:next.selection?.experimentId===inner?inner:outer};last=next;draw();},destroy(){dead=true;host.replaceChildren();}};
}
