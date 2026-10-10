/** Describe the selected existing model, not a new grid or PLL model. */
export function gflModelScope(settings={},analysis={},input={}){
 if(analysis.schemaVersion!==undefined&&analysis.schemaVersion!==1||analysis.modelVersion!==undefined&&analysis.modelVersion!==1)return '所选分析模型或版本未支持；保留原配置与 PI，不能以标量通过替代主线结论。';
 if(analysis.modelId==='gfl-dq-reference-v1')return '所选主线：PLL 与 dq 联立工程参考模型。完整外环 '+(input.dMode??settings.dMode??'P')+' / '+(input.qMode??settings.qMode??'Q')+' 参考实验保留两外环、电网与 RC、dq 交叉项及同步模型；电流参考实验冻结外环输出增量，保留工作点偏置。'+(analysis.syncMode==='fixed-angle'?'固定同步角，不跟踪 PCC；没有 PLL 动态。':'SRF PLL 动态，fn 为特征频率，工程初值不是实测参数。')+' 非零显式延时仅为 Padé 近似，不可应用。四环标量阶跃和标量 Bode 仅用于诊断，不替代主线结论。单逆变器、平衡 LCL 等效；不含开关 EMT、限流、饱和、负序、保护或认证。';
 if(analysis.modelId&&analysis.modelId!=='legacy-scalar')return '所选分析模型或版本未支持；保留原配置与 PI，不能以标量通过替代主线结论。';
 const electrical=settings.considerScr===true
  ?'已启用电网阻抗（SCR）分析：电网 R/L、PCC 的 RC 支路及滤波电压前馈参与单轴标量模型。'
  :'未启用电网阻抗（SCR）分析：电流环采用本地 Rf/Lf 与理想电压前馈，不使用上游电网阻抗；Vac 模式需要启用本项。';
 const dynamic=' 仍假设理想同步角和理想 dq 解耦；未包含 PLL 动态、完整 dq / 外环耦合或非线性限幅。';
 const time=settings.delaySamples===0?' 阶跃图为零延时、额定点小信号预览，不等同于 HIL 实测。':' 含非零纯延时或延时未确认时，仅显示已支持的频域分析，不绘制零延时替代曲线。';
 return '原标量整定 / 四格阶跃基线：'+electrical+dynamic+time+' 可选额外 PLL/dq 校核保留；只有明确选择主线分析模型后才以联立响应排序。';
}
