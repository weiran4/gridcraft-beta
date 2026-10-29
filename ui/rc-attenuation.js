import {prepareRcAttenuation,rcAttenuationAt,sweepRcAttenuation} from '../analysis/rc-attenuation.js';
import {escapeHtml as esc} from './symbols.js?v=transformer-rx3';
const fmt=v=>v===Infinity?'∞':v===-Infinity?'−∞':Number(v.toPrecision(5)).toString();
export function mountRcAttenuation(host,project,rcId){
 host.innerHTML=`<div class="rc-check-heading"><div><h3>03 · 谐波衰减校核</h3><p class="help-label">桥侧电压谐波 → RC 接入点（PCC）电压谐波 · 当前值与试选值比较</p></div><span class="rc-scope-tag">无源网络 · GFL / GFM 通用</span></div>
 <div class="rc-check-layout"><div class="rc-check-controls">
 <label class="field"><span>校核网络</span><select data-h="scope"><option value="network">当前连接网络</option><option value="local">局部 LC 空载对照</option></select></label>
 <label class="field"><span>关注频率 / Hz</span><input data-h="frequency" aria-label="谐波关注频率" type="number" min="0" step="any"></label>
 <label class="rc-check-toggle"><input data-h="linked" type="checkbox" checked> 跟随开关频率</label>
 <label class="field"><span>该频率允许传递比例 / %（选填）</span><input data-h="target" aria-label="允许谐波传递比例" type="number" min="0" max="100" step="any" placeholder="填写你的衰减要求"></label>
 <p class="help-label">例如 5%：桥侧该频率谐波的 5% 传到 PCC，约 −26 dB。不是额定电压的 5% 纹波要求。</p>
 <div data-h-result aria-live="polite"></div></div>
 <div><div class="rc-check-legend"><span><i class="rc-line-current"></i>拓扑当前 R/C</span><span><i class="rc-line-trial"></i>试选 R/C</span><span><i class="rc-line-target"></i>单频要求</span></div><div data-h-chart></div><p class="help-label">横轴：频率（对数）；纵轴：20 log₁₀ |V_PCC,h / V_bridge,h|。0 dB 为等幅，大于 0 dB 表示放大。</p></div></div>
 <details><summary>网络范围与计算假设</summary><p data-h-network class="help-label"></p><p class="help-label">按三相平衡、恒定 R/L/C 参数计算。关联逆变器桥侧施加单位电压谐波，其余理想电压源的谐波置零；其他逆变器仅保留滤波阻抗，不含控制器输出阻抗。变压器包含变比与漏阻抗，不含寄生参数。本版元件库未建模独立负载，不自动假设负载。若要推算实际纹波或损耗，还需桥侧 PWM 频谱及背景谐波。扫频采样可能漏过极窄峰值，单频通过不代表全频段通过。</p></details>
 <div class="rc-stability-note"><b>04 · 控制稳定性：未在此校核</b><span>QF 与谐波传递不能判定闭环稳定。应用选值后，请在对应 GFL / GFM 分析页重新检查控制器。</span></div>`;
 const get=k=>host.querySelector(`[data-h="${k}"]`),chart=host.querySelector('[data-h-chart]'),result=host.querySelector('[data-h-result]'),network=host.querySelector('[data-h-network]');
 let state=null;
 function draw(){
  chart.innerHTML='';result.innerHTML='';network.textContent='';
  if(!state){result.textContent='请先填写有效的设计输入及电容选值。';return;}
  const {values,r}=state;
  get('frequency').disabled=get('linked').checked;if(get('linked').checked)get('frequency').value=values.fs;
  try{
   const frequency=get('frequency').valueAsNumber,target=get('target').value===''?null:get('target').valueAsNumber;
   if(!Number.isFinite(frequency)||frequency<=0)throw Error('关注频率必须大于零。');
   if(target!==null&&(!Number.isFinite(target)||target<=0||target>=100))throw Error('允许传递比例应大于 0%、小于 100%。');
   if(r.resistanceOhm==null)throw Error('请先选用电容。');
   const scope=get('scope').value,current=prepareRcAttenuation(project,rcId,values.ibrId,null,scope),trial=prepareRcAttenuation(project,rcId,values.ibrId,{capacitanceF:values.selectedUf*1e-6,resistanceOhm:r.resistanceOhm},scope);
   const a=rcAttenuationAt(current,frequency),b=rcAttenuationAt(trial,frequency);
   const min=Math.min(project.frequencyHz,frequency/10),max=Math.max(values.fs*3,frequency*3,min*100);
   chart.innerHTML=plot(sweepRcAttenuation(current,min,max),sweepRcAttenuation(trial,min,max),frequency,target);
   result.innerHTML=`<div class="metric-row"><span>当前 · ${fmt(frequency)} Hz</span><b>${fmt(a.magnitude*100)}% / ${fmt(a.db)} dB</b></div><div class="metric-row"><span>试选 · ${fmt(frequency)} Hz</span><b>${fmt(b.magnitude*100)}% / ${fmt(b.db)} dB</b></div><div class="note ${b.singular||target!==null&&b.magnitude>target/100?'error':''}">${b.singular?'该频率出现理想模型奇异点，不能判为通过。':target===null?'尚未设置衰减要求，仅显示传递比例。':b.magnitude<=target/100?'试选值满足该频率的传递比例要求。':'试选值不满足该频率的传递比例要求；可调整 Rc、C 或 L 后比较。'}</div>`;
   network.textContent=(scope==='network'?'已计入当前连通网络：':'仅保留局部空载支路：')+trial.components.map(c=>c.name+' ('+c.id+')').join('、')+(trial.network.clamped?'。此接入点被理想电压源直接钳位，电压传递为零并不代表谐波电流为零。':'。');
  }catch(e){result.innerHTML='<div class="note error">'+esc(e.message)+'</div>';}
 }
 host.querySelectorAll('[data-h]').forEach(el=>el.addEventListener('input',draw));
 return next=>{state=next;draw();};
}
function plot(a,b,frequency,target){
 const W=850,H=350,left=70,right=25,top=25,bottom=65,pw=W-left-right,ph=H-top-bottom;
 const min=a[0].frequencyHz,max=a.at(-1).frequencyHz;
 const finite=[-40,20,...[...a,...b].map(p=>p.db).filter(Number.isFinite)];
 if(target!==null)finite.push(20*Math.log10(target/100));
 const low=Math.min(-40,Math.floor(Math.min(...finite)/20)*20),high=Math.max(20,Math.ceil(Math.max(...finite)/20)*20);
 const x=f=>left+Math.log(f/min)/Math.log(max/min)*pw,y=db=>top+(high-db)/(high-low)*ph;
 const lines=[];
 for(let k=0;k<=5;k++){const db=low+(high-low)*k/5;lines.push(`<path d="M${left},${y(db)}h${pw}" stroke="#dce6ed"/><text x="${left-12}" y="${y(db)+5}" text-anchor="end">${Math.round(db)}</text>`);}
 for(let d=Math.floor(Math.log10(min));d<=Math.ceil(Math.log10(max));d++)for(const n of [1,2,5]){const f=n*10**d;if(f<min||f>max)continue;lines.push(`<path d="M${x(f)},${top}v${ph}" stroke="#e7eef3"/><text x="${x(f)}" y="${H-bottom+25}" text-anchor="middle">${f>=1000?fmt(f/1000)+'k':fmt(f)}</text>`);}
 const path=samples=>{let path='',pen=false;for(const p of samples){if(!Number.isFinite(p.db)){pen=false;continue;}path+=(pen?'L':'M')+x(p.frequencyHz).toFixed(2)+','+y(p.db).toFixed(2);pen=true;}return path;};
 const mark=target===null?'':`<path d="M${x(frequency)-9},${y(20*Math.log10(target/100))}h18" stroke="#b87724" stroke-width="3"/>`;
 return `<svg class="rc-attenuation-plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="当前与试选 RC 的无源电压谐波传递曲线"><rect x="${left}" y="${top}" width="${pw}" height="${ph}" fill="#f8fbfc"/>${lines.join('')}<path d="M${left},${top}v${ph}h${pw}" stroke="#58758c" fill="none"/><path d="M${x(frequency)},${top}v${ph}" stroke="#b5c6d1" stroke-dasharray="4 5"/><path d="${path(a)}" stroke="#7894ac" stroke-width="2.5" stroke-dasharray="6 4" fill="none"/><path d="${path(b)}" stroke="#087f79" stroke-width="2.5" fill="none"/>${mark}<text x="18" y="20">dB</text><text x="${W/2}" y="${H-10}" text-anchor="middle">频率 / Hz</text></svg>`;
}
