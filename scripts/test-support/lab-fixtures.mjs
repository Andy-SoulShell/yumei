/** 本机协议夹具：音频是真实可播放文件；转写和回答内容均为合成结果。 */
import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import net from "node:net";
import { createECDH, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { LAB_DIR, FIXTURE_ORIGIN } from "./lab-config.mjs";

const require = createRequire(import.meta.url);
const { Response, Blob } = globalThis;
const webPushRequire = createRequire(require.resolve("web-push"));
const ece = webPushRequire("http_ece");

/** 生成两秒 PCM WAV 和 MP3，避免假字节被误报成音频成功。 */
export async function createAudioFixtures(directory = LAB_DIR) {
  await mkdir(directory, { recursive: true });
  const rate = 24000;
  const samples = rate * 2;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    const time = index / rate;
    const fade = Math.min(1, time * 20, (2 - time) * 20);
    wav.writeInt16LE(
      Math.round(
        Math.sin(time * Math.PI * 2 * (time < 1 ? 440 : 660)) * 8000 * fade
      ),
      44 + index * 2
    );
  }
  const wavPath = path.join(directory, "simulated-audio.wav");
  const mp3Path = path.join(directory, "simulated-audio.mp3");
  await writeFile(wavPath, wav);
  const encoded = spawnSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    wavPath,
    "-codec:a",
    "libmp3lame",
    "-metadata",
    "title=SIMULATED protocol fixture",
    mp3Path,
  ]);
  if (encoded.status !== 0)
    throw new Error("ffmpeg is required to generate a real MP3 fixture");
  return { wav, mp3: await readFile(mp3Path), wavPath, mp3Path };
}

