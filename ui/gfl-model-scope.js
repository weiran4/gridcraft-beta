/** Describe the selected existing model, not a new grid or PLL model. */
export function gflModelScope(settings={}){
 const electrical=settings.considerScr===true
  ?'已启用电网阻抗（SCR）分析：电网 R/L、PCC 的 RC 支路及滤波电压前馈参与单轴标量模型。'
  :'未启用电网阻抗（SCR）分析：电流环采用本地 Rf/Lf 与理想电压前馈，不使用上游电网阻抗；Vac 模式需要启用本项。';
 const dynamic=' 仍假设理想同步角和理想 dq 解耦；未包含 PLL 动态、完整 dq / 外环耦合或非线性限幅。';
 const time=settings.delaySamples===0?' 阶跃图为零延时、额定点小信号预览，不等同于 HIL 实测。':' 含非零纯延时或延时未确认时，仅显示已支持的频域分析，不绘制零延时替代曲线。';
 return '原标量整定 / 四格阶跃基线：'+electrical+dynamic+time+' 新增 PLL/dq 联立模型在独立面板启用、展示和校核。';
}
