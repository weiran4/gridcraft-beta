# dq 控制约定与参数对接

本工具的数值增益以明确的方向和归一化为前提。改变电流坐标本身不改变物理系统，但必须同时改变测量、给定、控制极性及解耦符号。

## 当前约定

- 电流 i 从逆变器流向电网；u 为逆变器桥侧电压，v 为并网点电压。
- 正序、幅值不变 Park 变换：d 行为 cos，q 行为 −sin；d 轴对准电压。
- 三相功率标幺值 P = vd id + vq iq，Q = vq id − vd iq，以注入电网为正。
- 电压基准为相电压峰值，电流基准为额定相电流峰值，Sb = 3/2 Vb Ib。
- PI 为 C(s) = Kp + 1/(Ti s)，积分支路不乘 Kp。

以下电感方程使用物理单位：

    L did/dt = ud − vd − R id + ωL iq
    L diq/dt = uq − vq − R iq − ωL id

对应控制律：

    ud* = Hv vd + Cd(id* − Hi id) − ωL Hi iq
    uq* = Hv vq + Cq(iq* − Hi iq) + ωL Hi id

标幺控制律中的 ωL 换为 (ω/ωb)Lpu。理想测量时解耦项严格消去轴间耦合；有限电流滤波会留下残余耦合，当前单轴频响忽略该残余。

## 电流方向反转

令 j = −i（从电网流向逆变器），保持电压与 Park 变换不变：

    L djd/dt = vd − ud − R jd + ωL jq
    L djq/dt = vq − uq − R jq − ωL jd
    ud* = Hv vd − Cd(jd* − Hi jd) + ωL Hi jq
    uq* = Hv vq − Cq(jq* − Hi jq) − ωL Hi jd

同时 jd* = −id*、jq* = −iq*，PI 积分状态也按坐标变换。负的电流对象与负的 PI 电压极性相消，因此同基准下的 Kp、Ti 和闭环频响不变。若仅反转传感器或仅改变 PI 输出负号，反馈极性错误，不能沿用原闭环稳定结论。

最直接的对接方式是先将反向测得的两轴电流取负，后续完全使用本工具的约定；功率反馈和功率给定也必须统一为注入方向。

## 外环极性

外环误差统一为“给定 − 滤波测量”；P/Q 仍定义为注入电网，Vdc/Vac 为正电压幅值：

| 模式 | 当前 i 坐标对象符号 | 当前外环输出极性 | 反向 j 坐标外环输出极性 |
|---|---:|---:|---:|
| P | + | + | − |
| Q | − | − | + |
| Vdc | −（母线能量积分） | − | + |
| Vac | −（感性电网额定点近似） | − | + |

若 P/Q 的正方向也随电流一起改为吸收方向，功率对象和给定必须重新对应，不能直接套用表内 P/Q 的极性。

若只反转 q 轴，则 Q 公式及交叉解耦项符号也会变。若交换 d/q 轴，通道需要对应交换；仅称“标准 dq”不足以确定符号。

## PI 参数是否可直接使用

纯符号转换且同基准、同 PI 结构、同滤波/延时/对象时，数值增益可沿用。改变输入或输出基准会缩放增益：如果 e_new = a e_old、u_new = b u_old，则 Kp_new = (b/a)Kp_old，Ki_new = (b/a)Ki_old，Ti_new = (a/b)Ti_old。极性单独处理。

若目标 PI 为 Kp(1 + 1/(Ti_series s))，应使用 Ti_series = Kp × Ti_parallel，不能直接复制本页 Ti。电流环 PI 输出是归一化电压，若目标直接输出调制比且未执行电压归一化，也必须转换增益。

## 校核及边界

`tests/dq-conventions.test.js` 从 abc 的 RL 电压关系验证 Park 方程，检查反向坐标的实际电压命令一致，并在 P/Vdc、Q/Vac 四种模式组合和多个频率下，将保留正负号的闭环计算与工具频响比较。

这些校核说明本工具内部符号自洽，不代表任意外部仿真接线自动正确。整定仍基于额定点、理想 PLL、连续 PI 和单轴解耦近似；不覆盖 PLL、网络谐振、饱和和完整离散实现。

Park 变换定义可对照 [MathWorks Park Transform](https://www.mathworks.com/help/simscape-electrical/ref/parktransform.html) 的 d 轴对齐、幅值不变选项。以上电感和方向转换由 KVL 推导。
