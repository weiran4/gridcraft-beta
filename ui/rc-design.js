import {operatingSummary} from './operating-summary.js?v=pq1';
import {rcFrequencySettings} from '../project/rc-frequency.js?v=linkage1';
import {designInputIssues,markDesignInputs} from './design-input-validation.js?v=pq1';
import {designRcFilter,rcDesignCandidates,rcDesignContext} from '../analysis/rc-filter.js?v=pq1';
import {installFormulaTooltip} from './formula-tooltip.js?v=linkage1';
import {escapeHtml as esc} from './symbols.js?v=transformer-rx3';
import {math,sub,mi,mn,mo,frac,sqrt,sup} from './paper-math.js';
const fmt=v=>v==null?'待补充':v===Infinity?'∞':Number.isFinite(v)?Number(v.toPrecision(6)).toString():'不可计算';
const metric=(label,value)=>`<div class="metric-row"><span>${label}</span><b>${value}</b></div>`;
export function mountRcDesign(host,project,c,save,apply){
 const candidates=rcDesignCandidates(project,c.id),stored=c.extensions?.rcDesign||{};
 const ibrId=stored.ibrId??(candidates.length===1?candidates[0].id:'');
 const initialIbr=candidates.find(x=>x.id===ibrId),frequency=rcFrequencySettings(stored,initialIbr);
 const settings={ibrId,reactivePercent:5,qualityFactor:4,selectedUf:c.parametersSI.capacitanceF*1e6,...stored,fs:frequency.fs,fsMode:frequency.mode};
 const field=(key,label,unit,value,symbol='')=>`<label class="field"><span>${label}</span><div class="field-input"><input data-rc="${key}" aria-label="${label}" type="number" step="any" min="0" value="${esc(String(value??''))}"><small>${symbol}${unit}</small></div></label>`;
 host.innerHTML=`<div class="filter-design-grid"><section><h3>01 · 设计输入</h3><p class="help-label">每相串联 RC 并联支路 · 无功、谐振与阻尼设计</p>
 <label class="field"><span>关联 GFL / GFM（同一交流节点）</span><select data-rc="ibrId" aria-label="RC 设计关联逆变器"><option value="">请选择设计对象</option>${candidates.map(x=>`<option value="${esc(x.id)}">${esc(x.name)} · ${esc(x.id)}</option>`).join('')}</select></label>
 <div data-rc-context></div>
 <label class="field"><span>开关频率来源</span><select data-rc="fsMode" aria-label="RC 开关频率来源"><option value="linked">自动跟随关联逆变器</option><option value="custom">独立设定</option></select></label>
 ${field('fs','RC 设计开关频率 f_sw','Hz',settings.fs)}
 <p class="help-label">自动跟随时读取关联逆变器最新电感设计频率，未设置则以 10 kHz 起步。独立设定会保留自己的频率；旧工程已保存的频率按独立设定保留。</p>
 ${field('reactivePercent','电容无功幅值 / 额定有功上限','%',settings.reactivePercent,math(sub('δ','Q')))}
 ${field('qualityFactor','目标品质因数 QF','',settings.qualityFactor)}
 <p class="help-label">初始无功限值为 5%，品质因数 QF 建议取 3～5；均可修改。L 使用关联逆变器当前滤波电感，P 使用其额定有功，非运行 P 或额定 S。</p>
 <div class="note">采用简化 LC 模型：忽略上游电网与变压器阻抗对谐振的影响，电容无功采用忽略阻尼电阻的近似幅值。多机共享滤波器仅按选定单机校核。</div>
 </section><section><h3>02 · 约束与选值</h3><div data-rc-result aria-live="polite"></div>
 ${field('selectedUf','选用每相电容 Cf','μF',settings.selectedUf)}
 <div data-rc-proposal></div>
 <button type="button" data-rc-mid class="contribution">使用可行区间中值</button>
 <button type="button" data-rc-apply class="primary calculate">应用 C 与 R 到此 RC</button>
 <div data-rc-applied role="status"></div>
 <p class="help-label">R 为电容串联阻尼电阻，由选用 C 和目标 QF 计算。应用一次更新本元件 R/C，支持撤销；RC 仍不计入 SCR。</p>
 </section><section class="derived-equations filter-design-formulas"><h3>03 · 设计公式与定义</h3><p class="help-label">悬停或 Tab 聚焦变量查看值及单位。Cf、Qcf、fres 和 Rf 对应本窗口选用值。</p>${formulas()}</section></div>`;
 const select=host.querySelector('[data-rc="ibrId"]');select.value=settings.ibrId;host.querySelector('[data-rc="fsMode"]').value=settings.fsMode;
 const inputs=[...host.querySelectorAll('[data-rc]')],result=host.querySelector('[data-rc-result]'),proposal=host.querySelector('[data-rc-proposal]'),context=host.querySelector('[data-rc-context]'),button=host.querySelector('[data-rc-apply]'),mid=host.querySelector('[data-rc-mid]'),status=host.querySelector('[data-rc-applied]');
 const setVariables=installFormulaTooltip(host);
 const read=()=>Object.fromEntries(inputs.map(el=>[el.dataset.rc,el.tagName==='SELECT'?el.value:el.value===''?null:el.valueAsNumber]));
 const calc=()=>{const values=read(),ctx=rcDesignContext(project,c.id,values.ibrId);return {values,ctx,r:designRcFilter({...ctx,...values,capacitanceF:values.selectedUf==null?null:values.selectedUf*1e-6})};};
 const mark=(r)=>markDesignInputs(host,'data-rc',designInputIssues('rc',read(),r,project.frequencyHz));
 function update(){
  const state=read(),frequency=rcFrequencySettings(state,candidates.find(x=>x.id===state.ibrId)),fsInput=host.querySelector('[data-rc="fs"]');
  fsInput.disabled=frequency.mode==='linked';if(fsInput.disabled)fsInput.value=frequency.fs??'';
  mark(null);
  try{const {values,ctx,r}=calc();mark(r);
   context.innerHTML=operatingSummary(ctx)+metric('额定有功 Pcon',fmt(ctx.ratedW/1e6)+' MW')+metric('变流器侧线电压 RMS',fmt(ctx.voltageLL)+' V')+metric('当前滤波电感 Lt',fmt(ctx.L*1000)+' mH')+metric('基波频率 f₀',fmt(ctx.frequencyHz)+' Hz');
   result.innerHTML=metric('无功约束 C 上限',fmt(r.capReactiveMaxF*1e6)+' μF')+metric('谐振约束 C 上限',fmt(r.capResonanceMaxF*1e6)+' μF')+metric('可行 C 下限',fmt(r.capMinF*1e6)+' μF')+metric('最终 C 上限',fmt(r.capMaxF*1e6)+' μF')+metric('谐振频率允许范围',fmt(r.resonanceMinHz)+' – '+fmt(r.resonanceMaxHz)+' Hz')+`<div class="note ${r.selectedPass?'':'error'}">${!r.feasible?'无可行区间：请调整开关频率、电感或无功限值。':r.selectedPass?'选用电容满足无功及谐振约束。':'选用电容须在可行区间内。'}${values.qualityFactor<3||values.qualityFactor>5?'<br>当前 QF 超出建议的 3～5 范围。':''}</div>`;
   proposal.innerHTML=metric('选用 C 的无功幅值',r.qVar==null?'待补充':fmt(r.qVar/1000)+' kvar · '+fmt(r.qVar/ctx.ratedW*100)+'%')+metric('选用 C 的谐振频率',r.resonanceHz==null?'待补充':fmt(r.resonanceHz)+' Hz')+metric('按目标 QF 计算的阻尼 R',r.resistanceOhm==null?'待补充':fmt(r.resistanceOhm)+' Ω')+`<div class="note ${r.currentPass?'':'error'}">拓扑当前：C = ${fmt(ctx.currentC*1e6)} μF，R = ${fmt(ctx.currentR)} Ω；QF = ${fmt(r.currentQualityFactor)}，fres = ${fmt(r.currentResonanceHz)} Hz。${r.currentPass?'当前 C 满足两项约束。':'当前 C 不满足两项约束。'}</div>`;
   button.disabled=!r.selectedPass;mid.disabled=!r.feasible;
   setVariables(variableValues(ctx,values,r));
  }catch(e){context.innerHTML='';result.innerHTML='<div class="note error">'+esc(e.message)+(candidates.length?'':'<br>先将 RC 与一个 GFL/GFM 的 AC 端口接至同一节点。')+'</div>';proposal.innerHTML='';button.disabled=true;mid.disabled=true;setVariables({});}
 }
 function persist(){const values=read();if(Object.values(values).some(v=>typeof v==='number'&&!Number.isFinite(v)))return;save(values);}
 inputs.forEach(el=>{el.oninput=()=>{status.textContent='';update();};el.onchange=()=>{status.textContent='';update();persist();};});
 mid.onclick=()=>{try{const {r}=calc();if(r.feasible){host.querySelector('[data-rc="selectedUf"]').value=(r.capMinF+r.capMaxF)*5e5;status.textContent='';update();persist();}}catch{}};
 button.onclick=()=>{try{const {values,r}=calc();if(!r.selectedPass)return;apply({capacitanceF:values.selectedUf*1e-6,resistanceOhm:r.resistanceOhm},values);update();status.textContent='已应用到 '+c.name+'，拓扑已同步。';}catch{update();}};
 update();
}
function variableValues(ctx,p,r){
 const val=(name,v,unit)=>name+'：'+(v==null?'待补充':fmt(v)+' '+unit);
 return {P:val('额定有功',ctx.ratedW/1e6,'MW'),V:val('线电压 RMS',ctx.voltageLL,'V'),L:val('逆变器当前滤波电感',ctx.L*1000,'mH'),C:val('选用每相电容',p.selectedUf,'μF'),Q:val('选用电容无功幅值',r.qVar==null?null:r.qVar/1000,'kvar'),delta:val('无功比例上限',p.reactivePercent/100,'（无量纲；'+fmt(p.reactivePercent)+'%）'),omega:val('基波角频率',r.omega,'rad/s'),f0:val('基波频率',ctx.frequencyHz,'Hz'),fs:val('开关频率',p.fs,'Hz'),fr:val('选用电容谐振频率',r.resonanceHz,'Hz'),R:val('计算阻尼电阻',r.resistanceOhm,'Ω'),qf:val('目标品质因数',p.qualityFactor,'（无量纲）'),Cq:val('无功约束电容上限',r.capReactiveMaxF*1e6,'μF'),Cmin:val('谐振约束电容下限',r.capMinF*1e6,'μF'),Cr:val('谐振约束电容上限',r.capResonanceMaxF*1e6,'μF'),Cmax:val('最终电容上限',r.capMaxF*1e6,'μF')};
}
function formulas(){
 const v=(key,a,b)=>'<mrow class="formula-variable" data-formula-var="'+key+'" tabindex="0" aria-describedby="filterVariableTooltip">'+(b?sub(a,b):mi(a))+'</mrow>';
 const P=v('P','P','con'),V=v('V','V','LL,con'),L=v('L','L','t'),C=v('C','C','f'),Q=v('Q','Q','Cf'),d=v('delta','δ','Q'),w=v('omega','ω','0'),f0=v('f0','f','0'),fs=v('fs','f','sw'),fr=v('fr','f','res'),R=v('R','R','f'),qf=v('qf','QF'),Cq=v('Cq','C','Q,max'),Cmin=v('Cmin','C','min'),Cr=v('Cr','C','res,max'),Cmax=v('Cmax','C','max');
 const eq=mo('='),le=mo('≤'),pi=mi('π'),two=mn(2),one=mn(1),line=(label,s)=>'<div class="rc-equation"><div class="help-label">'+label+'</div>'+math(s)+'</div>';
 return line('无功幅值约束',Q+eq+w+C+sup(V,2)+le+d+P)+line('无功约束电容上限',Cq+eq+frac(d+P,w+sup(V,2)))+
 line('谐振频率约束',mn(10)+f0+le+fr+eq+frac(one,two+pi+sqrt(L+C))+le+frac(fs,two))+
 line('电容区间',Cmin+eq+frac(one,sup('<mrow>'+mo('(')+pi+fs+mo(')')+'</mrow>',2)+L)+le+C+le+Cr+eq+frac(one,sup('<mrow>'+mo('(')+two+pi+mn(10)+f0+mo(')')+'</mrow>',2)+L))+
 line('合并两项上限',Cmax+eq+mi('min')+mo('(')+Cq+mo(',')+Cr+mo(')'))+
 line('品质因数与阻尼电阻',qf+eq+frac(one,R)+sqrt(frac(L,C))+mo('；')+R+eq+frac(one,qf)+sqrt(frac(L,C)))+
 line('基波角频率',w+eq+two+pi+f0)+
 '<p class="help-label">C 为每相电容，VLL,con 为变流器侧线电压 RMS，Q 为三相容性无功幅值。δQ 按比例代入（5% = 0.05）。Lt 对应逆变器 Lf；此处 Rf 是 RC 阻尼电阻，不是逆变器滤波电感的串联电阻。</p>';
}
