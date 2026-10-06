import test from 'node:test';import assert from 'node:assert/strict';import {defaults,prepare} from '../analysis/pq-capability.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),a+' != '+b);
test('independent PQ current circle follows voltage and fixed current base',()=>{for(const vpu of [1,.5]){const m=prepare({...defaults,vpu,Ipu:1.2,C:0,R:0,L:0});near(m.current.r,1.2*vpu);near(m.current.p,0);near(m.current.q,0);}});
test('zero filter impedance gives constant modulation requirement',()=>{const m=prepare({...defaults,C:0,R:0,L:0});assert.equal(m.voltage,null);near(m.point(.7,.3).E,480);});
test('RC and copper loss satisfy power balance in both directions',()=>{const m=prepare({...defaults,R:.01});for(const p of [-.8,.8]){const t=m.point(p,.2);near(t.dc,p*1e6+m.loss+3*.01*t.I*t.I);}});
test('interval membership agrees with point constraints over signed PQ plane',()=>{for(const R of [0,.01]){const m=prepare({...defaults,R,pout:.6,pin:.3});for(let q=-1.4;q<1.5;q+=.13)for(let p=-1.4;p<1.5;p+=.11){const t=m.point(p,q),inside=m.intervals(q).some(([a,b])=>p>=a&&p<=b);assert.equal(inside,t.currentOK&&t.voltageOK&&t.dcOK);}}});
test('rejects missing values and zero voltage',()=>{assert.throws(()=>prepare({...defaults,V:0}));assert.throws(()=>prepare({...defaults,Ipu:NaN}));});

test('ideal DC ignores output and absorption caps but retains current and voltage limits',()=>{const m=prepare({...defaults,dcIdeal:1,pout:0,pin:0,C:0,R:0,L:0});for(const p of [-.5,.5]){const t=m.point(p,0);assert.equal(t.dcOK,true);assert.equal(t.currentOK,true);assert.ok(m.intervals(0).some(([a,b])=>p>=a&&p<=b));}assert.equal(m.point(2,0).currentOK,false);const low=prepare({...defaults,dcIdeal:1,Vdc:100});assert.equal(low.point(.1,0).voltageOK,false);});
