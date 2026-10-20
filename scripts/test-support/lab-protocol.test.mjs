/** 用真实 HTTP/SMTP socket 验证夹具协议及故障开关，不访问商业供应商。 */
import { before, after, test } from "node:test";
import { strict as assert } from "node:assert";
import { Buffer } from "node:buffer";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import nodemailer from "nodemailer";
import webpush from "web-push";
import { startFixtures } from "./lab-fixtures.mjs";

const { fetch, FormData, Blob, AbortSignal } = globalThis;
let fixture;
let directory;
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "yumei-service-lab-protocol-"));
  fixture = await startFixtures({ httpPort: 0, smtpPort: 0, directory });
});
after(async () => {
  await fixture?.close();
  // mkdtemp 的明确目录，只含本测试生成的音频。
  if (directory) {
    const resolved = path.resolve(directory);
    if (
      !resolved.startsWith(path.resolve(tmpdir()) + path.sep) ||
      !path.basename(resolved).startsWith("yumei-service-lab-protocol-")
    )
      throw new Error(
        "Refusing to remove a path outside this test's temporary directory"
      );
    await rm(resolved, { recursive: true, force: true });
  }
});

test("Whisper accepts real multipart WAV and refuses a fake file", async () => {
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append(
    "file",
    new Blob([fixture.audio.wav], { type: "audio/wav" }),
    "audio.wav"
  );
  const response = await fetch(
    `${fixture.httpOrigin}/whisper/v1/audio/transcriptions`,
    { method: "POST", body: form }
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).duration, 2);
  const invalid = await fetch(
    `${fixture.httpOrigin}/whisper/v1/audio/transcriptions`,
    { method: "POST", body: "not an audio file" }
  );
  assert.equal(invalid.status, 400);
});

test("real encoded MP3 bytes are served through both HTTP TTS protocols", async () => {
  for (const [route, fields] of [
    [
      "/elevenlabs/v1/text-to-speech/qa-synthetic-voice",
      { model_id: "eleven_multilingual_v2" },
    ],
    ["/fish/v1/tts", { reference_id: "qa-synthetic-model", format: "mp3" }],
  ]) {
    const response = await fetch(fixture.httpOrigin + route, {
      method: "POST",
      headers: { "content-type": "application/json", model: "s1" },
      body: JSON.stringify({ text: "simulated audio", ...fields }),
    });
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.deepEqual(
      new Uint8Array(await response.arrayBuffer()),
      new Uint8Array(fixture.audio.mp3)
    );
  }
});

test("TTS fixtures reject wrong routes and missing or invalid provider fields", async () => {
  const request = (route, body, headers = {}) =>
    fetch(fixture.httpOrigin + route, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  for (const fields of [
    { text: "test" },
    { text: "test", model_id: "wrong-model" },
    { model_id: "eleven_multilingual_v2" },
  ])
    assert.equal(
      (
        await request(
          "/elevenlabs/v1/text-to-speech/qa-synthetic-voice",
          fields
        )
      ).status,
      400
    );
  const fish = {
    text: "test",
    reference_id: "qa-synthetic-model",
    format: "mp3",
  };
  for (const field of ["text", "reference_id", "format"]) {
    const input = { ...fish };
    delete input[field];
    assert.equal(
      (await request("/fish/v1/tts", input, { model: "s1" })).status,
      400
    );
  }
  for (const [input, headers] of [
    [fish, {}],
    [fish, { model: "wrong" }],
    [{ ...fish, reference_id: "wrong" }, { model: "s1" }],
    [{ ...fish, format: "wav" }, { model: "s1" }],
  ])
    assert.equal((await request("/fish/v1/tts", input, headers)).status, 400);
  for (const route of [
    "/elevenlabs/v1/text-to-speech/wrong-voice",
    "/elevenlabs/arbitrary",
    "/fish/arbitrary",
  ])
    assert.equal((await request(route, { text: "test" })).status, 404);
});

test("Whisper protocol also accepts browser WebM/MP4 container uploads", async () => {
  // 此处仅检查 multipart/容器路由；不声称实际麦克风或识别质量。
  for (const [mime, bytes] of [
    ["audio/webm", Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4])],
    [
      "audio/mp4",
      Buffer.from([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4]),
    ],
  ]) {
    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("file", new Blob([bytes], { type: mime }), "recording");
    assert.equal(
      (
        await fetch(`${fixture.httpOrigin}/whisper/v1/audio/transcriptions`, {
          method: "POST",
          body: form,
        })
      ).status,
      200
    );
  }
});

