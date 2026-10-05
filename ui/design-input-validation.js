const positive=v=>Number.isFinite(v)&&v>0;
const fmt=v=>Number(v.toPrecision(6)).toString();
export function designInputIssues(kind,p,r,f0){
 const issues={},keys=kind==='rc'?['fs','reactivePercent','qualityFactor','selectedUf']:['fs','harmonicPu','ripplePercent','dropPercent','selectedMh'];
 for(const k of keys)if(!positive(p[k]))issues[k]='请输入大于 0 的有限数值。';
 for(const k of kind==='rc'?['reactivePercent']:['ripplePercent','dropPercent'])if(p[k]>100)issues[k]='百分比不能超过 100%。';
 if(kind==='rc'){
  if(!p.ibrId)issues.ibrId='请选择同一交流节点上的设计对象。';
  if(positive(p.fs)&&p.fs<20*f0)issues.fs='不满足 10f₀ ≤ f_sw/2，开关频率至少为 '+fmt(20*f0)+' Hz。';
  if(positive(p.qualityFactor)&&(p.qualityFactor<3||p.qualityFactor>5))issues.qualityFactor='超出建议 QF = 3～5；仍允许自定义。';
  if(p.reactivePercent>5&&p.reactivePercent<=100)issues.reactivePercent='超出初始建议的 5% 无功上限；仍允许自定义。';
  if(r&&positive(p.selectedUf)&&(p.selectedUf*1e-6<r.capMinF||p.selectedUf*1e-6>r.capMaxF))issues.selectedUf=r.feasible?'超出可行区间：'+fmt(r.capMinF*1e6)+'～'+fmt(r.capMaxF*1e6)+' μF。':'当前约束无交集，无法选择合格电容。';
 }else{
  if(p.modulationMode==='custom'&&(!positive(p.modulation)||p.modulation>1.3))issues.modulation='调制比须大于 0 且不超过 1.3。';
  if(p.thirdPercent!==undefined&&(!Number.isFinite(p.thirdPercent)||p.thirdPercent<0||p.thirdPercent>30))issues.thirdPercent='三次谐波注入须在 0～30%。';
  const harmonic=p.sideband==='custom'?p.harmonicOrder*f0:p.sideband==='N-2'?p.fs-2*f0:2*p.fs-f0;
  if(p.currentMarginPercent!==undefined&&(!Number.isFinite(p.currentMarginPercent)||p.currentMarginPercent<100))issues.currentMarginPercent='电流倍率须不低于 100%。';
  if(p.currentMode===undefined&&p.currentEfficiencyPercent!==undefined&&(!positive(p.currentEfficiencyPercent)||p.currentEfficiencyPercent>100))issues.currentEfficiencyPercent='修正效率须大于 0 且不超过 100%。';
  if(p.sideband==='custom'&&(!positive(p.harmonicOrder)||p.harmonicOrder<=1))issues.harmonicOrder='谐波次数必须大于 1。';
  if(positive(p.fs)&&harmonic<=f0)issues.fs='主导谐波必须高于基波，请提高开关频率。';
  for(const k of ['ripplePercent','dropPercent'])if(p[k]>20&&p[k]<=100)issues[k]='超出初始建议的 20% 上限；仍允许自定义。';
  if(r&&positive(p.selectedMh)&&(p.selectedMh/1000>r.maxH||(r.minH!=null&&p.selectedMh/1000<r.minH)))issues.selectedMh=r.feasible===false?(p.selectedMh/1000<r.maxH||p.selectedMh/1000>r.minH?'超出折中选值区间：'+fmt(r.maxH*1000)+'～'+fmt(r.minH*1000)+' mH。':'当前为折中选值，超限比例以红色显示。'):r.minH==null?'超出电压降约束上限 '+fmt(r.maxH*1000)+' mH。':'超出可行区间：'+fmt(r.minH*1000)+'～'+fmt(r.maxH*1000)+' mH。';
 }
 return issues;
}
export function markDesignInputs(host,attribute,issues){
 host.querySelectorAll('['+attribute+']').forEach(input=>{
  const key=input.getAttribute(attribute),label=input.closest('label'),message=issues[key];
  let hint=label.querySelector('.design-field-error');
  if(!hint){hint=document.createElement('span');hint.className='design-field-error';hint.id=attribute+'-'+key+'-error';label.append(hint);}
  label.classList.toggle('design-field-invalid',Boolean(message));
  input.setAttribute('aria-invalid',message?'true':'false');
  if(message){hint.textContent=message;hint.hidden=false;input.setAttribute('aria-describedby',hint.id);}
  else{hint.hidden=true;hint.textContent='';input.removeAttribute('aria-describedby');}
 });
}
