# GFL / GFM 整定工具第一阶段：网络建模与 Grid Strength

状态：用户已批准，第一版已实现。实现记录见 docs/verification.md。

## 1. 目标与边界

复用 Branch Builder 的图形编辑能力，建立三相平衡网络，以选定 PCC 为观测点，计算电网侧正序 Thevenin 阻抗、短路容量和 SCR，为后续 GFL/GFM PI 整定提供网络基础。

V1 仅包含用户规定的八种元件：Ideal AC Voltage Source、Series RL、Ideal Transformer、RC Filter、GFL Inverter、GFM Inverter、DC Voltage Source + R、Bus/PCC。不实现 EMT、PI/PLL 整定、旧节点方程求解、黑盒、N-port、打包或代码生成。

用户提供的第一阶段需求是功能依据。用户已确认：RC 不计入 SCR 并明确提示；新项目使用独立目录和独立 Git 仓库，不改动原项目。其他实现细节为建议设计。

## 2. 现有代码检查与复用清单

基线：`codex/ui-engineering-polish`，HEAD `661856b`；检查时工作区无未提交修改。项目没有 package.json，前端为原生 JavaScript + SVG，主要集中在约 1.78 万行的 `index.html`；服务入口为 `local_server.py` 和 `server.js`。

下面的行号对应检查时的基线，仅用于追溯。

| 能力 | 现有位置 | V1 处理 |
| --- | --- | --- |
| 编辑状态、画布状态 | index.html:3193、3530 | 保留状态管理方式，增加独立电气数据 |
| 端口连线、吸附、导线处理 | connectTerminals:4994 起 | 迁移复用，适配 AC/DC 端口类型 |
| 连接节点归并 | netGroups:5348 附近 | 复用并查集思路与代码；抽成不依赖全局 state 的函数 |
| 工程序列化与加载 | circuitStateJson、loadCircuitState:7245 | 复用布局及连接序列化；新增独立格式标识和版本 |
| 复制粘贴 | copySelectedBranches:7761、pasteCopiedBranches:7786 | 保留 ID 重映射及内部导线复制；增加电气元数据复制 |
| SVG 元件及导线绘制 | renderBranches:15922、renderWires:16796 | 保留定位、选中、拖动及导线路由，替换符号和参数绑定 |
| 平移、缩放、键盘及鼠标操作 | 17093 起 | 迁移复用并做交互回归 |
| 撤销、重做 | snapshot:17707、restore、undo、redo | 保留机制，覆盖电气参数与 PCC 标记 |
| 旧结果、求解、打包、代码导出 | renderOutput、buildReducedPayload 等 | 新入口不加载、不调用；旧工具保留 |

当前不是一个可直接 import 的独立编辑器库；简单加载旧页面再添加面板会保留大量旧计算副作用。`netGroups()` 的 N1/N2 等编号按当前枚举生成，不适合用作永久 PCC 身份。

## 3. 三种实现方式与建议

1. **建议：独立入口 + 迁移复用编辑器实现。** 新增 `grid-strength/index.html`，把实际需要的画布、连接、历史和存储代码迁移为模块，保留来源说明。旧入口先保持原状；核心电气算法使用原生 JS ES modules，浏览器和 Node 单元测试共用。代价是短期存在两份编辑器代码，后续再评估统一共享。
2. 原页面增加分析模式。初期代码移动少，但大量旧的 render、参数面板和计算缓存需要分支隔离，较易出现误触旧求解流程的问题。
3. 同时把旧、新入口改成共享编辑器。长期维护更好，但 V1 需要覆盖原工具的大量回归范围，明显扩大此次改动。

新项目位于 `E:\gfl_gfm_tuner`，具有独立 `.git`，初始分支为 `main`。原项目 `E:\network_node` 仅作为只读参考源。后续迁移以原项目 HEAD `661856b` 为来源，记录复用文件及函数，不修改原项目或引用其可变运行时文件。

## 4. 模块清单

