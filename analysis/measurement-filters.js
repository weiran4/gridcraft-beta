export const filterFields=[
 ['filterPqMs','P/Q 功率','pq',10],
 ['filterVdcMs','直流电压 Vdc','vdc',10],
 ['filterVoltageMs','交流电压','voltage',10],
 ['filterCurrentMs','电流 dq','current',1]
];
export const filterDefaults=Object.fromEntries(filterFields.map(([key,,,value])=>[key,value]));
export function measurementFilters(input={}){
 return Object.fromEntries(filterFields.map(([key,label,group,fallback])=>{
  const ms=input[key]===undefined?fallback:input[key];
  if(!Number.isFinite(ms)||ms<0)throw Error(label+'滤波时间常数必须为非负有限数，0 表示旁路。');
  const seconds=ms/1000;
  return [group,{ms,seconds,cutoffHz:ms===0?null:1/(2*Math.PI*seconds)}];
 }));
}
