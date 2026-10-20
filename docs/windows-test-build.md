# Windows 测试安装包

GitHub Actions 的 `Windows test package` 工作流从指定分支构建 Windows x64 的 EXE 安装包，并尝试额外生成 MSI。在 Actions 页面选择该工作流并运行，完成后下载 `LightPage-PDF-Windows-运行编号` artifact。EXE 是必需产物，MSI 失败不会丢弃已经生成的 EXE，失败详情保留在对应步骤日志中。

工作流准备 Java 25、Node.js 24、Rust 和 Task，检查后端资源与格式，使用现有 `desktop:prepare` 打包后端 JAR、Java 运行时和 Windows 安装辅助组件，再执行桌面类型检查、Rust 测试与 Tauri 构建。打包前会使用捆绑的 Java 启动 JAR，确认 `/api/v1/info/status` 返回 `UP`，避免缺少启动资源的安装包通过构建。安装包附带 SHA-256 校验文件，artifact 保留 14 天。

测试构建只生成安装包，不发布 GitHub Release，也不生成自动更新签名文件。前端生产构建在 GitHub runner 上由 Tauri 的 `beforeBuildCommand` 执行。本机授权缓存、真实卡密、日志、模型缓存与临时截图不进入构建。

中文 OCR、编辑字体、Java、Tesseract 和 Poppler 随基础包提供。LibreOffice 改为可选组件：在格式转换页或设置的常规页面点击安装，软件从 GitHub Release 下载固定版本，校验 SHA-256 后解压到 `%LOCALAPPDATA%\LightPage-PDF\components\office\版本号`。完成后先保存文档，再点击重启即可启用 Word、Excel、PowerPoint 等相关转换。组件约需下载 198 MB，安装后约占 574 MB；更新主程序后可继续使用，不需要重复下载。旧版本捆绑的 LibreOffice 仍可识别。

组件版本、地址、体积和校验值固定在 `frontend/editor/src-tauri/office-component.json`。发布新组件时，使用现有 Windows 准备与裁剪脚本生成运行时，再运行 `python scripts/package-office-component.py 运行时目录 输出.zip`，发布到独立 GitHub Release 并更新固定元数据。构建流程会验证公开下载的组件并测试实际解压安装；基础安装包的资源清单只包含 Java、OCR 和 Poppler，不包含 LibreOffice。

增强中文实体识别依赖可选的本地 Python 服务；该服务不可用时，脱敏使用本地规则和 OCR，并显示识别服务不可用提示。测试安装包不预装该服务。
