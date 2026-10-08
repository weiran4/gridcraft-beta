import {createStepClient} from './gfl-step-client.js';
import {bodeLoopGrid} from './bode-plot.js';
import {escapeHtml as esc} from './symbols.js';
const fmt=x=>Number.isFinite(x)?Number(x.toPrecision(5)).toString():'—';
const keys=['enabled','pllEnabled','frequencyHz','damping','pllFilterMs','dcModel','decouplingFrequency'];
export function mountGflDqPanel(host,{onSettings,onState}){
 host.className='gfl-dq-panel';
 host.innerHTML=`<div class="dq-heading"><h3>PLL / dq 小信号联立分析</h3><label><input id="dqEnabled" data-dq="enabled" type="checkbox">启用额外校核（不覆盖原 PI）</label></div>
 <p class="dq-intro">上方四格阶跃及单环 PM 仍是原标量基线；这里把电网、RC、d/q 电流、外环和同步角一起线性化，单独判断所列模型的稳定性。</p>
 <div id="dqBody" hidden><div class="dq-options">
 <label>同步角模型<select id="dqPllEnabled" data-dq="pllEnabled"><option value="true">SRF PLL 动态</option><option value="false">固定同步角（不跟踪 PCC）</option></select></label>
 <label>PLL 特征频率 fn / Hz<input id="dqFrequency" data-dq="frequencyHz" type="number" min="0.01" step="any"></label>
 <label>PLL 阻尼系数 ζ<input id="dqDamping" data-dq="damping" type="number" min="0.01" step="any"></label>
 <label>PLL 独立测量滤波 / ms<input id="dqPllFilter" data-dq="pllFilterMs" type="number" min="0" step="any"></label>
 <label>DC 分析模型<select id="dqDcModel" data-dq="dcModel"><option value="auto">按外环：Vdc用电容，P用刚性DC</option><option value="capacitor">恒输入功率＋独立 DC 电容</option><option value="rigid">刚性 DC 电压（不支持 Vdc 外环）</option></select></label>
 <label>电流解耦系数中的频率<select id="dqDecoupling" data-dq="decouplingFrequency"><option value="pll">PLL 估计频率</option><option value="nominal">固定额定频率</option></select></label></div>
 <p id="dqPllSummary" class="dq-note"></p><p id="dqStatus" class="dq-status" role="status" aria-live="polite"></p>
 <div class="dq-summary-grid"><section><h4>当前 PI</h4><div id="dqCurrent"></div></section><section><h4>所选候选 / 手动试调</h4><div id="dqCandidate"></div></section></div>
 <p id="dqOperatingPoint" class="dq-note"></p>
 <details id="dqFrequencyDetails"><summary>联立闭环频响：包括交叉通道</summary><div class="dq-frequency-controls"><label>显示对象<select id="dqSource"><option value="current">当前 PI</option><option value="candidate">所选候选 / 试调</option></select></label><span id="dqFrequencyNote"></span></div><div id="dqBode"></div></details>
 <div class="dq-footer"><button id="dqExport" type="button" disabled>导出工作点、A/B/C/D 与极点</button><span>导出仅含分析数据，不修改工程。</span></div>
 <details class="dq-reading"><summary>模型依据、参数含义与未覆盖内容</summary>
 <p>归一化 SRF PLL：e=vq/|v|，Δω=Kp·e+ξ，dξ/dt=Ki·e；Kp=2ζ(2πfn)，Ki=(2πfn)²。fn 是二阶环特征参数，不直接等于 0 dB 交越或 −3 dB 带宽。20 Hz/0.707 是可编辑参考初值，必须核对真实控制器。</p>
 <p>基于实际运行 PCC P/Q 求高电压支路工作点；名义电网源为 1 pu，电流方向为逆变器向电网。支持单逆变器、正 Lf/Lg/C、串联 Rc 的三相平衡 LCL 等效。保留旋转 dq 交叉项、滤波解耦残余、PLL 坐标变化及选中的两外环，使用运行点 Jacobian A/B/C/D。</p>
 <p>Vdc 模式采用独立 DC 电容＋恒输入功率、理想 DC 电压归一化的电压执行器，不是画布中理想电压源钳位。显式延时大于零时使用一阶 Padé，仅作近似分析；不会把该近似通过当成精确已验证推荐。fs、PWM 频率不自动变成额外延时；不模拟离散 PI、开关、死区、限流、饱和、负序、故障或保护。</p>
 <p>原候选生成器仍是标量搜索。启用后，应用候选需要额外通过此 dq 模型的零延时校核；找不到通过的候选不代表全局不可行。闭环交叉通道没有独立的“PM=60°”解释。</p>
 <p>依据：<a href="https://imperix.com/doc/implementation/synchronous-reference-frame-pll" target="_blank" rel="noopener noreferrer">imperix SRF PLL</a>；<a href="https://imperix.com/doc/implementation/vector-current-control" target="_blank" rel="noopener noreferrer">dq 电流控制参考</a>。这是项目按声明方程实现的工程参考模型，不是 IEEE 2800 认证模型或任意厂商的通用模型。</p>
 </details></div>`;
 const q=id=>host.querySelector('#'+id);let model=null,data=null,busy=false,error='',dead=false,frame=null;const widths=new WeakMap();
 const status=r=>{if(!r)return '尚未评估';if(r.status==='missingGains')return '暂无参数';if(r.status!=='ok')return '未评估：'+(r.message||'数值计算未完成');return (r.delayModel==='none'?'':'Padé 近似 · ')+(r.poleStatus==='stable'?'所列联立模型稳定':r.poleStatus==='unstable'?'所列联立模型不稳定':'临界稳定 / 需核实');};
 function summary(r){if(r?.status!=='ok')return `<p>${esc(status(r))}</p>`;return `<p class="${r.poleStatus==='unstable'?'dq-error':''}">${esc(status(r))}</p><p>最大极点实部 <strong>${fmt(r.alpha)}</strong> s⁻¹ · ${r.order} 个状态</p><p>工作点残差 ${fmt(r.residual)} · Jacobian复核 ${fmt(r.jacobianError)}</p><div class="dq-poles">${r.poles.slice(0,6).map(p=>`<span>${fmt(p.re)} ${p.im<0?'−':'+'} j${fmt(Math.abs(p.im))}</span>`).join('')}</div>`;}
 function chart(){const r=data?.[q('dqSource').value],labels=r?.model?.outputNames??[model?.input?.dMode??'y₁',model?.input?.qMode??'y₂'];
  const titles={d:`${labels[0]} ← ${labels[0]}*`,q:`${labels[0]} ← ${labels[1]}*（交叉）`,P:`${labels[1]} ← ${labels[0]}*（交叉）`,Q:`${labels[1]} ← ${labels[1]}*`};
  q('dqBode').innerHTML=bodeLoopGrid(!busy&&r?.status==='ok'?r.sweep:null,titles,{titles,width:q('dqBode').clientWidth||1100,columns:matchMedia('(max-width:900px)').matches?1:2});
  q('dqFrequencyNote').textContent=r?.status==='ok'?`实际闭环输出 / 给定；显示至 ${fmt(r.sweep.max)} Hz，不是单环开环裕度图。`:status(r);
 }
 function draw(){if(dead)return;host.dataset.state=busy?'loading':data?'ready':'empty';
  q('dqStatus').textContent=error||(busy?'正在计算工作点、PLL 与双轴联立极点…':'额外校核不改变当前 PI；不稳定或未完成时不能以标量模型通过代替。');
  q('dqCurrent').innerHTML=busy?'<p>正在重新计算，旧结论已清除…</p>':summary(data?.current);
  q('dqCandidate').innerHTML=busy?'<p>正在重新计算，旧结论已清除…</p>':summary(data?.candidate);
  q('dqExport').disabled=!data||busy;
  const r=data?.current?.status==='ok'?data.current:data?.candidate?.status==='ok'?data.candidate:null;
  q('dqOperatingPoint').textContent=r?`工作点 PCC：${fmt(r.model.op.gridVoltageLL)} V L-L (${fmt(r.model.op.V)} pu)；送网 P=${fmt(r.model.op.P)} pu，Q=${fmt(r.model.op.Q)} pu；桥侧电流 ${fmt(r.model.op.bridgeCurrentPu)} pu。DC：${r.model.dcDynamic?'电容能量 / 恒功率输入':'刚性电压'}；显式延时 ${fmt(r.model.delaySeconds*1e6)} μs。`:'工作点尚未得到有效结果。';
  const s=model?.settings;if(s){const w=2*Math.PI*s.frequencyHz;q('dqPllSummary').textContent=s.pllEnabled?`SRF PLL：Kp=${fmt(2*s.damping*w)} s⁻¹，Ki=${fmt(w*w)} s⁻²；独立PLL滤波 ${fmt(s.pllFilterMs)} ms。`:'固定同步角：不含PLL状态，不等于理想瞬时跟踪PCC角度。';}
  chart();onState?.({enabled:!!model?.settings.enabled,busy,ready:!!data&&!busy,candidate:data?.candidate,current:data?.current,error});
 }
 const client=createStepClient({workerFactory:()=>new Worker(new URL('./gfl-dq-worker.js',import.meta.url),{type:'module'}),onEvent:e=>{
  if(e.type==='loading'){data=null;busy=true;error='';}else if(e.type==='result'){busy=false;data=e.result;error='';}else{busy=false;data=null;error=e.message||'';}draw();
 }});
 host.addEventListener('change',e=>{const key=e.target.dataset.dq;if(!keys.includes(key))return;const el=e.target,value=el.type==='checkbox'?el.checked:key==='pllEnabled'?el.value==='true':el.type==='number'?el.valueAsNumber:el.value;
  try{onSettings({[key]:value});el.removeAttribute('aria-invalid');error='';}catch(err){el.setAttribute('aria-invalid','true');error=err.message;client.clear(error);}
 });
 q('dqSource').onchange=chart;q('dqFrequencyDetails').ontoggle=chart;
 q('dqExport').onclick=()=>{if(!data||busy)return;const url=URL.createObjectURL(new Blob([JSON.stringify({schema:'gridcraft-dq-analysis-v1',input:model.input,configuration:model.settings,currentGains:model.currentGains,candidateGains:model.candidateGains,result:data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='gfl-dq-pll-analysis.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(entries=>{let changed=false;for(const {target,contentRect}of entries){if(Math.abs((widths.get(target)??-1)-contentRect.width)>.5)changed=true;widths.set(target,contentRect.width);}if(changed&&frame===null)frame=requestAnimationFrame(()=>{frame=null;chart();});});observer?.observe(q('dqBode'));
 return {render(next){model=next;for(const el of host.querySelectorAll('[data-dq]')){const v=next.settings[el.dataset.dq];if(el.type==='checkbox')el.checked=v;else if(document.activeElement!==el)el.value=String(v);}
  q('dqBody').hidden=!next.settings.enabled;
  if(!next.settings.enabled){client.clear();return;}
  if(next.invalid||!next.input){client.clear('输入无效，旧 dq 联立结果已清除。');return;}
  client.update({input:next.input,settings:next.settings,currentGains:next.currentGains??null,candidateGains:next.stale?null:next.candidateGains??null});
 },destroy(){dead=true;client.destroy();observer?.disconnect();if(frame!==null)cancelAnimationFrame(frame);host.replaceChildren();}};
}
