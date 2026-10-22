# 本地 OmniVoice 语音服务

OmniVoice 是可选的独立 Python 服务。用户在「设置 → 语音服务」中选择 OmniVoice，查看连接状态、选择音色并保存后，即可试听或朗读聊天回复。不配置时无需安装 Python 依赖，也不影响其他语音服务。

## 安装与启动

需要 [uv](https://docs.astral.sh/uv/) 和 Python 3.12。以下命令在项目根目录运行，Python 环境、下载缓存和模型保存在忽略提交的 `data/omnivoice/` 中。

```sh
pnpm omnivoice:install
# 只有 CPU 的机器可以改用：pnpm omnivoice:install --cpu
```

安装默认使用官方建议的 PyTorch 2.8.0 + CUDA 12.8，适合兼容的 NVIDIA 驱动。模型首次使用时从 Hugging Face 下载；可以提前下载模型到本地，并用 `OMNIVOICE_MODEL` 指定目录。运行环境需能访问 PyPI、PyTorch 下载站及 Hugging Face。

如果已有专用 Python 环境，可在 `.env` 设置 `OMNIVOICE_PYTHON` 指向其解释器。启动和下载命令会使用这个环境；不会修改系统 Python 或 ComfyUI 环境。

### 国内网络与断点续传

模型可通过 hf-mirror.com 直连分段下载。安装 Python 依赖后运行：

```sh
node scripts/omnivoice.mjs download --direct --workers 16
```

默认保存到 `data/omnivoice/model`，断线后执行相同命令即可续传。`--direct` 仅让本次下载忽略代理环境变量，镜像及其重定向的文件 CDN 均使用直连；TLS 校验使用系统信任的证书，保持开启。网络较慢时可调节并发，范围为 1～128。主模型与音频解码器下载完成后会校验官方发布的 SHA256；未通过校验的文件不会作为完成的模型发布。

下载完成后，在 `.env` 设置本地模型目录：

```dotenv
OMNIVOICE_MODEL=I:/yumei/data/omnivoice/model
```

PyPI 依赖和 PyTorch 使用各自的软件源，不经过 hf-mirror。代理导致安装缓慢时，可仅在安装进程中清除 `HTTP_PROXY` / `HTTPS_PROXY`，并设置 `UV_SYSTEM_CERTS=true`，使用可信的 PyPI 镜像；无需关闭证书校验。

在 `.env` 中加入：

```dotenv
OMNIVOICE_BASE_URL=http://127.0.0.1:8002
OMNIVOICE_API_KEY=
OMNIVOICE_TIMEOUT_MS=180000
```

```sh
pnpm omnivoice:start
```

服务默认监听 `127.0.0.1:8002`。保持其运行，然后在另一个终端运行或重启 YUMEI（`pnpm dev` / `pnpm start`）。已有数据库先执行 `pnpm db:migrate`；生产服务启动时也会自动执行迁移。

`GET /health` 返回进程状态及模型是否已加载。`GET /v1/audio/voices` 返回音色目录，`POST /v1/audio/speech` 接收 `model: "omnivoice"`、`input`、`voice` 和 `response_format: "wav"`，返回 24 kHz WAV。该接口实现上述 OpenAI 风格字段，不能当作完整的 OpenAI API 使用。

服务按需加载模型，自动模式在 CUDA 可用且空闲显存至少 4 GiB 时选择 GPU，否则选择 CPU。4 GiB 是选择设备的阈值，不是所有文本长度的显存保证。设置 `OMNIVOICE_DEVICE=cuda:0` 可固定 GPU，或设为 `cpu`。默认空闲 120 秒卸载模型，设置 `OMNIVOICE_IDLE_SECONDS=0` 可常驻。与 ComfyUI 共用 GPU 时，请留出推理显存。CPU 可用于验证，速度通常慢得多。

同一服务只执行一个生成请求；忙时返回 429，避免堆积长队列。首次模型下载可能超过请求超时，下载完成后可重试。文本同时受站点限长和服务 5000 字符上限约束，音频保存、过期清理、年龄确认、请求限流与每日 AI 尝试预算沿用现有流程。OmniVoice 不需要用户 BYOK，也不受 ElevenLabs/Fish Audio 的付费服务权限控制。

## Docker 应用连接宿主机服务

如果 YUMEI 运行在 Docker，Python 服务运行在宿主机：

```dotenv
OMNIVOICE_BASE_URL=http://host.docker.internal:8002
OMNIVOICE_API_KEY=替换为随机长令牌
```

```sh
pnpm omnivoice:start --host 0.0.0.0
```

Compose 已传入应用需要的地址、令牌和超时，并提供 Linux 的宿主机网关映射。此模式必须配置共享令牌；限制服务端口的网络可访问范围。浏览器通过 YUMEI 后端调用，不会直接访问 Python，也不会拿到服务令牌。无需把 Python 推理依赖打包进 Node 应用镜像。

## 上传参考录音并用于聊天朗读

在「设置 → 语音服务 → OmniVoice」中展开「上传参考音频，克隆音色」，填写名称，上传参考录音并填写录音中的准确原文，然后点击「保存克隆音色」。新音色会自动选中；点击语音分区的保存按钮后即可试听，也会用于聊天的手动朗读与自动朗读。

支持 WAV、MP3、FLAC、OGG，大小不超过 5 MB，时长为 3～30 秒，建议使用 3～10 秒的清晰单人人声。服务会实际解码并校验音频，将其转为 24 kHz 单声道 WAV；空白、损坏、过短或过长的录音会被拒绝。原文需与录音一致，此流程无需额外下载 Whisper 或训练模型。

每个账号最多保存 10 个音色。规范化录音和原文保存在应用数据库的私人音色记录中，不生成公开文件 URL，也不加入其他账号的音色列表。朗读时应用验证归属后将参考传给本地服务；Python 不持久保存上传的音频。选择自己的克隆音色后可点击删除；删除会移除其参考记录，并将当前已保存的该音色偏好恢复为默认音色。已生成的朗读音频仍按原有保留期限回收。更新应用时需应用新的数据库迁移，并重启 Python 服务。

## 每个角色使用独立音色

在创建或编辑角色页面的「角色音色」中选择自己的克隆音色并保存。也可从聊天顶栏的「角色音色」按钮进入角色编辑。每个角色独立保存绑定，同一音色也可供多个自己的角色使用。

也可以直接在角色页展开「上传参考音频，克隆音色」，上传录音并填写准确原文。编辑已有角色时点击「克隆并绑定此角色」，新音色会立即绑定当前角色；不跳转页面、不改变账号默认音色，其他未保存的资料仍留在表单中。创建新角色时点击「克隆并选择音色」，然后创建角色即可一起保存绑定。上传校验与全局语音设置共用同一表单和接口；绑定失败时保留录音和文字，再次点击会重试绑定已创建的音色。

聊天朗读优先使用当前会话所属角色的绑定音色（OmniVoice），包括手动点击播放、新回复自动朗读和语音输入后的回复朗读。没有绑定时沿用账号的语音引擎和音色；设置页试听仍使用账号默认声音。选择「跟随账号语音设置」并保存角色即可解除绑定。删除克隆音色会自动解除所有角色对它的绑定。

服务端按当前用户校验角色及音色归属，不能绑定或朗读其他账号的私人音色。切换角色或改变绑定时，客户端停止旧音频并忽略迟到的播放结果。

## 运营方配置公共音色

内置女声、男声、耳语三个音色使用文字属性设计，并设置固定随机种子。文字音色设计并不保证不同台词完全相同的声纹；需要稳定声音时使用参考录音克隆。

将自定义目录放入 `data/omnivoice/voices.json`，并设置 `OMNIVOICE_VOICES_FILE` 为其路径。保留 `default` 音色，参考音频路径相对于该 JSON 文件解析：

```json
[
  {
    "id": "default",
    "name": "我的角色声音",
    "ref_audio": "reference.wav",
    "ref_text": "这里填写参考录音中准确说出的内容。",
    "seed": 42
  }
]
```

参考录音建议为 3～10 秒。提供准确转写可避免额外加载 Whisper；服务要求克隆音色同时提供 `ref_audio` 和 `ref_text`。配置后重启 Python 服务，再到设置页检查连接。音色通过 ID 持久化到每位用户的偏好。服务接受目录中的音色 ID，或应用在校验账号归属后传入的参考音频字节和原文；不接受用户指定的本地路径、URL 或序列化模型文件。

## 本地验证记录

2026-10-22 已用本地合成的中文参考录音完成真实流程：全局上传并试听、两个角色绑定不同克隆音色、聊天手动与自动朗读，以及角色编辑页直接上传并立即绑定。最后一条流程未提交角色的其他资料草稿，账号默认声音与其他角色绑定保持不变；聊天实际生成了 24 kHz 单声道 WAV，并从应用文件地址读取和解码验证。

提交前完整回归为 162 个测试文件、1430 项测试通过；另有 38 项多语言专项、22 项上海时区专项和 8 项 Python 服务协议测试通过。TypeScript、ESLint、Prettier、Git 差异检查和生产构建均通过。

本机样例、截图与验证记录位于忽略提交的 `output/omnivoice/`，包括 `clone-verification.json`、`character-voice-verification.json`、`inline-clone-verification.json`。模型、运行环境、参考音频、生成媒体、会话凭据和服务日志不纳入版本控制。

## 许可

[官方模型卡](https://huggingface.co/k2-fsa/OmniVoice#license) 将代码按 Apache 2.0 发布，预训练模型权重按 **CC-BY-NC** 发布。此接入适用于本地、非商业使用；商业部署需要另外核实并取得适用的模型授权。
