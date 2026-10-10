# GFL Tuning Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变原电气/控制模型和已保存增益的前提下，增加可解释的 GFL PI 候选搜索、目标可行性诊断与明确的比较/应用流程。

**Architecture:** 保留 `autoTuneGfl` 作为原策略回归基线。新增纯函数输入适配、模型评价、预算受控搜索和预览状态模块；搜索在 Worker 内执行，只有明确应用才写回当前逆变器。沿用现有页面、同步存储、复数/多项式及图表工具。

**Tech Stack:** 浏览器原生 ES modules、Web Worker、现有 SVG/HTML/CSS；Node.js 原生测试；开发期 SciPy 独立数值对照，不成为在线依赖。

**Spec:** `docs/superpowers/specs/2026-10-06-gfl-tuning-advisor-design.md`。

**Status:** 实施计划待审阅；下列代码任务尚未执行。本次文档提交不是新版整定器。

**Base:** `8897496aa6b66aca2d8def4337e96c735054edaf`；工作分支 `feat/gfl-tuning-advisor`。执行方法已由用户指定：由当前助手实施并通过 PR 交付，不要求本地 AI。

## Global Constraints

- 只改变 GFL 整定/诊断/展示及相关测试；不增加 PLL、dq 耦合、GFM、EMT、FRT 或其他元件算法。
- 不变更 `I=GV+Ihis`、原单位约定或功率正方向；保存 Ki，界面 Ti=1/Ki。
- 用户工程、RLC、DC 电压/电容、测量滤波、控制周期和显式延时不由搜索修改。
- 旧工程加载、浏览、搜索、切换 Bode 不能替换既有 PI；应用/恢复必须是明确动作。
- 稳定性和硬约束优先于交越目标；目标未达不是输入错误，搜索失败不阻断合法手动 PI 分析。
- 默认保留 60° 优选裕度与 5 倍级联间隔；二者都是展示清楚的工程策略，不是标准要求。未得到用户授权时不得放宽硬裕度下限。
- 非零纯延时仅按实际覆盖范围给出频域筛查；不使用零延时极点证明有延时系统稳定。
- 不声称静态能力/单通道模型证明 HIL 实测、完整弱网稳定或标准合规。未定义的扰动/不确定性验证保持未评估。
- 不修改或合并 main，不发布 Pages，不增加外部在线计算服务。PR 未完成测试前保持 Draft。

## Review Focus

1. 同步标签页或模型参数在 Worker 运行中变化：旧候选过期，不能覆盖新工程（任务 5/6）。
2. Ki=0、R=0、测量滤波旁路、重复/接近极点：当前合法手动 PI 仍可分析；不伪造推荐或时域指标（任务 2/3）。
3. 缺失参数、null 与显式零值不同：不把未知延时/滤波默认为已验证的零；旧默认值带来源标记（任务 1）。
4. 极低目标、多次交越、无交越、纯延时和病态多项式：返回覆盖/数值状态，不以单个 PM 宣称稳定（任务 2/4）。
5. P/Q 与 Vdc/Vac 模式切换和新建无增益元件：各模式银行保留；新模式只有预览、未应用标记（任务 5/6）。

## 文件与公共接口

| 文件 | 职责 |
|---|---|
| `analysis/gfl-model-input.js` | 提取事实参数、来源、模型适用性；将模型验证与整定目标验证分开 |
| `analysis/gfl-linear-model.js` | 生成当前模型的零延时物理输出/测量输出有理传递函数 |
| `analysis/gfl-linear-evaluation.js` | 交越、极点、带宽和覆盖状态；频响仍调用原 `loopResponse` |
| `analysis/gfl-step-metrics.js` | 零延时小信号阶跃与数值可靠性检查 |
| `analysis/gfl-tuning-search.js` | 两种模式的候选生成、全频域筛查与排序 |
| `analysis/gfl-tuning-diagnostics.js` | 字段、模型、策略及目标限制原因的结构化输出 |
| `project/gfl-tuning-state.js` | 基线/预览/应用/过期状态及只修改目标 IBR 的事务 |
| `ui/gfl-tuning-worker.js` | 快照化搜索和可取消任务，不写入 localStorage |
| `ui/gfl-tuning-panel.js` | 输入目标、比较表、结果解释及按钮绑定 |
| `ui/gfl-design.js`, `gfl.html`, `ui/gfl-design.css` | 接入现有页面，不再在 refresh 中强制自动整定 |
| `tests/gfl-advisor-*.test.js` | 输入、数值、候选、状态和页面接入回归 |
| `tests/fixtures/PV_Grid_Demo.json` | 原用户案例，校验来源散列，不作为网页自动加载工程 |
| `scripts/validate-gfl-advisor.mjs`, `scripts/validate-gfl-advisor.py` | 输出数值对照数据，并用 SciPy 独立核对 |
| `.github/workflows/gfl-advisor-checks.yml` | 仅 PR 的测试与构建，不部署网站 |

