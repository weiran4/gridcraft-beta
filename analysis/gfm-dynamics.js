import {eigenvalues} from './eigenvalues.js?v=gfm2';
import {validateGfmInput,validateGfmGains} from './gfm-pi.js?v=scr1';
export function gfmOperatingPoint(p){
 const Z=p.voltageLL**2/p.ratedVA,w=2*Math.PI*p.frequencyHz,r=p.gridR/Z,x=w*p.gridL/Z,P=p.activePowerW/p.ratedVA,Q=p.reactivePowerVar/p.ratedVA,E=p.gridVoltagePu??1;
 const b=E*E+2*(r*P+x*Q),disc=b*b-4*(r*r+x*x)*(P*P+Q*Q);
 if(!(E>0)||disc<=0||b<=0)throw Error('指定 P/Q 无可用的高电压潮流解，或位于电压崩溃边界。');
 const V=Math.sqrt((b+Math.sqrt(disc))/2),ig=[P/V,-Q/V],rc=p.Rc/Z,Xc=1/(w*p.C*Z),den=rc*rc+Xc*Xc,ic=[V*rc/den,V*Xc/den],il=ig.map((v,k)=>v+ic[k]),vc=[V-rc*ic[0],-rc*ic[1]],eg=[V-r*ig[0]+x*ig[1],-r*ig[1]-x*ig[0]],u=[V+p.R/Z*il[0]-w*p.L/Z*il[1],p.R/Z*il[1]+w*p.L/Z*il[0]];
 return {Z,w,P,Q,V,ig,ic,il,vc,eg,u,currentPu:Math.hypot(...il),modulation:2*Math.sqrt(2/3)*p.voltageLL*Math.hypot(...u)/p.dcVoltage,voltageLL:V*p.voltageLL};
}
export function gfmDynamicModel(p,g,mode,m){
 if(p.considerScr===false)throw Error('SCR 未启用，不能运行并网 dq 耦合校核。');
 validateGfmInput(p);validateGfmGains(g);if(!['droop','vsg','sync'].includes(mode))throw Error('未知成网模式。');
 for(const k of mode==='droop'?['mp','nq']:['h','d','nq',mode==='vsg'?'kv':'ke'])if(!Number.isFinite(m[k])||m[k]<=0)throw Error(k+' 必须为正数。');
 if(p.gridL<=0)throw Error('耦合动态模型需要正的电网电感。');
 const op=gfmOperatingPoint(p),{Z,w}=op,l=p.L/Z,lg=p.gridL/Z,C=p.C*Z,rl=p.R/Z,rg=p.gridR/Z,rc=p.Rc/Z;
 const names=[],x0=[],idx={};const state=(key,v)=>{idx[key]=names.length;names.push(key);x0.push(v);};
 for(const key of ['il','ig','vc'])op[key].forEach((v,k)=>state(key+k,v));
 if(p.filterCurrentMs>0)op.il.forEach((v,k)=>state('hi'+k,v));
 if(p.filterVoltageMs>0)[op.V,0].forEach((v,k)=>state('hv'+k,v));
 if(p.filterPqMs>0){state('pf',op.P);state('qf',op.Q);}
 const xi=op.u.map((v,k)=>v-p.feedforwardVoltage*(k===0?op.V:0)-(k===0?-1:1)*w*l*op.il[1-k]);
 const xv=op.il.map((v,k)=>v-p.feedforwardCurrent*op.ig[k]-(k===0?-1:1)*w*C*op.vc[1-k]);
 for(let k=0;k<2;k++){if(g[k?'q':'d'].ki>0)state('xi'+k,xi[k]);if(g[k?'Q':'P'].ki>0)state('xv'+k,xv[k]);}
 state('delta',0);if(mode!=='droop'){state('omega',1);state('emf',op.V);}
 const Td=p.delaySamples/p.fs;if(Td>0)op.u.forEach((v,k)=>state('delay'+k,v));
 const derivative=(x,reference={})=>{
  const out=Array(x.length).fill(0),get=(key,fallback=0)=>idx[key]===undefined?fallback:x[idx[key]],put=(key,v)=>{if(idx[key]!==undefined)out[idx[key]]=v;};
  const il=[get('il0'),get('il1')],ig=[get('ig0'),get('ig1')],vc=[get('vc0'),get('vc1')],v=vc.map((a,k)=>a+rc*(il[k]-ig[k]));
  const hi=il.map((a,k)=>get('hi'+k,a)),hv=v.map((a,k)=>get('hv'+k,a)),P=v[0]*ig[0]+v[1]*ig[1],Q=v[1]*ig[0]-v[0]*ig[1],pf=get('pf',P),qf=get('qf',Q),Vf=Math.hypot(...hv);
  const pref=op.P+(reference.P??0),qref=op.Q+(reference.Q??0),vref=op.V+(reference.V??0),om=mode==='droop'?1+m.mp/100*(pref-pf):get('omega'),freq=w*om;
  const amplitude=mode==='droop'?vref+m.nq/100*(qref-qf):mode==='sync'?om*get('emf'):get('emf');
  const ir=[0,0],u=[0,0];for(let k=0;k<2;k++){
   const ev=(k===0?amplitude:0)-hv[k],sgn=k===0?-1:1;
   ir[k]=g[k?'Q':'P'].kp*ev+get('xv'+k,xv[k])+p.feedforwardCurrent*ig[k]+sgn*freq*C*vc[1-k];put('xv'+k,g[k?'Q':'P'].ki*ev);
   const ei=ir[k]-hi[k];u[k]=g[k?'q':'d'].kp*ei+get('xi'+k,xi[k])+p.feedforwardVoltage*hv[k]+sgn*freq*l*hi[1-k];put('xi'+k,g[k?'q':'d'].ki*ei);
  }
  const delta=get('delta'),eg=[op.eg[0]*Math.cos(delta)+op.eg[1]*Math.sin(delta),-op.eg[0]*Math.sin(delta)+op.eg[1]*Math.cos(delta)];
  for(let k=0;k<2;k++){
   let ud=u[k];if(Td>0){ud=2*get('delay'+k)-ud;put('delay'+k,2/Td*(u[k]-get('delay'+k)));}
   const rot=k===0?1:-1;
   put('il'+k,(ud-v[k]-rl*il[k])/l+rot*freq*il[1-k]);put('ig'+k,(v[k]-eg[k]-rg*ig[k])/lg+rot*freq*ig[1-k]);put('vc'+k,(il[k]-ig[k])/C+rot*freq*vc[1-k]);
   put('hi'+k,(il[k]-hi[k])/(p.filterCurrentMs/1000));put('hv'+k,(v[k]-hv[k])/(p.filterVoltageMs/1000));
  }
  put('pf',(P-pf)/(p.filterPqMs/1000));put('qf',(Q-qf)/(p.filterPqMs/1000));put('delta',w*(om-1));
  if(mode!=='droop'){
   put('omega',(mode==='sync'?(pref-pf)/om-m.d*(om-1):pref-pf-m.d*(om-1))/(2*m.h));
   put('emf',(mode==='vsg'?m.kv:m.ke)*((vref-Vf)/(m.nq/100)+qref-qf));
  }
  return out;
 };
 const residual=Math.max(...derivative(x0).map(Math.abs));if(!Number.isFinite(residual)||residual>1e-7)throw Error('工作点残差过大，未线性化。');
 const A=names.map(()=>Array(names.length).fill(0));for(let j=0;j<names.length;j++){const h=2e-6*Math.max(1,Math.abs(x0[j])),plus=[...x0],minus=[...x0];plus[j]+=h;minus[j]-=h;const a=derivative(plus),b=derivative(minus);for(let i=0;i<names.length;i++)A[i][j]=(a[i]-b[i])/(2*h);}
 return {A,x0,names,op,residual,derivative,delayModel:Td>0?'first-order-pade':'none'};
}
export function analyzeGfmMode(p,g,mode,m){const model=gfmDynamicModel(p,g,mode,m),poles=eigenvalues(model.A),alpha=poles[0].re;return {mode,poles,alpha,stable:alpha< -1e-6,marginal:Math.abs(alpha)<=1e-6,order:model.names.length,op:model.op,residual:model.residual,delayModel:model.delayModel,damping:poles.filter(z=>Math.abs(z.im)>1e-4).map(z=>({frequencyHz:Math.abs(z.im)/(2*Math.PI),zeta:-z.re/Math.hypot(z.re,z.im)})).sort((a,b)=>a.zeta-b.zeta)};}

