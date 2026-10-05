export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
export function symbol(type){switch(type){
case 'source':return '<circle r="25"/><path d="M-17 0 Q-9-22 0 0 T17 0 M25 0H64"/>';
case 'rl':return '<path d="M-64 0H-43 l5-9 8 18 8-18 8 18 5-9 H-4 c0-20 14-20 14 0 c0-20 14-20 14 0 c0-20 14-20 14 0 H64"/>';
case 'transformer':return '<path d="M-64 0H-24 M24 0H64 M-3-26V26 M3-26V26"/><circle cx="-14" r="20"/><circle cx="14" r="20"/>';
case 'bus':return '<path class="bus-bar" d="M0-37V37"/><circle class="bus-core" r="4"/>';
case 'rc':return '<path d="M0-64V-35 l-7 5 14 7-14 7 7 5 V0 M-17 0H17 M-17 9H17 M0 9V26 M-18 26H18 M-12 33H12 M-6 40H6"/>';
case 'gfl':case 'gfm':return '<rect x="-35" y="-29" width="70" height="58" rx="6"/><path d="M-31 24L31-24 M-64 0H-35 M35 0H64"/><path data-domain-symbol="ac" d="M-24-9 q5-12 10 0 t10 0"/><path data-domain-symbol="dc" d="M8 7H24 M8 14H24"/>';
case 'dc':return '<circle r="25"/><path d="M25 0H64 M-6-12H6 M0-18V-6 M-6 12H6"/>';
}}
export function localPort(type,side){if(type==='bus')return{x:0,y:0};if(type==='rc')return{x:0,y:-64};if(type==='source'||type==='dc')return{x:64,y:0};return{x:side==='A'||side==='AC'?-64:64,y:0};}
export function terminalPosition(c,side){const p=localPort(c.type,side),a=(c.rotation||0)*Math.PI/180;return{x:c.x+p.x*Math.cos(a)-p.y*Math.sin(a),y:c.y+p.x*Math.sin(a)+p.y*Math.cos(a)};}

export function thumbnail(type){return `<svg class="component-thumbnail" viewBox="-76 -76 152 152" aria-hidden="true"><g class="symbol">${symbol(type)}</g></svg>`;}