公共结构：`Gains={d,q,P,Q}`，每项含非负有限 `kp,ki`；P/Q 为内部通道键，显示标签由外环模式确定。

`ContextResult={inputStatus,modelInput,sourceMap,diagnostics}`。诊断项为 `{code,severity,field,message,evidence}`，其中 evidence 区分计算结果、用户输入和工程预设。

`Evaluation={modelCoverage,loops,stability,diagnostics}`；每个 loop 含 `crossings[]`、`bandwidth`、`step` 和各项 `status`。未知/数值失败不是 0。

`TuningResult={policyId,policyVersion,snapshotKey,searchStatus,targetStatus,candidates,diagnostics,budget}`。候选包含输入快照、四组增益、各通道实际评价、未满足的硬/软目标；不输出裸 gains 冒充目标通过。

## Task 1: 固定真实案例，拆分事实/目标校验

**Files:** 新建 `analysis/gfl-model-input.js`、`tests/gfl-advisor-input.test.js`、`tests/fixtures/PV_Grid_Demo.json`；仅在必要时为 `analysis/gfl-outer.js` 增加不依赖目标频率的模型描述接口，保留原 `outerModels` 行为供旧算法使用。

**Interfaces:** `readGflModelInput(project,ibrId,settings):ContextResult`；`validateTuningRequest(request):{valid,errors}`。复用 `getGfl`、`connectedDc`、`outerContext`；不得另写一套上游阻抗或单位算法。

- [ ] 写失败测试：原文件 SHA-256 为 `1982d9f5a1c0c59e058ad42fc6b50a876c41da29e2aaa048dac49b3a5d25a972`；完整工程导入后 8 个增益与旧算法精确一致；SCR 与原 `outerContext` 一致；原工程序列化前后完全相同。
- [ ] 运行 `node --test tests/gfl-advisor-input.test.js`，确认新接口缺失导致失败；不要修改旧测试以掩盖行为变化。
- [ ] 实现模型事实与目标验证分离。无目标的自动模式、非法性能目标都不应阻止合法现有 PI 的模型评价。零电流滤波可旁路；负值无效；缺失/空值提供来源和不足提示。将原 helper 所需的初始化参数与用户未指定目标区分。
- [ ] 验证 `node --test tests/gfl-advisor-input.test.js tests/gfl-autotune.test.js`。补充 Vdc 缺电容、Vac 无电网灵敏度、控制周期单位、缺失 delaySamples 与显式 0 的断言。
- [ ] Commit: `test(gfl): pin PV1 baseline and separate model inputs from tuning goals`。

## Task 2: 统一频响与零延时闭环模型评价

**Files:** 新建 `analysis/gfl-linear-model.js`、`analysis/gfl-linear-evaluation.js`、`tests/gfl-advisor-evaluation.test.js`。复用 `analysis/eigenvalues.js`；原 `gfl-frequency.js` 与旧 `autoTuneGfl` 默认行为保持不变。

**Interfaces:** `gflLinearModels(input,gains):{d,q,P,Q}`（每项 `numerator,denominator,measurementNumerator,measurementDenominator`，升幂系数）；`evaluateGfl(input,gains,options={}):Evaluation`。非零延时下禁止调用零延时多项式作为稳定证明。

