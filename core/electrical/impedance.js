export const rlImpedance=(r,l,f)=>({re:r,im:2*Math.PI*f*l});
export const rcImpedance=(r,c,f)=>({re:r,im:-1/(2*Math.PI*f*c)});
export const magnitude=z=>Math.hypot(z.re,z.im);
export const scale=(z,k)=>({re:z.re*k,im:z.im*k});
export const add=(a,b)=>({re:a.re+b.re,im:a.im+b.im});
export const ratio=z=>z.re===0?(z.im===0?null:'Infinity'):(Number.isFinite(z.im/z.re)?z.im/z.re:'Infinity');
export const angleDegrees=z=>z.re===0&&z.im===0?null:Math.atan2(z.im,z.re)*180/Math.PI;
