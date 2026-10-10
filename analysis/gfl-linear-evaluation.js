import {loopResponse,validateGains} from './gfl-frequency.js';
import {modelFacts,validateModelFacts} from './gfl-model-input.js';
import {gflLinearModels,dcGain,poleStability} from './gfl-linear-model.js';
const loops=['d','q','P','Q'];
const logGrid=(min,max,count)=>Array.from({length:count},(_,i)=>min*(max/min)**(i/(count-1)));
export function sweepGfl(input,gains,options={}){
 validateModelFacts(input);validateGains(gains);const p=modelFacts(input),max=input.fs/2;
 const zeros=loops.map(k=>gains[k].kp>0?gains[k].ki/gains[k].kp/(2*Math.PI):0).filter(f=>f>0&&Number.isFinite(f));
 let min=Math.min(.01,...zeros.map(f=>f/1000),options.minimumHz??.01);min=Math.max(1e-12,Math.min(min,max/10000));
 const Td=input.delaySamples/input.fs,requested=Math.max(options.count??1401,Math.ceil(16*Math.log(max/min)*max*Td));
 const count=Math.min(24001,requested),status=requested>24001?'budgetExceeded':'ok';
 const fs=[...new Set([...logGrid(min,max,count),...(options.anchors??[]).filter(f=>f>=min&&f<=max)])].sort((a,b)=>a-b),series=Object.fromEntries(loops.map(k=>[k,[]])),closed=Object.fromEntries(loops.map(k=>[k,[]])),last={},closedLast={};
 for(const f of fs){const r=loopResponse(p,gains,f);for(const k of loops){const z=r.open[k],t=r.closed[k];if(!Number.isFinite(z.re)||!Number.isFinite(z.im)||!Number.isFinite(t.re)||!Number.isFinite(t.im))throw Error('频率响应发生奇点或超出数值范围。');let phase=Math.atan2(z.im,z.re)*180/Math.PI;
  if(last[k]===undefined&&k==='P'&&p.dMode==='Vdc'&&gains.P.ki>0)last[k]=-180;
  if(last[k]!==undefined){while(phase-last[k]>180)phase-=360;while(phase-last[k]<-180)phase+=360;}last[k]=phase;
  let cp=Math.atan2(t.im,t.re)*180/Math.PI;if(closedLast[k]!==undefined){while(cp-closedLast[k]>180)cp-=360;while(cp-closedLast[k]<-180)cp+=360;}closedLast[k]=cp;
  series[k].push({f,db:20*Math.log10(Math.max(1e-300,Math.hypot(z.re,z.im))),phase});closed[k].push({f,phase:cp,db:20*Math.log10(Math.max(1e-300,Math.hypot(t.re,t.im)))});
 }}
 return {min,max,series,closed,status,count:fs.length};
}
export function locateCrossings(points,responseAt){
 const found=[],add=x=>{if(!found.some(v=>Math.abs(Math.log(v.frequency/x.frequency))<1e-7))found.push(x);};
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];
  if(Math.abs(a.db)<1e-10){add({frequency:a.f,margin:180+a.phase,direction:b.db<a.db?'down':'up'});continue;}
  if(a.db*b.db>0)continue;
  let lo=a.f,hi=b.f,side=a.db;
  for(let j=0;j<32;j++){const mid=Math.sqrt(lo*hi),z=responseAt(mid),db=20*Math.log10(Math.hypot(z.re,z.im));if(db*side>0)lo=mid;else hi=mid;}
  const frequency=Math.sqrt(lo*hi),z=responseAt(frequency);let phase=Math.atan2(z.im,z.re)*180/Math.PI;
  const expected=a.phase+(b.phase-a.phase)*Math.log(frequency/a.f)/Math.log(b.f/a.f);while(phase-expected>180)phase-=360;while(phase-expected< -180)phase+=360;
  add({frequency,margin:180+phase,direction:b.db<a.db?'down':'up'});
 }
 return found;
}
function bandwidth(points,gain){
 if(!Number.isFinite(gain)||gain===0)return {status:'undefinedDcGain',hz:null,crossings:[]};
 const level=20*Math.log10(Math.abs(gain))-3.01029995664,xs=[];
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if((a.db-level)*(b.db-level)<0){const t=(level-a.db)/(b.db-a.db);xs.push({frequency:a.f*(b.f/a.f)**t,direction:b.db<a.db?'down':'up'});}}
 const first=xs.find(x=>x.direction==='down');return {status:first?'ok':'outsideScan',hz:first?.frequency??null,crossings:xs};
}
export function evaluateGfl(input,gains,options={}){
 const p=modelFacts(input),scan=sweepGfl(input,gains,options),delayed=input.delaySamples!==0,models=delayed?null:gflLinearModels(input,gains),out={};
 for(const k of loops){const points=scan.series[k],xs=locateCrossings(points,f=>loopResponse(p,gains,f).open[k]);
  const touch=points.some((v,i)=>i>0&&i<points.length-1&&Math.abs(v.db)<.03&&(v.db-points[i-1].db)*(points[i+1].db-v.db)<0);
  // Missing zero crossings at an unresolved low endpoint are explicitly reported.
  const lowUnresolved=gains[k].ki>0&&points[0].db<=0;
  out[k]={crossings:xs,minMargin:xs.length?Math.min(...xs.map(x=>x.margin)):null,scanStatus:lowUnresolved?'lowFrequencyUnresolved':scan.status,
   nearTangency:touch,stability:delayed?{status:'unverified',poles:null}:poleStability(models[k].denominator),
   bandwidth:bandwidth(scan.closed[k],models?dcGain(models[k]):NaN),step:{status:delayed?'unsupportedDelay':'notRun'}};
 }
 const statuses=Object.values(out).map(l=>l.stability.status),status=delayed?'unverified':statuses.includes('unstable')?'unstable':statuses.includes('marginal')?'marginal':statuses.includes('numericalFailure')?'numericalFailure':'stable';
 return {modelCoverage:delayed?'frequencyOnlyWithDelay':'exactZeroDelayScalar',loops:out,stability:{status},scan:{min:scan.min,max:scan.max,count:scan.count,status:scan.status},diagnostics:[],...(options.includeSeries?{series:scan.series,closedSeries:scan.closed}:{})};
}
