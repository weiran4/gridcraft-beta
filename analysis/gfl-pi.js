
/** Analytic RL tuning, amplitude-invariant Park transform, SI seconds.
 * Perfect PCC-voltage orientation, voltage feedforward and dq decoupling.
 * No grid/RC/PLL dynamics, saturation or sampled-data simulation.
 */
import {measurementFilters} from './measurement-filters.js?v=filters1';
export function designGflPi({ratedVA,voltageLL,frequencyHz,R,L,dcVoltage,fs=10000,fi=500,fp=50,delaySamples=1.5,...filterSettings}){
 const positive={ratedVA,voltageLL,frequencyHz,L,dcVoltage,fs,fi,fp};
 for(const [key,value]of Object.entries(positive))if(!Number.isFinite(value)||value<=0)throw Error(key+' 必须为正的有限数值。');
 if(!Number.isFinite(R)||R<0||!Number.isFinite(delaySamples)||delaySamples<0)throw Error('R 和延时必须为非负有限数值。');
 if(fp>=fi)throw Error('外环目标频率必须小于电流内环带宽。');
 if(fi>=fs/2)throw Error('电流带宽必须低于采样频率的一半。');
 const wb=2*Math.PI*frequencyHz,wc=2*Math.PI*fi,wp=2*Math.PI*fp;
 const Zb=voltageLL**2/ratedVA,Vb=Math.sqrt(2/3)*voltageLL,Ib=Math.sqrt(2)*ratedVA/(Math.sqrt(3)*voltageLL);
 const kp=L*wc/Zb,ki=R*wc/Zb,outerKp=wp/wc,outerKi=wp;
 const filters=measurementFilters(filterSettings);
 const warnings=[];
 if(Object.values(filters).some(f=>f.seconds>0))warnings.push('PI 建议值按无测量滤波的初始模型给出；加入滤波后实际带宽及裕度请以下方频响为准。');
 if(fi>fs/10)warnings.push('电流带宽超过采样频率的1/10；应降低带宽并验证离散模型。');
 if(fp>fi/5)warnings.push('内外环带宽间隔不足5倍；简化级联近似可能不可靠。');
 if(R/L<wc/100)warnings.push('Rf/Lf远小于目标带宽：零极点抵消给出的 Ti 很大（R=0 时为 ∞），扰动恢复对电阻估计敏感。');
 const delayMargin=90-360*fi*delaySamples/fs;
 if(delayMargin<45)warnings.push('简化纯延时估计的电流环相位裕度低于45°。');
 const maxPhasePeak=dcVoltage/Math.sqrt(3),headroom=maxPhasePeak/Vb;
 if(headroom<=1)warnings.push('按SVPWM线性区估计，DC电压不足以合成额定AC电压。');
 const result={base:{S: ratedVA,VLL:voltageLL,Vdq:Vb,Idq:Ib,Irms:Ib/Math.sqrt(2),Z:Zb,L:Zb/wb,wb},
 current:{kp,ki,kpSI:L*wc,kiSI:R*wc,kiStep:ki/fs,bandwidth:wc},
 power:{kp:outerKp,ki:outerKi,kiStep:outerKi/fs,bandwidth:wp},
 Rpu:R/Zb,Lpu:wb*L/Zb,delayMargin,headroom,maxPhasePeak,warnings};
 if([Zb,Vb,Ib,kp,ki,outerKp,outerKi,headroom].some(v=>!Number.isFinite(v)))throw Error('参数超出数值范围。');
 return result;
}
