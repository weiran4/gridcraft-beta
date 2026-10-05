# Offline verification only. No Python dependency in the web application.
import json
from pathlib import Path
import numpy as np
from scipy import signal
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=Path(__file__).resolve().parent.parent
out=root/'docs'/'validation'
data=json.loads((out/'pi-comparison-data.json').read_text())
p=data['input']; Z=p['voltageLL']**2/p['ratedVA']; L=p['L']; R=p['R']; Hi=p['filterCurrentMs']/1000
Kdc=p['ratedVA']/(p['dcCapacitanceF']*p['dcVoltage']**2); Kvac=p['gridXOhm']/Z

def inner(g):
    # Physical states: current, PI integrator output, filtered current.
    kp,ki=g['kp'],g['ki']
    return np.array([[-R/L,Z/L,-Z*kp/L],[0,0,-ki],[1/Hi,0,-1/Hi]]),np.array([Z*kp/L,ki,0.]),np.array([1.,0,0])

def system(g,k):
    if k in ['d','q']: return inner(g[k])
    A,B,C=inner(g['d' if k=='P' else 'q']); kp,ki=g[k]['kp'],g[k]['ki']
    n=6 if k=='P' else 5
    F=np.zeros((n,n)); U=np.zeros(n); Y=np.zeros(n); F[:3,:3]=A
    if k=='P':
        sensor,integral=4,5
        F[3,:3]=Kdc*C; F[4,3]=1/(p['filterVdcMs']/1000);F[4,4]=-F[4,3]; Y[3]=1
    else:
        sensor,integral=3,4
        F[3,:3]=Kvac*C/(p['filterVoltageMs']/1000);F[3,3]=-1/(p['filterVoltageMs']/1000); Y[:3]=Kvac*C
    F[:3,sensor]=-B*kp; F[:3,integral]=B; U[:3]=B*kp
    F[integral,sensor]=-ki; U[integral]=ki
    return F,U,Y

labels={'d':'d current','q':'q current','P':'Vdc','Q':'Vac'}
t=np.arange(0,2.000025,50e-6)
fig,axs=plt.subplots(2,2,figsize=(11,7)); metrics={}
for name,item in data['results'].items():
    metrics[name]={}
    for k,ax in zip(['d','q','P','Q'],axs.flat):
        A,B,C=system(item['gains'],k); poles=np.linalg.eigvals(A); expected=np.roots(item['polynomials'][k][::-1])
        assert max(poles.real)<0, (name,k,poles)
        assert max(min(abs(x-poles)) for x in expected)<1e-5, (name,k,'polynomial mismatch')
        _,y=signal.step(signal.StateSpace(A,B[:,None],C[None,:],np.zeros((1,1))),T=t)
        dc=float((-C@np.linalg.solve(A,B)).item()); assert abs(dc-1)<1e-7
        outside=np.flatnonzero(abs(y-1)>.02)
        settling=float(t[outside[-1]+1]) if len(outside) and outside[-1]+1<len(t) else None
        rise=float(t[np.flatnonzero(y>=.9)[0]]-t[np.flatnonzero(y>=.1)[0]])
        f=item['crossings'][k][0]
        metrics[name][k]={'kp':item['gains'][k]['kp'],'tiSeconds':1/item['gains'][k]['ki'],'crossoverHz':f['frequency'],'phaseMarginDeg':f['margin'],'maxPoleReal':float(max(poles.real)),'overshootPercent':float(max(0,y.max()-1)*100),'rise10to90Ms':rise*1000,'settling2PercentMs':settling*1000 if settling is not None else None,'stable':True,'meets60Degrees':f['margin']>=59.99}
        ax.plot(t*1000,y,label='Simulation case' if name=='simulation' else 'Automatic (60 deg target)',lw=1.5)
        ax.set_xlim(0,100 if k in ['d','q'] else 650); ax.set_title(labels[k]);ax.set_xlabel('Time / ms');ax.set_ylabel('Normalized output'); ax.axhline(1,color='grey',ls=':',lw=.8);ax.grid(alpha=.2)
