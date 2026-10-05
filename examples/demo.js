import {pvGridExample} from './pv-grid-demo.js?v=tr-rating1';
import {gfm480Demo,gfm480Inputs} from './gfm-480-demo.js?v=gfm-pi1';
export function demo(name='pvfarm'){
 if(name==='gfm480')return gfm480Demo(gfm480Inputs);
 return structuredClone(pvGridExample);
}
