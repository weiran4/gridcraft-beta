import {tiFromKi} from '../analysis/pi-time.js?v=ti1';
import {gainSliderMax} from './gain-slider.js?v=transformer-rx3';
const text=(x,y,t,cls='')=>`<text x="${x}" y="${y}" class="${cls}">${t}</text>`;
const line=(d,cls='')=>`<path d="${d}" class="signal ${cls}" marker-end="url(#gfmArrow)"/>`;
const sum=(x,y)=>`<circle cx="${x}" cy="${y}" r="14" class="sum"/>`+text(x-5,y+5,'+');
const rect=(x,y,w,h)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="plant"/>`;
const f=n=>Number.isFinite(n)?String(n):'∞';
export function gfmDiagram(g,s){
 const names={d:'电流 d',q:'电流 q',P:'电压 d',Q:'电压 q'},mode=s.mode,m=s.modes[mode];
 const filter=(x,y,key,label)=>rect(x-55,y,110,66)+`<foreignObject x="${x-52}" y="${y+3}" width="104" height="61"><div xmlns="http://www.w3.org/1999/xhtml" class="filter-fields"><div class="tf"><span>1</span><span>1 + sT</span></div><label>T = <input aria-label="图内 ${label}时间常数" type="number" min="0" step="any" required data-setting="${key}" value="${s[key]}"/> ms</label></div></foreignObject>`;
 const outer=(x,y,w,title,fields)=>rect(x,y,w,118)+text(x+12,y+24,title,'block-title')+`<foreignObject x="${x+8}" y="${y+32}" width="${w-16}" height="80"><div xmlns="http://www.w3.org/1999/xhtml" class="outer-fields">`+fields.map(([k,l,u])=>`<label>${l}<input type="number" min="0.000000001" step="any" required data-outer="${k}" aria-label="图内 ${l}" value="${m[k]}"/><small>${u}</small></label>`).join('')+'</div></foreignObject>';
 const pi=(key,x,y)=>rect(x,y,180,142)+text(x+30,y+24,'PI '+names[key],'block-title')+`<foreignObject x="${x+8}" y="${y+32}" width="164" height="105"><div xmlns="http://www.w3.org/1999/xhtml" class="gain-fields">`+['kp','ti'].map(k=>{const value=k==='ti'?tiFromKi(g[key].ki):g[key].kp,max=gainSliderMax(Number.isFinite(value)?value:1,Number.isFinite(value)?value:1),min=k==='ti'?1e-8:0;return `<label>${k==='ti'?'Ti · s':'Kp'}<input aria-label="${names[key]} ${k==='ti'?'Ti':'Kp'}" data-gain="${key}.${k}" ${k==='ti'?'type="text"':'type="number" step="any" min="0"'} required value="${f(value)}"/></label><input type="range" aria-label="${names[key]} ${k} 滑块" data-gain="${key}.${k}" min="${min}" max="${max}" step="any" value="${Number.isFinite(value)?value:max}" ${Number.isFinite(value)?'':'disabled'}/>`;}).join('')+'</div></foreignObject>';
 let svg=`<svg id="gfmDiagram" viewBox="0 0 1180 1220" role="group" aria-label="${mode} 成网外环和电压电流双环信号框图"><defs><marker id="gfmArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#263743"/></marker></defs>`;
 svg+=text(20,25,(mode==='droop'?'Droop · 下垂控制':mode==='vsg'?'VSG · 功率摆动方程':'Synchronverter · 转矩与励磁'),'section-title');
 svg+=text(20,108,'P*')+line('M45 103H76')+sum(90,103)+line('M104 103H'+(mode==='sync'?145:170));
 if(mode==='droop')svg+=outer(170,50,190,'mp · P–f 下垂',[['mp','mp','%']])+line('M360 103H426');
 else if(mode==='vsg')svg+=outer(170,50,210,'1 / (2Hs + D)',[['h','H','s'],['d','D','pu']])+line('M380 103H426');
 else svg+=rect(145,79,85,48)+text(162,108,'÷ ω')+line('M230 103H255')+outer(255,50,190,'1 / (2Hs + D)',[['h','H','s'],['d','D','pu']])+line('M445 103H496');
 const sx=mode==='sync'?510:440;
 svg+=sum(sx,103)+text(sx-4,49,'1')+line(`M${sx} 57V89`)+text(sx+10,85,'+')+line(`M${sx+14} 103H615`)+text(543,88,'ω')+rect(615,79,130,48)+text(650,108,'ωb / s')+line('M745 103H795')+text(807,108,'θ → dq 变换 / 调制');
 svg+=line('M90 223V199','feedback')+filter(90,135,'filterPqMs','P 反馈')+line('M90 135V117','feedback')+text(105,132,'−')+text(78,243,'P');
 svg+=text(540,166,'ω 为 pu，θ 为 rad；δ = θ − ωb t','diagram-note')+text(540,191,mode==='sync'?'转矩差 = (P* − Pf) / ω；频率反馈经 D':'频率偏差 Δω 与标幺基准 1 相加','diagram-note');
 svg+=text(20,333,'Q*')+line('M45 328H76')+sum(90,328)+line('M104 328H'+(mode==='droop'?170:146))+line('M90 448V425','feedback')+filter(90,360,'filterPqMs','Q 反馈')+line('M90 360V342','feedback')+text(105,356,'−')+text(78,469,'Q');
 if(mode==='droop')svg+=outer(170,275,190,'nq · Q–V 下垂',[['nq','nq','%']])+line('M360 328H426')+sum(440,328)+text(425,252,'V₀')+line('M440 260V314')+text(450,310,'+')+line('M454 328H720')+text(735,333,'vd* = V*；vq* = 0');
 else{
 svg+=sum(160,328)+line('M174 328H415')+text(178,354,'+')+line('M160 440V342','feedback')+rect(230,415,175,48)+text(244,444,'(V₀ − |vf|) / nq')+line('M230 440H160','feedback');
 svg+=outer(415,275,235,mode==='vsg'?'Kv / s → V*':'Ke / s → ψ',[['nq','nq','%'],[mode==='vsg'?'kv':'ke',mode==='vsg'?'Kv':'Ke','1/s']])+line('M650 328H715');
 if(mode==='sync')svg+=rect(715,304,65,48)+text(735,333,'× ω')+line('M780 328H835')+text(850,333,'V* = ω ψ');else svg+=text(735,333,'vd* = V*；vq* = 0');
 }
 svg+=text(710,430,'P/Q：PCC 送网电流 ig 与 PCC 电压 v','diagram-note')+text(710,455,'P = vd igd + vq igq；Q = vq igd − vd igq','diagram-note');
 svg+=`<path d="M20 492H1160" class="divider"/>`+text(20,520,'共用 dq 电压 / 电流双环 · 同名变量代表同一信号','section-title');
 for(const [a,vo,ci,y]of [['d','P','d',670],['q','Q','q',990]]){
  svg+=text(14,y+5,'v'+a+'*')+line(`M48 ${y}H76`)+sum(90,y)+line(`M104 ${y}H140`)+pi(vo,140,y-65)+line(`M320 ${y}H346`)+sum(360,y)+line(`M374 ${y}H421`)+text(385,y-40,'iL'+a+'*')+sum(435,y)+line(`M449 ${y}H475`)+pi(ci,475,y-65)+line(`M655 ${y}H716`)+sum(730,y)+line(`M744 ${y}H776`)+sum(790,y)+line(`M804 ${y}H835`)+rect(835,y-35,230,70)+text(854,y-14,s.considerScr?'Lf / RC / 电网 dq 电路':'本地 Lf / RC · 理想解耦')+text(855,y+7,'u'+a+' → iL'+a+', v'+a+', ig'+a)+text(854,y+27,s.delaySamples>0?'D(s) = exp(−sTd)':'D(s) = 1 · 零延时','diagram-note')+line(`M1065 ${y}H1110`)+text(1120,y+5,'输出');
  svg+=text(309,y-88,(s.considerScr?'F · ig':'固定扰动 ig')+a)+line(`M360 ${y-76}V${y-14}`,'feedforward')+text(370,y-19,'+');
  svg+=text(291,y+113,'ω Cb vc'+(a==='d'?'q':'d'))+line(`M360 ${y+90}V${y+14}`,'decoupling')+text(371,y+34,a==='d'?'−':'+');
  svg+=text(679,y-128,(s.considerScr?'av · v':'v')+a)+(s.considerScr?filter(730,y-116,'filterVoltageMs',a+' 轴电压前馈'):rect(675,y-116,110,66)+text(681,y-80,'理想电压前馈'))+line(`M730 ${y-50}V${y-14}`,'feedforward')+text(741,y-20,'+');
  svg+=text(733,y+113,'ω Lb iL'+(a==='d'?'q':'d')+'f')+line(`M790 ${y+90}V${y+14}`,'decoupling')+text(802,y+34,a==='d'?'−':'+');
  for(const [x,key,label,name]of [[90,'filterVoltageMs','v'+a,a+' 轴电压反馈'],[435,'filterCurrentMs','iL'+a,a+' 轴电流反馈']])svg+=text(x-12,y+191,label)+line(`M${x} ${y+174}V${y+153}`,'feedback')+filter(x,y+87,key,name)+line(`M${x} ${y+87}V${y+14}`,'feedback')+text(x+14,y+34,'−');
 }
 return svg+text(20,1208,'Cb = Cf Zb，Lb = Lf/Zb；电容解耦使用 vc，电感解耦使用滤波电流；蓝：前馈，棕：解耦。','diagram-note')+'</svg>';
}
