# 本机格式转换

Word、Excel 和 PowerPoint 转 PDF 使用开源 LibreOffice 引擎和 unoserver，通过项目已有的转换接口处理。
文档留在本机，转换结果继续进入原有文件库、阅读器和下载流程。

Windows 首次配置：

```powershell
./scripts/Setup-LocalConversion.ps1
./scripts/Start-LocalBackend.ps1
```

已有本项目的处理服务占用 8080 时，使用 `./scripts/Start-LocalBackend.ps1 -Restart`。
脚本只重启与指定 Java 和 JAR 路径匹配的进程。启动后刷新页面即可更新转换能力。
已有 LibreOffice 时可指定 `-SofficePath`；使用其他处理服务包时可指定 `-JarPath` 和 `-JavaPath`。

配置脚本从 LibreOffice 官方地址下载固定版本 26.8.1，并校验官方 SHA-256。
组件解压到用户目录 `%LOCALAPPDATA%/QingyePDF/LibreOffice`，不改变 Office 文件关联。
unoserver 3.7 使用 LibreOffice 自带的 Python，通过固定版本及 SHA-256 安装，许可证随包保留。
启动脚本在 127.0.0.1 上启动或复用本软件的转换工作进程，让 LibreOffice 留在内存中，避免每次转换重新启动。
Windows 启动器使用 LibreOffice 的环境加载程序，处理其 `sys.executable` 返回目录导致默认启动器无法运行的问题。
转换接口已有独立临时目录、进程超时和输入清理；本次直接复用，未另建转换接口。
部署到另一台电脑时需要重新配置该组件；网页本身不包含 Office 转换引擎。

本次已验证 DOCX 转 PDF（中文、表格和图片）以及 PDF 转 DOCX，并在网页中完成转换、结果入库和打开查看。
其他格式以运行中服务报告的能力为准。PDF 转 Word 可能改变版式，扫描件文字识别仍取决于 OCR 组件；不保证复杂文件与 Microsoft Office 逐像素一致。

## 开源来源

- [LibreOffice](https://www.libreoffice.org/download/)：MPL-2.0，实际使用其原生转换引擎。发行包中的许可证保留在组件目录。
- [unoserver](https://github.com/unoconv/unoserver)：MIT，实际使用其常驻转换进程和客户端。
- [Gotenberg 的 LibreOffice 转换接口](https://gotenberg.dev/docs/convert-with-libreoffice/convert-to-pdf)：用于比较本机转换方案，未复制其源代码。
- [libreoffice-document-converter](https://github.com/matbeedotcom/libreoffice-document-converter)：比较过 WASM 方案；其浏览器方案需下载大型引擎并启用跨源隔离，本次未引入该依赖。
