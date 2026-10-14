# 本地中文文件脱敏识别

此服务只接收文字，返回姓名、机构、地址的类型和原文范围。阅读器、坐标定位、手动核对和文件导出仍由前端处理。没有登录、计费、遥测或文档上传到第三方的流程。

Windows 首次安装和启动：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File engine/scripts/start_redaction.ps1 -Setup
```

后续启动省略 `-Setup`。服务只监听 `127.0.0.1:5161`，前端通过 `VITE_LOCAL_REDACTION_URL` 连接；地址校验限制为本机。启动脚本使用独立的 `.venv-redaction` 环境。第一次安装需要从 ModelScope 下载约 409 MB 权重，缓存到 `engine/.model_cache/redaction-raner`；识别时只读已安装的本地模型，不自动下载。

安装完成后，本地前端开发服务会自动启动该识别服务；已有服务则直接复用。自动启动不安装依赖或下载模型，退出前端时只关闭由它创建的子进程。独立部署或正式桌面安装包仍需单独启动或打包识别服务。

Linux/macOS 可在 engine 目录设置 `UV_PROJECT_ENVIRONMENT=.venv-redaction`、`PYTHONPATH=src`，依次运行 `uv sync --locked --group redaction`、`uv run --locked --group redaction python -m stirling.redaction.download`、`uv run --locked --group redaction python -m stirling.redaction.server`。

模型首次加载后会复用，长文本分段带重叠区，返回 JavaScript UTF-16 偏移，避免 emoji 或罕见字导致定位偏移。模型分数不等于识别准确率；有姓名结构、单位后缀或详细门牌结构支持的候选默认勾选，仍标记为待核对，其余候选需手动确认。服务不可用时前端会明确提示，并保留字段、规则和词库识别。

借鉴 szzzcode/szzz-redact-desk 的 RaNER 接入、字段边界、机构别名、来源优先级和复核思路，借鉴 RayBagel/LegalMask 的法律角色和法律引用保护思路。按完整人物名称区分身份，未使用按姓氏归并算法，也没有实现代号还原或导出原文映射表。仓库许可分别保留在 `redact-desk.LICENSE`、`LegalMask.LICENSE`。模型及其依赖使用各自许可。

- https://github.com/szzzcode/szzz-redact-desk/tree/022c92525e4b3f8fb5ee8d94a05e82ae527f9b91
- https://github.com/RayBagel/LegalMask/tree/e68a79dafaac8f96402e603abb3fa6eb0095f4b1
- https://modelscope.cn/models/iic/nlp_raner_named-entity-recognition_chinese-base-generic