保留：现有工程及旧入口、成熟交互实现与操作习惯、画布布局及端口连接表示方式。

从新应用移除：G/Ihis 编辑器、符号求解调用、黑盒/N-port/YBox 工具栏、各类代码导出及计算缓存。这里的移除只针对新应用的依赖和 UI，不删除旧项目的功能源码。

新增目录：

```text
grid-strength/
  index.html
  core/network/       # 端口归并、拓扑、径向检查、稳定关联
  core/electrical/    # SI、复数、RL/RC、变比、标幺、Ssc/SCR
  components/         # 八种元件定义、参数字段、符号与端口
  analysis/           # PCC 解析、电源路径、校验、贡献项
  ui/                 # 迁移的编辑器、参数面板、分析面板
  project/            # 文件格式、验证、保存、导入
  examples/           # 单级、多级变压器与理想源示例
tests/grid-strength/  # 计算、拓扑、存储与必要交互回归
```

核心层不引用 DOM、UI state 或 Python 求解服务。是否调整静态服务的 JS MIME 类型和路径处理，在实施时按模块加载需要确定。

## 5. 数据结构

采用三相平衡单线图：每个 AC 端口代表三相母线的正序连接；不把单相旧模型的 A/B 端口电气语义直接套用于新模型。

```text
Project {
  format: "grid-strength", schemaVersion: 1,
  id, name, frequencyHz: 60,
  components: Component[], wires: Wire[],
  editor: { positions, rotations, viewCenter, zoom, groups },
  extensions: {}
}
Component {
  id, type, name,
  ports: [{ id, domain: "ac" | "dc" }],
  parametersSI: {...},
  extensions: {}
}
Wire { id, from: { componentId, portId }, to: {...}, routing }
BusParameters { ratedVoltageV, isPcc, primaryIbrId }
InverterParameters {
  ratedApparentPowerVA, ratedActivePowerW, ratedReactivePowerVar,
  ratedAcVoltageV, activePowerW, reactivePowerVar,
  filterResistanceOhm, filterInductanceH
}
```

控制器扩展保存在命名空间明确的 `extensions.control` 中，V1 不解释、不执行。单位不依赖显示标签；字段名称带 SI 单位后缀。完整实现需为八种元件分别定义允许字段及验证器。

Bus/PCC 是具有稳定 component ID 的显式元件，绑定其 AC 端口。导线归并产生派生电气节点；不会把易变的 N 编号保存为 PCC 的永久引用。没有显式 Bus 的等电位连接也自动识别为派生母线。相同节点上的多个 Bus 标记必须电压一致。

逆变器包含 AC 及可选 DC 端口。DC 源支路与 AC 图隔离，非法跨域导线被拒绝。RC 采用一个 AC 接入端和隐含中性点的固定并联串联 RC 支路。

V1 选择与 PCC 同一 AC 节点上的一个主要 IBR；多个候选时要求明确选择，不能静默用首个或 operating P。没有候选时仍可显示 Zth/Ssc，SCR 显示缺少额定容量。内部 Rf/Lf 属于逆变器侧参数，不计入 PCC 向电网侧的路径阻抗。

新格式保存全部参数、连接与布局；导入先完整校验，成功后一次替换，失败保留原工程。旧 Branch Builder 符号参数无法可靠自动转换为 R/L，V1 不承诺旧电气模型无损自动迁移；识别旧文件并给出明确提示。

## 6. 计算契约

```text
analyzeGridStrength(project, pccId) ->
  { status, errors[], warnings[], assumptions[],
    pcc, sourceId, primaryIbrId, voltageBaseV, powerBaseVA,
    upstreamComponentIds[], upstreamWireIds[],
    zTheveninOhm: { re, im }, magnitudeOhm, xr,
    zBaseOhm, zTheveninPu: { re, im },
    shortCircuitVA, scr, contributions[] }
```

