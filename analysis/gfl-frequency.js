import {outerModels} from './gfl-outer.js?v=outer1';

import {measurementFilters} from './measurement-filters.js?v=filters1';
const add=(a,b)=>({re:a.re+b.re,im:a.im+b.im});
const mul=(a,b)=>({re:a.re*b.re-a.im*b.im,im:a.re*b.im+a.im*b.re});
const div=(a,b)=>{const d=b.re*b.re+b.im*b.im;return {re:(a.re*b.re+a.im*b.im)/d,im:(a.im*b.re-a.re*b.im)/d};};
const one={re:1,im:0};
export function validateGains(gains){
 for(const loop of ['d','q','P','Q'])for(const k of ['kp','ki'])if(!Number.isFinite(gains?.[loop]?.[k])||gains[loop][k]<0)throw Error(loop+' '+k+' 必须为非负有限数。');
}
export function loopResponse(input,gains,hz){
 validateGains(gains);if(!(hz>0))throw Error('频率必须大于0');
 const w=2*Math.PI*hz,Zb=input.voltageLL**2/input.ratedVA,Td=input.delaySamples/input.fs;
 const plant=div({re:Zb,im:0},{re:input.R,im:w*input.L});
 const delay={re:Math.cos(-w*Td),im:Math.sin(-w*Td)};
 const C=loop=>({re:gains[loop].kp,im:-gains[loop].ki/w});
 const filters=measurementFilters(input),H=group=>div(one,{re:1,im:w*filters[group].seconds});
 const open={},closed={};
 // Return ratio includes the sensor; tracking output is the physical signal.
 for(const a of ['d','q']){const forward=mul(mul(C(a),plant),delay);open[a]=mul(forward,H('current'));closed[a]=div(forward,add(one,open[a]));}
 const models=outerModels(input);
 // Controller polarity cancels the signed outer plant; gains remain positive.
 for(const [outer,inner] of [['P','d'],['Q','q']]){const m=models[outer],plant=m.integrator?{re:0,im:-m.gain/w}:{re:m.gain,im:0},forward=mul(mul(C(outer),closed[inner]),plant);open[outer]=mul(forward,H(m.filter));closed[outer]=div(forward,add(one,open[outer]));}
 return {open,closed};
}
export function frequencySweep(input,gains,mode='open',count=401){
 const max=input.fs/2,min=Math.min(.1,max/10000),series={d:[],q:[],P:[],Q:[]},last={};
 for(let i=0;i<count;i++){
  const f=min*(max/min)**(i/(count-1)),response=loopResponse(input,gains,f)[mode];
  for(const key of Object.keys(series)){
   const z=response[key];if(!Number.isFinite(z.re)||!Number.isFinite(z.im))throw Error('频率响应超出数值范围，或恰好位于奇点；请调整增益。');let phase=Math.atan2(z.im,z.re)*180/Math.PI;
   // Anchor the extra Vdc integrator to its low-frequency phase branch.
   if(i===0&&mode==='open'&&key==='P'&&input.dMode==='Vdc'&&Math.hypot(z.re,z.im)>0)last[key]=gains.P.ki>0?-180:-90;
   if(last[key]!==undefined){while(phase-last[key]>180)phase-=360;while(phase-last[key]<-180)phase+=360;}
   last[key]=phase;series[key].push({f,db:20*Math.log10(Math.max(1e-15,Math.hypot(z.re,z.im))),phase});
  }
 }
 return {min,max,series};
}
export function crossings(points){
 const found=[];
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if((a.db>0&&b.db<=0)||(a.db<0&&b.db>=0)){
 const t=-a.db/(b.db-a.db);found.push({frequency:Math.exp(Math.log(a.f)+t*Math.log(b.f/a.f)),margin:180+a.phase+t*(b.phase-a.phase)});
 }}
 return found;
}

