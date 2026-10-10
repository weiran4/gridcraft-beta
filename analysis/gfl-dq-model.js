/** Gridcraft averaged dq reference model (not an IEEE-mandated device model).
 * Balanced radial Lf + shunt series Rc/C + grid RL; fixed nominal synchronous
 * electrical coordinates; controller coordinates rotate with the SRF PLL.
 * The actual PCC P/Q high-voltage equilibrium precedes numerical linearization.
 * See docs/validation/gfl-dq-pll-model.md for equations, references and limits.
 */
import {validateGains} from './gfl-frequency.js';
export const dqModelVersion='gfl-dq-srf-pll-v1';
export const dqDefaults={enabled:false,pllEnabled:true,frequencyHz:20,damping:Math.SQRT1_2,pllFilterMs:0,dcModel:'auto',decouplingFrequency:'pll'};
const finite=Number.isFinite,positive=(v,name)=>{if(!finite(v)||v<=0)throw Error(name+' 必须为正的有限数。');};
const nonnegative=(v,name)=>{if(!finite(v)||v<0)throw Error(name+' 必须为非负有限数。');};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const rotate=(v,angle)=>[Math.cos(angle)*v[0]+Math.sin(angle)*v[1],-Math.sin(angle)*v[0]+Math.cos(angle)*v[1]];
export function pllParameters(raw={}){
 const p={...dqDefaults,...raw};positive(p.frequencyHz,'PLL 特征频率 fn');positive(p.damping,'PLL 阻尼系数');nonnegative(p.pllFilterMs,'PLL 测量滤波');
 if(typeof p.pllEnabled!=='boolean')throw Error('PLL 开关必须为布尔值。');
 if(!['auto','rigid','capacitor'].includes(p.dcModel))throw Error('DC 模型必须为自动、刚性电压或恒功率/电容。');
 if(!['pll','nominal'].includes(p.decouplingFrequency))throw Error('解耦频率必须为 PLL 估计或额定频率。');
 const omega=2*Math.PI*p.frequencyHz;
 return {...p,kp:2*p.damping*omega,ki:omega*omega,omega};
}
// q voltage is normalized by PCC magnitude BEFORE the optional PLL LPF.
export const srfPll=(normalizedQ,integral,p)=>({delta:p.kp*normalizedQ+integral,integral:p.ki*normalizedQ});
export function gflDqOperatingPoint(p){
 const Z=p.voltageLL**2/p.ratedVA,w=2*Math.PI*p.frequencyHz,r=p.gridROhm/Z,x=p.gridXOhm/Z;
 const P=p.activePowerW/p.ratedVA,Q=p.reactivePowerVar/p.ratedVA,E=p.gridVoltagePu??1;
 positive(E,'电网电源标幺电压');
 const b=E*E+2*(r*P+x*Q),disc=b*b-4*(r*r+x*x)*(P*P+Q*Q);
 if(!finite(disc)||disc<=1e-12||b<=0)throw Error('指定 PCC P/Q 无可用高电压工作点，或位于电压崩溃边界。');
 const V=Math.sqrt((b+Math.sqrt(disc))/2),ig=[P/V,-Q/V],rc=p.gridCapResistanceOhm/Z,Xc=1/(w*p.gridCapacitanceF*Z);
 const ic=[V*rc/(rc*rc+Xc*Xc),V*Xc/(rc*rc+Xc*Xc)],il=ig.map((v,k)=>v+ic[k]);
 const vc=[V-rc*ic[0],-rc*ic[1]],eg=[V-r*ig[0]+x*ig[1],-r*ig[1]-x*ig[0]];
 const rf=p.R/Z,lf=p.L/Z,u=[V+rf*il[0]-w*lf*il[1],rf*il[1]+w*lf*il[0]];
 return {Z,w,P,Q,E,V,il,ig,ic,vc,eg,u,bridgePower:dot(u,il),losses:rf*dot(il,il)+rc*dot(ic,ic),
  gridVoltageLL:V*p.voltageLL,bridgeCurrentPu:Math.hypot(...il),modulation:2*Math.sqrt(2/3)*p.voltageLL*Math.hypot(...u)/p.dcVoltage};
}
export function gflDqModel(input,gains,raw={}){
 const p={...input},pll=pllParameters(raw);validateGains(gains);
 if(p.gridError)throw Error(p.gridError);
 if(!p.considerScr)throw Error('dq 电网联立分析需要启用 SCR；不会把未知电网替换成理想电网。');
 for(const k of ['ratedVA','voltageLL','frequencyHz','L','dcVoltage','fs'])positive(p[k],k);
 if(pll.pllEnabled&&pll.frequencyHz>=p.fs/2)throw Error('PLL 特征频率须低于控制 Nyquist 频率；请核对单位。');
 for(const k of ['R','gridROhm','gridCapResistanceOhm','filterCurrentMs','filterVoltageMs','filterPqMs','filterVdcMs','delaySamples'])nonnegative(p[k],k);
 positive(p.gridXOhm,'dq 模型的电网电感（以正电抗表示）');positive(p.gridCapacitanceF,'LCL/RC 支路电容');
 for(const k of ['activePowerW','reactivePowerVar'])if(!finite(p[k]))throw Error(k+' 尚未配置。');
 if(!['P','Vdc'].includes(p.dMode)||!['Q','Vac'].includes(p.qMode))throw Error('未支持的 GFL 外环模式。');
 const dcDynamic=pll.dcModel==='capacitor'||(pll.dcModel==='auto'&&p.dMode==='Vdc');
 if(p.dMode==='Vdc'&&!dcDynamic)throw Error('刚性 DC 电源钳位电压，不能同时评价 Vdc 电容能量控制；选择电容模型。');
 if(dcDynamic)positive(p.dcCapacitanceF,'独立 DC 分析电容');
 const op=gflDqOperatingPoint(p),{Z,w}=op,l=p.L/Z,lg=p.gridXOhm/(w*Z),cap=p.gridCapacitanceF*Z,rf=p.R/Z,rg=p.gridROhm/Z,rc=p.gridCapResistanceOhm/Z;
 const names=[],x0=[],idx={};const add=(key,v)=>{idx[key]=names.length;names.push(key);x0.push(v);};
 for(const key of ['il','ig','vc'])op[key].forEach((v,k)=>add(key+k,v));
 if(p.filterCurrentMs>0)op.il.forEach((v,k)=>add('hi'+k,v));
 if(p.filterVoltageMs>0)[op.V,0].forEach((v,k)=>add('hv'+k,v));
 if(p.filterPqMs>0){if(p.dMode==='P')add('pf',op.P);if(p.qMode==='Q')add('qf',op.Q);}
 if(dcDynamic){add('dcVoltage',1);if(p.dMode==='Vdc'&&p.filterVdcMs>0)add('dcMeasured',1);}
 for(const [k,key]of [['d','xi0'],['q','xi1'],['P','outer0'],['Q','outer1']])if(gains[k].ki>0)add(key,0);
 if(pll.pllEnabled){add('pllAngle',0);add('pllIntegral',0);if(pll.pllFilterMs>0)add('pllMeasured',0);}
 const Td=p.delaySamples/p.fs;if(Td>0)op.u.forEach((v,k)=>add('delay'+k,v));
 const inputNames=[p.dMode+' reference',p.qMode+' reference','grid phase / rad','grid amplitude / pu','DC input power / pu'];
 const outputNames=[p.dMode,p.qMode,'id (controller frame)','iq (controller frame)','PLL angle / rad','PCC voltage / pu'];
 // PI integrators are represented as incremental output states around their
 // initialized operating outputs. With Ki=0 that operating bias remains fixed.
 const bias=op.u.map((v,k)=>v-(k===0?op.V:0)-(k===0?-1:1)*w*l*op.il[1-k]);
 const evaluate=(x,u=Array(inputNames.length).fill(0))=>{
  const dx=Array(x.length).fill(0),get=(key,fallback=0)=>idx[key]===undefined?fallback:x[idx[key]],put=(key,v)=>{if(idx[key]!==undefined)dx[idx[key]]=v;};
  const il=[get('il0'),get('il1')],ig=[get('ig0'),get('ig1')],vc=[get('vc0'),get('vc1')],v=vc.map((a,k)=>a+rc*(il[k]-ig[k]));
  const delta=get('pllAngle'),ic=rotate(il,delta),vg=rotate(v,delta),hi=ic.map((a,k)=>get('hi'+k,a)),hv=vg.map((a,k)=>get('hv'+k,a));
  const P=dot(v,ig),Q=v[1]*ig[0]-v[0]*ig[1],pf=get('pf',P),qf=get('qf',Q),dc=get('dcVoltage',1);
  const normalizedQ=vg[1]/Math.max(1e-9,Math.hypot(...vg)),measured=get('pllMeasured',normalizedQ);
  const dynamics=pll.pllEnabled?srfPll(measured,get('pllIntegral'),pll):{delta:0,integral:0};
  put('pllAngle',dynamics.delta);put('pllIntegral',dynamics.integral);put('pllMeasured',(normalizedQ-measured)/(pll.pllFilterMs/1000));
  const errors=[p.dMode==='Vdc'?1+u[0]-get('dcMeasured',dc):op.P+u[0]-pf,p.qMode==='Vac'?op.V+u[1]-Math.hypot(...hv):op.Q+u[1]-qf];
  const signs=[p.dMode==='Vdc'?-1:1,-1],ir=errors.map((e,k)=>op.il[k]+signs[k]*(gains[k?'Q':'P'].kp*e+get('outer'+k)));
  const omega=pll.decouplingFrequency==='pll'?w+dynamics.delta:w,uc=[];
  for(let k=0;k<2;k++){
   const error=ir[k]-hi[k],gain=gains[k?'q':'d'];
   uc[k]=hv[k]+(k===0?-1:1)*omega*l*hi[1-k]+bias[k]+gain.kp*error+get('xi'+k);
   put('xi'+k,gain.ki*error);put('outer'+k,gains[k?'Q':'P'].ki*errors[k]);
   put('hi'+k,(ic[k]-hi[k])/(p.filterCurrentMs/1000));put('hv'+k,(vg[k]-hv[k])/(p.filterVoltageMs/1000));
  }
  const command=rotate(uc,-delta),applied=command.map((v,k)=>Td>0?2*get('delay'+k)-v:v),eg=rotate(op.eg,-u[2]).map(v=>v*(1+u[3]));
  for(let k=0;k<2;k++){
   const rot=k===0?1:-1;
   put('il'+k,(applied[k]-v[k]-rf*il[k])/l+rot*w*il[1-k]);
   put('ig'+k,(v[k]-eg[k]-rg*ig[k])/lg+rot*w*ig[1-k]);
   put('vc'+k,(il[k]-ig[k])/cap+rot*w*vc[1-k]);
   put('delay'+k,2/Td*(command[k]-get('delay'+k)));
  }
  put('pf',(P-pf)/(p.filterPqMs/1000));put('qf',(Q-qf)/(p.filterPqMs/1000));
  put('dcMeasured',(dc-get('dcMeasured',dc))/(p.filterVdcMs/1000));
  if(dcDynamic){if(!(dc>0))throw Error('DC 电压离开正电压小信号范围。');put('dcVoltage',p.ratedVA*(op.bridgePower+u[4]-dot(applied,il))/(p.dcCapacitanceF*p.dcVoltage**2*dc));}
  return {dx,y:[p.dMode==='Vdc'?dc:P,p.qMode==='Vac'?Math.hypot(...v):Q,ic[0],ic[1],delta,Math.hypot(...v)]};
 };
 const ref0=Array(inputNames.length).fill(0),eq=evaluate(x0,ref0),residual=Math.max(...eq.dx.map(Math.abs));
 if(!finite(residual)||residual>1e-7)throw Error('工作点残差超限，不能可靠线性化：'+residual);
 function jacobian(factor){
  const n=names.length,m=inputNames.length,o=outputNames.length,A=Array.from({length:n},()=>Array(n)),B=Array.from({length:n},()=>Array(m)),C=Array.from({length:o},()=>Array(n)),D=Array.from({length:o},()=>Array(m));
  for(let j=0;j<n+m;j++){
   const h=factor*Math.max(1,j<n?Math.abs(x0[j]):1),xp=[...x0],xm=[...x0],up=[...ref0],um=[...ref0];
   if(j<n){xp[j]+=h;xm[j]-=h;}else{up[j-n]+=h;um[j-n]-=h;}
   const a=evaluate(xp,up),b=evaluate(xm,um);
   for(let i=0;i<n;i++)(j<n?A[i]:B[i])[j<n?j:j-n]=(a.dx[i]-b.dx[i])/(2*h);
   for(let i=0;i<o;i++)(j<n?C[i]:D[i])[j<n?j:j-n]=(a.y[i]-b.y[i])/(2*h);
  }
  return {A,B,C,D};
 }
 const coarse=jacobian(2e-6),fine=jacobian(1e-6);
 let jacobianError=0;
 for(const key of ['A','B','C','D'])for(let i=0;i<fine[key].length;i++){
  const norm=Math.max(1,...fine[key][i].map(Math.abs));
  for(let j=0;j<fine[key][i].length;j++){
   if(!finite(fine[key][i][j]))throw Error('Jacobian 非有限数，未给出结论。');
   jacobianError=Math.max(jacobianError,Math.abs(fine[key][i][j]-coarse[key][i][j])/norm);
  }
 }
 if(jacobianError>1e-5)throw Error('Jacobian 步长复核不收敛，未给出结论。');
 return {...fine,names,x0,inputNames,outputNames,y0:eq.y,op,residual,jacobianError,evaluate,pll,dcDynamic,
  version:dqModelVersion,delayModel:Td>0?'first-order-pade':'none',delaySeconds:Td,controlStepSeconds:1/p.fs,
  dcAssumption:dcDynamic?'constant-input-power-capacitor; ideal DC-voltage-normalized actuator':'rigid-dc; voltage-command actuator'};
}
