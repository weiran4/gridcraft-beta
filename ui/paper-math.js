
export const mi=t=>'<mi>'+t+'</mi>',mn=t=>'<mn>'+t+'</mn>',mo=t=>'<mo>'+t+'</mo>',mt=t=>'<mtext>'+t+'</mtext>';
export const sub=(a,b)=>'<msub>'+mi(a)+mt(b)+'</msub>',sup=(a,b)=>'<msup>'+a+mn(b)+'</msup>';
export const frac=(a,b)=>'<mfrac><mrow>'+a+'</mrow><mrow>'+b+'</mrow></mfrac>';
export const sqrt=a=>'<msqrt>'+a+'</msqrt>';
export const math=s=>'<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow>'+s+'</mrow></math>';
export function equationSet(settings={}){
 const dMode=settings.dMode??'P',qMode=settings.qMode??'Q';
 const eq=mo('='),plus=mo('+'),minus=mo('−'),v=a=>sub('v',a+',pu'),i=a=>sub('i',a+',pu'),ref=a=>'<msup>'+i(a)+'<mo>*</mo></msup>';
 const H=a=>sub('H',a)+mo('(')+mi('s')+mo(')');
 const C=a=>sub('C',a)+mo('(')+mi('s')+mo(')');
 const u=a=>'<msup>'+sub('u',a+',pu')+'<mo>*</mo></msup>';
 const k=a=>sub('K',a);
 const row=s=>'<div class="paper-equation">'+math(s)+'</div>';
 return row(sub('ω','i')+eq+mn(2)+mi('π')+sub('f','i')+mt('； ')+sub('ω','o')+eq+mn(2)+mi('π')+sub('f','o')+mt('； ')+sub('ω','b')+eq+mn(2)+mi('π')+sub('f','0')+mt('； ')+sub('T','d')+eq+mi('N')+sub('T','s')+mt('， ')+sub('T','s')+eq+frac(mn(1),sub('f','s')))+row(C('ℓ')+eq+k('p,ℓ')+plus+frac(mn(1),sub('T','i,ℓ')+mi('s'))+mt('， ℓ ∈ {'+dMode+','+qMode+',d,q}'))+
 row(sub('P','pu')+eq+v('d')+i('d')+plus+v('q')+i('q')+mt('； ')+sub('Q','pu')+eq+v('q')+i('d')+minus+v('d')+i('q'))+
 row(ref('d')+eq+(dMode==='Vdc'?minus:'')+C(dMode)+mo('(')+sub(dMode,'ref')+minus+H(dMode==='Vdc'?'vdc':'PQ')+mi(dMode)+mo(')')+mt('； ')+ref('q')+eq+minus+C(qMode)+mo('(')+sub(qMode,'ref')+minus+H(qMode==='Vac'?'v':'PQ')+mi(qMode)+mo(')'))+
 row(u('d')+eq+H('v')+v('d')+plus+C('d')+mo('(')+ref('d')+minus+H('i')+i('d')+mo(')')+minus+frac(mi('ω'),sub('ω','b'))+sub('L','f,pu')+H('i')+i('q'))+
 row(u('q')+eq+H('v')+v('q')+plus+C('q')+mo('(')+ref('q')+minus+H('i')+i('q')+mo(')')+plus+frac(mi('ω'),sub('ω','b'))+sub('L','f,pu')+H('i')+i('d'))+
 '<p class="small-note">自动整定：A(s) 为该环除 PI 外的开环对象，包含测量滤波；外环还包含实际内环闭环。令 ωz = r·ωc，电流环 / Vdc 的 r = 0.2，P / Q / Vac 的 r = 5。降低 ωc 直至相位裕度至少 60°；外环交越不超过内环的 1/5。r 是整定策略，不是设备参数。</p>'+
 row(k('p')+eq+frac(mn(1),mo('|')+mi('A')+mo('(')+mi('j')+sub('ω','c')+mo(')')+mo('|')+sqrt(mn(1)+plus+sup(mi('r'),2)))+mt('； ')+sub('T','i')+eq+frac(mn(1),k('p')+mi('r')+sub('ω','c')))+
 row(H('x')+eq+frac(mn(1),mn(1)+plus+mi('s')+sub('T','x'))+mt('，x ∈ {PQ, vdc, v, i}；T 用秒，0 表示旁路'))+
 '<p class="small-note">以下频响采用理想解耦近似，忽略图示滤波解耦的残余轴间耦合。T_d/q 与 T_o 均为实际输出/给定（区别于积分时间常数 Ti），控制极性与被控对象负号相消。</p>'+
 row(sub('G','i')+eq+frac(sub('Z','b'),sub('R','f')+plus+mi('s')+sub('L','f'))+'<msup><mi>e</mi><mrow><mo>−</mo><mi>s</mi>'+sub('T','d')+'</mrow></msup>')+
 row(sub('L','d/q')+eq+C('d/q')+sub('G','i')+H('i')+mt('； ')+sub('T','d/q')+eq+frac(C('d/q')+sub('G','i'),mn(1)+plus+sub('L','d/q')))+
 row(sub('L','o')+eq+C('o')+sub('T','d/q')+sub('G','o')+H('o')+mt('； ')+sub('T','o')+eq+frac(C('o')+sub('T','d/q')+sub('G','o'),mn(1)+plus+sub('L','o')))+
 '<p class="small-note">以下 Go 为极性抵消后的对象。P/Q：Go = 1。</p>'+
 (dMode==='Vdc'?'<p class="small-note">Vdc：Cbus·Vdc·dVdc/dt = Pdc − Pac；ΔVdc,pu/Δid,pu = −Kdc/s，Kdc = Sb/(Cbus·Vdc0²)。Go = Kdc/s，反馈 H_vdc(s) = 1/(1+sT_vdc)。采用填写的直流电压时间常数；假设 DC 输入功率不变。</p>':'')+
 (qMode==='Vac'?'<p class="small-note">Vac：另一通道保持不变，额定电压点 ΔVac,pu ≈ −Kvac·Δiq,pu；Kvac = Xth/Zb，Go = Kvac，反馈 H_v(s) = 1/(1+sT_v)。采用填写的交流电压时间常数；忽略网络动态及电阻引入的通道耦合。</p>':'');
}
