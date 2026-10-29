import {gfmDynamicModel} from './gfm-dynamics.js';
import {buildGfmIslandModel} from './gfm-island-model.js';
import {eigenvalues} from './eigenvalues.js';
import {assessOperatingCapability} from './operating-capability.js';
export function evaluateGfmStructure(request) {
 const {input,gains,mode='droop',modeParameters={},implementation={},topology='grid-connected',islandControl='full',load={},limits={}}=request;
 if(!['grid-connected','island'].includes(topology))throw Error('Unsupported topology');
 if(!['full','fixed'].includes(islandControl))throw Error('Unsupported island control');
 const model=topology==='island'?buildGfmIslandModel(input,gains,implementation,load,islandControl==='fixed'?'fixed':mode,modeParameters):gfmDynamicModel({...input,considerScr:true},gains,mode,modeParameters,implementation);
 const poles=eigenvalues(model.A),alpha=Math.max(...poles.map(z=>z.re));
 const op=model.op,capability=assessOperatingCapability({...op,gridCurrentPu:Math.hypot(...op.ig)},limits);
 return {version:'gfm-structure-v2',request:structuredClone(request),implementation:model.implementation,scope:model.scope,topology,
  stable:alpha< -1e-6,alpha,poles,capability,op,residual:model.residual,names:model.names,A:model.A,delayModel:model.delayModel,
  qualification:'diagnostic-only',notes:['平衡点附近的平均小信号分析；不认证启动、合闸、限幅或开关纹波。','固定平衡偏置显式初始化；Ki=0 不等于无偏置控制器。',...(topology==='island'?[islandControl==='fixed'?'角度、频率、幅值固定；成网外层被冻结，SCR 不适用。':'孤岛包含成网幅值/频率外环与 P/Q 滤波；绝对相角为自由参考，不计入极点。SCR 不适用。','孤岛为平衡三相电阻负载；P/Q 测于负载支路，电压幅值取滤波 dq 模长；给定匹配所选平衡点，不认证任意给定的可达性。']:[]),...(input.delaySamples>0?['纯延时采用一阶 Padé，不代表完整采样/ZOH实现。']:[])]};
}