test("HTTP failure and hung request are switchable and abortable", async () => {
  fixture.modes.whisper = "failure";
  assert.equal(
    (
      await fetch(`${fixture.httpOrigin}/whisper/v1/audio/transcriptions`, {
        method: "POST",
      })
    ).status,
    503
  );
  fixture.modes.whisper = "timeout";
  await assert.rejects(
    fetch(`${fixture.httpOrigin}/whisper/v1/audio/transcriptions`, {
      method: "POST",
      signal: AbortSignal.timeout(100),
    }),
    { name: "TimeoutError" }
  );
  fixture.modes.whisper = "success";
});

function mailClient() {
  return nodemailer.createTransport({
    host: "127.0.0.1",
    port: fixture.smtpPort,
    secure: false,
    auth: { user: "qa", pass: "local-only" },
    connectionTimeout: 300,
    greetingTimeout: 300,
    socketTimeout: 200,
  });
}

test("SMTP performs actual auth and DATA delivery without external forwarding", async () => {
  const client = mailClient();
  await client.sendMail({
    from: "qa@example.invalid",
    to: "person@example.invalid",
    subject: "SIMULATED local verification",
    text: "Local-only protocol acceptance",
  });
  assert.equal(fixture.evidence.mail.length, 1);
  assert.ok(
    fixture.evidence.mail[0].raw.includes("Local-only protocol acceptance")
  );
  await assert.rejects(
    client.sendMail({
      from: "qa@example.invalid",
      to: "real-recipient@example.com",
      subject: "blocked",
      text: "Must not leave local sink",
    })
  );
  assert.equal(fixture.evidence.mail.length, 1);
  client.close();
});

test("SMTP failure and timeout reject rather than claiming delivery", async () => {
  const client = mailClient();
  for (const mode of ["failure", "timeout"]) {
    fixture.modes.smtp = mode;
    await assert.rejects(
      client.sendMail({
        from: "qa@example.invalid",
        to: "person@example.invalid",
        subject: "SIMULATED failure",
        text: "Not delivered",
      })
    );
    assert.equal(fixture.evidence.mail.length, 1);
  }
  fixture.modes.smtp = "success";
  client.close();
});

test("real web-push ECDH/VAPID bytes decrypt at local gateway", async () => {
  const vapid = webpush.generateVAPIDKeys();
  const payload = {
    title: "New message",
    body: "You have a new message",
    notificationId: 42,
  };
  const details = webpush.generateRequestDetails(
    fixture.device,
    JSON.stringify(payload),
    {
      vapidDetails: { subject: "mailto:qa@example.invalid", ...vapid },
      TTL: 60,
    }
  );
  const response = await fetch(
    `${fixture.httpOrigin}/push/qa-push/synthetic-device`,
    { method: details.method, headers: details.headers, body: details.body }
  );
  assert.equal(response.status, 201);
  assert.deepEqual(fixture.evidence.push[0].payload, payload);
  assert.equal(fixture.evidence.push[0].vapidPresent, true);
});

test("push gateway failures, expired subscription and timeout never record success", async () => {
  const count = fixture.evidence.push.length;
  for (const [mode, status] of [
    ["failure", 503],
    ["gone", 410],
  ]) {
    fixture.modes.push = mode;
    assert.equal(
      (
        await fetch(`${fixture.httpOrigin}/push/qa-push/synthetic-device`, {
          method: "POST",
          body: "unused",
        })
      ).status,
      status
    );
  }
  fixture.modes.push = "timeout";
  await assert.rejects(
    fetch(`${fixture.httpOrigin}/push/qa-push/synthetic-device`, {
      method: "POST",
      signal: AbortSignal.timeout(100),
    }),
    { name: "TimeoutError" }
  );
  fixture.modes.push = "success";
  assert.equal(fixture.evidence.push.length, count);
});
