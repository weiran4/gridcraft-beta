# GFM 电压 / 电流 PI：模型、实现与验证

日期：2026-10-04。

## 目的与范围

以 BESS_GFM_demo 为入口，在独立网页内自动整定电流 d/q、电压 d/q 四个并联 PI；参数可编辑、随工程保存和导出。沿用 Kp + 1/(Ti s)，Ki = 1/Ti，而不是 Kp/Ti。额定相电压峰值和电流峰值作 dq 基准，Zb = VLL²/Sbase。

三种成网模式提供相互独立的配置及明确方程；不是三个名称相同的动态模型。当前 PI 的数值校核固定成网参考角和幅值，不将惯量、下垂、励磁或功率测量滤波引入内环特征方程。不能由该校核断言三种完整控制系统稳定。模式参数的初值只是可编辑初值，尚未经具体控制实现确认。

## 电路与参考小信号模型

仅支持单逆变器、单同节点串联 RC 支路、径向单电源电网。电网 Rth/Lth 包括两台变压器折算阻抗。电压测量是 PCC / RC 支路端电压，不是电容本体电压。电流 iL 是滤波电感电流，ig 是流向电网的电流，ic=iL−ig。

采用理想 dq 解耦的单轴连续模型；旋转坐标系中的剩余交叉项、电网 dq 耦合和变动角度不在此模型中。该假设是整定参考，而不是对真实控制器完美补偿能力的保证。

- ZL = Rf + sLf，Zc = Rc + 1/(sCf)，Zg = Rth + sLth。
- Zp = Zc Zg/(Zc+Zg)，Zb = VLL²/Sbase。
- Hi = 1/(1+sTcurrent)，Hv = 1/(1+sTvoltage)。零时间常数为旁路。
- D = exp(−sTd)，Td = delaySamples/fs。
- A = [ZL+(1−av D Hv)Zp]/Zb。
- Li = Ci D Hi/A，Ti,cl = (Ci D/A)/(1+Li)。
- Gv = (Ti,cl Zp/Zb)/(1−F Ti,cl Zp/Zg)。
- Lv = Cv Gv Hv，Tv,cl = Cv Gv/(1+Lv)。

电压前馈 av 经过 Hv，并与 PI 输出一同经过 D；送网电流前馈 F 暂按即时测量。若实际实现滤波送网电流或前馈的测量位置不同，需要调整模型。

P/Q 测量滤波只供成网层配置；Vdc 滤波预留但没有 Vdc 控制环，二者不改变本页内环 Bode。运行 P/Q 用于初始外环参考和视在容量校核，不求解潮流。DC 按固定电压处理，未做调制或饱和校核。

## 成网模式定义

均用 pu 功率、电压和频率；θ 用 rad，ωb=2πf0，mp/nq 从输入百分数换算。

- Droop：ω=1+mp(P*−Pf)，V*=V0+nq(Q*−Qf)，θdot=ωbω。
- VSG：2H ωdot=P*−Pf−D(ω−1)，V*dot=Kv[(V0−Vf)/nq+Q*−Qf]。
- Synchronverter 参考变体：2H ωdot=P*/ω−Pf/ω−D(ω−1)，ψdot=Ke[(V0−Vf)/nq+Q*−Qf]，V*=ωψ。此处仅展示转子 / 励磁与双环组合的参考形式，不宣称覆盖所有 Synchronverter 实现。

这些方程仅用于展示和参数配置。本版不计算模式整体极点，不自动整定 H/D/Kv/Ke。

## 自动整定策略

相位裕度目标默认 60°；电流/电压交越上限默认 500/50 Hz，Ts=50 μs，Td=0；P/Q/Vdc/电压滤波默认10 ms，电流1 ms；F=0.75，av=1。后两项为参考控制结构初值。

先整定电流，再闭合电流环整定电压。电流零点/交越比固定0.2；电压有限静态增益情形取5，F=1产生积分对象时取0.2。电压交越最多为电流的1/5，电流不超过fs/10。扫描第一个相位边界，并回退交越上限；拒绝额外0 dB交越或裕度不足。零延时还需通过 Routh 判据。该策略保守，不是最优性能搜索。

非零纯延时保留精确频域相位，但不以有限阶多项式作稳定证明。手动 PI 可以保存，未通过校核时红色提示；无效输入清除结果、阻止导出。

## 实现与复现

- `project/gfm-settings.js`：元件关联、默认参数和同节点 RC 校验。
- `analysis/gfm-pi.js`：频响、零延时特征多项式、自动整定。
- `ui/gfm-design.js` / `gfm.html`：顶部参数、三模式、图内滤波、Kp/Ti、Bode、保存/导出。
- 工程参数存于 `extensions.gfmPi[ibrId]`，使用已有跨页字段合并，不覆盖 GFL 配置。

运行 `node --test tests/gfm-pi.test.js`。独立状态空间复核：`node scripts/verify-gfm-pi.mjs`，然后 `python scripts/verify-gfm-pi.py`（离线需要 NumPy，不参与网页运行）。

复核以 iL、ig、vC、测量电流、测量电压、电流积分器及电压积分器为独立状态构建矩阵；不复用特征多项式推导。比较两组电气/前馈/滤波参数、四个环路、八个频率的闭环复响应与全部物理极点。结果保存在 `docs/validation/gfm-state-verification.json`。默认四环稳定仅指本文标量模型。

公开原理背景：[Imperix — Grid-Forming Inverter](https://doi.org/10.66800/0168)。本项目的带串联阻尼 RC、电网与滤波前馈的模型按上述电路方程独立推导。
