# 轻页 PDF 卡密授权

客户端按当前项目的 React / TypeScript 与 Tauri / Rust 结构实现。卡密授权只启用在 Tauri 桌面运行环境；浏览器开发和网页版不会尝试获取硬件标识或调用原生授权命令。

## 文件与入口

| 文件 | 职责 |
| --- | --- |
| `frontend/editor/src-tauri/src/card_license.rs` | P-256 / SHA-256 验签，产品、机器码、卡密、nonce 与到期时间校验 |
| `frontend/editor/src-tauri/src/commands/card_license.rs` | 硬件标识、联网请求、原子保存缓存及三个 Tauri 命令 |
| `frontend/editor/src/desktop/services/cardLicenseHost.ts` | 原生命令调用；通过 `@app` 扩展点接入 |
| `frontend/editor/src/core/services/cardLicenseService.ts` | 授权状态类型、到期显示、卡密遮蔽与机器码格式化 |
| `frontend/editor/src/core/contexts/CardLicenseContext.tsx` | 启动离线检查、激活状态、到期锁定与操作错误 |
| `frontend/editor/src/core/components/license/CardLicensePanel.tsx` | 启动激活界面及设置中的授权管理 |

`AppProviders` 在工作区初始化前显示授权检查。有效本地授权通过后才挂载工作区；无授权、过期或验签失败时显示激活界面。窗口框架在授权界面之外，窗口关闭和移动仍可使用。

## 验证协议

向 `https://lic.supervere.com/api/verify` 发送 POST JSON：

```json
{
  "software_id": "pdf_book",
  "license_key": "用户输入的卡密",
  "machine_id": "本机标识的 SHA-256 前 32 位大写十六进制",
  "nonce": "每次请求新生成的 UUID v4"
}
```

成功响应：

```json
{
  "success": true,
  "payload": "原始 JSON 字符串",
  "signature": "Base64 编码的 ECDSA 签名"
}
```

`payload` 解码后的必要内容示例（示例值不是有效授权）：

```json
{
  "software_id": "pdf_book",
  "license_key": "用户输入的卡密",
  "machine_id": "与请求一致",
  "nonce": "与本次请求完全一致",
  "expires_at": 1800000000,
  "permanent": false
}
```

服务器必须在验证卡密的产品归属后，把 `software_id` 放入签名 payload。客户端不接受缺少产品标识、其他产品、其他设备或其他卡密的授权。不修改小说软件的缓存，也不接受它的旧授权作为轻页授权。

签名使用提供的 SPKI 公钥，验证 payload 字符串的原始 UTF-8 字节。不可先解析再序列化后验签。支持 DER 与 IEEE P1363 两种 ECDSA 签名编码。仅有 `success: true` 或未签名的 `expires_at` 无法激活；联网响应还必须包含与本次 UUID 完全一致的 nonce。

`expires_at` 接受非负整数或十进制数字字符串，单位为 Unix 秒。普通授权缺少到期时间会被拒绝，时间达到到期值即失效。永久授权支持 `permanent: true`，并兼容原小说客户端约定的 `expires_at >= 9999999999`。

失败响应可以使用 `{"success": false, "msg": "失败原因"}`。网络超时为 20 秒，禁用 HTTP 重定向，保持 TLS 证书校验。

## 机器码与缓存

Windows 优先读取主板/系统 UUID，过滤全零、全 F 和 OEM 占位值后，回退到 Windows MachineGuid。辅助进程不显示窗口，硬件探测在后台线程执行。Linux 使用 DMI UUID 或 `/etc/machine-id`；macOS 使用 IOPlatformUUID。这两种平台有代码实现，但本次未做实机验收。

没有可用硬件标识时，为当前安装生成并保存独立 UUID，避免所有设备使用同一个默认机器码。安装标识位于 Tauri 应用数据目录的 `lightpage-install-id`。清除授权不会删除它。

授权缓存位于同一应用数据目录的 `lightpage-card-license.json`：

```json
{
  "payload": "服务器的原始签名内容",
  "signature": "服务器签名",
  "last_verified_at": 1800000000
}
```

缓存是签名 JSON 文件，使用临时文件、同步写入和原子替换，避免写入中断留下半份授权。缓存真实性由签名校验保证；`last_verified_at` 仅用于显示，不参与授权判断。卡密输入只保留在当前组件内，激活成功后清空，已保存卡密在界面中遮蔽显示。

每次启动只校验本地缓存，不自动联网复验。有效缓存直接放行，断网可用；缓存无效时仍可输入卡密联网激活。应用运行期间按到期时间锁定，并在每分钟及窗口恢复焦点时重新检查本地状态。工具切换不发送授权请求。

用户可在设置中手动联网复验、更换卡密或清除本机授权。更换失败保留原有且仍有效的授权；临时网络故障也保留有效缓存。当前卡密被服务器明确拒绝时清除其缓存，重新启动不能通过旧缓存恢复。首次激活和更换必须取得签名授权且成功保存到本机后才返回成功。

## 验证范围

前端测试涵盖无网络启动放行、无缓存激活、原生错误不放行、重复点击、失败更换保留原卡、清除失败保留错误、当前会话到期锁定及卡密遮蔽。Rust 测试覆盖产品/设备/卡密/nonce 精确匹配、篡改拒绝、DER/P1363、到期边界、永久授权、硬件占位值过滤、安装标识唯一与持久化、缓存原子替换和清除。

已使用用户提供的 `pdf_book` 卡密向验证服务器完成本机激活，服务器返回的签名、产品、卡密、机器码、nonce 与到期时间均通过校验。授权缓存随后通过本地离线校验。没有修改或部署验证服务器。

开发诊断入口为 `src-tauri/examples/card_license_probe.rs`，复用实际授权实现，从标准输入读取卡密，不输出卡密或机器码。`--offline` 模式只读取本机缓存，不请求网络。该入口使用 Windows 的应用数据目录，不能用于其他平台。缺少打包用 JAR 的开发机器可通过临时 `TAURI_CONFIG` 排除 bundle resources 编译测试；这不代表完成了安装包打包。

原小说客户端实现参考自用户仓库 `ruiworm/Tomato-Novel-Downloader`，提交 `0fc72bcc29f3da368b5903b52f9498a83a27ee6d`。轻页实现没有复制小说业务、用户数据、私钥或原软件的授权缓存。
