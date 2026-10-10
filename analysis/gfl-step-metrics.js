/** Small zero-delay LTI responses, NOT EMT or nonlinear/limited controller tests.
 * Conservative scaling/squaring + converged Taylor exponential. This is not the
 * optimized Al-Mohy/Higham algorithm; independent reference is scipy.linalg.expm.
 * Method background: https://eprints.maths.manchester.ac.uk/1442/
 * Refinement and explicit numerical/budget states are part of the API.
 */
import {trim,scaledPolynomial,dcGain,poleStability} from './gfl-linear-model.js';
const eye=n=>Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0));
const norm=A=>Math.max(...A.map(row=>row.reduce((s,v)=>s+Math.abs(v),0)));
const product=(A,B)=>{const n=A.length,C=Array.from({length:n},()=>Array(n).fill(0));for(let i=0;i<n;i++)for(let k=0;k<n;k++)for(let j=0;j<n;j++)C[i][j]+=A[i][k]*B[k][j];return C;};
export function matrixExponential(A){
 const n=A.length;if(!n||A.some(row=>row.length!==n||row.some(v=>!Number.isFinite(v))))throw Error('矩阵指数输入无效。');
 const s=Math.max(0,Math.ceil(Math.log2(Math.max(norm(A),1e-300)/.5)));if(s>40)throw Error('矩阵指数尺度过大，拒绝不可靠结果。');
 const B=A.map(row=>row.map(v=>v/2**s));let term=eye(n),sum=eye(n),converged=false;
 for(let k=1;k<=80;k++){term=product(term,B).map(row=>row.map(v=>v/k));sum=sum.map((row,i)=>row.map((v,j)=>v+term[i][j]));if(norm(term)<1e-16*Math.max(1,norm(sum))){converged=true;break;}}
 if(!converged)throw Error('矩阵指数未收敛。');
 for(let k=0;k<s;k++)sum=product(sum,sum);
 if(sum.some(row=>row.some(v=>!Number.isFinite(v))))throw Error('矩阵指数数值溢出。');
 return sum;
}
function realization(model){
 const denominator=trim(model.denominator),numerator=trim(model.numerator),n=denominator.length-1;
 if(numerator.length>n+1)throw Error('非真有理传递函数没有有限普通阶跃响应。');
 const {scale}=scaledPolynomial(denominator),lead=denominator[n];
 const a=denominator.map((v,i)=>v/lead*Math.pow(scale,i-n));
 const b=Array.from({length:n+1},(_,i)=>(numerator[i]||0)/lead*Math.pow(scale,i-n));
 const D=b[n],A=Array.from({length:n},()=>Array(n).fill(0)),B=Array(n).fill(0),C=Array.from({length:n},(_,i)=>b[i]-D*a[i]);
 for(let i=0;i<n-1;i++)A[i][i+1]=1;for(let j=0;j<n;j++)A[n-1][j]=-a[j];B[n-1]=1;
 // Similarity balancing; transform B and C along with A.
 for(let pass=0;pass<24;pass++){let changed=false;for(let i=0;i<n;i++){
  let row=0,col=0;for(let j=0;j<n;j++)if(i!==j){row+=Math.abs(A[i][j]);col+=Math.abs(A[j][i]);}
  if(!row||!col)continue;const f=2**Math.round(Math.log2(Math.sqrt(row/col)));
  if(!(f>0)||!Number.isFinite(f))continue;
  if(row/f+col*f<.95*(row+col)){for(let j=0;j<n;j++)A[i][j]/=f;for(let j=0;j<n;j++)A[j][i]*=f;B[i]/=f;C[i]*=f;changed=true;}
 }if(!changed)break;}
 const aug=Array.from({length:n+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===n?0:scale*(j===n?B[i]:A[i][j])));
 if(aug.some(row=>row.some(v=>!Number.isFinite(v)))||C.some(v=>!Number.isFinite(v)))throw Error('状态空间尺度超出范围。');
 return {aug,C,D,n};
}
function sample(model,poles,window,bins,maxPoints){
 const {aug,C,D,n}=realization(model);let state=Array(n+1).fill(0);state[n]=1;
 const points=[{t:0,y:D}],fast=Math.max(...poles.map(z=>Math.hypot(z.re,z.im)),1/window);
 let start=0,end=Math.min(window,1/fast);
 while(start<window){const dt=(end-start)/bins,M=matrixExponential(aug.map(row=>row.map(v=>v*dt)));
  for(let j=1;j<=bins;j++){state=M.map(row=>row.reduce((s,v,k)=>s+v*state[k],0));const y=D+C.reduce((s,v,i)=>s+v*state[i],0);if(!Number.isFinite(y))throw Error('阶跃传播数值溢出。');points.push({t:start+j*dt,y});if(points.length>maxPoints)throw Error('阶跃采样预算耗尽。');}
  start=end;end=Math.min(window,end*2);
 }
 return points;
}
const interpolate=(a,b,ya,yb,level)=>a+(b-a)*(level-ya)/(yb-ya);
function metrics(points,gain){
 const ys=points.map(p=>p.y/gain);
 const hit=level=>{if(ys[0]>=level)return 0;for(let i=1;i<ys.length;i++)if(ys[i]>=level&&ys[i-1]<level)return interpolate(points[i-1].t,points[i].t,ys[i-1],ys[i],level);return null;};
 const t10=hit(.1),t90=hit(.9);let last=-1,max=1;
 for(let i=0;i<ys.length;i++){if(Math.abs(ys[i]-1)>.02)last=i;if(ys[i]>max)max=ys[i];}
 let settling=null;if(last<0)settling=0;else if(last<ys.length-1){const a=points[last],b=points[last+1];settling=interpolate(a.t,b.t,Math.abs(ys[last]-1),Math.abs(ys[last+1]-1),.02);}
 return {riseTimeSeconds:t10===null||t90===null?null:t90-t10,overshootPercent:Math.max(0,(max-1)*100),settlingTimeSeconds:settling};
}
export function linearStepMetrics(model,options={}){
 const empty={dcGain:null,riseTimeSeconds:null,overshootPercent:null,settlingTimeSeconds:null,windowSeconds:null,points:[],verification:{refined:false}};
 try{
  const stability=poleStability(model.denominator);if(stability.status!=='stable')return {...empty,status:stability.status};
  const gain=dcGain(model);if(!Number.isFinite(gain)||gain===0)return {...empty,status:'undefinedDcGain',dcGain:Number.isFinite(gain)?gain:null};
  if(trim(model.denominator).length===1)return {...empty,status:'ok',dcGain:gain,riseTimeSeconds:0,overshootPercent:0,settlingTimeSeconds:0,windowSeconds:0,points:[{t:0,y:gain}],peakPoint:{t:0,y:gain},verification:{refined:true,method:'constant'}};
  const rate=Math.min(...stability.poles.map(z=>-z.re)),required=12/rate,maxWindow=options.maxWindowSeconds??1e6,window=Math.min(required,maxWindow);
  if(!(window>0)||!Number.isFinite(window))throw Error('观察窗无效。');
  const coarse=sample(model,stability.poles,window,48,options.maxPoints??20000),fine=sample(model,stability.poles,window,96,options.maxPoints??20000),a=metrics(coarse,gain),b=metrics(fine,gain);
  const agrees=(x,y,tol)=>x===null||y===null?x===y:Math.abs(x-y)<=tol;
  const verified=agrees(a.settlingTimeSeconds,b.settlingTimeSeconds,Math.max(.00002,.005*(b.settlingTimeSeconds??0)))&&agrees(a.riseTimeSeconds,b.riseTimeSeconds,Math.max(.00002,.01*(b.riseTimeSeconds??0)))&&Math.abs(a.overshootPercent-b.overshootPercent)<=.1;
  const tailOK=Math.abs(fine.at(-1).y/gain-1)<.005;
  // Decimation must not remove the extremum annotated by the preview.
  const peakIndex=fine.reduce((best,p,i)=>p.y/gain>fine[best].y/gain?i:best,0);
  const troughIndex=fine.reduce((best,p,i)=>p.y/gain<fine[best].y/gain?i:best,0);
  const settlingIndex=b.settlingTimeSeconds===null?-1:fine.findIndex(p=>p.t>=b.settlingTimeSeconds);
  const keep=new Set([0,fine.length-1,peakIndex,troughIndex,settlingIndex,settlingIndex-1]);
  return {...b,peakPoint:fine[peakIndex],status:required>maxWindow||b.settlingTimeSeconds===null||!tailOK?'windowExceeded':verified?'ok':'resolutionLimited',dcGain:gain,windowSeconds:window,
   points:options.includePoints===false?[]:fine.filter((_,i)=>i%Math.max(1,Math.floor(fine.length/600))===0||keep.has(i)),
   verification:{refined:verified,method:'balanced-state-space-exponential',samples:fine.length,settlingTolerance:.02}};
 }catch(error){return {...empty,status:'numericalFailure',message:error.message};}
}
