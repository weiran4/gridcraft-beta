import test from 'node:test';
import assert from 'node:assert/strict';
import {pwmSpectrum,convertHarmonicBasis} from '../analysis/pwm-spectrum.js';
const p={frequencyHz:50,fs:2000,modulation:.643,thirdPercent:15};
test('PWM FFT matches computed PV and wind harmonics and excludes common-mode carrier',()=>{
 const a=pwmSpectrum(p),h=a.harmonics.find(x=>x.order===79);
 assert.ok(Math.abs(h.phasePu-.38856)<.001);
 assert.ok(Math.abs(h.linePu-Math.sqrt(3)*h.phasePu)<.001);
 assert.equal(a.dominant.order,79);
 assert.ok(a.harmonics.find(x=>x.order===40).linePu<.001);
 const b=pwmSpectrum({...p,modulation:.939});
 assert.ok(Math.abs(b.harmonics.find(x=>x.order===38).phasePu-.2063)<.001);
 assert.equal(b.dominant.order,38);
});
test('phase and line conversion preserves physical voltage and null input',()=>{
 const line=convertHarmonicBasis(.4,'phase','line');
 assert.ok(Math.abs(line-.4*Math.sqrt(3))<1e-12);
 assert.ok(Math.abs(convertHarmonicBasis(line,'line','phase')-.4)<1e-12);
 assert.equal(convertHarmonicBasis(null,'line','phase'),null);
});
test('coherent multicycle FFT supports rational carrier ratios and rejects unbounded cases',()=>{
 assert.equal(pwmSpectrum({...p,fs:2025}).cycles,2);
 for(const patch of [{modulation:0},{fs:1},{thirdPercent:-1},{frequencyHz:0},{modulation:1.5},{fs:2000.1234567}])assert.throws(()=>pwmSpectrum({...p,...patch}));
});
