import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../examples/demo.js';
import {gfmContext,gfmDefaults,gfmSettings,setGfmField} from '../project/gfm-settings.js';
import {autoTuneGfm,gfmResponse,gfmPolynomials,gfmSweep,validateGfmInput} from '../analysis/gfm-pi.js';
import {isHurwitz} from '../analysis/gfl-autotune.js';
import {crossings} from '../analysis/gfl-frequency.js';
const input=()=>({...gfmContext(demo('gfm480'),'GFM1'),...gfmDefaults()});
test('GFM context reads actual 480 V RC, grid, converter and DC without mutation',()=>{
 const p=demo('gfm480'),before=JSON.stringify(p),c=gfmContext(p,'GFM1');
 assert.equal(c.C,646e-6);assert.equal(c.Rc,.118);assert.equal(c.L,146.3e-6);assert.equal(c.voltageLL,480);
 assert.ok(c.gridL>0);assert.ok(c.gridR>0);assert.equal(c.dcVoltage,800);assert.equal(JSON.stringify(p),before);
 const x=structuredClone(p);x.components=x.components.filter(c=>c.id!=='RC1');assert.throws(()=>gfmContext(x,'GFM1'),/RC/);
 const two=structuredClone(p.components.find(c=>c.id==='RC1'));two.id='RC2';p.components.push(two);p.wires.push({id:'extra',from:'PCC1.AC',to:'RC2.AC',mid:null});assert.throws(()=>gfmContext(p,'GFM1'),/RC/);
});
test('GFM auto tuning yields stable PI with sensor-aware margins and separated crossovers',()=>{
 const p=input(),r=autoTuneGfm(p);for(const k of ['d','q','P','Q']){assert.ok(r.gains[k].kp>0);assert.ok(r.gains[k].ki>0);assert.ok(isHurwitz(gfmPolynomials(p,r.gains)[k]));const xs=crossings(gfmSweep(p,r.gains,'open',1801).series[k]);assert.equal(xs.length,1);assert.ok(xs[0].margin>=p.pm-.25);}
 assert.ok(r.loops.P.frequency<=r.loops.d.frequency/5*1.001);
 assert.equal(r.gains.d.kp,r.gains.q.kp);assert.equal(r.gains.P.ki,r.gains.Q.ki);
});
test('GFM capacitance, measurement filters, grid and feedforward affect actual model',()=>{
 const p=input(),g={d:{kp:.2,ki:10},q:{kp:.2,ki:10},P:{kp:.1,ki:2},Q:{kp:.1,ki:2}};
 const base=gfmResponse(p,g,30).open.P;
 for(const [key,val] of [['C',p.C*2],['Rc',p.Rc*2],['filterVoltageMs',20],['filterCurrentMs',2],['gridL',p.gridL*2],['feedforwardCurrent',0],['feedforwardVoltage',0]])assert.notDeepEqual(gfmResponse({...p,[key]:val},g,30).open.P,base,key);
});
test('GFM DC tracking tends to one and manual unstable gain does not pass Routh',()=>{
 const p=input(),r=autoTuneGfm(p);for(const k of ['d','q','P','Q'])assert.ok(Math.abs(gfmResponse(p,r.gains,1e-7).closed[k].re-1)<1e-4);
 const g=structuredClone(r.gains);g.d={kp:.01,ki:1e6};assert.equal(isHurwitz(gfmPolynomials(p,g).d),false);
});
test('GFM settings remain independent of GFL and modes; serialization preserves Ti convention',()=>{
 const p=demo('gfm480'),s=gfmSettings(p,'GFM1');assert.equal(s.fs,20000);assert.equal(s.delaySamples,0);s.modes.vsg.h=4;assert.notEqual(gfmSettings(p,'GFM1').modes.vsg.h,4);
 setGfmField(p,'GFM1','C',700e-6);assert.equal(gfmContext(p,'GFM1').C,700e-6);assert.equal(p.extensions.gflPi,undefined);
 assert.throws(()=>setGfmField(p,'GFM1','C',0));
 const q=input();for(const change of [{C:0},{fs:0},{filterVoltageMs:-1},{feedforwardCurrent:2},{pm:90},{fv:1000},{gridL:0,gridR:0}])assert.throws(()=>validateGfmInput({...q,...change}));
});

test('GFM bypass sensors, full current feedforward and pure delay retain explicit scope',()=>{
 const p=input();for(const change of [{filterVoltageMs:0,filterCurrentMs:0},{feedforwardCurrent:1},{Rc:0}]){const x={...p,...change},a=autoTuneGfm(x);assert.ok(Object.values(a.stability).every(Boolean));}
 const delayed={...p,delaySamples:1.5},a=autoTuneGfm(delayed);assert.equal(a.stability,null);assert.throws(()=>gfmPolynomials(delayed,a.gains),/延时/);
});
