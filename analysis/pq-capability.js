// Independent, balanced three-phase steady-state capability model. SI internally.
export const defaults={dcIdeal:0,S:1,V:480,f:50,vpu:1,Ipu:1,Vdc:800,m:1.15,margin:5,R:0.00001,L:146.3,C:646,Rc:0.118,pout:1,pin:1,P:0.8,Q:0.2,view:1.5};
export function prepare(s){
 for(const [k,v] of Object.entries(s))if(!Number.isFinite(v))throw Error('请输入完整且有限的数值：'+k);
 for(const k of ['S','V','f','vpu','Ipu','Vdc','m','view'])if(s[k]<=0)throw Error(k+' 必须大于 0');
 for(const k of ['R','L','C','Rc','pout','pin','margin'])if(s[k]<0)throw Error(k+' 不能小于 0');
 if(s.margin>=100)throw Error('调制裕量必须小于 100%');
 const S=s.S*1e6,V=s.V*s.vpu/Math.sqrt(3),w=2*Math.PI*s.f,X=w*s.L*1e-6,xc=s.C?1/(w*s.C*1e-6):0,den=s.Rc*s.Rc+xc*xc;
 const a=s.C?V*s.Rc/den:0,b=s.C?V*xc/den:0,Imax=s.Ipu*S/(Math.sqrt(3)*s.V),Emax=Math.sqrt(3)/(2*Math.sqrt(2))*s.m*(1-s.margin/100)*s.Vdc,loss=3*V*a;
 const point=(p,q)=>{const P=p*S,Q=q*S,ir=P/(3*V)+a,ii=-Q/(3*V)+b,I=Math.hypot(ir,ii),E=Math.sqrt(3)*Math.hypot(V+s.R*ir-X*ii,s.R*ii+X*ir),dc=P+loss+3*s.R*I*I;return {I,E,dc,Ig:Math.hypot(P,Q)/(3*V),currentOK:I<=Imax*(1+1e-10),voltageOK:E<=Emax*(1+1e-10),dcOK:s.dcIdeal===1||(dc<=s.pout*1e6+1e-6&&dc>=-s.pin*1e6-1e-6)};};
 const current={p:-3*V*a/S,q:3*V*b/S,r:3*V*Imax/S},z2=s.R*s.R+X*X,voltage=z2?{p:3*V*(-V*s.R/z2-a)/S,q:-3*V*(V*X/z2-b)/S,r:3*V*Emax/Math.sqrt(3*z2)/S}:null;
 function roots(q,limit){const A=s.R*S*S/(3*V*V),B=S*(1+2*s.R*a/V),D=loss+3*s.R*(a*a+(b-q*S/(3*V))**2)-limit;if(A===0)return [-D/B];const disc=B*B-4*A*D;if(disc<0)return [];const t=-.5*(B+Math.sqrt(disc));return [t/A,t===0?0:D/t].sort((a,b)=>a-b);}
 function intervals(q){const cuts=[-s.view,s.view];for(const circle of [current,voltage])if(circle){const d=circle.r**2-(q-circle.q)**2;if(d>=0)cuts.push(circle.p-Math.sqrt(d),circle.p+Math.sqrt(d));}if(s.dcIdeal!==1)cuts.push(...roots(q,s.pout*1e6),...roots(q,-s.pin*1e6));const xs=cuts.filter(x=>x>=-s.view&&x<=s.view).sort((a,b)=>a-b),out=[];for(let i=1;i<xs.length;i++){const t=point((xs[i-1]+xs[i])/2,q);if(t.currentOK&&t.voltageOK&&t.dcOK)out.push([xs[i-1],xs[i]]);}return out;}
 return {S,V,Imax,Emax,loss,current,voltage,point,roots,intervals};
}
