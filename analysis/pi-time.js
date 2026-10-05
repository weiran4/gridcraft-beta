// Parallel branches: u = Kp*e + (1/Ti)*integral(e dt), Ti in seconds.
// Keep legacy stored Ki as the calculation source of truth.
export function tiFromKi(ki){
 if(!Number.isFinite(ki)||ki<0)throw Error('积分增益必须为非负有限数。');
 return ki===0?Infinity:1/ki;
}
export function kiFromTi(value){
 if(value===Infinity||String(value).trim()==='∞'||String(value).trim()==='Infinity')return 0;
 const ti=Number(value);
 if(String(value).trim()===''||!Number.isFinite(ti)||ti<=0||!Number.isFinite(1/ti))throw Error('Ti 必须为正数，单位秒；输入 ∞ 可关闭积分。');
 return 1/ti;
}
export function piTimeParameters(gain){
 const ti=tiFromKi(gain.ki);
 return {kp:gain.kp,tiSeconds:Number.isFinite(ti)?ti:null,integralEnabled:gain.ki!==0};
}
