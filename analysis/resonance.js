import {buildGraph} from '../core/network/graph.js?v=transformer-rx3';
import {validateProject} from '../project/model.js?v=transformer-rx3';
import {transformerImpedance} from '../core/electrical/transformer.js?v=transformer-rx3';
import {rcDesignCandidates} from './rc-filter.js?v=pq1';
const ground='@ground';
const positive=v=>Number.isFinite(v)&&v>0;
export function localResonance(project,rcId,ibrId){
 const rc=project.components.find(c=>c.id===rcId&&c.type==='rc'),ibr=rcDesignCandidates(project,rcId).find(c=>c.id===ibrId);
 if(!rc||!ibr)throw Error('请选择与 RC 同一交流节点的逆变器。');
 const C=rc.parametersSI.capacitanceF,L=ibr.parametersSI.filterInductanceH,R=rc.parametersSI.resistanceOhm+ibr.parametersSI.filterResistanceOhm;
 if(!positive(C)||!positive(L)||!Number.isFinite(R)||R<0)throw Error('局部 LC 计算要求 L、C 大于零，串联电阻非负。');
 const frequencyHz=1/(2*Math.PI*Math.sqrt(L*C)),qualityFactor=R===0?Infinity:Math.sqrt(L/C)/R,dampingRatio=R/2*Math.sqrt(C/L);
 return {L,C,R,frequencyHz,qualityFactor,dampingRatio,dampedHz:dampingRatio<1?frequencyHz*Math.sqrt(1-dampingRatio**2):null,ibrId};
}
// Refer all voltages and impedances to the observation node before nodal stamping.
// This handles ideal turns ratios without treating a transformer as a same-voltage wire.
export function prepareResonance(project,rcId){
 const errors=validateProject(project);if(errors.length)throw Error(errors.join('\n'));
 const rc=project.components.find(c=>c.id===rcId&&(c.type==='rc'||(c.type==='bus'&&c.parametersSI.isPcc)));if(!rc)throw Error('请选择 RC 或 PCC 元件。');
 const g=buildGraph(project),start=g.net(rcId+'.AC'),ratios=new Map([[start,1]]),queue=[start];
 for(let i=0;i<queue.length;i++)for(const {edge,next} of g.adjacency.get(queue[i])||[]){
  const p=edge.component.parametersSI,turns=edge.component.type==='transformer'?(edge.a===queue[i]?p.secondaryVoltageV/p.primaryVoltageV:p.primaryVoltageV/p.secondaryVoltageV):1;
  const ratio=ratios.get(queue[i])*turns;if(!positive(ratio)||!positive(ratio*ratio))throw Error('变压器折算超出数值范围。');
  if(ratios.has(next)){if(Math.abs(ratios.get(next)-ratio)>1e-8*Math.max(ratio,ratios.get(next)))throw Error('网络回路中的变压器变比不一致，无法进行谐振分析。');}
  else{ratios.set(next,ratio);queue.push(next);}
 }
 const components=[],branches=[],parents=new Map([[ground,ground],...queue.map(n=>[n,n])]);
 const root=n=>{let k=n;while(parents.get(k)!==k)k=parents.get(k);return k;};
 const union=(a,b)=>parents.set(root(a),root(b));
 const push=(c,a,b,R,L=0,C=0,factor=1)=>{
  if(![R,L,C].every(v=>Number.isFinite(v)&&v>=0))throw Error(c.name+'：折算阻抗无效。');
  components.push({id:c.id,name:c.name,type:c.type,R,L,C,factor});
  if(R===0&&L===0&&C===0)union(a,b);else branches.push({a,b,R,L,C});
 };
 for(const edge of g.edges){if(!ratios.has(edge.a))continue;const c=edge.component,p=c.parametersSI,factor=1/ratios.get(edge.a)**2;
  if(c.type==='rl')push(c,edge.a,edge.b,p.resistanceOhm*factor,p.inductanceH*factor,0,factor);
  else{const z=transformerImpedance(p,project.frequencyHz,true);push(c,edge.a,edge.b,z.re*factor,z.im/(2*Math.PI*project.frequencyHz)*factor,0,factor);}
 }
 for(const c of project.components){if(!['source','gfl','gfm','rc'].includes(c.type))continue;const n=g.net(c.id+'.AC');if(!ratios.has(n))continue;const p=c.parametersSI,factor=1/ratios.get(n)**2;
  if(c.type==='source'){union(n,ground);components.push({id:c.id,name:c.name,type:c.type,factor});}
  else if(c.type==='rc')push(c,n,ground,p.resistanceOhm*factor,0,p.capacitanceF/factor,factor);
  else push(c,n,ground,p.filterResistanceOhm*factor,p.filterInductanceH*factor,0,factor);
 }
 const reference=root(ground),nodes=[...new Set(queue.map(root))].filter(n=>n!==reference),clamped=root(start)===reference;
 if(nodes.length>64)throw Error('当前谐振扫频支持最多 64 个独立交流节点，请缩小分析网络。');
 const indices=new Map(nodes.map((n,i)=>[n,i]));
 return {rcId,components,clamped,size:nodes.length,port:clamped?-1:indices.get(root(start)),branches:branches.map(b=>({...b,a:indices.get(root(b.a))??-1,b:indices.get(root(b.b))??-1})).filter(b=>b.a!==b.b)};
}
function solve(real,imag,rhs){
 const n=real.length,bim=new Float64Array(n),scale=Math.max(...real.map((row,i)=>Math.max(...row.map((v,j)=>Math.hypot(v,imag[i][j])))));
 if(!positive(scale))return null;
 for(let k=0;k<n;k++){
  let pivot=k;for(let i=k+1;i<n;i++)if(Math.hypot(real[i][k],imag[i][k])>Math.hypot(real[pivot][k],imag[pivot][k]))pivot=i;
  if(Math.hypot(real[pivot][k],imag[pivot][k])<scale*1e-13)return null;
  [real[k],real[pivot]]=[real[pivot],real[k]];[imag[k],imag[pivot]]=[imag[pivot],imag[k]];[rhs[k],rhs[pivot]]=[rhs[pivot],rhs[k]];[bim[k],bim[pivot]]=[bim[pivot],bim[k]];
  const pr=real[k][k],pi=imag[k][k],den=pr*pr+pi*pi;
  for(let i=k+1;i<n;i++){
   const fr=(real[i][k]*pr+imag[i][k]*pi)/den,fi=(imag[i][k]*pr-real[i][k]*pi)/den;
   for(let j=k+1;j<n;j++){real[i][j]-=fr*real[k][j]-fi*imag[k][j];imag[i][j]-=fr*imag[k][j]+fi*real[k][j];}
   rhs[i]-=fr*rhs[k]-fi*bim[k];bim[i]-=fr*bim[k]+fi*rhs[k];real[i][k]=imag[i][k]=0;
  }
 }
 const xr=new Float64Array(n),xi=new Float64Array(n);
 for(let i=n-1;i>=0;i--){let r=rhs[i],im=bim[i];for(let j=i+1;j<n;j++){r-=real[i][j]*xr[j]-imag[i][j]*xi[j];im-=real[i][j]*xi[j]+imag[i][j]*xr[j];}const a=real[i][i],b=imag[i][i],d=a*a+b*b;xr[i]=(r*a+im*b)/d;xi[i]=(im*a-r*b)/d;}
 return {real:xr,imag:xi};
}
export function impedanceAt(model,frequencyHz){
 if(!positive(frequencyHz))throw Error('扫频频率必须大于零。');
 if(model.clamped)return {frequencyHz,re:0,im:0,magnitude:0,phaseDeg:null,singular:false};
 const n=model.size,real=Array.from({length:n},()=>new Float64Array(n)),imag=Array.from({length:n},()=>new Float64Array(n)),rhs=new Float64Array(n),w=2*Math.PI*frequencyHz;
 for(const {a,b,R,L,C} of model.branches){
  const x=w*L-(C?1/(w*C):0),d=R*R+x*x;if(d===0)return {frequencyHz,magnitude:Infinity,singular:true};
  const yr=R/d,yi=-x/d;for(const i of [a,b])if(i>=0){real[i][i]+=yr;imag[i][i]+=yi;}
  if(a>=0&&b>=0){real[a][b]-=yr;real[b][a]-=yr;imag[a][b]-=yi;imag[b][a]-=yi;}
 }
 rhs[model.port]=1;const result=solve(real,imag,rhs);
 if(!result)return {frequencyHz,magnitude:Infinity,singular:true};
 const re=result.real[model.port],im=result.imag[model.port],magnitude=Math.hypot(re,im);
 if(!Number.isFinite(magnitude))return {frequencyHz,magnitude:Infinity,singular:true};
 return {frequencyHz,re,im,magnitude,phaseDeg:Math.atan2(im,re)*180/Math.PI,singular:false};
}
export function sweepResonance(model,{minHz=1,maxHz=20000,points=1001}={}){
 if(!positive(minHz)||!positive(maxHz)||maxHz<=minHz||!Number.isInteger(points)||points<101||points>5001||maxHz/minHz>1e8)throw Error('请输入有效扫频范围：0 < 下限 < 上限，频率比不超过 10⁸；采样点数为 101～5001。');
 const logMin=Math.log(minHz),step=Math.log(maxHz/minHz)/(points-1),samples=Array.from({length:points},(_,i)=>impedanceAt(model,Math.exp(logMin+i*step))),peaks=[];
 for(let i=1;i<samples.length-1;i++)if(samples[i].magnitude>samples[i-1].magnitude&&samples[i].magnitude>samples[i+1].magnitude){
  let low=Math.log(samples[i-1].frequencyHz),high=Math.log(samples[i+1].frequencyHz);let best=samples[i];
  // Refine each visible local maximum, retaining singular samples as unbounded candidates.
  for(let j=0;j<42;j++){const a=low+(high-low)/3,b=high-(high-low)/3,pa=impedanceAt(model,Math.exp(a)),pb=impedanceAt(model,Math.exp(b));if(pa.magnitude>best.magnitude)best=pa;if(pb.magnitude>best.magnitude)best=pb;if(pa.magnitude<pb.magnitude)low=a;else high=b;}
  if(!peaks.some(p=>Math.abs(Math.log(p.frequencyHz/best.frequencyHz))<1e-5))peaks.push(best);
 }
 return {minHz,maxHz,samples,peaks,singularCount:samples.filter(p=>p.singular).length};
}

