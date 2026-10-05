import {operatingSummary} from './operating-summary.js?v=pq1';
import {pwmWorkbenchMarkup,mountPwmWorkbench} from './pwm-workbench.js?v=pq1';
import {convertHarmonicBasis} from '../analysis/pwm-spectrum.js?v=pwm3';
import {designInputIssues,markDesignInputs} from './design-input-validation.js?v=pq1';
import {installFormulaTooltip} from './formula-tooltip.js?v=linkage1';
import {filterVariableValues} from './filter-variable-values.js?v=pq1';
import {designFilterInductor,filterDesignContext} from '../analysis/filter-inductor.js?v=pq1';
import {escapeHtml as esc} from './symbols.js?v=transformer-rx3';
import {math,sub,mi,mn,mo,mt,frac,sqrt} from './paper-math.js';
const fmt=v=>v==null?'待补充':v===Infinity?'∞':Number(v.toPrecision(6)).toString();
const metric=(name,value)=>`<div class="metric-row"><span>${name}</span><b>${value}</b></div>`;
const constraintMetric=(label,actual,limit)=>{
 const exceeded=Number.isFinite(actual)&&actual>limit+1e-9;
 return `<div class="metric-row${exceeded?' constraint-exceeded':''}"><span>${label}</span><b>${actual==null?'待补充':fmt(actual)+'%'}<small class="constraint-comparison">限值 ${fmt(limit)}%${exceeded?' · 超出 '+fmt(actual-limit)+' 个百分点':''}</small></b></div>`;
};
const defaults={fs:10000,sideband:'N-2',harmonicPu:null,harmonicBasis:'line',ripplePercent:20,dropPercent:20,currentMode:'operating',currentMarginPercent:100,amplitudeSource:'fft',modulationMode:'operating',modulation:0.643,thirdPercent:15,fftSelection:'auto',harmonicOrder:79};
export function mountFilterDesign(host,project,c,save,apply){
 const ctx=filterDesignContext(project,c.id),settings={...defaults,...c.extensions?.filterDesign};
 if(!c.extensions?.filterDesign?.currentMode&&settings.modulationMode!=='custom')settings.modulationMode='operating';
 if(c.extensions?.filterDesign&&!c.extensions.filterDesign.amplitudeSource)settings.amplitudeSource='manual';
 const field=(key,label,unit,value)=>`<label class="field"><span>${label}</span><div class="field-input"><input data-filter="${key}" aria-label="${label}" type="number" step="any" min="0" value="${esc(String(value??''))}"><small>${key==='ripplePercent'?math(sub('δ','i')):key==='dropPercent'?math(sub('δ','v')):''}${unit}</small></div></label>`;
 host.innerHTML=`<div class="filter-design-grid">${pwmWorkbenchMarkup(settings,field)}<section class="filter-design-inputs"><h3>02 · 设计输入</h3><p class="help-label">两电平变流器 · 主导谐波近似 · GFL / GFM 通用。初始频率及限值为可修改的设计假设。</p>
 ${operatingSummary(ctx)}${metric('额定线电压 / 容量',fmt(ctx.voltageLL)+' V / '+fmt(ctx.ratedVA/1e6)+' MVA')}${metric('DC 电压 · 读取连接源',ctx.dcVoltage==null?'未连接唯一 DC 源':fmt(ctx.dcVoltage)+' V')}
 ${field('fs','开关频率 f_sw','Hz',settings.fs)}
 <label class="field"><span>设计电流依据</span><select data-filter="currentMode"><option value="operating">运行 P/Q · 自动联动</option><option value="rated">额定容量 S</option></select></label>
 ${field('currentMarginPercent','设计电流倍率 kI（100% = 不加裕量）','%',settings.currentMarginPercent)}
 <p class="help-label">I设计 = kI × I依据。运行模式依据 √(P²+Q²)/(√3 VLL)；额定模式依据 S额定/(√3 VLL)。倍率不是变流器效率。100% 表示不额外放大；额定容量与 SCR、PI 标幺基准保持独立。</p>
 <label class="field"><span>主导谐波候选</span><select data-filter="sideband" aria-label="主导谐波候选"><option value="N-2">N − 2：f_sw − 2f₀</option><option value="2N-1">2N − 1：2f_sw − f₀</option><option value="custom">指定谐波次数 · FFT / 手动</option></select></label>
 ${field('harmonicOrder','指定谐波次数 h','',settings.harmonicOrder)}
 <label class="field"><span>谐波幅值口径</span><select data-filter="harmonicBasis" aria-label="谐波幅值口径"><option value="phase">相电压谐波峰值</option><option value="line">线电压谐波峰值</option></select></label>
 ${field('harmonicPu','谐波峰值（以 Vdc/2 为基准）','pu',settings.harmonicPu)}
 <p class="help-label">两种口径均以 Vdc/2 为基准。切换相／线口径会同步换算 pu 数值，保持同一物理幅值与设计结果。幅值需与实际调制方式及调制比对应。按 Vh/Nh 比较主导谐波：高调制比通常取 N−2，否则关注 2N−1。输入框填 Vh 的幅值，不是 Vh/Nh；候选选择不会自动生成幅值。此处 f_sw 是 PWM 频率，不是控制采样频率。</p>
 ${field('ripplePercent','允许纹波峰峰值 / 设计 RMS 电流','%',settings.ripplePercent)}
 ${field('dropPercent','允许基波电压降 / 额定相电压','%',settings.dropPercent)}
 </section><section class="filter-design-results"><h3>03 · 约束与选值</h3><div data-filter-result aria-live="polite"></div>
 ${field('selectedMh','选用电感 Lf（可手动输入）','mH',settings.selectedMh??ctx.L*1000)}
 <p class="help-label" data-filter-selection-range></p>
 <button type="button" data-filter-mid class="contribution">使用可行区间中值</button>
 <button type="button" data-filter-apply class="primary calculate">应用到此 ${esc(c.type.toUpperCase())} 的 Lf</button>
 <p class="help-label">应用后同步拓扑及 PI 页的电感输入，支持撤销；PI 自动模式按新电感重整定，手动模式保留增益并重算频响。约束冲突时允许应用折中值，超限项仍保留红色提示。判据仅覆盖这两项约束，不代表谐振、调制裕量或闭环稳定性已校核。</p>
 <div data-filter-applied role="status"></div></section><section class="derived-equations filter-design-formulas"><h3>04 · 设计公式与定义</h3><p class="help-label">悬停或用 Tab 聚焦变量，查看当前值与单位。Lf 与纹波使用选用电感实时预览；点击应用后才写入拓扑。</p><div data-filter-formulas>${formulas(settings.harmonicBasis)}</div></section></div>`;
 let setVariableValues=installFormulaTooltip(host),formulaBasis=settings.harmonicBasis;
 const updateVariables=(values,r)=>setVariableValues(filterVariableValues(ctx,values,r));
 host.querySelector('[data-filter="sideband"]').value=settings.sideband;
 host.querySelector('[data-filter="harmonicBasis"]').value=settings.harmonicBasis;
 for(const key of ['amplitudeSource','modulationMode','currentMode'])host.querySelector('[data-filter="'+key+'"]').value=settings[key];
 let basisBefore=settings.harmonicBasis;
 const inputs=[...host.querySelectorAll('[data-filter]')],result=host.querySelector('[data-filter-result]'),button=host.querySelector('[data-filter-apply]'),mid=host.querySelector('[data-filter-mid]');
 const read=()=>Object.fromEntries(inputs.map(el=>[el.dataset.filter,el.tagName==='SELECT'?el.value:el.value===''?null:el.valueAsNumber]));
 const calculate=()=>{const values=read(),valid=Number.isFinite(values.selectedMh)&&values.selectedMh>0;const r=designFilterInductor({...ctx,...values,L:valid?values.selectedMh/1000:ctx.L});if(!valid){r.ripplePercent=null;r.dropPercent=null;r.currentPass=null;r.canApply=false;}return {values,r};};
 const mark=(r)=>markDesignInputs(host,'data-filter',designInputIssues('l',read(),r,ctx.frequencyHz));
 const updatePwm=mountPwmWorkbench(host,ctx,order=>{
  host.querySelector('[data-filter="fftSelection"]').value=order;
  host.querySelector('[data-filter="amplitudeSource"]').value='fft';update();save(read());
 });
 let initialFftSelection=settings.fftSelection;
 function update(){
  let current=read();
  const fft=updatePwm({...current,fftSelection:initialFftSelection??current.fftSelection});initialFftSelection=null;
  const fftMode=current.amplitudeSource==='fft';
  for(const k of ['harmonicPu','sideband','harmonicOrder'])host.querySelector('[data-filter="'+k+'"]').disabled=fftMode;
  if(fftMode&&fft.error){host.querySelector('[data-filter="harmonicPu"]').value='';host.querySelector('[data-filter="harmonicOrder"]').value='';}
  if(fftMode&&fft.selected){
   host.querySelector('[data-filter="sideband"]').value='custom';
   host.querySelector('[data-filter="harmonicOrder"]').value=fft.selected.order;
   host.querySelector('[data-filter="harmonicPu"]').value=Number((current.harmonicBasis==='phase'?fft.selected.linePu/Math.sqrt(3):fft.selected.linePu).toPrecision(9));
  }
  host.querySelector('[data-filter="harmonicOrder"]').closest('label').hidden=read().sideband!=='custom';
  const basis=read().harmonicBasis;
  const amplitude=host.querySelector('[data-filter="harmonicPu"]'),label=(basis==='phase'?'相电压':'线电压')+'谐波峰值（以 Vdc/2 为基准）';amplitude.setAttribute('aria-label',label);amplitude.closest('label').querySelector('span').textContent=label;
  if(basis!==formulaBasis){host.querySelector('[data-filter-formulas]').innerHTML=formulas(basis);host.querySelector('#filterVariableTooltip')?.remove();setVariableValues=installFormulaTooltip(host);formulaBasis=basis;}
  mark(null);
  try{if(fftMode&&fft.error)throw Error(fft.error);const {values,r}=calculate();
   updateVariables(values,r);mark(r);
   const ok=r.canApply;
   host.querySelector('[data-filter-selection-range]').textContent=r.midpointH==null?'请补全参数以计算选值区间。':(r.feasible===false?'折中选值区间：':'可行选值区间：')+fmt(Math.min(r.minH,r.maxH)*1000)+' ～ '+fmt(Math.max(r.minH,r.maxH)*1000)+' mH（包含端点）。可直接在上方输入任意区间内数值。';
   result.innerHTML=metric('额定基准电流 RMS',fmt(r.baseCurrentRms)+' A')+metric('本次设计电流 RMS',fmt(r.currentRms)+' A')+`<p class="help-label">I基准 = ${fmt(ctx.ratedVA/1e6)} MVA / (√3 × ${fmt(ctx.voltageLL/1000)} kV) = ${fmt(r.baseCurrentRms)} A<br>I运行 = √(${fmt(ctx.activeW/1e6)}² + ${fmt(ctx.reactiveVar/1e6)}²) MVA / (√3 × ${fmt(ctx.voltageLL/1000)} kV) = ${fmt(r.operating.currentRms)} A<br>I设计 = ${fmt(r.marginFactor)} × ${fmt(r.referenceCurrentRms)} A = ${fmt(r.currentRms)} A（${values.currentMode==='operating'?'运行 P/Q':'额定容量'}）</p>`+metric('所选谐波频率',fmt(r.harmonicHz)+' Hz')+`<div class="help-label" data-harmonic-frequency-calculation>${math(sub('f','h')+mo('=')+mi('h')+sub('f','0')+mo('=')+mn(fmt(r.harmonicHz/ctx.frequencyHz))+mo('×')+mn(fmt(ctx.frequencyHz))+mt(' Hz')+mo('=')+mn(fmt(r.harmonicHz))+mt(' Hz'))}<br>谐波次数 × 基波频率</div>`+metric('相电压谐波峰值 · 换算后',r.harmonicPhasePeakV==null?'待补充':fmt(r.harmonicPhasePeakV)+' V')+metric('纹波约束下限 Lmin',r.minH==null?'待填谐波幅值及 DC 电压':fmt(r.minH*1000)+' mH')+metric('电压降约束上限 Lmax',fmt(r.maxH*1000)+' mH')+metric('拓扑当前 Lf',fmt(ctx.L*1000)+' mH')+constraintMetric('实际纹波比例 δᵢ',r.ripplePercent,values.ripplePercent)+constraintMetric('实际压降比例 δᵥ',r.dropPercent,values.dropPercent)+`<div class="note ${r.feasible===false||r.currentPass===false||!ok?'error':''}">${r.feasible===null?'条件待补充，尚不能判定完整可行区间。':r.feasible===false?'两项约束无法同时满足。可在两个边界之间手动输入任意折中电感值，中间值仅供快捷选择；实际 δᵢ、δᵥ 的超限项仍标红。':r.currentPass?'选用电感满足当前所选谐波的纹波约束与基波电压降约束。':'存在可行区间，请检查选用电感。'}${r.feasible===true&&!ok?'<br>选用电感须位于上下限内才可应用。':''}</div>`;
   button.disabled=!ok;mid.disabled=r.midpointH==null;mid.textContent=r.feasible===false?'填入中间值（可选）':'使用可行区间中值';button.textContent=(r.feasible===false?'应用折中电感到此 ':'应用到此 ')+c.type.toUpperCase()+' 的 Lf';
  }catch(e){host.querySelector('[data-filter-selection-range]').textContent='请补全有效参数以计算选值区间。';updateVariables(read(),null);result.innerHTML='<div class="note error">'+esc(e.message)+'</div>';button.disabled=true;mid.disabled=true;mid.textContent='使用中间值';button.textContent='应用到此 '+c.type.toUpperCase()+' 的 Lf';}
 }
 inputs.forEach(el=>{el.oninput=()=>{if(el.dataset.filter==='harmonicBasis'){const a=host.querySelector('[data-filter="harmonicPu"]');const converted=convertHarmonicBasis(a.value===''?null:a.valueAsNumber,basisBefore,el.value);a.value=converted??'';basisBefore=el.value;}host.querySelector('[data-filter-applied]').textContent='';update();};el.onchange=()=>{update();const values=read();if(Object.values(values).some(v=>typeof v==='number'&&!Number.isFinite(v)))return;save(values);};});
 mid.onclick=()=>{try{const {values,r}=calculate();if(r.midpointH!=null){const selectedMh=r.midpointH*1000;host.querySelector('[data-filter="selectedMh"]').value=selectedMh;save({...values,selectedMh});host.querySelector('[data-filter-applied]').textContent='';update();}}catch{}};
 button.onclick=()=>{try{const {values,r}=calculate(),l=values.selectedMh/1000;if(r.canApply&&Number.isFinite(l)&&l>0){apply(l,values);ctx.L=l;update();const status=host.querySelector('[data-filter-applied]');status.classList.toggle('constraint-exceeded',r.feasible===false);status.textContent='已应用'+(r.feasible===false?'折中电感':'')+'到 '+c.name+'，拓扑已同步。'+(r.feasible===false?'实际比例仍有超限，请查看红色结果。':'');}}catch{update();}};
 update();
}
function formulas(basis='line'){
 const conversion=basis==='phase'?'':sqrt(mn(3));
 const variable=(key,symbol,index)=>'<mrow class="formula-variable" data-formula-var="'+key+'" tabindex="0" aria-describedby="filterVariableTooltip">'+sub(symbol,index)+'</mrow>';
 const eq=mo('='),L=variable('L','L','f'),I=variable('I','I','design'),V=variable('V','V','LL,con'),fh=variable('fh','f','h'),f0=variable('f0','f','0'),di=variable('di','δ','i'),dv=variable('dv','δ','v');
 const S=variable('S','S','rated'),lo=variable('min','L','min'),hi=variable('max','L','max'),h=variable('harmonic','V',basis==='phase'?'h,ph,pk,pu':'h,LL,pk,pu'),dc=variable('dc','V','dc');
 const line=s=>'<div style="overflow-x:auto;margin:16px 0">'+math(s)+'</div>';
 return line(variable('Ibase','I','base')+eq+frac(S,sqrt(mn(3))+V))+
 line(variable('Iop','I','op')+eq+frac(sqrt('<msup>'+variable('P','P','op')+mn(2)+'</msup>'+mo('+')+'<msup>'+variable('Q','Q','op')+mn(2)+'</msup>'),sqrt(mn(3))+V))+
 line(I+eq+variable('kI','k','I')+variable('Iref','I','ref'))+
 line(lo+eq+frac(h+dc,mn(2)+conversion+mi('π')+fh+di+I))+
 line(hi+eq+frac(dv+V,sqrt(mn(3))+mn(2)+mi('π')+f0+I))+
 line(lo+mo('≤')+L+mo('≤')+hi)+
 line(variable('ripple','Δi','pp')+mo('≈')+frac(h+dc,mn(2)+conversion+mi('π')+fh+L))+
 '<p class="help-label">δi、δv 用比例代入（20% = 0.2）。Δipp 为主导单谐波的峰峰值近似；I design 为本次 RMS 设计电流；Iref 由电流依据选项决定，kI 用倍率代入（100% = 1）。忽略电感电阻的电压降，假设滤波器后端高频电压近似为零。谐波幅值必须与所选频率及实际调制工况对应。</p>';
}