- [ ] 写失败测试：PV1 在 0.1、1、5、50、200、1000 Hz 的有理物理输出与原 `loopResponse(...).closed` 归一化误差 <1e-8；各传感输出须等于物理输出乘该反馈滤波器。
- [ ] 运行 `node --test tests/gfl-advisor-evaluation.test.js`，确认先失败。
- [ ] 实现局部 RL 与电网/RC 两种传递函数表达，分母对照 `closedLoopPolynomials`。去掉严格为零的首尾系数，处理合法纯 P/关环退化而不凭近似消零极点隐藏不稳定模态。按时间尺度平衡伴随矩阵后复用现有特征值函数，检查归一化根残差；数值未收敛返回 numericalFailure。
- [ ] 对数频扫包含所有目标和 PI 零点下方至少 3 个 decade；高端至少覆盖当前图域 fs/2。正弦纯延时按连续展开后的相位评价。对穿越段二分细化，保留上穿/下穿及切触/不确定标记；最低点已在 0 dB 以下时扩大低频段或显式报告域不足。带宽以解析 DC 增益作参考，不使用最后采样点。
- [ ] 测试：基线内环 7.2122177636 Hz 与外环 1.4424435527 Hz 在 1e-4 相对误差内；低于 0.1 Hz 的交越不遗漏；多交越不自动等于不稳定；非零延时没有零延时稳定标记；病态根、无交越、Ki=0、R=0、滤波全旁路状态明确。通过后 commit：`feat(gfl): add model-scoped loop evaluation and complete crossover reporting`。

## Task 3: 小信号时域指标与独立数值对照

**Files:** 新建 `analysis/gfl-step-metrics.js`、`tests/gfl-advisor-step.test.js`、`scripts/validate-gfl-advisor.mjs`、`scripts/validate-gfl-advisor.py`，将公开可复核预期值存入 `tests/fixtures/gfl-advisor-reference.json`。

**Interfaces:** `linearStepMetrics(model,options={}):{status,dcGain,riseTimeSeconds,overshootPercent,settlingTimeSeconds,windowSeconds,points,verification}`。消费任务 2 的有理模型，不重用一份未核对的独立近似对象。

- [ ] 写失败测试：一阶 1/(1+sT) 的 10–90% 上升时间为 ln(9)T，±2% 稳定时间为 -ln(0.02)T；常数增益、零增益、重复极点、带直通项分别定义结果，单位均为秒/百分比。
- [ ] 运行 `node --test tests/gfl-advisor-step.test.js`，确认失败；先查阅拟用数值方法原始资料，不引入不可追溯的高阶求根/积分器。
- [ ] 实现小规模连续线性状态空间阶跃：使用适合刚性线性系统的、经过独立对照的矩阵指数传播，避免把数十微秒固定步长用于所有慢工况。初值包含直通项；最终值来自解析 DC 增益；自适应观察窗和加密网格后比较指标。达到预算仍未稳定返回 windowExceeded，不填一个虚假的稳定时间。
- [ ] 独立 SciPy 对照：PV1 基线 Vdc 稳定时间约 1.4087 s、超调约 12.259%；50 Hz 内环探测约 0.35465 s、16.40%。稳定时间容差 max(2 ms,1%)、超调容差 0.2 个百分点；频响先通过任务 2 的误差限，再比较指标。非零延时不生成该零延时阶跃。
- [ ] 运行上述测试和 `node scripts/validate-gfl-advisor.mjs && python scripts/validate-gfl-advisor.py`，保留版本与实际误差，commit：`feat(gfl): evaluate physical-output step metrics with independent numeric checks`。

## Task 4: 有预算的 PI 候选搜索与目标诊断

**Files:** 新建 `analysis/gfl-tuning-search.js`、`analysis/gfl-tuning-diagnostics.js`、`tests/gfl-advisor-search.test.js`。

**Interfaces:** `searchGflCandidates(input,request,baselineGains,options={}):TuningResult`；`diagnoseGfl(input,request,evaluation,searchResult):Diagnostic[]`。计算不能修改传入对象；支持 `onProgress` 和取消/预算信号。

