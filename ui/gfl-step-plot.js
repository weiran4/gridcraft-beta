/** SVG only: never synthesizes a response from PM, bandwidth or settling time. */
import {escapeHtml as esc} from './symbols.js';
const finite=Number.isFinite,num=x=>Number(x.toPrecision(3)).toString();
export function stepResponseSvg(data,{width=900,showCurrent=true,showCandidate=true,fullWindow=false}={}){
 const curves=[['current','当前 PI',data?.current,showCurrent],['candidate','候选 PI',data?.candidate,showCandidate]]
  .filter(([, ,r,show])=>show&&r?.status==='ok'&&r.points?.length&&r.points.every(p=>finite(p.t)&&finite(p.y)));
 if(!curves.length)return '<div class="step-empty">没有可显示的有效曲线；请查看下方状态说明。</div>';
 const W=Math.max(340,width),H=W<500?300:340,left=56,right=20,top=38,bottom=48;
 const maxWindow=Math.max(...curves.map(([, ,r])=>r.windowSeconds||0),.001);
 const focus=Math.max(.001,...curves.map(([, ,r])=>Math.max(r.settlingTimeSeconds??0,r.riseTimeSeconds??0,r.overshootPercent>.02?r.peakPoint?.t??0:0)*1.35));
 const end=fullWindow?maxWindow:Math.min(maxWindow,focus),start=-.04*end;
 const visible=r=>{const points=r.points.filter(p=>p.t<=end);const next=r.points.find(p=>p.t>end);if(next)points.push(next);return points;};
 const values=curves.flatMap(([, ,r])=>visible(r).map(p=>p.y));values.push(0,1.02);
 const low=Math.min(...values),high=Math.max(...values),pad=Math.max(.08,(high-low)*.09),ymin=low-pad,ymax=high+pad;
 const x=t=>left+(t-start)/(end-start)*(W-left-right),y=v=>top+(ymax-v)/(ymax-ymin)*(H-top-bottom),X=W-right,Y=H-bottom;
 const timeScale=end<2?1000:1,unit=end<2?'ms':'s';
 const text=(xx,yy,t,attrs='')=>`<text x="${xx}" y="${yy}" ${attrs}>${esc(t)}</text>`;
 let svg=`<svg class="step-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="当前 PI 与候选 PI 的归一化参考阶跃响应，时间单位 ${unit}"><defs><clipPath id="step-response-clip"><rect x="${left}" y="${top}" width="${X-left}" height="${Y-top}"/></clipPath></defs>`;
 // Reference band is always about TARGET=1, not normalized to each output gain.
 svg+=`<rect data-curve="step-target-band" x="${x(0)}" y="${y(1.02)}" width="${X-x(0)}" height="${y(.98)-y(1.02)}" class="step-band"><title>目标误差带：0.98–1.02</title></rect>`;
 for(let i=0;i<=4;i++){const t=end*i/4,xx=x(t);svg+=`<line x1="${xx}" x2="${xx}" y1="${top}" y2="${Y}" class="step-grid"/>`+text(xx,Y+20,num(t*timeScale),'text-anchor="middle"');}
 for(let i=0;i<=4;i++){const v=ymin+(ymax-ymin)*i/4,yy=y(v);svg+=`<line x1="${left}" x2="${X}" y1="${yy}" y2="${yy}" class="step-grid"/>`+text(left-9,yy+4,num(v),'text-anchor="end"');}
 svg+=`<path data-curve="step-reference" d="M${left},${y(0)} H${x(0)} V${y(1)} H${X}" class="step-reference"/>`;
 for(const [id,label,r]of curves){
  const cls=`step-${id}`;let points=visible(r);if(r.verification?.method==='constant')points=[{t:0,y:r.dcGain},{t:end,y:r.dcGain}];
  const d=`M${left},${y(0)} L${x(0)},${y(0)} `+points.map(p=>`L${x(p.t)},${y(p.y)}`).join(' ');
  svg+=`<g clip-path="url(#step-response-clip)" class="${cls}">`;
  if(Math.abs(r.dcGain-1)>1e-5){const a=r.dcGain-.02*Math.abs(r.dcGain),b=r.dcGain+.02*Math.abs(r.dcGain);svg+=`<rect data-curve="step-final-band" x="${x(0)}" y="${y(b)}" width="${X-x(0)}" height="${y(a)-y(b)}" class="step-own-band"><title>${esc(label)} 最终值 ${num(r.dcGain)} ±2%；不是目标误差带</title></rect>`;}
  svg+=`<path data-curve="${cls}" d="${d}" class="step-trace"><title>${esc(label)} · 实际输出 / 参考增量</title></path>`;
  if(finite(r.settlingTimeSeconds)&&r.settlingTimeSeconds<=end){const xx=x(r.settlingTimeSeconds);svg+=`<line x1="${xx}" x2="${xx}" y1="${top+5}" y2="${Y}" class="step-settling"><title>${esc(label)} ±2% 稳定时间：${num(r.settlingTimeSeconds*timeScale)} ${unit}（相对最终值）</title></line>`;}
  const peak=r.peakPoint;if(peak&&r.overshootPercent>.02&&peak.t<=end){const xx=x(peak.t),yy=y(peak.y);svg+=`<circle cx="${xx}" cy="${yy}" r="4" class="step-peak"><title>${esc(label)} 峰值 ${num(peak.y)}；超调 ${num(r.overshootPercent)}%</title></circle>`+text(Math.min(X-5,Math.max(left+8,xx+9)),Math.max(top+15,yy-(id==='current'?12:-20)),`${id==='current'?'当前':'候选'} +${num(r.overshootPercent)}%`,`class="step-peak-text" text-anchor="${xx>X-125?'end':'start'}"`);}
  svg+='</g>';
 }
 svg+=text(left,19,'归一化增量 Δy / Δr')+text(X,Y+41,`时间 / ${unit}`,'text-anchor="end"');
 svg+=`<line x1="${left}" x2="${X}" y1="${Y}" y2="${Y}" class="step-axis"/></svg>`;
 return svg;
}
