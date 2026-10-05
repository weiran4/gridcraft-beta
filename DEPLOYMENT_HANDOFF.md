# 给网页部署 AI：Gridcraft Beta 上线交接

## 交付位置

- 独立项目：`E:\gridcraft-beta`
- **直接上传目录：`E:\gridcraft-beta\dist`**，上传其中的内容，不要再额外包一层 dist。
- GitHub：`https://github.com/weiran4/gridcraft-beta`（私有仓库，需用户已有授权访问）。
- 版本：`0.2.0-beta.1`，Git 标签 `v0.2.0-beta.1`。
- 原始开发目录 `E:\gfl_gfm_tuner` 和原网络解工具 `E:\network_node` 保持独立。

## 部署方法

将 dist 内容作为普通 HTTPS 静态站点发布，或挂到现有网站的 `/tools/gridcraft-beta/` 子路径。

从 GitHub 拉取时，执行 `npm run build`，发布目录填 `dist`；无需安装依赖，Node 只运行文件复制脚本。也可以直接复制允许发布的文件：index.html、gfl.html、ui/、analysis/、components/、core/、project/、examples/。

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

新用户访问 index.html 会获得 PV 范例；已有浏览器保存的工程会优先恢复，更新模板不会覆盖用户数据。PI 页依赖所选工程，请先进入首页再选中 PV1 进入 PI 设计。跨域/端口迁移请手动导出和导入工程 JSON。

## 上线验收

1. 首页正常加载 PV 范例，选择/拖动元件及参数面板可用。
2. 进入 PV1 PI 页，默认 Vdc / Vac，Cbus 64000 μF、Ts 50 μs、Td 0。
3. 顶部输入区与下方图形显示完整，窄窗口可以换行。
4. 修改滤波、重新整定、切换模式后结果更新；刷新后参数保留。
5. 电感 FFT、RC / 谐振、DC 电压 / 电容工具可打开。
6. 控制台无模块加载错误；资源均从本站点加载，无后端请求。
7. JSON 保存和导入、PI 导出可用；上线地址及版本回报用户。

## 验证记录

当前版本完整单元测试 142 项通过。静态审计检查 61 个运行文件及 136 个相对资源引用。PI 两组增益比较同时通过特征多项式及独立状态空间验证，详见 docs/validation/pi-comparison.md。实际 HTTPS 主机的缓存、MIME 与存储权限需部署方在目标站点再验收。

本机已用普通静态服务器在 `/dist/` 子路径验证首页、从 PV 设计入口进入 PI 页、默认参数恢复及图表计算；浏览器控制台未见模块错误。这里的服务器仅提供文件，不提供任何计算接口。