- [ ] 写失败测试：同一 PV1 事实参数下，搜索必须包含 50 Hz、r=0.05 的探测或返回可核验的额外淘汰理由；外环指定 50 Hz、最低 40 Hz 时，1.44/5.19/10 Hz 不得标记目标满足；极小预算返回 budgetExceeded 而非物理不可行。
- [ ] 运行 `node --test tests/gfl-advisor-search.test.js`，确认新入口缺失造成失败。
- [ ] 实现两种请求：automatic 不要求 fi/fp；target 保留每类目标、容差、allowReduction 和最低接受值。默认 preferred/min margin 均为 60°，仅用户显式降低硬下限时放宽；默认 separationRatio=5，可编辑且显示工程策略。可选超调/稳定时间未填写时为 null，不制造用户要求。
- [ ] 搜索频率和 r：初始 log 网格 r∈[0.01,10]，显式包含 0.05/0.2/5；频率网格含用户目标、允许边界及 50 Hz 探测。自动模式默认频率搜索域 [0.01 Hz,fctrl/10]，外环受每个实际内环/5 限制；更低用户目标扩展搜索域。粗扫后对合格区域局部细化，缓存对象频响；所有上限与已探索范围输出在预算元数据中，不称全局最优。
- [ ] 先保留多个合格内环，再按各自物理闭环设计外环，最终复核四通道。多交越候选第一版排除推荐并解释；零延时必须通过闭环检验。延时模型只能输出待验证候选，不声称推荐的整体稳定性已证明；时域硬约束未评估时 targetStatus 不能 satisfied。
- [ ] 排序用独立状态：先完成硬约束与目标等级筛选，再按稳定时间、超调与最小裕度作 Pareto 淘汰；代表解最多三组，不凑数。balanced 在剩余候选的这三项归一化指标等权排序；tracking 优先稳定时间、同级再比较超调；扰动模式在没有明确定义的注入模型前禁用并解释。参数未知时不输出鲁棒性评分。
- [ ] 运行原整定测试与新搜索测试；输入 JSON 深冻结验证无变更，比较零延时/有延时/高滤波/低频/纯电阻不支持 Vac 等分支。Commit：`feat(gfl): search PI shapes and explain unmet crossover targets`。

## Task 5: 保留已存 PI，预览/应用/恢复事务

**Files:** 新建 `project/gfl-tuning-state.js`、`tests/gfl-advisor-state.test.js`。复用 `project/sync.js`，不全量重写工程。

**Interfaces:** `createTuningState(stored)`；`previewCandidate(state,candidate,snapshotKey)`；`applyCandidate(project,ibrId,state,currentSnapshotKey)`；`restoreAppliedGains(project,ibrId,state)`。前两者纯内存，后两者返回显式变更的新工程；持久化仍由现有 store 负责。

- [ ] 写失败测试：manual=false 的 PV1 加载后 8 个值逐项保持；搜索/预览不写工程；应用只改 `extensions.gflPi.PV1` 中授权的增益和整定元数据。
- [ ] 运行 `node --test tests/gfl-advisor-state.test.js`，确认失败。
- [ ] 实现基线/预览/已应用/过期状态；policyId 为 `gfl-tuning-advisor-v1`，新增元数据存于 `extensions.gflPi[id].advisor`，保留未知键和 gainBank。原始来源不明时显示旧策略/手动参数，不伪造新版已应用状态。
- [ ] 测试旧候选拒绝应用、其他标签页修改另一个元件不被覆盖、同元件输入变化使候选过期、模式切换各自增益恢复、无增益新模式为未应用、恢复仅还原前一组 PI 不回滚后续 RLC 修改。
- [ ] 保存/再加载再对比，commit：`fix(gfl): preserve stored gains and require explicit candidate application`。

## Task 6: 页面与 Worker 接入

**Files:** 新建 `ui/gfl-tuning-worker.js`、`ui/gfl-tuning-panel.js`、`tests/gfl-advisor-ui.test.js`；修改 `ui/gfl-design.js`、`gfl.html`、`ui/gfl-design.css`；只在接口确有必要时调整 `ui/gfl-diagram.js` 的可选推荐值显示。

