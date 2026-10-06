import {buildGraph} from '../core/network/graph.js?v=transformer-rx3';
import {analyzeGridStrength} from './grid-strength.js?v=transformer-rx3';
import {prepareResonance,impedanceAt} from './resonance.js?v=pcc1';
import {gfmContext,gfmSettings,gfmModes} from '../project/gfm-settings.js?v=scr1';
import {gfmPortModel,frequencyMatrix,invert2,c,add,sub,mul,div,scale} from './port-response.js?v=pcc1';
const keys=['Ydd','Ydq','Yqd','Yqq'];
const packed=M=>Object.fromEntries(keys.map((k,i)=>[k,M[Math.floor(i/2)][i%2]]));
export function pccCandidates(project,id){const graph=buildGraph(project),net=graph.net(id+'.AC');return project.components.filter(c=>['gfl','gfm'].includes(c.type)&&graph.net(c.id+'.AC')===net);}
export function preparePcc(project,id,kind,ibrId){
 const bus=project.components.find(c=>c.id===id&&c.type==='bus'&&c.parametersSI.isPcc);if(!bus)throw Error('请选择标记为 PCC 的母线。');
 if(kind==='grid'){
  const r=analyzeGridStrength(project,id);if(r.status==='error')throw Error(r.errors.join('；'));const R=r.zTheveninOhm.re,L=r.zTheveninOhm.im/(2*Math.PI*project.frequencyHz);
  return {keys:['Z'],unit:'Ω',axis:'电气频率 / Hz',scope:'向上游电网看：变压器变比、漏阻抗及电网 R/L；不含逆变器 Lf、RC 和控制。',details:`Rth = ${R} Ω；Lth = ${L*1000} mH`,at:f=>({Z:c(R,2*Math.PI*f*L)})};
 }
 if(kind==='passive'){
  const model=prepareResonance(project,id);return {keys:['Z'],unit:'Ω',axis:'电气频率 / Hz',scope:'PCC 全网络驱动点阻抗：所有理想电压源小信号置零；保留逆变器 Rf/Lf、RC、电网与变压器。不含任何控制器。',details:`${model.components.length} 个参与元件；${model.size} 个独立节点${model.clamped?'；观察点被理想电压源钳位，Z = 0':''}`,at:f=>{const z=impedanceAt(model,f);if(z.singular)throw Error('网络无阻尼极点或矩阵病态。');return {Z:c(z.re,z.im)};}};
 }
 if(kind!=='controlled')throw Error('未知扫频对象。');
 const candidates=pccCandidates(project,id),ibr=candidates.find(c=>c.id===ibrId)||(candidates.length===1?candidates[0]:null);if(!ibr)throw Error('请选择与 PCC 同一交流节点的逆变器；本版控制端口不跨变压器折算。');
 const graph=buildGraph(project),net=graph.net(id+'.AC'),rcs=project.components.filter(c=>c.type==='rc'&&graph.net(c.id+'.AC')===net);
 if(candidates.length!==1)throw Error('本版控制端口仅支持 PCC 同节点单逆变器。');
 if(ibr.type==='gfm'){
  const s=gfmSettings(project,ibr.id);if(!s.gains)throw Error('请先在 GFM PI 页面整定并保存 PI 参数。');
  const p={...gfmContext(project,ibr.id),...s,considerScr:true},model=gfmPortModel(p,s.gains,s.mode,s.modes[s.mode]);
  return {keys,unit:'S',axis:'同步 dq 扰动频率 / Hz',maxHz:p.fs/2,scope:`${gfmModes[s.mode]} 控制端口：包含逆变器 Lf/Rf、同节点串联 RC、电压/电流 PI、测量滤波及成网控制。电网仅确定工作点，已从端口动态移除。电流正向为 PCC 流入该子系统。固定同步参考系；不含 PLL、限流和饱和。${s.considerScr?'':'当前 PI 按本地模型保存；此处仍用实际并网工作点评估这些增益，不修改 SCR 开关。'}`,details:`${model.names.length} 阶端口模型；PCC 工作电压 ${model.op.voltageLL.toFixed(3)} V；${model.delayModel==='none'?'零执行延时':'延时采用一阶 Padé 近似'}；使用已保存 PI，不自动重整定`,at:f=>packed(invert2(frequencyMatrix(model,f)).map(row=>row.map(z=>scale(z,1/model.op.Z))))};
 }
 const saved=project.extensions?.gflPi?.[ibr.id],g=saved?.gains,p=ibr.parametersSI;
 if(!g)throw Error('请先在 GFL PI 页面整定并保存 PI 参数。');
 const fs=saved.fs??20000,delay=saved.delaySamples??0,Ti=(saved.filterCurrentMs??1)/1000,Tv=(saved.filterVoltageMs??10)/1000,Zb=p.ratedAcVoltageV**2/p.ratedApparentPowerVA;
 if(![fs,Zb,p.filterInductanceH].every(v=>Number.isFinite(v)&&v>0)||![delay,Ti,Tv,p.filterResistanceOhm,...['d','q'].flatMap(k=>[g[k]?.kp,g[k]?.ki])].every(v=>Number.isFinite(v)&&v>=0))throw Error('GFL 电气参数、已保存 PI 或滤波时间无效。');
 return {keys,unit:'S',axis:'同步 dq 扰动频率 / Hz',maxHz:fs/2,scope:'GFL 近似端口：固定同步角、冻结外环，理想 dq 电流解耦；包含已保存电流 PI、滤波电压前馈、精确纯延时及同节点 RC 支路。不含 P/Q/Vdc/Vac 外环动态与 PLL；不能据此判断完整 GFL 并网稳定性。电流正向为 PCC 流入逆变器及 RC。',details:`${ibr.name} · ${rcs.length} 个同节点 RC；仅使用已保存 d/q 电流 PI，不自动重整定`,at:f=>{
  const w=2*Math.PI*f,D=c(Math.cos(-w*delay/fs),Math.sin(-w*delay/fs)),Hi=div(c(1),c(1,w*Ti)),Hv=div(c(1),c(1,w*Tv)),zl=c(p.filterResistanceOhm,w*p.filterInductanceH);
  const Y=[[c(0),c(0)],[c(0),c(0)]];for(let k=0;k<2;k++){const gain=g[k?'q':'d'],Ci=c(gain.kp,-gain.ki/w);Y[k][k]=div(sub(c(1),mul(D,Hv)),add(zl,scale(mul(mul(D,Ci),Hi),Zb)));}
  for(const rc of rcs){const C=rc.parametersSI.capacitanceF,R=rc.parametersSI.resistanceOhm;if(!(C>0&&R>=0))throw Error('RC 参数无效。');const a=c(0,w*C),b=2*Math.PI*project.frequencyHz*C,N=[[a,c(-b)],[c(b),a]],M=[[add(c(1),scale(a,R)),c(-b*R)],[c(b*R),add(c(1),scale(a,R))]],inv=invert2(M);for(let i=0;i<2;i++)for(let j=0;j<2;j++)Y[i][j]=add(Y[i][j],add(mul(N[i][0],inv[0][j]),mul(N[i][1],inv[1][j])));}
  return packed(Y);
 }};
}
export function sweepPcc(model,{minHz=.1,maxHz=2000,points=401}={}){
 if(!Number.isFinite(minHz)||!Number.isFinite(maxHz)||minHz<=0||maxHz<=minHz||maxHz/minHz>1e8||!Number.isInteger(points)||points<101||points>2001)throw Error('扫频范围须满足 0 < 下限 < 上限，频率比 ≤ 10⁸，点数 101～2001。');
 if(model.maxHz&&maxHz>model.maxHz)throw Error('控制扫频上限不得超过 1/(2Ts) = '+model.maxHz+' Hz；该限制不代表高频模型精度保证。');
 const series=Object.fromEntries(model.keys.map(k=>[k,[]]));let failed=0;
 for(let i=0;i<points;i++){const f=minHz*(maxHz/minHz)**(i/(points-1));let values;try{values=model.at(f);}catch{failed++;}
  for(const k of model.keys){const z=values?.[k],m=z?Math.hypot(z.re,z.im):NaN,valid=Number.isFinite(m);series[k].push({frequencyHz:f,re:valid?z.re:null,im:valid?z.im:null,magnitude:valid?m:null,phaseDeg:valid&&m>1e-14?Math.atan2(z.im,z.re)*180/Math.PI:null});}
 }
 if(failed===points)throw Error('整个频段均无法求解；请检查端口、参数与模型。');
 return {minHz,maxHz,points,series,failed,unit:model.unit,axis:model.axis,scope:model.scope,details:model.details};
}