// Search near the scalar design; retain its margin/spacing constraints and
// require the selected complete dq mode to have poles strictly in the left half-plane.
export async function tuneGfmCoupled(p,seed,mode,m,progress=()=>{}){
 let best=null,checked=0;const {gfmSweep,gfmPolynomials}=await import('./gfm-pi.js?v=scr1');const {crossings}=await import('./gfl-frequency.js?v=scr1');const {isHurwitz}=await import('./gfl-autotune.js?v=scr1');
 for(const ip of [.5,1,2,4])for(const ii of [.1,1,5])for(const vp of [.15,.5,1,2])for(const vi of [.003,.01,.03,.1,.3,1]){
  const g={d:{kp:seed.d.kp*ip,ki:seed.d.ki*ii},q:{kp:seed.q.kp*ip,ki:seed.q.ki*ii},P:{kp:seed.P.kp*vp,ki:seed.P.ki*vi},Q:{kp:seed.Q.kp*vp,ki:seed.Q.ki*vi}};checked++;
  if(checked%24===0){progress(checked,288);await new Promise(resolve=>setTimeout(resolve,0));}
  const sweep=gfmSweep(p,g,'open',501),xs=Object.fromEntries(Object.entries(sweep.series).map(([k,v])=>[k,crossings(v)]));
  if(Object.values(xs).some(v=>v.length!==1||v[0].margin<p.pm-.15)||xs.d[0].frequency>p.fi||xs.P[0].frequency>Math.min(p.fv,xs.d[0].frequency/5))continue;
  if(p.delaySamples===0&&!Object.values(gfmPolynomials(p,g)).every(isHurwitz))continue;
  const dyn=analyzeGfmMode(p,g,mode,m);if(dyn.alpha>=-1e-4)continue;
  if(!best||dyn.alpha<best.dynamics.alpha)best={gains:g,dynamics:dyn,loops:Object.fromEntries(Object.entries(xs).map(([k,v])=>[k,v[0]]))};
 }
 if(!best)throw Error('搜索范围内没有同时通过内环裕度与 '+mode+' 耦合极点校核的 PI；请调整控制参数或滤波。');
 // Dense verification before accepting a candidate.
 const check=gfmSweep(p,best.gains,'open',2401);for(const pts of Object.values(check.series)){const xs=crossings(pts);if(xs.length!==1||xs[0].margin<p.pm-.2)throw Error('候选参数未通过密集扫频复核。');}
 return {...best,checked,policy:'dq-mode-constrained-local-search-v1'};
}
