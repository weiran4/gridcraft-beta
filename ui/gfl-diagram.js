import {tiFromKi} from '../analysis/pi-time.js?v=ti1';
import {gainSliderMax} from './gain-slider.js?v=transformer-rx3';
import {math,sub,frac,mn,mi,mo} from './paper-math.js?v=transformer-rx3';
const text=(x,y,s,cls='')=>'<text x="'+x+'" y="'+y+'" class="'+cls+'">'+s+'</text>';
const path=(d,cls='')=>'<path d="'+d+'" class="signal '+cls+'" marker-end="url(#arrow)"/>';
const sum=(x,y)=>'<circle cx="'+x+'" cy="'+y+'" r="14" class="sum"/>'+text(x-5,y+5,'+');
const label=(x,y,s)=>'<text x="'+x+'" y="'+y+'" text-anchor="middle">'+s+'</text>';
import {measurementFilters,filterFields} from '../analysis/measurement-filters.js?v=filters1';
export function controlDiagram(gains,recommended,settings={}){
 const names={P:settings.dMode??'P',Q:settings.qMode??'Q',d:'d',q:'q'};
 const f=measurementFilters(settings);
 function filterBox(x,y,group,branch){
  const [key,name]=filterFields.find(field=>field[2]===group);
  return '<g class="filter-block"><title>'+name+'：H(s) = 1 / (1 + sT)，0 ms 为旁路；与设计输入同步</title><rect class="plant" x="'+(x-64)+'" y="'+y+'" width="128" height="64"/><foreignObject x="'+(x-60)+'" y="'+(y+3)+'" width="120" height="59"><div xmlns="http://www.w3.org/1999/xhtml" class="filter-fields">'+math(frac(mn(1),mn(1)+mo('+')+mi('s')+mi('T')))+'<label>T = <input type="number" min="0" step="any" data-filter-setting="'+key+'" value="'+f[group].ms+'" aria-label="'+branch+' '+name+'滤波时间常数 ms"/><span>ms</span></label></div></foreignObject></g>';
 }
 function box(loop,x,y){
 const fields=['kp','ti'].map(k=>{
 const value=k==='ti'?tiFromKi(gains[loop].ki):gains[loop].kp,rec=k==='ti'?tiFromKi(recommended[loop].ki):recommended[loop].kp,finite=Number.isFinite(value);
 const max=gainSliderMax(Number.isFinite(rec)?rec:0,finite?value:0),minimum=k==='ti'?Math.max(Number.MIN_VALUE,Math.min(finite?value:1,max)*1e-6):0;
 return '<label>'+math(sub(k==='ti'?'T':'K',k==='ti'?'i':'p'))+(k==='ti'?'<span class="pi-unit">s</span>':'')+'<input aria-label="'+names[loop]+' '+(k==='ti'?'Ti 秒':'Kp')+'" data-gain="'+loop+'.'+k+'" '+(k==='ti'?'type="text" inputmode="decimal"':'type="number" min="0" step="any"')+' value="'+(finite?Number(value.toPrecision(9)):'∞')+'"/></label><input aria-label="'+names[loop]+' '+(k==='ti'?'Ti':'Kp')+' 滑块" data-slider="'+loop+'.'+k+'" type="range" min="'+minimum+'" max="'+max+'" step="any" value="'+(finite?value:max)+'"'+(!finite?' disabled':'')+'/>';
 }).join('');
 return '<rect x="'+x+'" y="'+y+'" width="185" height="140" class="pi-box"/>'+text(x+65,y+22,'PI '+names[loop],'block-title')+'<foreignObject x="'+(x+8)+'" y="'+(y+29)+'" width="169" height="106"><div xmlns="http://www.w3.org/1999/xhtml" class="gain-fields">'+fields+'</div></foreignObject>';
 }
 const plant=y=>'<rect x="820" y="'+(y-30)+'" width="165" height="60" class="plant"/>'+text(832,y-7,settings.considerScr?'电压 / RC / 电网':'电压生成 / RL 对象')+text(833,y+16,'PCC 电压与 dq 耦合');
 const feedback=(x,y,name)=>label(x,y+165,name)+path('M'+x+' '+(y+146)+'V'+(y+14),'feedback')+text(x+9,y+36,'−')+filterBox(x,y+80,x===80?(name==='Vdc'?'vdc':name==='Vac'?'voltage':'pq'):'current',name+' 反馈');
 const decoupling=(y,name,sign)=>label(790,y+96,'(ω/ωb) Lf '+name+'f')+path('M760 '+(y+78)+'V'+(y+14),'decoupling')+text(769,y+36,sign);
 return '<svg id="controlDiagram" viewBox="0 0 1100 870" role="group" aria-label="可选外环双环控制；远距离信号用同名变量标签相连，含电压前馈与dq解耦"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#263743"/></marker></defs>'+
 text(25,30,'所有信号及 Lf 均为标幺值 · 电流正方向：逆变器 → 电网 · 理想 PLL，vd = 1，vq = 0','diagram-note')+
 box('P',120,105)+box('d',425,105)+box('Q',120,365)+box('q',425,365)+
 text(12,166,names.P+'*')+path('M40 170H65')+sum(80,170)+path('M94 170H120')+(names.P==='Vdc'?path('M305 170H326')+'<rect x="326" y="155" width="28" height="30" class="plant"/>'+text(329,175,'−1')+path('M354 170H370'):path('M305 170H370'))+text(352,140,'id*')+sum(385,170)+path('M399 170H425')+path('M610 170H675')+sum(690,170)+path('M704 170H745')+sum(760,170)+path('M774 170H820')+plant(170)+path('M985 170H1020')+text(1030,175,'id')+
 text(12,426,names.Q+'*')+path('M40 430H65')+sum(80,430)+path('M94 430H120')+path('M305 430H326')+'<rect x="326" y="415" width="28" height="30" class="plant"/>'+text(329,435,'−1')+path('M354 430H370')+text(352,400,'iq*')+sum(385,430)+path('M399 430H425')+path('M610 430H675')+sum(690,430)+path('M704 430H745')+sum(760,430)+path('M774 430H820')+plant(430)+path('M985 430H1020')+text(1030,435,'iq')+
 label(690,60,'vd')+path('M690 70V156','feedforward')+text(699,149,'+')+filterBox(690,78,'voltage','vd 前馈')+
 label(690,320,'vq')+path('M690 330V416','feedforward')+text(699,409,'+')+filterBox(690,338,'voltage','vq 前馈')+
 feedback(80,170,names.P)+feedback(385,170,'id')+decoupling(170,'iq','−')+
 feedback(80,430,names.Q)+feedback(385,430,'iq')+decoupling(430,'id','+')+
 '<rect x="425" y="633" width="285" height="82" class="plant"/>'+text(528,656,'P/Q 测量')+text(462,680,'P = vd id + vq iq')+text(462,703,'Q = vq id − vd iq')+
 text(250,679,'vd, vq, id, iq')+path('M355 674H425','feedback')+
 path('M710 654H770','feedback')+text(782,659,'P')+path('M710 695H770','feedback')+text(782,700,'Q')+
 text(28,753,'同名变量表示同一信号；短箭头表示输入 / 输出方向。蓝色：电压前馈；棕色：交叉解耦。','diagram-note')+text(28,781,'id_f = Hi id；iq_f = Hi iq；电压前馈使用 Hv。图示解耦使用滤波电流。','diagram-note')+text(28,805,'频响采用理想解耦的单轴近似，未计测量滤波造成的残余 dq 耦合。','diagram-note')+text(28,833,names.P==='Vdc'?'Vdc 反馈：id → −Kdc/s → Vdc（母线储能）':'P 反馈：id → P（额定点 vd = 1）','diagram-note')+text(28,858,names.Q==='Vac'?'Vac 反馈：iq → −Kvac → Vac（并网点低频灵敏度）':'Q 反馈：Q = −iq（额定点 vd = 1）','diagram-note')+'</svg>';
}
