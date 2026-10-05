const scales={pu:1,V:1,A:1,'Ω':1,H:1,F:1,W:1,var:1,VA:1,Hz:1,deg:Math.PI/180,kV:1e3,MW:1e6,Mvar:1e6,MVA:1e6,mH:1e-3,'μF':1e-6};
export function toSI(value,unit){if(!(unit in scales))throw Error('Unknown unit '+unit);return value*scales[unit];}
export function fromSI(value,unit){if(!(unit in scales))throw Error('Unknown unit '+unit);return value/scales[unit];}
