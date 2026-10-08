import {escapeHtml as esc} from './symbols.js';
const colors={d:'#137b70',q:'#316caa',P:'#af772c',Q:'#8556a4'};
export function bodeSvg(sweep,options={}){
 const compact=options.compact===true,W=compact?Math.max(260,options.width??540):1000,H=compact?360:530,x0=compact?54:75,x1=W-(compact?17:35);
 const panels=compact?[{key:'db',top:29,bottom:142,label:'Magnitude / dB',step:20},{key:'phase',top:207,bottom:320,label:'Phase / °',step:90}]:[{key:'db',top:25,bottom:235,label:'Magnitude / dB',step:20},{key:'phase',top:285,bottom:490,label:'Phase / °',step:90}];
 const x=f=>x0+Math.log(f/sweep.min)/Math.log(sweep.max/sweep.min)*(x1-x0);
 let s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(options.label??'四个控制环的波特幅频及相频图')+'"><rect width="'+W+'" height="'+H+'" fill="white"/>';
 for(const p of panels){
  const values=Object.values(sweep.series).flatMap(a=>a.map(v=>v[p.key])).filter(Number.isFinite);
  let step=p.step;const vmin=Math.min(0,...values),vmax=Math.max(0,...values);
  if(compact)while((vmax-vmin)/step>4)step*=2;
  let lo=Math.floor(vmin/step)*step,hi=Math.ceil(vmax/step)*step;if(lo===hi)hi+=step;
  const y=v=>p.bottom-(v-lo)/(hi-lo)*(p.bottom-p.top);
  s+='<text x="'+x0+'" y="'+(p.top-9)+'" font-size="13">'+p.label+'</text>';
  for(let v=lo;v<=hi;v+=step){s+='<path d="M'+x0+' '+y(v)+'H'+x1+'" stroke="'+(v===0?'#a1b4bd':'#e5eaed')+'"/><text x="'+(x0-9)+'" y="'+(y(v)+4)+'" text-anchor="end" font-size="12">'+v+'</text>';}
  const first=Math.ceil(Math.log10(sweep.min)),last=Math.floor(Math.log10(sweep.max)),every=compact?Math.max(1,Math.ceil((last-first+1)/Math.max(2,Math.floor((x1-x0)/66)))):1;
  for(let e=first;e<=last;e+=every){const f=10**e,label=compact&&(f<.001||f>=10000)?'1e'+e:f;s+='<path d="M'+x(f)+' '+p.top+'V'+p.bottom+'" stroke="#e5eaed"/><text x="'+x(f)+'" y="'+(p.bottom+18)+'" text-anchor="middle" font-size="12">'+label+'</text>';}
  for(const [k,points] of Object.entries(sweep.series)){const path=points.map((v,i)=>(i?'L':'M')+x(v.f).toFixed(2)+' '+y(v[p.key]).toFixed(2)).join(' ');s+='<path data-bode-trace="'+esc(k)+'" d="'+path+'" fill="none" stroke="'+colors[k]+'" stroke-width="2"'+(['q','Q'].includes(k)?' stroke-dasharray="6 4"':'')+'/>';}
 }
 return s+'<text x="'+((x0+x1)/2)+'" y="'+(H-5)+'" text-anchor="middle" font-size="14">Frequency / Hz</text></svg>';
}
export const bodeLegend=(labels={})=>'<div class="bode-legend">'+Object.entries(colors).map(([k,c])=>'<span><i style="border-color:'+c+';'+(['q','Q'].includes(k)?'border-top-style:dashed':'')+'"></i>'+(labels[k]??k)+' 环</span>').join('')+'</div>';

/** GFL-only layout. The original overlay API remains available to GFM. */
export function bodeLoopGrid(sweep,labels={},options={}){
 const width=options.width??1200,columns=options.columns??2,plotWidth=Math.max(260,(width-(columns-1)*16)/columns-24);
 const names={d:'d 轴电流环',q:'q 轴电流环',P:(labels.P??'P')+' 外环',Q:(labels.Q??'Q')+' 外环'};
 return '<div class="bode-loop-grid">'+['d','q','P','Q'].map(k=>{
  const valid=sweep&&sweep.min>0&&sweep.max>sweep.min&&sweep.series?.[k]?.length;
  const chart=valid?bodeSvg({...sweep,series:{[k]:sweep.series[k]}},{compact:true,width:plotWidth,label:names[k]+' 幅频及相频图'}):'<div class="bode-empty">当前输入无效或尚未配置 PI；未绘制曲线。</div>';
  return '<section class="bode-loop-card" data-bode-loop="'+k+'"><h3>'+esc(names[k])+'</h3><div class="bode-loop-stage">'+chart+'</div></section>';
 }).join('')+'</div>';
}
