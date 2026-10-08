import {dqDefaults,pllParameters} from '../analysis/gfl-dq-model.js';
export function readDqSettings(project,id){return {...dqDefaults,...(project.extensions?.gflPi?.[id]?.dqAnalysis??{})};}
export function saveDqSettings(project,id,patch){
 if(!project.components?.some(c=>c.id===id&&c.type==='gfl'))throw Error('所选 GFL 不存在。');
 for(const key of Object.keys(patch))if(!Object.hasOwn(dqDefaults,key))throw Error('未知 dq/PLL 设置项。');
 const settings={...readDqSettings(project,id),...patch};if(typeof settings.enabled!=='boolean')throw Error('dq 分析开关必须为布尔值。');
 pllParameters(settings);const p=structuredClone(project);p.extensions??={};p.extensions.gflPi??={};p.extensions.gflPi[id]??={};p.extensions.gflPi[id].dqAnalysis=settings;return p;
}
