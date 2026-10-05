import {operatingPoint} from '../analysis/operating-point.js?v=pq1';
import {math,mi,mn,mo,sub,frac,sqrt} from './paper-math.js';
import {pwmSpectrum} from '../analysis/pwm-spectrum.js?v=pwm3';
import {escapeHtml as esc} from './symbols.js';
const fmt=v=>Number.isFinite(v)?Number(v.toPrecision(6)).toString():'待补充';
export function pwmWorkbenchMarkup(settings,field){
 const v=(key,symbol,index)=>'<mrow class="formula-variable" data-formula-var="'+key+'" tabindex="0" aria-describedby="filterVariableTooltip">'+(index?sub(symbol,index):mi(symbol))+'</mrow>';
 const m=v('m','m'),k=v('third','k','3'),theta=sub('ω','0')+mi('t');
 const equations=math(m+mo('=')+frac(mn(2)+sqrt(mn(2))+v('Vc','V','c,rms'),v('dc','V','dc')))+math(sub('v','ref,a')+mo('=')+m+mo('[')+mi('sin')+mo('(')+theta+mo(')')+mo('+')+k+mi('sin')+mo('(')+mn(3)+theta+mo(')')+mo(']'));

 return `<section class="pwm-workbench"><h3>01 · PWM 波形与谐波频谱</h3><p class="help-label">理想两电平 SPWM ＋三次谐波注入，仅做开关波形的频谱计算。相电压图为桥臂电压，包含零序；设计依据使用线电压频谱排除零序。所有峰值均以 Vdc/2 为共同基准。</p><div class="pwm-controls">
 <label class="field"><span>设计幅值来源</span><select data-filter="amplitudeSource"><option value="manual">手动输入 · 频谱仅供参考</option><option value="fft">使用 FFT · 自动联动设计</option></select></label>
 <label class="field"><span>调制比 m</span><select data-filter="modulationMode"><option value="operating">运行 P/Q 与电感压降推算</option><option value="rated">额定电压推算 · 忽略压降</option><option value="custom">自定义调制比</option></select></label>
 ${field('modulation','调制比数值 m','',settings.modulation)}
 ${field('thirdPercent','三次谐波注入 / 基波幅值','%',settings.thirdPercent)}
 <label class="field"><span>频谱取值</span><select data-filter="fftSelection"><option value="auto">自动 · 最大 Vh/fh</option></select></label>
 </div><div class="pwm-equations">${equations}<span class="help-label">运行模式按 Vc = |Vph + jωLf I| 推算，使用拓扑已应用 Lf；额定模式忽略压降，Vc = VLL/√3。选用 Lf 应用后更新频谱。k₃ 为注入比例。</span></div><div data-pwm-status aria-live="polite"></div><div data-pwm-plots></div><details class="help-label"><summary>频谱算法与适用范围</summary><p>vref,a = m[sin(ω₀t) + k₃ sin(3ω₀t)]；三相基波相差 120°，共用 ±1 三角载波。开关波形为 ±1，线电压由两相相减获得。采用相干采样、矩形窗和单边峰值 FFT（2|FFT|/Ns），搜索至 4fsw + 4f₀；图中省略小于 0.001 pu 的谱线。按线电压峰值 / 频率判断电流纹波主导项，排除基波；非整数频率比最多使用 20 个基波周期。FFT 采样率仅用于数值分辨率，与 PI 控制器采样率无关。没有模拟电网、器件死区或闭环动态。</p></details></section>`;
}
function waveform(s){
 const W=1120,H=205,x=t=>45+t*(W-65),y=v=>90-v*65;
 const path=key=>s.wave.map((p,i)=>i&&key==='switching'?'H'+x(p.t).toFixed(2)+'V'+y(p[key]).toFixed(2):(i?'L':'M')+x(p.t).toFixed(2)+','+y(p[key]).toFixed(2)).join(' ');
 return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="一个基波周期内的参考波、三角载波与 A 相开关波形"><path d="M45 20V160H1100" fill="none" stroke="#8297a2"/>${[-1,0,1].map(v=>`<text x="35" y="${y(v)+4}" text-anchor="end">${v}</text><path d="M45 ${y(v)}H1100" stroke="#dce8e9"/>`).join('')}${[['carrier','#a5b5c8'],['switching','#cc7b30'],['reference','#087e75']].map(([k,c])=>`<path d="${path(k)}" fill="none" stroke="${c}" stroke-width="${k==='reference'?2:1}"/>`).join('')}${[0,.25,.5,.75,1].map(t=>`<text x="${x(t)}" y="180" text-anchor="middle">${t===0?'0':t===1?'T₀':t+' T₀'}</text>`).join('')}<text x="45" y="201" fill="#087e75">参考波</text><text x="120" y="201" fill="#8297b2">三角载波</text><text x="215" y="201" fill="#ac6020">A 相开关波形</text></svg>`;
}
function spectrumChart(s,key,selected,dc){
 const W=560,H=230,left=42,right=12,top=25,bottom=40,max=Math.max(1,...s.harmonics.map(h=>h[key]))*1.1,x=o=>left+o/s.maxOrder*(W-left-right),y=v=>H-bottom-v/max*(H-top-bottom);
 const bars=s.harmonics.filter(h=>h[key]>.001).map(h=>{
 const title=`第 ${fmt(h.order)} 次 · ${fmt(h.hz)} Hz · ${fmt(h[key])} pu · ${dc==null?'DC 待补充':fmt(h[key]*dc/2)+' V 峰值'}`;
 const use=h.linePu>.001&&h.order>1.001,color=Math.abs(h.order-selected.order)<1e-8?'#b85023':h.order===s.dominant.order?'#087e75':'#6895a4';
 return `<g ${use?'data-pwm-order="'+h.order+'" tabindex="0" role="button" aria-label="'+esc('选择'+title)+'"':''}><title>${esc(title+(use?' · 点击用于设计':' · 基波或零序，不用于纹波设计'))}</title><path d="M${x(h.order)} ${y(0)}V${y(h[key])}" stroke="${color}" stroke-width="${h.order===selected.order?3:1.7}"/><rect x="${x(h.order)-3}" y="${y(h[key])-4}" width="6" height="${y(0)-y(h[key])+4}" fill="transparent"/></g>`;
 }).join('');
 return `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${key==='phasePu'?'桥臂相电压':'线电压'}谐波峰值频谱"><text x="${left}" y="16">${key==='phasePu'?'桥臂相电压（含零序）':'线电压（排除零序）'} · 峰值 pu</text>${[0,.5,1].map(r=>`<path d="M${left} ${y(max*r)}H${W-right}" stroke="#e0eaed"/><text x="35" y="${y(max*r)+4}" text-anchor="end">${Number((max*r).toFixed(2))}</text>`).join('')}<path d="M${left} ${top}V${H-bottom}H${W-right}" stroke="#8297a2" fill="none"/>${bars}${[0,1,2,3,4].map(n=>`<text x="${x(n*s.ratio)}" y="${H-21}" text-anchor="middle">${n===0?'0':n===1?'N':n+'N'}</text>`).join('')}<text x="${W/2}" y="${H-3}" text-anchor="middle">谐波次数 h（N = ${fmt(s.ratio)}）· 点击谱线选取</text></svg>`;
}
export function mountPwmWorkbench(host,ctx,onSelect){
 let cacheKey='',cached=null,plotKey='',lastSelection='';
 const select=host.querySelector('[data-filter="fftSelection"]'),status=host.querySelector('[data-pwm-status]'),plots=host.querySelector('[data-pwm-plots]');
 plots.onclick=e=>{const el=e.target.closest('[data-pwm-order]');if(el)onSelect(el.dataset.pwmOrder);};
 plots.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.dataset.pwmOrder){e.preventDefault();onSelect(e.target.dataset.pwmOrder);}};
 return values=>{
  const modulation=values.modulationMode==='custom'?values.modulation:values.modulationMode==='operating'?operatingPoint(ctx).modulation:ctx.dcVoltage?2*Math.sqrt(2/3)*ctx.voltageLL/ctx.dcVoltage:null;
  host.querySelector('[data-filter="modulation"]').disabled=values.modulationMode!=='custom';
  if(values.modulationMode!=='custom')host.querySelector('[data-filter="modulation"]').value=Number.isFinite(modulation)?fmt(modulation):'';
  try{
   const key=JSON.stringify([ctx.frequencyHz,values.fs,modulation,values.thirdPercent]);
   if(cacheKey!==key){cached=pwmSpectrum({frequencyHz:ctx.frequencyHz,fs:values.fs,modulation,thirdPercent:values.thirdPercent});cacheKey=key;}
   const s=cached;
   if(lastSelection!==key){
    const old=values.fftSelection;
    select.innerHTML='<option value="auto">自动 · 最大 Vh/fh</option>'+s.harmonics.filter(h=>h.order>1.001&&h.linePu>.001).map(h=>`<option value="${h.order}">h = ${fmt(h.order)} · ${fmt(h.hz)} Hz</option>`).join('');
    select.value=[...select.options].some(o=>o.value===old)?old:'auto';lastSelection=key;
   }
   const selected=select.value==='auto'?s.dominant:s.harmonics.find(h=>Math.abs(h.order-Number(select.value))<1e-8)||s.dominant;
   status.innerHTML=`<div class="pwm-summary"><span>m = <b>${fmt(modulation)}</b> · 基波 ${fmt(ctx.frequencyHz)} Hz · 开关 ${fmt(values.fs)} Hz</span><span>主导：<b>h = ${fmt(s.dominant.order)} · ${fmt(s.dominant.hz)} Hz</b></span><span>选中：<b>h = ${fmt(selected.order)}</b> · 相 ${fmt(selected.linePu/Math.sqrt(3))} pu / 线 ${fmt(selected.linePu)} pu</span><span>${values.amplitudeSource==='fft'?'FFT 已联动设计输入':'手动模式：下方输入不被频谱覆盖'}</span></div>${values.amplitudeSource==='fft'&&selected.order!==s.dominant.order?'<div class="note error">当前选中项不是主导谐波，按它单独设计可能低估纹波。选择“自动 · 最大 Vh/fh”可恢复主导项。</div>':''}${s.overmodulated?'<div class="note error">参考波超过载波峰值，已进入过调制；频谱反映削顶后的 PWM，不代表正常线性调制工况。</div>':''}<p class="help-label">相干窗口 ${s.cycles} 个基波周期 · ${s.size.toLocaleString()} 点。绿色为主导项，橙色为当前选中项。选中的相电压幅值由线电压 / √3 得到，排除零序。</p>`;
   const drawKey=key+'|'+selected.order+'|'+ctx.dcVoltage;
   if(drawKey!==plotKey){plots.innerHTML=waveform(s)+`<div class="pwm-spectra">${spectrumChart(s,'phasePu',selected,ctx.dcVoltage)}${spectrumChart(s,'linePu',selected,ctx.dcVoltage)}</div>`;plotKey=drawKey;}
   return {selected,modulation,selection:select.value};
  }catch(e){status.innerHTML='<div class="note error">'+esc(e.message)+'</div>';plots.innerHTML='';plotKey='';return {error:e.message,modulation};}
 };
}