/** 启动回环 HTTP 与 SMTP；所有捕获数据仅限专用合成账号。 */
export async function startFixtures({
  httpPort = 3299,
  smtpPort = 3298,
  directory = LAB_DIR,
} = {}) {
  const audio = await createAudioFixtures(directory);
  const deviceKey = createECDH("prime256v1");
  deviceKey.generateKeys();
  const auth = randomBytes(16);
  const device = {
    endpoint: "https://push.lab.invalid/qa-push/synthetic-device",
    keys: {
      p256dh: deviceKey.getPublicKey().toString("base64url"),
      auth: auth.toString("base64url"),
    },
  };
  const modes = {
    whisper: "success",
    elevenlabs: "success",
    fish: "success",
    smtp: "success",
    push: "success",
    chat: "success",
  };
  const evidence = { requests: [], mail: [], smtp: [], push: [], checkout: [] };
  const sockets = new Set();
  const json = (res, status, value) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };
  const http = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, FIXTURE_ORIGIN);
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      if (url.pathname === "/__lab/state")
        return json(res, 200, { simulated: true, modes, evidence, device });
      if (url.pathname === "/__lab/modes" && req.method === "POST") {
        const patch = JSON.parse(body.toString());
        for (const [service, mode] of Object.entries(patch)) {
          if (
            !(service in modes) ||
            !["success", "failure", "timeout", "gone"].includes(mode)
          )
            return json(res, 400, { error: "invalid lab scenario" });
        }
        Object.assign(modes, patch);
        return json(res, 200, { modes });
      }
      if (url.pathname === "/fixture.mp3") {
        res.writeHead(200, { "Content-Type": "audio/mpeg" });
        return res.end(audio.mp3);
      }
      if (url.pathname.startsWith("/checkout/")) {
        evidence.checkout.push({ path: url.pathname, simulated: true });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(
          "<h1>SIMULATED checkout</h1><p>No payment details are accepted. No charge is made.</p>"
        );
      }
      const service = url.pathname.split("/")[1];
      if (!(service in modes))
        return json(res, 404, { error: "unknown fixture" });
      evidence.requests.push({
        service,
        method: req.method,
        path: url.pathname,
        bytes: body.length,
        mode: modes[service],
        at: new Date().toISOString(),
      });
      if (modes[service] === "timeout") return; // 由真实应用超时/abort关闭请求。
      if (modes[service] === "failure")
        return json(res, 503, {
          error: { message: "SIMULATED upstream unavailable" },
        });
      if (modes[service] === "gone")
        return json(res, 410, { error: "SIMULATED expired device" });
      if (service === "whisper") {
        const form = await new Response(body, {
          headers: {
            "content-type":
              req.headers["content-type"] || "application/octet-stream",
          },
        }).formData();
        const file = form.get("file");
        const bytes =
          file instanceof Blob
            ? Buffer.from(await file.arrayBuffer())
            : Buffer.alloc(0);
        const hasAudioContainer =
          (bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WAVE") ||
          bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ||
          bytes.toString("ascii", 4, 8) === "ftyp" ||
          bytes.toString("ascii", 0, 4) === "OggS" ||
          bytes.toString("ascii", 0, 3) === "ID3" ||
          (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
        if (form.get("model") !== "whisper-1" || !hasAudioContainer)
          return json(res, 400, {
            error: "expected multipart audio upload with a supported container",
          });
        return json(res, 200, {
          task: "transcribe",
          language: "english",
          duration: 2,
          text: "This is a simulated transcription for the local service lab.",
          segments: [
            {
              id: 0,
              seek: 0,
              start: 0,
              end: 2,
              text: "This is a simulated transcription for the local service lab.",
              tokens: [],
              temperature: 0,
              avg_logprob: -0.1,
              compression_ratio: 1,
              no_speech_prob: 0,
            },
          ],
        });
      }
      if (
        service === "elevenlabs" &&
        url.pathname === "/elevenlabs/v1/voices" &&
        req.method === "GET"
      )
        return json(res, 200, {
          voices: [
            {
              voice_id: "qa-synthetic-voice",
              name: "QA simulated voice",
              category: "premade",
              description: "Local protocol fixture; not vendor speech",
              preview_url: `${FIXTURE_ORIGIN}/fixture.mp3`,
              labels: { simulated: "true" },
            },
          ],
        });
      if (
        service === "fish" &&
        url.pathname === "/fish/model" &&
        req.method === "GET"
      )
        return json(res, 200, {
          total: 1,
          items: [
            {
              _id: "qa-synthetic-model",
              title: "QA simulated model",
              description: "Local protocol fixture",
              tags: ["simulated"],
            },
          ],
        });
      if (service === "elevenlabs" || service === "fish") {
        const expectedPath =
          service === "elevenlabs"
            ? "/elevenlabs/v1/text-to-speech/qa-synthetic-voice"
            : "/fish/v1/tts";
        if (url.pathname !== expectedPath || req.method !== "POST")
          return json(res, 404, { error: "unknown TTS fixture route" });
        const input = JSON.parse(body.toString());
        if (
          typeof input.text !== "string" ||
          !input.text.length ||
          input.text.length > 5000 ||
          (service === "elevenlabs" &&
            input.model_id !== "eleven_multilingual_v2") ||
          (service === "fish" &&
            (input.reference_id !== "qa-synthetic-model" ||
              input.format !== "mp3" ||
              req.headers.model !== "s1"))
        )
          return json(res, 400, { error: "invalid TTS protocol fields" });
        res.writeHead(200, { "Content-Type": "audio/mpeg" });
        return res.end(audio.mp3);
      }
      if (service === "push") {
        const decrypted = ece.decrypt(body, {
          version: "aes128gcm",
          privateKey: deviceKey,
          authSecret: auth,
        });
        evidence.push.push({
          payload: JSON.parse(decrypted.toString()),
          encryptedBytes: body.length,
          vapidPresent: String(req.headers.authorization).startsWith("vapid "),
        });
        res.writeHead(201);
        return res.end();
      }
      if (service === "chat") {
        const input = JSON.parse(body.toString());
        const content =
          "This is a simulated local companion reply. Thank you for sharing your voice message.";
        if (input.stream) {
          res.writeHead(200, { "Content-Type": "text/event-stream" });
          for (const text of [
            "This is a simulated local companion reply. ",
            "Thank you for sharing your voice message.",
          ])
            res.write(
              `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`
            );
          return res.end("data: [DONE]\n\n");
        }
        return json(res, 200, {
          choices: [{ message: { role: "assistant", content } }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        });
      }
      return json(res, 404, { error: "unknown route" });
    } catch {
      return json(res, 400, { error: "invalid fixture protocol request" });
    }
  });
  const smtp = net.createServer(socket => {
    let buffer = "";
    let inData = false;
    let data = "";
    let authStep = 0;
    socket.setEncoding("utf8");
    socket.write("220 lab.example.invalid ESMTP simulated local sink\r\n");
    socket.on("data", chunk => {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n");
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData) {
          if (line !== ".") {
            data += line + "\r\n";
            continue;
          }
          inData = false;
          evidence.smtp.push({
            mode: modes.smtp,
            accepted: modes.smtp === "success",
            at: new Date().toISOString(),
          });
          if (modes.smtp === "timeout") continue;
          if (modes.smtp === "failure") {
            socket.write("451 SIMULATED temporary rejection\r\n");
            continue;
          }
          evidence.mail.push({ raw: data, simulated: true });
          data = "";
          socket.write("250 queued locally only\r\n");
          continue;
        }
        if (authStep) {
          authStep--;
          socket.write(
            authStep
              ? "334 UGFzc3dvcmQ6\r\n"
              : "235 authentication accepted locally\r\n"
          );
          continue;
        }
        if (/^EHLO|^HELO/.test(line))
          socket.write("250-lab.example.invalid\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (/^AUTH LOGIN/.test(line)) {
          authStep = 2;
          socket.write("334 VXNlcm5hbWU6\r\n");
        } else if (/^AUTH PLAIN/.test(line))
          socket.write("235 authentication accepted locally\r\n");
        else if (/^MAIL FROM:/.test(line)) {
          if (!line.includes("@example.invalid"))
            socket.write("550 only synthetic addresses permitted\r\n");
          else socket.write("250 sender accepted\r\n");
        } else if (/^RCPT TO:/.test(line)) {
          if (!line.includes("@example.invalid"))
            socket.write("550 only synthetic addresses permitted\r\n");
          else socket.write("250 recipient accepted\r\n");
        } else if (line === "DATA") {
          inData = true;
          socket.write("354 end with dot\r\n");
        } else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  for (const server of [http, smtp])
    server.on("connection", socket => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => {});
    });
  await new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(httpPort, "127.0.0.1", resolve);
  });
  try {
    await new Promise((resolve, reject) => {
      smtp.once("error", reject);
      smtp.listen(smtpPort, "127.0.0.1", resolve);
    });
  } catch (error) {
    http.close();
    throw error;
  }
  return {
    httpOrigin: `http://127.0.0.1:${http.address().port}`,
    smtpPort: smtp.address().port,
    audio,
    device,
    modes,
    evidence,
    async close() {
      for (const socket of sockets) socket.destroy();
      await Promise.all(
        [http, smtp].map(
          server => new Promise(resolve => server.close(resolve))
        )
      );
    },
  };
}
