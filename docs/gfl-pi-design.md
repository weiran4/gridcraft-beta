# GFL PI 模型与整定方法

## 变量与基准

电流正方向为逆变器到电网，采用幅值不变 Park 变换。`Vb=√(2/3)VLL`，`Ib=√2 S/(√3 VLL)`，`Zb=VLL²/S`，`Lb=Zb/ωb`。因此 `1.5 Vb Ib=S`。

`Ppu=vd id+vq iq`，`Qpu=vq id−vd iq`；额定点 vd=1、vq=0。d 外环选择 P 或 Vdc，q 外环选择 Q 或 Vac。Q、Vdc、Vac 的控制极性独立施加负号，PI 增益保持非负。

## PI 与滤波

并联 PI 为 `C(s)=Kp+1/(Ti s)`，Ti 单位秒；积分支路不乘 Kp。内部存储 Ki=1/Ti 以兼容已有工程。Ki=0 对应 Ti=∞，关闭积分。

测量滤波 `Hx=1/(1+sTx)`。P/Q、Vdc、AC 电压默认各 10 ms，dq 电流默认 1 ms；0 表示旁路。控制步长 Ts 默认 50 μs，延时 Td=N Ts 默认 0。步长不等于 PWM 开关周期，频响仍为连续时间模型。

## 对象和返回比

理想电压前馈与 dq 解耦后，电流对象 `Gi=Zb/(Rf+sLf) exp(−sTd)`。

`Li=Ci Gi Hi`，实际电流/给定 `Ti_track=Ci Gi/(1+Li)`。传感器只放在反馈支路，不额外乘到实际输出的分子。

P/Q 的外环对象为 1。Vdc 来自 `Cbus Vdc dVdc/dt=Pdc−Pac`，极性抵消后 `Go=Kdc/s`，`Kdc=S/(Cbus Vdc0²)`；假设 DC 输入功率不变。Vac 使用额定点低频静态灵敏度 `Go=Kvac=Xth/Zb`，另一通道保持不变。

外环返回比 `Lo=Co Ti_track Go Ho`，实际输出/给定 `To=Co Ti_track Go/(1+Lo)`。Vdc 使用 Vdc 滤波，Vac 使用交流电压滤波，P/Q 使用功率滤波。

## 自动整定策略

输入 fi/fo 为交越频率目标上限，目标相位裕度至少 60°。固定 PI 零点比 r：电流与 Vdc 为 0.2，P/Q/Vac 为 5。r 是算法策略而非设备参数。

令 A 为该环去掉 PI 后的对象，选 `Kp=1/(|A(jωc)|√(1+r²))`、`Ki=Kp r ωc`、`Ti=1/Ki`。从低频扫描到第一个相位裕度边界，并将外环频率限制在实际内环的 1/5 以下。

频响扫描检查额外交越；零延时使用 Routh-Hurwitz 检查闭环特征多项式。纯延时非零时不提供多项式稳定性证明。此策略并非全局最优设计，速度、超调和裕度需要权衡。

## 交互与验证

自动模式随参数变化重新计算；手动增益保留，显式重新整定按钮恢复自动值。模式组合独立保存。导出包括 Kp/Ti、输入、模型与验证结果。

相应计算在 analysis/gfl-autotune.js、gfl-frequency.js、gfl-outer.js、measurement-filters.js；验证在 tests/。独立的状态空间比较见 validation/pi-comparison.md。

模型不含 PLL、网络谐振、残余轴间耦合、限幅或精确数字控制实现。额定点稳定性不能外推为完整系统任意工况稳定。
