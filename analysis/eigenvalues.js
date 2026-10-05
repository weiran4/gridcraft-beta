// Balanced Hessenberg reduction and complex shifted QR. No external runtime.
const z=(re,im=0)=>({re,im}),add=(a,b)=>z(a.re+b.re,a.im+b.im),sub=(a,b)=>z(a.re-b.re,a.im-b.im),mul=(a,b)=>z(a.re*b.re-a.im*b.im,a.re*b.im+a.im*b.re),conj=a=>z(a.re,-a.im),abs=a=>Math.hypot(a.re,a.im),scale=(a,k)=>z(a.re*k,a.im*k);
const sqrt=a=>{const n=abs(a);return z(Math.sqrt(Math.max(0,(n+a.re)/2)),(a.im<0?-1:1)*Math.sqrt(Math.max(0,(n-a.re)/2)));};
export function eigenvalues(matrix){
 const n=matrix.length;if(!n||matrix.some(r=>r.length!==n||r.some(v=>!Number.isFinite(v))))throw Error('特征值矩阵无效。');
 const a=matrix.map(r=>[...r]);
 for(let pass=0;pass<20;pass++){let changed=false;for(let i=0;i<n;i++){let row=0,col=0;for(let j=0;j<n;j++)if(i!==j){row+=Math.abs(a[i][j]);col+=Math.abs(a[j][i]);}if(!row||!col)continue;const f=2**Math.round(Math.log2(Math.sqrt(row/col)));if(!Number.isFinite(f)||f===0)continue;if(row/f+col*f<.95*(row+col)){for(let j=0;j<n;j++)a[i][j]/=f;for(let j=0;j<n;j++)a[j][i]*=f;changed=true;}}if(!changed)break;}
 for(let k=0;k<n-2;k++){const v=a.slice(k+1).map(r=>r[k]),norm=Math.hypot(...v);if(!norm)continue;v[0]+=(v[0]>=0?1:-1)*norm;const vn=Math.hypot(...v);for(let i=0;i<v.length;i++)v[i]/=vn;
  for(let j=k;j<n;j++){let dot=0;for(let i=0;i<v.length;i++)dot+=v[i]*a[k+1+i][j];for(let i=0;i<v.length;i++)a[k+1+i][j]-=2*v[i]*dot;}
  for(let i=0;i<n;i++){let dot=0;for(let j=0;j<v.length;j++)dot+=a[i][k+1+j]*v[j];for(let j=0;j<v.length;j++)a[i][k+1+j]-=2*dot*v[j];}
  for(let i=k+2;i<n;i++)a[i][k]=0;
 }
 let h=a.map(r=>r.map(v=>z(v))),m=n,steps=0;const roots=[];
 while(m>1){if(abs(h[m-1][m-2])<1e-11*Math.max(1,abs(h[m-1][m-1])+abs(h[m-2][m-2]))){roots.push(h[m-1][m-1]);m--;h=h.slice(0,m).map(r=>r.slice(0,m));steps=0;continue;}
  if(++steps>2500)throw Error('特征值迭代未收敛，未给出稳定性结论。');
  const aa=h[m-2][m-2],dd=h[m-1][m-1],mid=scale(add(aa,dd),.5),dif=scale(sub(aa,dd),.5),rad=sqrt(add(mul(dif,dif),mul(h[m-2][m-1],h[m-1][m-2]))),r1=add(mid,rad),r2=sub(mid,rad);
  let shift=abs(sub(r1,dd))<abs(sub(r2,dd))?r1:r2;if(steps%40===0)shift=add(dd,z(abs(h[m-1][m-2]),.1*abs(h[m-1][m-2])));
  for(let i=0;i<m;i++)h[i][i]=sub(h[i][i],shift);const rotations=[];
  for(let k=0;k<m-1;k++){const x=h[k][k],y=h[k+1][k],norm=Math.hypot(abs(x),abs(y)),c=norm?scale(x,1/norm):z(1),s=norm?scale(y,1/norm):z(0);rotations.push([c,s]);
   for(let j=k;j<m;j++){const x=h[k][j],y=h[k+1][j];h[k][j]=add(mul(conj(c),x),mul(conj(s),y));h[k+1][j]=sub(mul(c,y),mul(s,x));}h[k+1][k]=z(0);
  }
  for(let k=0;k<m-1;k++){const [c,s]=rotations[k];for(let i=0;i<m;i++){const x=h[i][k],y=h[i][k+1];h[i][k]=add(mul(x,c),mul(y,s));h[i][k+1]=sub(mul(y,conj(c)),mul(x,conj(s)));}}
  for(let i=0;i<m;i++)h[i][i]=add(h[i][i],shift);
 }
 roots.push(h[0][0]);if(roots.some(v=>!Number.isFinite(v.re)||!Number.isFinite(v.im)))throw Error('特征值超出数值范围。');return roots.sort((a,b)=>b.re-a.re);
}
