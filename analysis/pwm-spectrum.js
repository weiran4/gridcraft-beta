// Ideal two-level, naturally sampled SPWM. FFT magnitudes are peak / (Vdc/2).
export function convertHarmonicBasis(value,from,to){
 if(value==null||from===to)return value;
 if(!['phase','line'].includes(from)||!['phase','line'].includes(to))throw Error('无效的谐波口径。');
 return value*(to==='line'?Math.sqrt(3):1/Math.sqrt(3));
}
function amplitudes(re){
 const n=re.length,im=new Float64Array(n);
 for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
 for(let len=2;len<=n;len*=2){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);
  for(let start=0;start<n;start+=len){let cr=1,ci=0;for(let j=0;j<len/2;j++){
   const u=start+j,v=u+len/2,tr=re[v]*cr-im[v]*ci,ti=re[v]*ci+im[v]*cr;
   re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;
   const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr;
  }}
 }
 return Array.from({length:n/2},(_,k)=>Math.hypot(re[k],im[k])*(k===0?1:2)/n);
}
export function pwmSpectrum({frequencyHz,fs,modulation,thirdPercent=15}){
 if(!Number.isFinite(frequencyHz)||frequencyHz<=0||!Number.isFinite(fs)||fs<10*frequencyHz)throw Error('频谱要求开关频率至少为基波频率的 10 倍。');
 if(!Number.isFinite(modulation)||modulation<=0||modulation>1.3||!Number.isFinite(thirdPercent)||thirdPercent<0||thirdPercent>30)throw Error('调制比须在 0～1.3，三次谐波注入须在 0～30%。');
 const ratio=fs/frequencyHz;
 let cycles=1;while(cycles<=20&&Math.abs(ratio*cycles-Math.round(ratio*cycles))>1e-8)cycles++;
 if(cycles>20)throw Error('当前频率无法在 20 个基波周期内相干采样。请调整开关频率，或使用手动幅值；不输出有频谱泄漏的近似结果。');
 const size=2**Math.ceil(Math.log2(Math.max(262144,cycles*ratio*512)));
 if(size>1048576)throw Error('频率组合超出在线 FFT 采样上限，请降低频率比或使用手动幅值。');
 const a=new Float64Array(size),ab=new Float64Array(size),wave=[];
 let refMax=0;
 for(let k=0;k<size;k++){
  const t=k*cycles/size,theta=2*Math.PI*t,c=1-4*Math.abs((ratio*t)%1-.5);
  const ref=shift=>modulation*(Math.sin(theta+shift)+thirdPercent/100*Math.sin(3*(theta+shift)));
  const va=ref(0),vb=ref(-2*Math.PI/3);refMax=Math.max(refMax,Math.abs(va));
  a[k]=va>=c?1:-1;ab[k]=a[k]-(vb>=c?1:-1);
  if(t<1&&k%Math.max(1,Math.floor(size/cycles/2400))===0)wave.push({t,reference:va,carrier:c,switching:a[k]});
 }
 const phase=amplitudes(a),line=amplitudes(ab),harmonics=[];
 // Search all non-fundamental bins through four carrier groups, not only N-2 / 2N-1.
 for(let k=1;k<=Math.min(Math.floor((4*ratio+4)*cycles),size/2-1);k++)harmonics.push({order:k/cycles,hz:k*frequencyHz/cycles,phasePu:phase[k],linePu:line[k],score:line[k]/(k/cycles)});
 const candidates=harmonics.filter(h=>h.order>1.001&&h.linePu>.001);
 const dominant=candidates.reduce((best,h)=>!best||h.score>best.score?h:best,null);
 if(!dominant)throw Error('当前波形没有可用的非零序开关谐波。');
 return {harmonics,dominant,wave,cycles,size,ratio,refMax,overmodulated:refMax>1.00001,maxOrder:4*ratio+4};
}
