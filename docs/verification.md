# 验证方法

- `npm test`：网络、电气单位、元件、设计约束、PWM FFT、谐振、PI 模型及参数同步的单元测试。
- Beta 发布工具的 `npm run audit:static`：相对资源引用、运行时接口及本机路径检查。
- Beta 发布工具的 `npm run build`：仅复制浏览器运行文件到 dist。
- `python -m unittest discover -s tests -p test_launcher.py`：本地启动器验证（配有该启动器的版本）。
- PI 数值复核：闭环特征多项式与独立状态空间特征值比对，线性阶跃指标见 validation/pi-comparison.md。

浏览器验收包括：元件编辑与撤销、设计输入联动、模式切换、刷新恢复、顶部输入区响应式布局及子路径页面跳转。测试结论限定在所实现的模型，不代替实际设备或完整系统试验。
