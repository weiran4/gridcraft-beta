import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject,createComponent} from '../project/model.js';
import {prepareResonance,impedanceAt,sweepResonance,localResonance} from '../analysis/resonance.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
function fixture(){
 const p=emptyProject();p.frequencyHz=50;
 const add=(type,id,params)=>{const c=createComponent(type,id);Object.assign(c.parametersSI,params);p.components.push(c);return c;};
 add('source','S',{ratedVoltageV:400});add('rl','G',{resistanceOhm:0,inductanceH:.002});
 add('gfl','I',{ratedAcVoltageV:400,filterResistanceOhm:0,filterInductanceH:.001});add('rc','C',{resistanceOhm:0,capacitanceF:.0001});
 p.wires=[['S.AC','G.A'],['G.B','I.AC'],['I.AC','C.AC']].map(([from,to],i)=>({id:'w'+i,from,to}));return p;
}
test('local LC calculation is independent of PQ and includes both series resistances in damping',()=>{
 const p=fixture();p.components.find(c=>c.id==='C').parametersSI.resistanceOhm=2;
 p.components.find(c=>c.id==='I').parametersSI.filterResistanceOhm=1;
 const r=localResonance(p,'C','I');near(r.frequencyHz,503.292121,1e-8);near(r.qualityFactor,Math.sqrt(10)/3);
 p.components.find(c=>c.id==='I').parametersSI.reactivePowerVar=9e6;near(localResonance(p,'C','I').frequencyHz,r.frequencyHz);
});
test('single LCL nodal solution agrees with independent parallel-admittance solution',()=>{
 const model=prepareResonance(fixture(),'C'),w=2*Math.PI*300;
 const expected=-1/(w*.0001-1/(w*.001)-1/(w*.002));
 const z=impedanceAt(model,300);near(z.re,0);near(z.im,expected);
});
test('lossless LCL resonance uses parallel, not sum, of the two inductors',()=>{
 const p=fixture(),model=prepareResonance(p,'C'),f=1/(2*Math.PI*Math.sqrt((.001*.002/.003)*.0001));
 assert.equal(impedanceAt(model,f).singular,true);
 p.components.find(c=>c.id==='C').parametersSI.resistanceOhm=.01;
 const r=sweepResonance(prepareResonance(p,'C'),{minHz:10,maxHz:5000,points:701});
 assert.equal(r.peaks.length,1);near(r.peaks[0].frequencyHz,f,1e-4);
});
test('transformer ratios reflect grid impedance to the observation side',()=>{
 const p=fixture(),t=createComponent('transformer','T');Object.assign(t.parametersSI,{primaryVoltageV:4000,secondaryVoltageV:400,shortCircuitResistancePu:0,shortCircuitReactancePu:0});p.components.push(t);
 p.components.find(c=>c.id==='G').parametersSI.inductanceH=.2;p.components.find(c=>c.id==='S').parametersSI.ratedVoltageV=4000;
 p.wires[1].to='T.A';p.wires.push({id:'t',from:'T.B',to:'I.AC'});
 const a=impedanceAt(prepareResonance(p,'C'),300),b=impedanceAt(prepareResonance(fixture(),'C'),300);near(a.im,b.im);
});
test('parallel inverter branches, damping and changed capacitance are included',()=>{
 const p=fixture(),i=createComponent('gfm','I2');Object.assign(i.parametersSI,{filterInductanceH:.001,filterResistanceOhm:0});p.components.push(i);p.wires.push({id:'i2',from:'I2.AC',to:'C.AC'});
 p.components.find(c=>c.id==='C').parametersSI.resistanceOhm=.03;
 const model=prepareResonance(p,'C'),w=2*Math.PI*300,z=impedanceAt(model,300),rc={re:.03,im:-1/(w*.0001)},d=rc.re**2+rc.im**2,yr=rc.re/d,yi=-rc.im/d-2/(w*.001)-1/(w*.002);
 near(z.re,yr/(yr*yr+yi*yi));near(z.im,-yi/(yr*yr+yi*yi));
 assert.ok(model.components.some(c=>c.id==='I2'));
 const before=sweepResonance(model,{minHz:100,maxHz:2000}).peaks[0].frequencyHz;p.components.find(c=>c.id==='C').parametersSI.capacitanceF*=4;
 const after=sweepResonance(prepareResonance(p,'C'),{minHz:100,maxHz:2000}).peaks[0].frequencyHz;near(after/before,.5,.001);
});
test('ideal voltage source clamps the RC node; disconnected unrelated components are excluded',()=>{
 const p=fixture();p.wires.push({id:'short',from:'S.AC',to:'C.AC'});p.components.push(createComponent('rc','unconnected'));
 const m=prepareResonance(p,'C');assert.equal(m.clamped,true);assert.equal(impedanceAt(m,500).magnitude,0);assert.equal(m.components.some(c=>c.id==='unconnected'),false);
 assert.deepEqual(sweepResonance(m,{minHz:10,maxHz:1000}).peaks,[]);
});
test('isolated RC has no resonance and invalid sweep ranges are rejected',()=>{
 const p=emptyProject();p.components.push(createComponent('rc','C'));const m=prepareResonance(p,'C');
 assert.equal(sweepResonance(m,{minHz:10,maxHz:10000}).peaks.length,0);
 for(const options of [{minHz:0,maxHz:100},{minHz:100,maxHz:10},{minHz:1,maxHz:Infinity},{minHz:1,maxHz:10,points:1}])assert.throws(()=>sweepResonance(m,options));
});
test('two separated capacitor nodes produce two observable resonance peaks',()=>{
 const p=fixture();p.components=p.components.filter(c=>!['S','G'].includes(c.id));p.wires=p.wires.filter(w=>!w.from.startsWith('S.')&&!w.from.startsWith('G.'));
 p.components.find(c=>c.id==='C').parametersSI.resistanceOhm=.005;
 const line=createComponent('rl','L2');Object.assign(line.parametersSI,{resistanceOhm:.005,inductanceH:.002});const cap=createComponent('rc','C2');Object.assign(cap.parametersSI,{resistanceOhm:.005,capacitanceF:.0002});p.components.push(line,cap);
 p.wires.push({id:'a',from:'C.AC',to:'L2.A'},{id:'b',from:'L2.B',to:'C2.AC'});
 const a=.0001*.0002,b=.0001/.002+.0002*(1/.001+1/.002),c=1/(.001*.002),expected=[-1,1].map(sign=>Math.sqrt((b+sign*Math.sqrt(b*b-4*a*c))/(2*a))/(2*Math.PI));
 const sweep=sweepResonance(prepareResonance(p,'C'),{minHz:10,maxHz:3000});assert.equal(sweep.peaks.length,2);sweep.peaks.forEach((peak,i)=>near(peak.frequencyHz,expected[i],.001));
});
test('meshed parallel paths sum admittances and changing a connection updates the network',()=>{
 const p=fixture(),branch=createComponent('rl','G2');Object.assign(branch.parametersSI,{resistanceOhm:0,inductanceH:.002});p.components.push(branch);p.wires.push({id:'a',from:'S.AC',to:'G2.A'},{id:'b',from:'G2.B',to:'C.AC'});
 const w=2*Math.PI*300,withBranch=impedanceAt(prepareResonance(p,'C'),300);near(withBranch.im,-1/(w*.0001-2/(w*.002)-1/(w*.001)));
 p.wires=p.wires.filter(w=>w.id!=='b');const without=impedanceAt(prepareResonance(p,'C'),300);near(without.im,impedanceAt(prepareResonance(fixture(),'C'),300).im);
});
test('two transformer leakages and a lossy grid match independently referred series impedance',async()=>{
 const {pvReferenceDemo}=await import('../examples/pv-reference.js');const p=pvReferenceDemo({ratedIbrVA:1e6});
 const f=640,w=2*Math.PI*f,r=2303.01*(315/220000)**2+2*.001*315**2/1e6,l=41.568*(315/220000)**2+2*.1*315**2/(1e6*2*Math.PI*50);
 const branches=[[r,w*l],[1e-6,w*63e-6],[.051,-1/(w*.0015)]];let yr=0,yi=0;for(const [r,x]of branches){yr+=r/(r*r+x*x);yi-=x/(r*r+x*x);}
 const z=impedanceAt(prepareResonance(p,'RC1'),f);near(z.re,yr/(yr*yr+yi*yi));near(z.im,-yi/(yr*yr+yi*yi));
});
