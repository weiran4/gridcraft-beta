
import {escapeHtml as esc} from './symbols.js?v=transformer-rx3';
const n=v=>'<mn>'+esc(Number(v.toPrecision(7)))+'</mn>';
const mi=t=>'<mi>'+t+'</mi>',op=t=>'<mo>'+t+'</mo>';
const sub=(a,b)=>'<msub>'+mi(a)+'<mi mathvariant="normal">'+b+'</mi></msub>';
const row=s=>'<math display="block"><mrow>'+s+'</mrow></math>';
const sq=s=>'<msup>'+s+'<mn>2</mn></msup>';
const unit=s=>'<mspace width="0.2em"/><mtext>'+s+'</mtext>';
export function derivedFormulas(c,frequency){
 const p=c.parametersSI,R=p.resistanceOhm,w=2*Math.PI*frequency;
 const X=c.type==='rl'?w*p.inductanceH:-1/(w*p.capacitanceF),Z=Math.hypot(R,X);
 const xSymbol=c.type==='rl'?mi('X'):sub('X','C');
 const x=row(xSymbol+op('=')+(c.type==='rl'?'<mn>2</mn>'+mi('π')+mi('f')+mi('L'):'<mo>−</mo><mfrac><mn>1</mn><mrow><mn>2</mn>'+mi('π')+mi('f')+mi('C')+'</mrow></mfrac>')+op('=')+(c.type==='rl'?'<mn>2</mn>'+op('×')+mi('π')+op('×')+n(frequency)+op('×')+n(p.inductanceH):'<mo>−</mo><mfrac><mn>1</mn><mrow><mn>2</mn>'+op('×')+mi('π')+op('×')+n(frequency)+op('×')+n(p.capacitanceF)+'</mrow></mfrac>')+op('≈')+n(X)+unit('Ω'));
 const z=row(mi('Z')+op('=')+mi('R')+op('+')+mi('j')+mi('X')+op('≈')+n(R)+op(X<0?'−':'+')+mi('j')+n(Math.abs(X))+unit('Ω'));
 const magnitude=row(op('|')+mi('Z')+op('|')+op('=')+'<msqrt>'+sq(mi('R'))+op('+')+sq(mi('X'))+'</msqrt>')+row(op('=')+'<msqrt>'+sq(n(R))+op('+')+sq(n(Math.abs(X)))+'</msqrt>'+op('≈')+n(Z)+unit('Ω'));
 return '<section class="derived-equations"><h3 class="field-group">计算过程 · SI 单位</h3><p>f = '+esc(frequency)+' Hz；'+(c.type==='rl'?'L = '+esc(p.inductanceH)+' H':'C = '+esc(p.capacitanceF)+' F；容抗为负')+'</p>'+x+z+magnitude+(c.type==='rl'?row('<mfrac>'+mi('X')+mi('R')+'</mfrac>'+op('=')+'<mfrac>'+n(X)+n(R)+'</mfrac>'+op('≈')+(R===0?(X===0?'<mtext>未定义</mtext>':'<mi>∞</mi>'):n(X/R))):'')+'</section>';
}

export function transformerFormulas(c,frequency){
 const p=c.parametersSI,V1=p.primaryVoltageV,V2=p.secondaryVoltageV,S=p.ratedApparentPowerVA,fb=p.baseFrequencyHz,r=p.shortCircuitResistancePu,x=p.shortCircuitReactancePu;
 const base=V2*V2/S,R=r*base,Xb=x*base,L=Xb/(2*Math.PI*fb),X=2*Math.PI*frequency*L,a=V1/V2;
 const frac=(top,bottom)=>'<mfrac><mrow>'+top+'</mrow><mrow>'+bottom+'</mrow></mfrac>',eq=op('='),times=op('×');
 const block=(title,formula,values)=>'<p>'+title+'</p>'+row(formula)+row(eq+values);
 return '<section class="derived-equations"><h3 class="field-group">变压器换算过程 · 二次侧 B</h3><p>V₁、V₂ 为额定线电压 RMS；Sₙ 为本变压器三相额定容量。额定电压、容量分别以 kV、MVA 代入；kV²/MVA = Ω。</p>'+
 block('① 二次侧阻抗基准',sub('Z','b,2')+eq+frac(sq(sub('V','2')),sub('S','n')),frac(sq('<mrow>'+n(V2/1000)+unit('kV')+'</mrow>'),n(S/1e6)+unit('MVA'))+eq+n(base)+unit('Ω'))+
 block('② 短路电阻',sub('R','T,2')+eq+sub('r','pu')+sub('Z','b,2'),n(r)+times+n(base)+eq+n(R)+unit('Ω'))+
 block('③ 基准频率下的短路电抗',sub('X','T,2,b')+eq+sub('x','pu')+sub('Z','b,2'),n(x)+times+n(base)+eq+n(Xb)+unit('Ω'))+
 block('④ 漏感（不随工程频率改变）',sub('L','T,2')+eq+frac(sub('X','T,2,b'),n(2)+mi('π')+sub('f','b')),frac(n(Xb),n(2)+mi('π')+times+n(fb))+op('≈')+n(L)+unit('H'))+
 block('⑤ 当前工程频率下的电抗',sub('X','T,2')+eq+sub('X','T,2,b')+frac(mi('f'),sub('f','b')),n(Xb)+times+frac(n(frequency),n(fb))+op('≈')+n(X)+unit('Ω'))+
 block('⑥ 一次侧 → 二次侧阻抗折算',mi('a')+eq+frac(sub('V','1'),sub('V','2')),frac(n(V1/1000)+unit('kV'),n(V2/1000)+unit('kV'))+op('≈')+n(a))+
 row(sub('Z','上游,2')+eq+frac(sub('Z','上游,1'),sq(mi('a'))))+
 row(eq+n(1/(a*a))+times+sub('Z','上游,1'))+
 '<p>在二次侧看向电源：折算后的上游阻抗，再加本变压器串联阻抗。其他支路与 SCR 数值请查看对应 PCC 分析。</p>'+
 row(sub('Z','th,2')+eq+sub('Z','上游,2')+op('+')+sub('R','T,2')+op('+')+mi('j')+sub('X','T,2'))+
 '<p>反向折算：Z₁ = a² Z₂。pu 阻抗始终使用本变压器容量基准，不是 SCR 的 IBR 容量基准。</p></section>';
}
