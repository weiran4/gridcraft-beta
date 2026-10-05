const colors={d:'#137b70',q:'#316caa',P:'#af772c',Q:'#8556a4'};
export function bodeSvg(sweep){
 const W=1000,H=530,x0=75,x1=965,panels=[{key:'db',top:25,bottom:235,label:'Magnitude / dB',step:20},{key:'phase',top:285,bottom:490,label:'Phase / °',step:90}];
 const x=f=>x0+Math.log(f/sweep.min)/Math.log(sweep.max/sweep.min)*(x1-x0);
 let s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="四个控制环的波特幅频及相频图"><rect width="1000" height="530" fill="white"/>';
 for(const p of panels){
  const values=Object.values(sweep.series).flatMap(a=>a.map(v=>v[p.key])).filter(Number.isFinite);
  let lo=Math.floor(Math.min(0,...values)/p.step)*p.step,hi=Math.ceil(Math.max(0,...values)/p.step)*p.step;if(lo===hi)hi+=p.step;
  const y=v=>p.bottom-(v-lo)/(hi-lo)*(p.bottom-p.top);
  s+='<text x="75" y="'+(p.top-9)+'" font-size="13">'+p.label+'</text>';
  for(let v=lo;v<=hi;v+=p.step){s+='<path d="M75 '+y(v)+'H965" stroke="'+(v===0?'#a1b4bd':'#e5eaed')+'"/><text x="65" y="'+(y(v)+4)+'" text-anchor="end" font-size="12">'+v+'</text>';}
  for(let e=Math.ceil(Math.log10(sweep.min));e<=Math.floor(Math.log10(sweep.max));e++){const f=10**e;s+='<path d="M'+x(f)+' '+p.top+'V'+p.bottom+'" stroke="#e5eaed"/><text x="'+x(f)+'" y="'+(p.bottom+18)+'" text-anchor="middle" font-size="12">'+f+'</text>';}
  for(const [k,points] of Object.entries(sweep.series)){const path=points.map((v,i)=>(i?'L':'M')+x(v.f).toFixed(2)+' '+y(v[p.key]).toFixed(2)).join(' ');s+='<path d="'+path+'" fill="none" stroke="'+colors[k]+'" stroke-width="2"'+(['q','Q'].includes(k)?' stroke-dasharray="6 4"':'')+'/>';}
 }
 return s+'<text x="520" y="525" text-anchor="middle" font-size="14">Frequency / Hz</text></svg>';
}
export const bodeLegend=(labels={})=>'<div class="bode-legend">'+Object.entries(colors).map(([k,c])=>'<span><i style="border-color:'+c+';'+(['q','Q'].includes(k)?'border-top-style:dashed':'')+'"></i>'+(labels[k]??k)+' 环</span>').join('')+'</div>';
