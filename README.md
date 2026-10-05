# Gridcraft Beta · GFL / GFM Network Lab

版本：**0.2.0-beta.1**。独立的浏览器端电网与变流器设计工具，包含网络编辑、SCR、滤波电感/PWM FFT、RC 滤波与谐振、DC 电压/电容设计及 GFL PI 整定。

本项目是独立 Git 仓库，运行时不依赖 Branch Builder / network_node，也不读取它的文件。编辑器迁移来源见 [PROVENANCE](docs/PROVENANCE.md)。

## 网页部署

**可完全静态部署，无应用后端、数据库、服务器端计算或运行时第三方包。**

- 已准备的发布目录：`dist/`（由发布脚本生成，不提交重复产物）。
- 构建命令：`npm run build`；无需 `npm install`，构建只复制允许发布的文件。
- 发布入口：`index.html`；先选择 GFL，再进入 `gfl.html?ibr=PV1`。
- 支持子路径部署，例如 `/tools/gridcraft-beta/`；资源和页面链接使用相对路径。
- 详细交接：[DEPLOYMENT_HANDOFF.md](DEPLOYMENT_HANDOFF.md)。

## 本地使用

1. 从 GitHub 下载 ZIP，**完整解压**后进入项目文件夹。
2. 双击 `start.bat`：自动检测 Python、启动静态服务，确认就绪后打开默认浏览器。
3. 使用时保持启动窗口打开；关闭窗口或按 Ctrl+C 即可停止。

需要 Python 3.9+；未安装时脚本会显示官方下载地址和 PATH 提示。不需要 Node、npm install 或第三方 Python 包。重复双击会复用同一目录已启动的服务；默认端口 4189 被其他程序占用时尝试后续端口并提示（浏览器数据按端口隔离）。支持中文和带空格的项目路径。也可运行 `python scripts/launch.py`；`npm start` 保留为普通静态服务命令。

Python 仅用于本地预览；线上静态站点的用户不需要安装 Python 或 Node。

## 默认 PV 范例

Vdc / Vac 模式；独立总等效 Cbus 64000 μF；控制步长 50 μs，等效延时 0。P/Q、Vdc、交流电压滤波各 10 ms，电流滤波 1 ms。PI 采用 `Kp + 1/(Ti*s)`，Ti 为秒、积分支路不乘 Kp。已保存当前自动整定参数和电气参数；载入 PVFarm 范例即可恢复。

输入在 PI 页顶部横向分组，窄屏自动换行。自动整定使用测量滤波与内环闭环模型，目标相位裕度至少 60°，必要时降低实际交越频率。

## 校核

```sh
npm test
npm run audit:static
npm run build
```

PI 案例比较：[报告](docs/validation/pi-comparison.md)、[图](docs/validation/pi-step-comparison.png)。离线复现 `npm run compare:pi` 需要 Python、NumPy、SciPy、Matplotlib；这些仅用于开发验证，不进入网页发布文件。

## 数据与范围

工程数据保存在浏览器 localStorage，JSON 导入/导出用于备份与跨域迁移。无账号、云同步或自动服务器备份。请在切换域名/端口前导出需要的工程。

三相平衡、正序阻抗与 SI 单位。SCR 分析有径向单电源约束；RC 谐振和 PI 是分开的分析模型。PI 为额定点连续小信号、理想 PLL / 解耦模型；Vac 使用静态 Xth/Zb 灵敏度。稳定性结果不等同于完整电磁暂态仿真认证，不含限幅、PLL 或 RC 网络耦合动态。