1. 验证数值有限、必需字段及端口引用。拒绝负 R/L、非正电压/频率/S/C、非法变比、重复 ID 与 AC/DC 混接。
2. 归并导线端口，建立 AC 母线图。提取选定 PCC 的相关连通分量，检查孤立 PCC、无上游电源、多电源、环网或多条上游路径。V1 不对不支持的拓扑挑一条路径后给出貌似可靠的 SCR。
3. 沿唯一径向电源路径分析，按变压器 primary/secondary 端口决定方向。频率以工程值为准，源频率必须一致；从源沿变比传播标称电压并与显式 Bus/PCC 及逆变器额定电压核对，初始相对容差建议 0.1%。
4. 每个 Series RL 在其本侧为 `R + j*2*pi*f*L`，乘以该元件至 PCC 的累计电压比平方，折算到 PCC 后进行复数相加。变压器本体贡献为零，但记录折算倍率。
5. 以 PCC 额定线电压及主要 IBR 的三相额定 S 为默认基值，`Zbase = V_LL^2 / Sbase`。无 IBR 时不生成依赖 Sbase 的标幺结果。`Ssc = V_LL^2 / abs(Zth)`，`SCR = Ssc / S_rated`。不附加系数 3，不使用 operating P/Q。
6. 对有限正 X 且 R=0，X/R 显示无穷；R=X=0 时 X/R 显示不适用。零 Zth 返回结构化 `ideal-grid` 状态，UI 显示 `Theoretical SCR = Infinity` 及原因；不让 JSON 保存 NaN/Infinity，派生结果可重新计算。

贡献项保存本侧阻抗、折算系数、PCC 侧复阻抗及标幺复阻抗。总阻抗是复数相加的模，不是各项阻抗幅值之和。

## 7. 已确认的 RC 口径

用户已确认 V1 定义为“上游串联电网路径等效”：RC 参数合法性和当前频率支路阻抗仍计算和显示，但 RC 不进入 Zth/SCR，结果面板明确显示这一假设及排除的 RC 元件。

RC 参与驱动点阻抗的计算不属于 V1；后续如扩展，需要另行定义径向网络约简和支路贡献规则。

## 8. 界面与交互

左侧只显示八种元件；中央保留现有 SVG 操作；右侧区分参数与 Analysis。Bus 可标为 PCC，选择 PCC 后点击 Calculate Grid Strength。

结果显示 PCC 额定电压、IBR 名称和额定 MVA、operating P/Q、Rth/Xth/模/XR、基值与 pu、Ssc/SCR。工程变化立即使旧结果失效，避免修改参数后继续展示旧结论。

计算成功高亮参与路径和导线；贡献项点击定位并选中元件。错误给出具体元件及原因，能够定位时支持跳转。多个 PCC 独立选择和计算，不混用分析状态。

## 9. 验证与实施顺序

先建立可重复的编辑器交互检查，再迁移交互和存储；随后实现核心模型、纯计算测试与新 UI 集成。不能仅以页面能打开宣称通用交互未破坏。

计算自动测试至少覆盖用户的六项：单 RL、一级变压器、多级变压器、零阻抗无限 SCR、断网报错、改变 P/Q 不改变 SCR。额外覆盖变压器反方向、混合电压等级、单位换算、多源、环网、无效参数、多个 IBR、RC 选定口径及零电阻 X/R。

手算基准示例：PCC=10 kV、S=100 MVA、R=0.6 ohm、X=0.8 ohm，取 L=0.8/(2*pi*60) H，则 |Z|=1 ohm、Ssc=100 MVA、SCR=1。变压器测试用明确的 10:1 等变比和固定预期数值，避免测试仅重复生产公式。

存储测试覆盖保存/导入往返、粘贴 ID 重映射、PCC 身份在删除其他元件后保持、参数与拓扑撤销重做、导入失败不覆盖已有工程。浏览器检查覆盖放置、吸附连线、移动、框选、复制、删除、撤销重做、缩放平移、参数编辑、路径高亮及贡献项定位。

验收时提供可运行入口、启动说明、示例工程和实际测试结果。设计确认不代表已完成交互回归或计算验证。
