// Slider interaction must not change its scale. Numeric edits choose a fresh range.
export const gainSliderMax=(recommended,value)=>Math.max(recommended*4,value*2,1e-6);
export function syncGainSlider(slider,value,recommended,fromSlider){
 if(!fromSlider)slider.max=gainSliderMax(recommended,value);
 slider.value=value;
}