**Interfaces:** Worker `{type:'search',requestId,snapshotKey,input,request,baselineGains}` → `{type:'progress'|'result'|'error',requestId,snapshotKey,...}`；面板 `mountGflTuningPanel(host,callbacks)` 返回 `render(model)` 和 `destroy()`。

- [ ] 写失败测试：分析当前手动 PI 不调用 search；autoTuneGfl 失败不会清空合法手动 PI 的 Bode；点击生成候选不触发应用或 save；旧响应/取消响应不更新界面。
- [ ] 运行 `node --test tests/gfl-advisor-ui.test.js`，确认失败；测试事件行为，不只检查源文件字符串。
- [ ] 拆 refresh 为读取/模型验证、当前评价、展示三个阶段。保留手动 Kp/Ti 编辑、单位和回电路链接；新增“自动推荐/指定目标”“分析当前”“生成候选”“应用所选”“恢复上次”及目标-当前-候选比较。旧 retune 不再承担隐式覆盖。
- [ ] 数学输入失效时灰显失效结果；目标非法、未找到候选仅影响搜索区；事实/目标/增益改变均过期化候选。取消使用 Worker terminate，进度和结果按 requestId/snapshotKey 核验。Worker 不可用时明确错误，不在主线程偷偷无限搜索。
- [ ] 导出新 schema 保留旧参数字段，增加覆盖、目标、实际评价、策略版本、来源和应用状态；没有运行搜索或搜索失败也能导出合法当前 PI。显示“未配置能力检查”“额定点近似”“未评估 PLL/双轴耦合”，不替用户调整事实参数。
- [ ] 浏览器检查 1440×900、1366×768 和窄屏：导入 PV1、分析、目标无解、生成候选、手动编辑、应用、恢复、刷新、双标签页、改变输入、取消；记录控制台错误和截图。通过后 commit：`feat(gfl): integrate explainable tuning previews into the existing workbench`。

## Task 7: 全仓回归、仅验证的 CI 与 PR 交付

**Files:** 新增 `.github/workflows/gfl-advisor-checks.yml` 和 `docs/validation/gfl-tuning-advisor.md`；必要时增加 `package.json` 的独立验证 script，不更改现有 Pages 部署逻辑。

**Interfaces:** 原 `npm test`、`npm run build`、`npm run audit:static` 继续有效；开发期独立 SciPy 检查不进入 dist。CI 仅 `pull_request`/相关分支 push，只有 contents:read，不包含 pages 或 id-token 写权限，不调用 deploy。

- [ ] 写/运行回归检查：dist 中新 Worker 及其全部 imports 均存在且版本指纹一致；原案例、编辑器、GFM 和 PQ 测试不回退；旧整定基线仍可复现。
- [ ] 完整运行 `npm test && npm run build && npm run audit:static`；再运行独立数值对照和浏览器回归。记录实际计数、退出码、版本和未完成项，不把 12 项旧诊断当全仓测试。
- [ ] 新 CI 只测试构建，不手动触发带部署的 pages.yml。容器若无法 clone，可在该验证 workflow 中通过 `git archive HEAD` 生成源码工件供读取；不得包含令牌、.git 配置或环境秘密。未取得完整源码时不得声明本地全仓测试已通过。
- [ ] 审阅 diff，确认仅授权文件和 PI 元数据变化。重新读取远端工作分支；存在新提交先核对，不强制推送或覆盖。提交验证结果到本 PR。
- [ ] 只有功能、数值、回归与浏览器检查满足后才请求转为 Ready；否则保持 Draft 并列出阻塞。任何合并/发布等待用户决定。

## 计划自审

规格 1/7 对应输入与模型边界；3/8 对应事务和页面；4 对应请求/状态；5 对应评价/搜索/时域；6 对应诊断；9 对应文件模块；10 的十二条验收均在任务 1–7 中有测试或明确的集成检查。

与原设计的明确细化：默认硬裕度保持 60°，不会自行让步；扰动侧重在第一版没有注入模型时禁用；数值和搜索预算失败保留 unknown/budgetExceeded 状态；非零延时结果不当作完成时域/稳定验证的推荐。这些不是新增物理假设。

开始代码任务前审阅本计划；当前用户已指定由助手执行，不需要再选择本地 AI 或执行工具。
