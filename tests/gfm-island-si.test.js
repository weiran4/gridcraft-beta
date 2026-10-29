import test from 'node:test';import assert from 'node:assert/strict';import {buildGfmIslandModel} from '../analysis/gfm-island-model.js';
// Independent SI perturbation equations, then map derivatives back to pu.
const p={ratedVA:30000,voltageLL:400,frequencyHz:50,L:100e-6,R:1e-5,C:44e-6,Rc:.3378,gridR:.2,gridL:.001,activePowerW:0,reactivePowerVar:0,dcVoltage:650,fs:20000,fi:500,fv:50,pm:60,filterCurrentMs:1,filterVoltageMs:10,filterPqMs:10,filterVdcMs:0,delaySamples:0,feedforwardCurrent:.75,feedforwardVoltage:.5,considerScr:true};
const g={d:{kp:1,ki:50},q:{kp:1,ki:50},P:{kp:2.5,ki:10},Q:{kp:2.5,ki:10}};
test('island Jacobian matches independent SI KCL/KVL and measured-PCC control equations',()=>{const a=buildGfmIslandModel(p,g,{capacitorDecouplingSignal:'filtered-pcc',decouplingFrequencySource:'nominal'}),Vb=Math.sqrt(2/3)*p.voltageLL,Ib=Math.sqrt(2/3)*p.ratedVA/p.voltageLL,w=2*Math.PI*p.frequencyHz;
 const x=a.names.map((_,i)=>.003*Math.sin(i+1)),get=s=>x[a.names.indexOf(s)],v=[0,1].map(k=>get('vc'+k)*Vb+p.Rc*get('il'+k)*Ib),out={};
 for(let k=0;k<2;k++){const sg=k===0?-1:1,ir=-g[k?'Q':'P'].kp*get('hv'+k)*Ib+get('xv'+k)*Ib+sg*w*p.C*get('hv'+(1-k))*Vb,err=ir/Ib-get('hi'+k),u=(g[k?'q':'d'].kp*err+get('xi'+k)+p.feedforwardVoltage*get('hv'+k))*Vb+sg*w*p.L*get('hi'+(1-k))*Ib;
 out['il'+k]=((u-v[k]-p.R*get('il'+k)*Ib)/p.L-sg*w*get('il'+(1-k))*Ib)/Ib;
 out['vc'+k]=(get('il'+k)*Ib/p.C-sg*w*get('vc'+(1-k))*Vb)/Vb;
 out['hi'+k]=(get('il'+k)-get('hi'+k))/.001;out['hv'+k]=(v[k]/Vb-get('hv'+k))/.01;out['xi'+k]=50*err;out['xv'+k]=-10*get('hv'+k);}
 a.A.forEach((row,i)=>assert.ok(Math.abs(row.reduce((s,c,j)=>s+c*x[j],0)-out[a.names[i]])<1e-6,a.names[i]));});
