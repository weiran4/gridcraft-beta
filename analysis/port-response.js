import {gfmDynamicModel} from './gfm-dynamics.js?v=scr1';
export const c=(re,im=0)=>({re,im}),add=(a,b)=>c(a.re+b.re,a.im+b.im),sub=(a,b)=>c(a.re-b.re,a.im-b.im),mul=(a,b)=>c(a.re*b.re-a.im*b.im,a.re*b.im+a.im*b.re),scale=(a,k)=>c(a.re*k,a.im*k),div=(a,b)=>{const d=b.re*b.re+b.im*b.im;return c((a.re*b.re+a.im*b.im)/d,(a.im*b.re-a.re*b.im)/d);};
export function invert2(a){const d=sub(mul(a[0][0],a[1][1]),mul(a[0][1],a[1][0])),norm=Math.max(...a.flat().map(z=>Math.hypot(z.re,z.im)));if(!Number.isFinite(norm)||norm===0||Math.hypot(d.re,d.im)<1e-12*norm*norm)throw Error('端口矩阵奇异或病态，无法转换阻抗 / 导纳。');return [[div(a[1][1],d),div(scale(a[0][1],-1),d)],[div(scale(a[1][0],-1),d),div(a[0][0],d)]];}
// Complex Gaussian elimination with scaled partial pivoting; solve all input columns together.
export function frequencyMatrix({A,B,C,D},hz){
 if(!(Number.isFinite(hz)&&hz>0))throw Error('频率必须大于零。');
 const n=A.length,m=B[0].length,w=2*Math.PI*hz,mat=A.map((row,i)=>row.map((v,j)=>c(-v,i===j?w:0)).concat(B[i].map(v=>c(v))));
 const norms=mat.map(row=>Math.max(...row.slice(0,n).map(z=>Math.hypot(z.re,z.im))));
 for(let k=0;k<n;k++){
  let pivot=k;for(let i=k+1;i<n;i++)if(Math.hypot(mat[i][k].re,mat[i][k].im)/norms[i]>Math.hypot(mat[pivot][k].re,mat[pivot][k].im)/norms[pivot])pivot=i;
  if(!norms[pivot]||Math.hypot(mat[pivot][k].re,mat[pivot][k].im)<1e-13*norms[pivot])throw Error('频域矩阵奇异或病态。');
  [mat[k],mat[pivot]]=[mat[pivot],mat[k]];[norms[k],norms[pivot]]=[norms[pivot],norms[k]];
  for(let i=k+1;i<n;i++){const f=div(mat[i][k],mat[k][k]);for(let j=k+1;j<n+m;j++)mat[i][j]=sub(mat[i][j],mul(f,mat[k][j]));mat[i][k]=c(0);}
 }
 const X=Array.from({length:n},()=>Array(m));for(let i=n-1;i>=0;i--)for(let j=0;j<m;j++){let v=mat[i][n+j];for(let k=i+1;k<n;k++)v=sub(v,mul(mat[i][k],X[k][j]));X[i][j]=div(v,mat[i][i]);}
 return C.map((row,i)=>Array.from({length:m},(_,j)=>row.reduce((a,v,k)=>add(a,scale(X[k][j],v)),c(D[i][j]))));
}
// Remove the upstream RL states, impose a PCC current port, and rotate that port
// into a fixed synchronous frame. The grid is used only to establish the operating point.
// Positive perturbation current enters the converter + RC subsystem.
export function gfmPortModel(p,g,mode,settings){
 const full=gfmDynamicModel({...p,considerScr:true},g,mode,settings),{op}=full;
 const ids=Object.fromEntries(full.names.map((n,i)=>[n,i])),keep=full.names.map((n,i)=>i).filter(i=>!['ig0','ig1'].includes(full.names[i])),x0=keep.map(i=>full.x0[i]),rc=p.Rc/op.Z;
 function evaluate(x,j=[0,0]){
  const state=[...full.x0];keep.forEach((k,i)=>state[k]=x[i]);const delta=state[ids.delta],co=Math.cos(delta),si=Math.sin(delta),ig=[op.ig[0]-j[0],op.ig[1]-j[1]];
  state[ids.ig0]=co*ig[0]+si*ig[1];state[ids.ig1]=-si*ig[0]+co*ig[1];
  const v=[0,1].map(k=>state[ids['vc'+k]]+rc*(state[ids['il'+k]]-state[ids['ig'+k]]));
  return {dx:full.derivative(state).filter((_,i)=>keep.includes(i)),y:[co*v[0]-si*v[1],si*v[0]+co*v[1]]};
 }
 const n=keep.length,A=Array.from({length:n},()=>Array(n)),B=Array.from({length:n},()=>Array(2)),C=[Array(n),Array(n)],D=[Array(2),Array(2)];
 for(let k=0;k<n+2;k++){
  const h=k<n?2e-6*Math.max(1,Math.abs(x0[k])):2e-6,xp=[...x0],xm=[...x0],jp=[0,0],jm=[0,0];if(k<n){xp[k]+=h;xm[k]-=h;}else{jp[k-n]=h;jm[k-n]=-h;}
  const plus=evaluate(xp,jp),minus=evaluate(xm,jm);for(let i=0;i<n;i++)(k<n?A[i]:B[i])[k<n?k:k-n]=(plus.dx[i]-minus.dx[i])/(2*h);
  for(let i=0;i<2;i++)(k<n?C[i]:D[i])[k<n?k:k-n]=(plus.y[i]-minus.y[i])/(2*h);
 }
 return {A,B,C,D,x0,names:keep.map(i=>full.names[i]),op,residual:Math.max(...evaluate(x0).dx.map(Math.abs)),evaluate,delayModel:full.delayModel};
}
