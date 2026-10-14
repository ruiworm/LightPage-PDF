# Windows 测试安装包

GitHub Actions 的 `Windows test package` 工作流从指定分支构建 Windows x64 的 EXE 安装包，并尝试额外生成 MSI。在 Actions 页面选择该工作流并运行，完成后下载 `LightPage-PDF-Windows-运行编号` artifact。EXE 是必需产物，MSI 失败不会丢弃已经生成的 EXE，失败详情保留在对应步骤日志中。

工作流准备 Java 25、Node.js 24、Rust 和 Task，使用现有 `desktop:prepare` 打包后端 JAR、Java 运行时和 Windows 安装辅助组件，再执行桌面类型检查、Rust 测试与 Tauri 构建。安装包附带 SHA-256 校验文件，artifact 保留 14 天。

测试构建只生成安装包，不发布 GitHub Release，也不生成自动更新签名文件。前端生产构建在 GitHub runner 上由 Tauri 的 `beforeBuildCommand` 执行。本机授权缓存、真实卡密、日志、模型缓存与临时截图不进入构建。

中文 OCR 和编辑字体包含在前端资源中。Word/Excel 转 PDF 仍需本机 LibreOffice 与转换组件；可参考 `docs/local-conversion.md`。增强中文实体识别依赖可选的本地 Python 服务；该服务不可用时，脱敏使用本地规则和 OCR，并显示识别服务不可用提示。测试安装包不预装这两个额外服务。
