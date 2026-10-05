# 给网页部署 AI：Gridcraft Beta 上线交接

## 交付位置

- 独立项目：本仓库根目录
- **直接上传目录：`dist/`**，上传其中的内容，不要再额外包一层 dist。
- GitHub：`https://github.com/weiran4/gridcraft-beta`（私有仓库，需用户已有授权访问）。
- 当前交付：`main` 分支最新提交，包含 GFM 内环 PI。界面版本仍为 `0.2.0-beta.1`；旧标签 `v0.2.0-beta.1` 不含本次更新，请勿按旧标签部署。

## 部署方法

将 dist 内容作为普通 HTTPS 静态站点发布，或挂到现有网站的 `/tools/gridcraft-beta/` 子路径。

从 GitHub 拉取时，执行 `npm run build`，发布目录填 `dist`；无需安装依赖，Node 只运行文件复制脚本。也可以直接复制允许发布的文件：index.html、gfl.html、gfm.html、ui/、analysis/、components/、core/、project/、examples/。

**不需要 Python 后端、Node 服务、API 路由、数据库、Matlab、Simulink、Docker 或服务器函数。** 不要把 `start.bat` / `npm start` 配成线上服务；它们仅用于本地预览。

## 主机配置

- 正确提供 HTML、CSS、JS MIME 类型；ES 模块要通过 HTTP(S) 加载，不能用 file:// 双击代替网页服务。
- 保留目录和查询字符串；不存在的 JS 请求应返回 404，不要把所有路径重写成 index.html。
- 可以使用相对基路径，勿将资源路径统一改成站点根 `/`。
- HTML 和 JS/CSS 建议重新验证缓存（例如 Cache-Control: no-cache），当前并非全文件内容哈希发布。
- 不要公开 `.git`、docs、tests、scripts、日志或开发配置；发布 dist 已自动隔离这些内容。
- 不使用外部字体、CDN、跟踪或在线计算接口。SVG/MathML 中的 w3.org 字符串是命名空间，不是网络请求。
- 工具包含动态样式和 SVG foreignObject；若现有网站有严格 CSP，请先做实测，不要未经验证加入会阻止界面渲染的策略。

## 用户数据

工程在同源 localStorage 的 `gridcraft-v1` 中保存，面板宽度另存本地。此项目与 network_node 的数据格式不同，不能混用。若同一域名下同时部署多个 Gridcraft 版本，localStorage 不按路径隔离，建议 beta 使用独立子域名，或确认它们应共享数据后再同源部署。嵌入页面时注意浏览器存储权限。

新用户访问 index.html 会获得 PV 范例；已有浏览器保存的工程会优先恢复，更新模板不会覆盖用户数据。PI 页依赖所选工程，请先进入首页，选择 PV_Grid_Demo 或 BESS_GFM_demo，载入后选中对应逆变器进入 PI 设计。GFM 页面为 gfm.html?ibr=GFM1。跨域/端口迁移请手动导出和导入工程 JSON。

## 上线验收

1. 首页正常加载 PV 范例，选择/拖动元件及参数面板可用。
2. 进入 PV1 PI 页，默认 Vdc / Vac，Cbus 64000 μF、Ts 50 μs、Td 0。
3. 顶部输入区与下方图形显示完整，窄窗口可以换行。
4. 修改滤波、重新整定、切换模式后结果更新；刷新后参数保留。
5. 电感 FFT、RC / 谐振、DC 电压 / 电容工具可打开。
6. 控制台无模块加载错误；资源均从本站点加载，无后端请求。
7. 载入 BESS_GFM_demo，点击 GFM 的 PI 参数设计；四个 PI、滤波联动、三模式参数切换正常，刷新后保留。
8. JSON 保存和导入、PI 导出可用；上线地址及 Git 提交回报用户。

GFM 当前验证的是固定成网给定、理想 dq 解耦的标量内环模型，含单 RC 与径向电网 R/L；三种成网外环仅配置/展示，不包含整体稳定性认证。不要在部署时修改计算公式或移除模型范围说明。详见 docs/gfm-pi-design.md。

## 验证记录

2026-10-04：157 项 JavaScript 测试、6 项启动测试通过。静态审计检查 67 个运行文件及 154 个相对资源引用。GFM 还通过独立状态方程对频响及极点的复核（docs/validation/gfm-state-verification.json）。PI 两组增益比较同时通过特征多项式及独立状态空间验证，详见 docs/validation/pi-comparison.md。实际 HTTPS 主机的缓存、MIME 与存储权限需部署方在目标站点再验收。

本机已用普通静态服务器在 `/dist/` 子路径验证首页、从 PV 设计入口进入 PI 页、默认参数恢复及图表计算；浏览器控制台未见模块错误。这里的服务器仅提供文件，不提供任何计算接口。

## Windows 双击启动

Git 版本根目录包含 start.bat，配套 scripts/launch.py；完整解压后双击即可检测 Python 并打开浏览器。使用标准库，不安装依赖；支持重复启动识别、服务就绪检查和端口冲突回退。这些是本地预览辅助文件，不进入 dist，不是线上后端要求。
