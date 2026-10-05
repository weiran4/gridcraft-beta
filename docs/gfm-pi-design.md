# GFM 三模式控制与 PI 整定

更新：2026-10-05。入口 `gfm.html?ibr=GFM1`，范例 `BESS_GFM_demo`。

## 模型与符号

单逆变器、单同节点串联 RC 支路、单电源径向电网；电网 Rth/Lth 包含变压器折算阻抗。电流从逆变器流向电网，Park 变换 d=cos、q=−sin。相电压峰值及电流峰值为 dq 基准，Zb=VLL²/Sbase。P=vd·igd+vq·igq，Q=vq·igd−vd·igq，均为 pu。

PI 使用并联形式 Kp+1/(Ti·s)，Ki=1/Ti。电压测量为 PCC 电压 v，电流反馈为电感电流 iL；送网电流 ig 与电容电压 vc 是不同信号。所有测量低通为 1/(1+sT)，T=0 时旁路；输入显示 ms，方程使用 s。

工作点由指定送网 P/Q、电网等效和理想电源求解高电压潮流支路。令 r=Rth/Zb、x=ωbLth/Zb，电源幅值 E，PCC 幅值 V，则：

`V⁴ − [E²+2(rP+xQ)]V² +(r²+x²)(P²+Q²)=0`。

V₀ 自动匹配该工作点，不强制等于额定电压 1 pu。标准范例在 P=1 MW、Q=0 时 PCC 约437.406 V，电感电流约1.0992 pu；极点稳定不意味着额定电流约束已满足。DC 视作刚性电压，只参与调制需求计算；Vdc 测量时间常数保存备用，不参与本页极点。

## 三种成网层

频率 ω 用 pu，θ 用 rad，ωb=2πf₀。mp/nq 输入百分数，方程使用其除以100的值；Pf/Qf 经功率低通，Vf=|hv|。

- Droop：ω=1+mp(P*−Pf)，V*=V₀+nq(Q*−Qf)。
- VSG：2H·ωdot=P*−Pf−D(ω−1)，V*dot=Kv[(V₀−Vf)/nq+Q*−Qf]。
- Synchronverter 参考变体：2H·ωdot=(P*−Pf)/ω−D(ω−1)，ψdot=Ke[(V₀−Vf)/nq+Q*−Qf]，V*=ωψ。

各模式均有 θdot=ωbω，电路线性化使用相对电网角 δ=θ−ωbt。Synchronverter 这里采用转矩/励磁驱动共用电压电流双环的变体，不等同于所有直接生成桥端电压的实现。模式参数是可编辑的参考初值，不宣称复现某个供应商控制器。

## 共用 dq 电路与双环

令 J[d,q]=[−q,d]、Lb=Lf/Zb、Lgb=Lth/Zb、Cb=Cf·Zb、各电阻为 pu，Ω=ωbω：

```
v = vc + rc(iL−ig)
iLdot = (u−v−rf iL)/Lb − Ω J iL
igdot = (v−eg(δ)−rg ig)/Lgb − Ω J ig
vcdot = (iL−ig)/Cb − Ω J vc

iL* = Cv(v*−hv) + F ig + Ω Cb J vc
u* = Ci(iL*−hi) + av hv + Ω Lb J hi
```

Ci/Cv 为 d、q 独立 PI，包括积分状态。电感解耦使用滤波 iL，电容解耦使用内部 vc。送网电流前馈 F 为即时测量。PI 的稳态积分偏置根据潮流工作点计算，保证线性化点残差接近零；关闭积分时将对应偏置固定。改变测量点、滤波位置或符号，需要相应修改模型，不能仅复制增益。

Td=N·Ts。内环频响使用精确 exp(−sTd)；耦合极点在非零延时时使用一阶 Padé 近似，零延时时无延时状态。Ts 是控制步长，网页模型仍为连续平均模型，不是完整离散控制/开关仿真。

## 两层校核与自动整定

内环 Bode 保留固定角度、理想解耦的标量对象，用于预筛选；成网模式分析另行线性化完整上述 dq 方程，包含角度、P/Q 测量、电网与剩余耦合。

自动整定先生成标量 PI，再搜索288组比例/积分增益缩放候选。候选需要四环单交越、裕度满足目标、交越不超过输入上限、电压交越≤电流交越/5；零延时还要求标量 Routh 通过。随后要求当前模式耦合最大极点实部<−1e-4，选择搜索集合内衰减率更高的一组，并密集扫频复核。这是有限局部搜索，不是全局最优设计；H/D/下垂/励磁参数保留用户输入。

默认范例各模式分别整定后的最大实部约为 Droop −5.6881、VSG −3.9225、Synchronverter −4.0010 s⁻¹。使用某一模式的 PI 检查另外两种模式可能不稳定，因此按模式保存 PI，切换自动模式时重新整定。三模式对比表使用当前同一组 PI；极点图显示当前模式实部最大的六个极点，JSON 导出包含全部极点。

手动模式保留增益并报告不稳定；无效参数不提交到工程，不保留旧计算结果。图内 PI/滤波/成网参数与顶部输入同步；电路编辑通过工程字段合并更新，避免覆盖其他页面的无关修改。

## 验证与复现

- `npm test`：电路关联、模式敏感性、旁路、延时、三模式整定、序列化和框图回归。
- `node scripts/gfm-coupled-data.mjs <output.json>`
- `python scripts/check-gfm-coupled.py <output.json>`：用独立 NumPy 特征值算法复核12个矩阵，最大相对误差约5.9e-11。Python/NumPy仅用于离线开发复核，网页无此依赖。
- 原 `scripts/verify-gfm-pi.mjs` / `.py` 继续验证标量内环模型，不能代替耦合模型验证。

模型未包含限流、饱和、开关、数字执行细节和直流能量动态；小信号稳定不替代大扰动验证。

公开原理参考：[Imperix VSG](https://imperix.com/doc/implementation/virtual-synchronous-generator-for-droop-control)、[Zhong & Weiss: Synchronverters](https://www.eng.tau.ac.il/~gweiss/art97_IEEE.pdf)。电路和联动实现按本文方程独立构建。
