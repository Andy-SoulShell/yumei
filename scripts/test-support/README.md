# 隔离服务验收 Lab

这些脚本只用于本机协议验收。Whisper 转写、ElevenLabs/Fish 音频内容、聊天回答、SMTP 邮件接收、Web Push 网关和 Lemon Squeezy 事件均为**明确标记的模拟上游**。结果不能用来声称真实供应商密钥、识别质量、音质、浏览器推送到达率或真实支付通过。

需要 Node 22–24、已安装的项目依赖、`ffmpeg`、已构建的 `dist/public`，以及 `.env.test.local` 的本机测试 MySQL 和测试 root 密码。

```powershell
node --test "scripts/test-support/*.test.mjs"
node scripts/test-support/service-lab.mjs --smoke --keep
```

`--smoke` 启动原应用并完成 HTTP 验收，移除 `--keep` 则验收结束自动关闭。直接运行不带参数时可保持空白 lab，供手工交互。使用另一个浏览器会话打开 `http://127.0.0.2:3100`，合成账号保存在 `tmp/service-lab/browser-account.json`。密码只用于本机验收。不要把真实密钥、个人资料或支付资料输入 lab。

隔离边界：

- 不读取应用 `.env`，仅读取 `.env.test.local` 的数据库配置；子应用从空环境白名单构造，无真实供应商密钥。
- 只创建并迁移固定数据库 `yumei_live_lab_test`。应用使用独立随机密码用户；启动先撤销其既有权限，再授予按字面转义的该库权限，并检查 `SHOW GRANTS`。额外角色、其他库或转授权会阻止启动；不会重置 `yumei_test`。
- 应用只监听另一回环地址 `127.0.0.2:3100`，避免共享 localhost 的登录 Cookie；HTTP 夹具为 `127.0.0.1:3299`，SMTP 接收器为 `127.0.0.1:3298`。
- preload 只重定向精确 QA key 与固定供应商路径；`fetch`、默认 axios 实例以及 Node 的 `http/https.request/get` 检查目标，仅允许列出的回环地址。官方 `api.deepseek.com` 不重写且直接拒绝。fetch 和 axios 均关闭自动重定向，防止跟随到公网。lab 不配置 DeepSeek 密钥，聊天默认指向本机合成回答。
- 邮件只接收 `@example.invalid` 合成地址，无转发功能。推送保留原 SDK 的真实 ECDH/VAPID 加密，仅专用 `push.lab.invalid/qa-push/...` 合成设备改走本机传输，夹具解密检查隐私预览。它不是浏览器厂商的 Push Service。
- 结账地址只显示模拟说明，不接受卡号，不扣款。真实应用 webhook 接收合成 HMAC 签名事件，验证权益与去重。

这些是受控验收进程中常规 HTTP 调用的防护，**不是操作系统级网络沙箱**，也不声称拦截任意代码、独立客户端、浏览器或原始 socket。MySQL 和 SMTP 的 raw socket 连接依靠固定本机地址配置；没有通用 `net/tls/UDP` 拦截。不要在 lab 执行不受信任代码或配置真实服务凭据。

脚本生成两秒可播放 WAV、真正编码的 MP3；音频为测试音，不是供应商合成语音。完整链路会从实际应用文件 URL 下载 TTS 输出，再用 `ffmpeg` 解码。Whisper 夹具检查真实 multipart、模型字段与音频容器标记（含 WAV、浏览器 WebM/MP4 等），然后返回固定合成文本；不声称实际语音识别或麦克风硬件验收。

主验收还验证 SMTP 注册、登录链接单次消费、密码重置单次消费与旧会话撤销。SMTP 拒收时，密码重置对存在和不存在的邮箱均返回相同通用确认，不暴露账号状态；通过本机接收记录、运营日志和健康探针验证失败已记录且应用仍健康。这是防邮箱枚举的预期行为。

`tmp/service-lab/report.json` 保存成功断言、脱敏计量、上游请求元数据和合成推送；`application.log` 保存隔离进程日志。模拟邮件中的验证链接和账号文件仅留在被 Git 忽略的本地目录。

可切换场景：

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3299/__lab/modes -ContentType application/json -Body '{"whisper":"timeout","elevenlabs":"failure","fish":"success"}'
Invoke-RestMethod http://127.0.0.1:3299/__lab/state
```

支持 `whisper/elevenlabs/fish/chat/smtp/push`；模式为 `success/failure/timeout`，`push` 另可用 `gone` 返回 410。HTTP 音频/转写超时走原应用 abort/计量路径，lab 将 AI 超时缩短到 1.2 秒。`smtp:timeout` 故意不确认 DATA，原 nodemailer 的默认等待可能较长，测试客户端应另设连接/发送期限。内存学习在此 lab 关闭，避免合成聊天文本被当作结构化记忆结果；真实记忆模型验收由其他测试承担。

Ctrl+C 关闭应用、夹具和连接；数据库与本地报告保留，便于人工检查。每次 `--smoke` 使用新的合成账号，旧账号不会删掉。
