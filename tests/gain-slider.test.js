import test from 'node:test';
import assert from 'node:assert/strict';
import {gainSliderMax,syncGainSlider} from '../ui/gain-slider.js';
test('repeated drags to right endpoint and back preserve slider scale',()=>{
 const slider={max:gainSliderMax(2,2),value:2};
 for(let i=0;i<100;i++)syncGainSlider(slider,Number(slider.max),2,true);
 assert.equal(slider.max,8);
 syncGainSlider(slider,2,2,true);
 assert.equal(slider.max,8);assert.equal(slider.value,2);
});
test('numeric edits allow larger gains and recover a useful range after oversized values',()=>{
 const slider={max:8,value:2};
 syncGainSlider(slider,43469,2,false);assert.equal(slider.max,86938);
 syncGainSlider(slider,2,2,false);assert.equal(slider.max,8);
 assert.ok(gainSliderMax(0,0)>0);
});
