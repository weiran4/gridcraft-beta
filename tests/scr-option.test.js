import test from 'node:test';import assert from 'node:assert/strict';
import {demo} from '../examples/demo.js';import {outerContext,outerModels} from '../analysis/gfl-outer.js';
import {gfmContext,gfmSettings} from '../project/gfm-settings.js';
import {loopResponse} from '../analysis/gfl-frequency.js';import {gfmResponse,autoTuneGfm} from '../analysis/gfm-pi.js';
const gains=Object.fromEntries(['d','q','P','Q'].map(k=>[k,{kp:.2,ki:2}]));
const pv={ratedVA:1e6,voltageLL:315,frequencyHz:50,L:63e-6,R:1e-6,dcVoltage:800,fs:20000,fi:500,fp:50,delaySamples:0,gridROhm:.01,gridXOhm:.04,gridCapacitanceF:.0015,gridCapResistanceOhm:.051};
test('SCR is opt in; GFL checked network alters current and power response',()=>{assert.equal(gfmSettings(demo('gfm480'),'GFM1').considerScr,false);const changed={...pv,gridXOhm:.08,gridROhm:.02};for(const k of ['d','P']){assert.deepEqual(loopResponse({...pv,considerScr:false},gains,30).open[k],loopResponse({...changed,considerScr:false},gains,30).open[k]);assert.notDeepEqual(loopResponse({...pv,considerScr:true},gains,30).open[k],loopResponse({...changed,considerScr:true},gains,30).open[k]);}});
test('unchecked GFL cannot quietly use grid sensitivity for Vac',()=>{assert.throws(()=>outerModels({...pv,considerScr:false,qMode:'Vac'}),/SCR/);assert.ok(outerModels({...pv,considerScr:true,qMode:'Vac'}).Q.gain>0);});
test('GFM off ignores grid impedance, on uses it; local PI remains tunable',()=>{const project=demo('gfm480'),p={...gfmContext(project,'GFM1'),...gfmSettings(project,'GFM1')};for(const k of ['d','P']){assert.deepEqual(gfmResponse({...p,considerScr:false},gains,30).open[k],gfmResponse({...p,considerScr:false,gridR:p.gridR*2,gridL:p.gridL*2},gains,30).open[k]);assert.notDeepEqual(gfmResponse({...p,considerScr:true},gains,30).open[k],gfmResponse({...p,considerScr:true,gridL:p.gridL*2},gains,30).open[k]);}assert.ok(autoTuneGfm({...p,considerScr:false}).gains.d.kp>0);});

import {autoTuneGfl,closedLoopPolynomials,isHurwitz} from '../analysis/gfl-autotune.js';
import {gfmPolynomials} from '../analysis/gfm-pi.js';import {gfmDynamicModel} from '../analysis/gfm-dynamics.js';
import {parseProject,serializeProject} from '../project/model.js';
test('SCR choice persists and disabled GFM cannot report a coupled-grid result',()=>{const project=demo('gfm480');for(const value of [true,false]){project.extensions.gfmPi={GFM1:{considerScr:value}};assert.equal(gfmSettings(parseProject(serializeProject(project)),'GFM1').considerScr,value);}assert.throws(()=>gfmDynamicModel({...gfmContext(project,'GFM1'),...gfmSettings(project,'GFM1')},gains,'droop',{mp:1,nq:5}),/SCR/);});
test('GFL selected network has stable scalar PI in every outer-mode combination',()=>{for(const dMode of ['P','Vdc'])for(const qMode of ['Q','Vac']){const p={...pv,...outerContext(demo('pv315'),'PV1'),considerScr:true,dcCapacitanceF:.064,dMode,qMode},result=autoTuneGfl(p);assert.ok(Object.values(result.stability).every(Boolean));assert.notDeepEqual(result.gains.d,autoTuneGfl({...p,gridXOhm:p.gridXOhm*.7}).gains.d);}});
const cm=(a,b)=>({re:a.re*b.re-a.im*b.im,im:a.re*b.im+a.im*b.re}),cd=(a,b)=>{const n=b.re*b.re+b.im*b.im;return {re:(a.re*b.re+a.im*b.im)/n,im:(a.im*b.re-a.re*b.im)/n};};
const pe=(coeff,w)=>coeff.reduceRight((a,v)=>{const z=cm(a,{re:0,im:w});return {re:z.re+v,im:z.im};},{re:0,im:0});
const near=(a,b)=>assert.ok(Math.hypot(a.re-b.re,a.im-b.im)<1e-8*Math.max(1,Math.hypot(b.re,b.im)));
test('network characteristic polynomials agree with complex frequency tracking',()=>{
 const p={...pv,considerScr:true,filterCurrentMs:1,filterVoltageMs:10,filterPqMs:10,filterVdcMs:10,dcCapacitanceF:.064},Z=p.voltageLL**2/p.ratedVA,C=p.gridCapacitanceF,Lg=p.gridXOhm/(2*Math.PI*p.frequencyHz);
 for(const dMode of ['P','Vdc'])for(const qMode of ['Q','Vac'])for(const f of [.1,10,300]){const x={...p,dMode,qMode},w=2*Math.PI*f,polys=closedLoopPolynomials(x,gains),h=pe([1,.001],w),hv=pe([1,.01],w),dp=pe([1,C*(p.gridCapResistanceOhm+p.gridROhm),C*Lg],w),nc=pe([1,C*p.gridCapResistanceOhm],w),ci=pe([2,.2],w),numI=cm(cm(cm(ci,h),hv),{re:Z,im:0}),response=loopResponse(x,gains,f).closed;
 near(cd(cm(numI,dp),pe(polys.d,w)),response.d);
 const model=outerModels(x);for(const k of ['P','Q']){let n=cm(cm(cm(ci,numI),model[k].label==='Vdc'?dp:nc),hv);n={re:n.re*model[k].gain,im:n.im*model[k].gain};near(cd(n,pe(polys[k],w)),response[k]);}
 }
});
test('local GFM auto PI and Routh remain independent of grid and grid feedforward',()=>{const project=demo('gfm480'),p={...gfmContext(project,'GFM1'),...gfmSettings(project,'GFM1'),considerScr:false},r=autoTuneGfm(p),other=autoTuneGfm({...p,gridR:0,gridL:0,feedforwardCurrent:0,feedforwardVoltage:0});assert.deepEqual(r.gains,other.gains);assert.ok(Object.values(gfmPolynomials(p,r.gains)).every(isHurwitz));});