for ax in axs.flat: ax.legend(fontsize=8)
fig.suptitle('Same plant and sensors | Ts = 50 us | equivalent delay = 0\nLinear reference steps; no saturation, PLL or network dynamics')
fig.tight_layout();fig.savefig(out/'pi-step-comparison.png',dpi=160);plt.close(fig)
(out/'pi-comparison-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
rows=[]
for k in labels:
    for name in metrics:
        m=metrics[name][k];title='案例' if name=='simulation' else '自动整定'
        rows.append(f"| {labels[k]} | {title} | {m['crossoverHz']:.2f} | {m['phaseMarginDeg']:.2f} | {m['overshootPercent']:.2f}% | {m['rise10to90Ms']:.2f} | {m['settling2PercentMs']:.2f} |")
report='''# PV 案例 PI 与自动整定比较

日期：2026-10-04。此报告比较工具内同一连续小信号模型，不冒充 RSCAD 实测结果。

## 共同条件与判据

S=1 MVA，VLL=315 V，Lf=63 μH，Rf=1 μΩ，Vdc=800 V，Cbus=0.064 F；Xth=0.0366947423694 Ω。控制步长 50 μs，等效延时 0；电流滤波 1 ms，Vdc / Vac 滤波各 10 ms。步长仅用于时间采样及频率上限，不是精确离散控制仿真。未改变案例给定的 PI 数值。

PI 为 Kp + 1/(Ti*s)，积分支路不乘 Kp。案例 d: 1.5/0.02 s，q: 1/0.02 s，Vdc: 5/0.01 s，Vac: 2/0.01 s。自动参数来自保存的 beta 范例和同一整定引擎。

判据分开：闭环极点实部全部小于 0 表示本模型稳定；60° 是工具自动整定采用的裕度目标，45° 为页面原有警示阈值，两者不是通用强制标准。未预设超调和稳定时间限值，所以这些指标用于比较，不作为凭空新增的合格标准。

## 数值结果

| 环路 | 参数组 | 交越 Hz | 裕度 ° | 超调 | 10–90% 上升 ms | ±2% 稳定 ms |
|---|---|---:|---:|---:|---:|---:|
'''+ '\n'.join(rows)+'''

![同一模型的线性阶跃比较](pi-step-comparison.png)

## 结论

- 两组在此模型下全部稳定；独立状态空间特征值与工具闭环特征多项式根相互吻合。
- 案例 d、q、Vdc 的相位裕度低于 45°，不满足当前 60° 自动整定目标；Vac 裕度充足。
- 案例更快达到首次响应，但速度不等于振荡更小或稳定时间更短，应分别看表中的上升与稳定时间。
- 自动策略并非所有环路、所有指标都更好：尤其 Vac 案例本身具有很高的裕度；自动策略选择另一组速度、超调和积分强度折中。
- 60° 固定策略给出一组可用参数，不是唯一或全局最优参数。不能只凭增益数值大小比较 PI。

## 可复现性与范围

运行 `npm run compare:pi`。Node 使用本项目模型生成增益、频响和特征多项式；Python 用独立的电流、积分器和测量滤波状态方程构建闭环，SciPy 求线性阶跃，NumPy 验证极点。2 s 记录、50 μs 采样；±2% 稳定时间取最后一次离开误差带之后的时刻。曲线为单位化小信号响应，不能据此评估大阶跃限幅、调制饱和、PLL、RC 谐振、残余 dq 耦合或真实离散实现。

Python、NumPy、SciPy 和 Matplotlib 仅用于本报告离线复核，不参与浏览器运行，也不进入静态发布目录。
'''
(out/'pi-comparison.md').write_text(report,encoding='utf-8')
print(json.dumps(metrics,indent=2))
