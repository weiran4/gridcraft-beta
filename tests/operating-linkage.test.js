import {operatingPoint} from '../analysis/operating-point.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../examples/demo.js';
import {filterDesignContext,designFilterInductor} from '../analysis/filter-inductor.js';
import {dcDesignContext,designDcVoltage} from '../analysis/dc-voltage.js';
import {dcCapContext} from '../analysis/dc-capacitor.js';
import {rcDesignContext} from '../analysis/rc-filter.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const settings={fs:2000,sideband:'2N-1',harmonicBasis:'phase',harmonicPu:.389,ripplePercent:10,dropPercent:20,currentMode:'operating',currentMarginPercent:100,currentEfficiencyPercent:95};
test('operating PQ drives filter current without double counting the old efficiency correction',()=>{
 const p=demo(),c=p.components.find(x=>x.id==='PV1');c.parametersSI.activePowerW=1e6;c.parametersSI.reactivePowerVar=.5e6;
 const r=designFilterInductor({...filterDesignContext(p,'PV1'),...settings});
 near(r.currentRms,2049.1975376758824);near(r.baseCurrentRms,1832.85799742738);
 const rated=designFilterInductor({...filterDesignContext(p,'PV1'),...settings,currentMode:'rated'});near(rated.currentRms,1832.85799742738);
 c.parametersSI.reactivePowerVar=0;near(designFilterInductor({...filterDesignContext(p,'PV1'),...settings}).currentRms,1832.85799742738);
});
test('DC operating mode uses actual current and signed PQ angle, independently of saved angle',()=>{
 const p=demo(),c=p.components.find(x=>x.id==='PV1');c.parametersSI.activePowerW=1e6;c.parametersSI.reactivePowerVar=.5e6;
 const options={designMode:'operating',phaseAngleDeg:0,modulation:'third',marginPercent:5,selectedV:800};
 const pos=designDcVoltage({...dcDesignContext(p,'DC1','PV1'),...options});near(pos.currentRms,2049.1975376758824);near(pos.phi,Math.atan(.5));
 c.parametersSI.reactivePowerVar=-.5e6;const neg=designDcVoltage({...dcDesignContext(p,'DC1','PV1'),...options});near(neg.currentRms,pos.currentRms);assert.ok(neg.minimumV<pos.minimumV);
});
test('RC and capacitor contexts carry operating PQ without changing rated selection bases',()=>{
 const p=demo(),c=p.components.find(x=>x.id==='PV1');c.parametersSI.activePowerW=2e6;c.parametersSI.reactivePowerVar=.5e6;
 for(const ctx of [dcCapContext(p,'PV1'),rcDesignContext(p,'RC1','PV1')]){assert.equal(ctx.activeW,2e6);assert.equal(ctx.reactiveVar,.5e6);assert.equal(ctx.ratedW,1e6);}
});

test('operating phasor and modulation include signed reactive voltage drop',()=>{
 const p={activeW:3,reactiveVar:1.5,voltageLL:Math.sqrt(3),ratedVA:3,frequencyHz:50,L:1/(100*Math.PI),dcVoltage:2};
 const pos=operatingPoint(p);near(pos.currentRms,Math.sqrt(1.25));near(pos.converterRms,Math.sqrt(3.25));near(pos.modulation,Math.sqrt(6.5));assert.equal(pos.overRated,true);
 const neg=operatingPoint({...p,reactiveVar:-1.5});near(neg.converterRms,Math.sqrt(1.25));near(neg.currentRms,pos.currentRms);
 const zero=operatingPoint({...p,activeW:0,reactiveVar:0});assert.equal(zero.currentRms,0);assert.equal(zero.powerFactor,null);near(zero.converterRms,1);
 assert.throws(()=>operatingPoint({...p,activeW:NaN}));
});
test('zero operating power requires an explicit rated basis for ripple percentage design',()=>{
 const p=demo(),c=p.components.find(x=>x.id==='PV1');c.parametersSI.activePowerW=0;c.parametersSI.reactivePowerVar=0;
 assert.throws(()=>designFilterInductor({...filterDesignContext(p,'PV1'),...settings}),/运行电流/);
 assert.ok(designFilterInductor({...filterDesignContext(p,'PV1'),...settings,currentMode:'rated'}).currentRms>0);
});
