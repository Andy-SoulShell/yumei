/** 通过真实认证 Cookie、CSRF、tRPC、SSE、媒体 URL 和 webhook 走应用完整流程。 */
import { strict as assert } from "node:assert";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { setTimeout } from "node:timers";
import { randomUUID, createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createPool } from "mysql2/promise";
import { createTRPCUntypedClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import {
  APP_ORIGIN,
  FIXTURE_ORIGIN,
  LAB_DIR,
  WEBHOOK_SECRET,
  assertLabDatabase,
} from "./lab-config.mjs";

const { Headers, fetch, AbortSignal } = globalThis;

/** 仅接收当前隔离站点 Cookie，报告中不保存令牌。 */
function createSession() {
  const cookies = new Map();
  const request = async (url, init = {}) => {
    url = new URL(
      typeof url === "string" ? url : url.url || url.href,
      APP_ORIGIN
    ).href;
    assert.equal(new URL(url).origin, APP_ORIGIN);
    const headers = new Headers(init.headers);
    headers.set("origin", APP_ORIGIN);
    headers.set(
      "cookie",
      Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; ")
    );
    if (cookies.has("csrf_token"))
      headers.set(
        "x-csrf-token",
        decodeURIComponent(cookies.get("csrf_token"))
      );
    const response = await fetch(url, {
      ...init,
      headers,
      signal: init.signal || AbortSignal.timeout(12000),
      redirect: "manual",
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const equal = pair.indexOf("=");
      cookies.set(pair.slice(0, equal), pair.slice(equal + 1));
    }
    return response;
  };
  const rpc = createTRPCUntypedClient({
    links: [
      httpBatchLink({
        url: `${APP_ORIGIN}/api/trpc`,
        transformer: superjson,
        fetch: request,
      }),
    ],
  });
  return { request, rpc };
}

async function waitFor(predicate, description, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await predicate();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Lab wait timed out: ${description}`);
}

function mailUrl(mail, fragment) {
  const decoded = mail.raw
    .replace(/=\r\n/g, "")
    .replace(/=([0-9A-F]{2})/g, (_all, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  const urls =
    decoded.match(/http:\/\/127\.0\.0\.2:3100\/api\/auth\/[^\s<>"']+/g) || [];
  const url = urls.find(value => value.includes(fragment));
  assert.ok(url, "SMTP message must contain the expected local auth link");
  return url.replaceAll("&amp;", "&");
}

function authPost(session, endpoint, input) {
  return session.request(`${APP_ORIGIN}/api/auth/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** 独立合成账号不会发送真实邮件；只修改固定 lab 数据库中的自有记录。 */
export async function runLiveSmoke({ env, fixture, getApplicationLogs }) {
  assertLabDatabase(env.DATABASE_URL);
  const checks = [];
  const record = text => checks.push(text);
  const session = createSession();
  const { request, rpc } = session;
  const suffix = randomUUID().slice(0, 8);
  const email = `service-lab-${suffix}@example.invalid`;
  let password = `Qa-Local-Only-${randomUUID()}!`;
  const pool = createPool({
    uri: env.DATABASE_URL,
    timezone: "Z",
    connectionLimit: 2,
  });
  try {
    await assert.rejects(
      pool.query("SELECT COUNT(*) FROM yumei_test.users"),
      error =>
        ["ER_DBACCESS_DENIED_ERROR", "ER_TABLEACCESS_DENIED_ERROR"].includes(
          error.code
        )
    );
    record(
      "Actual lab database user is denied read access to the shared yumei_test database"
    );
    assert.equal((await fetch(`${APP_ORIGIN}/readyz`)).status, 200);
    assert.equal((await fetch(`${APP_ORIGIN}/settings`)).status, 200);
    record(
      "Actual isolated application readiness and built settings page return HTTP 200"
    );
    const signup = await request(`${APP_ORIGIN}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "SIMULATED service lab",
        email,
        password,
        callbackURL: `${APP_ORIGIN}/chats`,
      }),
    });
    assert.equal(signup.status, 200);
    const user = (await signup.json()).user;
    const mail = await waitFor(
      () => fixture.evidence.mail.find(item => item.raw.includes(email)),
      "SMTP signup verification"
    );
    const decoded = mail.raw
      .replace(/=\r\n/g, "")
      .replace(/=([0-9A-F]{2})/g, (_all, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
    const match = decoded.match(
      /http:\/\/127\.0\.0\.2:3100\/api\/auth\/verify-email\?[^\s<>"']+/
    );
    assert.ok(match, "Actual SMTP message must contain the verification link");
    const verified = await request(match[0].replaceAll("&amp;", "&"));
    assert.ok([200, 302].includes(verified.status));
    const login = await request(`${APP_ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200);
    assert.equal((await rpc.query("auth.me")).id, user.id);
    await rpc.mutation("auth.confirmAge", { birthDate: "1990-01-01" });
    record(
      "Email/password signup -> actual SMTP socket sink -> verification -> authenticated login -> age confirmation"
    );
    assert.equal(
      (
        await fetch(`${APP_ORIGIN}/api/trpc/auth.confirmAge`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
      403
    );
    record("Write without CSRF rejected at the application boundary");
    await rpc.mutation("preferences.update", { language: "en" });
    let info = await rpc.query("billing.getInfo");
    assert.equal(info.tier, "free");
    assert.equal(new URL(info.checkoutUrls.pro).origin, FIXTURE_ORIGIN);
    assert.ok(
      (await (await fetch(info.checkoutUrls.pro)).text()).includes(
        "No charge is made"
      )
    );
    const snapshot = {
      meta: {
        event_name: "subscription_created",
        custom_data: { user_id: user.id },
      },
      data: {
        id: `qa-sub-${suffix}`,
        attributes: {
          status: "active",
          variant_id: 91002,
          updated_at: new Date().toISOString(),
          renews_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        },
      },
    };
    const body = JSON.stringify(snapshot);
    const webhook = signature =>
      fetch(`${APP_ORIGIN}/api/billing/lemon-webhook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature": signature,
        },
        body,
      });
    assert.equal((await webhook("invalid")).status, 401);
    const signature = createHmac("sha256", WEBHOOK_SECRET)
      .update(body)
      .digest("hex");
    assert.equal((await webhook(signature)).status, 200);
    assert.equal(
      (await (await webhook(signature)).json()).ignored,
      "duplicate event"
    );
    info = await rpc.query("billing.getInfo");
    assert.equal(info.tier, "pro");
    record(
      "SIMULATED checkout contains no payment collection; real signed webhook rejects invalid signature, upgrades entitlement and deduplicates replay"
    );
    const gf = await rpc.mutation("girlfriend.create", {
      name: "QA simulated companion",
      personality:
        "An adult synthetic companion used only for local acceptance.",
      appearance: "Adult fictional test character.",
      presetId: "xiaotao",
    });
    const conversation = await rpc.mutation("conversation.create", {
      girlfriendId: gf.id,
      title: "SIMULATED protocol acceptance",
    });
    const voices = await rpc.query("apiConfig.listElevenLabsVoices");
    assert.equal(voices.voices[0].id, "qa-synthetic-voice");
    const models = await rpc.query("apiConfig.listFishAudioModels", {});
    assert.equal(models.models[0].id, "qa-synthetic-model");
    record(
      "Original voice/model list APIs use QA-key-matched real HTTP upstream requests"
    );
    for (const provider of ["elevenlabs", "fishaudio"]) {
      await rpc.mutation("apiConfig.updatePreferences", {
        ttsProvider: provider,
        elevenlabsVoiceId: "qa-synthetic-voice",
        fishAudioModelId: "qa-synthetic-model",
      });
      const generated = await rpc.mutation("tts.generate", {
        text: "This is a local simulated audio test.",
      });
      assert.equal(generated.provider, provider);
      const media = await request(generated.audioUrl);
      assert.equal(media.status, 200);
      assert.equal(media.headers.get("content-type"), "audio/mpeg");
      const bytes = Buffer.from(await media.arrayBuffer());
      assert.ok(bytes.equals(fixture.audio.mp3));
      const file = path.join(LAB_DIR, `${provider}-application-output.mp3`);
      await writeFile(file, bytes);
      const decode = spawnSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        file,
        "-f",
        "null",
        "-",
      ]);
      assert.equal(decode.status, 0, "Audio must actually decode");
      record(
        `${provider}: application TTS -> HTTP simulated upstream -> staged media -> actual file URL -> MP3 decoder success`
      );
    }
    const transcription = await rpc.mutation("voice.transcribe", {
      audioBase64: fixture.audio.wav.toString("base64"),
      mimeType: "audio/wav",
      language: "en",
    });
    assert.ok(transcription.transcriptionId);
    assert.equal(transcription.duration, 2);
    const accepted = await request(`${APP_ORIGIN}/api/chat/turns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientRequestId: randomUUID(),
        conversationId: conversation.id,
        content: transcription.text,
        transcriptionId: transcription.transcriptionId,
      }),
    });
    assert.equal(accepted.status, 202);
    const turn = await accepted.json();
    const events = await request(
      `${APP_ORIGIN}/api/chat/turns/${turn.id}/events`,
      { signal: AbortSignal.timeout(12000) }
    );
    assert.ok(events.headers.get("content-type").includes("text/event-stream"));
    const wire = await events.text();
    assert.ok(wire.includes('"status":"succeeded"'));
    assert.ok(wire.includes("simulated local companion reply"));
    record(
      "Actual WAV -> multipart Whisper-compatible HTTP -> persisted transcription credential -> chat turn -> real SSE -> synthetic companion text"
    );
    for (const service of ["whisper", "elevenlabs", "fish"]) {
      if (service !== "whisper")
        await rpc.mutation("apiConfig.updatePreferences", {
          ttsProvider: service === "fish" ? "fishaudio" : "elevenlabs",
        });
      for (const mode of ["failure", "timeout"]) {
        fixture.modes[service] = mode;
        const begin = Date.now();
        await assert.rejects(
          service === "whisper"
            ? rpc.mutation("voice.transcribe", {
                audioBase64: fixture.audio.wav.toString("base64"),
                mimeType: "audio/wav",
              })
            : rpc.mutation("tts.generate", { text: "Simulated failure test" })
        );
        assert.ok(Date.now() - begin < 10000);
        record(
          `${service}: ${mode} surfaces application error within bounded deadline`
        );
      }
      fixture.modes[service] = "success";
    }
    await rpc.mutation("push.subscribe", fixture.device);
    assert.equal(
      (await rpc.query("push.status", { endpoint: fixture.device.endpoint }))
        .subscribed,
      true
    );
    // 构造已离开八小时的合成账号，避免绕过产品的近期聊天抑制规则。
    await pool.query(
      "UPDATE messages SET createdAt = DATE_SUB(NOW(), INTERVAL 8 HOUR) WHERE conversationId = ?",
      [conversation.id]
    );
    await pool.query(
      "UPDATE girlfriends SET lastInteractionAt = DATE_SUB(NOW(), INTERVAL 8 HOUR) WHERE id = ? AND userId = ?",
      [gf.id, user.id]
    );
    const preferences = await rpc.query("notification.preferences");
    await rpc.mutation("notification.updatePreferences", {
      expectedRevision: preferences.revision,
      preferences: {
        timeZone: "UTC",
        proactiveEnabled: true,
        proactiveMode: "daily",
        quietStart: 0,
        quietEnd: 0,
        frequencyDays: 1,
        hidePrivatePreview: true,
      },
    });
    await rpc.mutation("notification.checkProactive");
    const push = await waitFor(
      () => fixture.evidence.push[0],
      "encrypted proactive push outbox delivery"
    );
    assert.equal(push.vapidPresent, true);
    assert.ok(push.encryptedBytes > 50);
    assert.equal(push.payload.body, "You have a new message");
    assert.ok(!push.payload.body.includes(gf.name));
    assert.ok(push.payload.url.includes("notification="));
    const notification = (await rpc.query("notification.list"))[0];
    assert.ok(notification);
    await rpc.mutation("notification.markRead", { id: notification.id });
    assert.equal(await rpc.query("notification.unreadCount"), 0);
    record(
      "Device subscribe -> explicit daily consent -> actual persistent outbox -> SDK ECDH/VAPID -> local HTTP sink decrypts generic private preview -> notification read feedback"
    );
    const magicBefore = fixture.evidence.mail.length;
    const magicRequested = await authPost(session, "sign-in/magic-link", {
      email,
      callbackURL: `${APP_ORIGIN}/chats`,
    });
    assert.equal(magicRequested.status, 200);
    const magicMail = await waitFor(
      () =>
        fixture.evidence.mail
          .slice(magicBefore)
          .find(item => item.raw.includes(email)),
      "SMTP magic-link message"
    );
    const magicUrl = mailUrl(magicMail, "/magic-link/verify?");
    const magicSession = createSession();
    assert.equal((await magicSession.request(magicUrl)).status, 302);
    assert.equal((await magicSession.rpc.query("auth.me")).id, user.id);
    const replay = createSession();
    const replayed = await replay.request(magicUrl);
    assert.ok(replayed.headers.get("location").includes("error=INVALID_TOKEN"));
    assert.equal(await replay.rpc.query("auth.me"), null);
    record(
      "Magic-link email is actually captured by SMTP; first link authenticates and replay fails without issuing a session"
    );

    fixture.modes.smtp = "failure";
    const failedMailCount = fixture.evidence.mail.length;
    const resetFailed = await authPost(session, "request-password-reset", {
      email,
      redirectTo: `${APP_ORIGIN}/reset-password`,
    });
    // Better Auth 对密码重置保留防枚举的通用确认；供应商失败不会透传 HTTP。
    assert.equal(resetFailed.status, 200);
    const genericResponse = await resetFailed.json();
    assert.equal(genericResponse.status, true);
    assert.match(genericResponse.message, /if this email exists/i);
    assert.ok(!JSON.stringify(genericResponse).includes(email));
    assert.ok(!JSON.stringify(genericResponse).includes(user.id));
    const unknownReset = await authPost(session, "request-password-reset", {
      email: `unknown-${suffix}@example.invalid`,
      redirectTo: `${APP_ORIGIN}/reset-password`,
    });
    assert.equal(unknownReset.status, 200);
    assert.deepEqual(await unknownReset.json(), genericResponse);
    await waitFor(
      () => fixture.evidence.smtp.find(item => item.mode === "failure"),
      "actual SMTP DATA rejection"
    );
    assert.equal(fixture.evidence.mail.length, failedMailCount);
    await waitFor(
      () => getApplicationLogs().includes("451 SIMULATED temporary rejection"),
      "operator log records SMTP rejection"
    );
    assert.equal((await fetch(`${APP_ORIGIN}/readyz`)).status, 200);
    fixture.modes.smtp = "success";
    record(
      "SMTP rejection preserves identical generic responses for known and unknown email, reveals no account details, records no delivered email, logs the operator failure and keeps readiness healthy"
    );

    const resetBefore = fixture.evidence.mail.length;
    assert.equal(
      (
        await authPost(session, "request-password-reset", {
          email,
          redirectTo: `${APP_ORIGIN}/reset-password`,
        })
      ).status,
      200
    );
    const resetMail = await waitFor(
      () =>
        fixture.evidence.mail
          .slice(resetBefore)
          .find(item => item.raw.includes(email)),
      "SMTP password-reset message"
    );
    const resetter = createSession();
    const resetLink = await resetter.request(
      mailUrl(resetMail, "/reset-password/")
    );
    assert.equal(resetLink.status, 302);
    const token = new URL(resetLink.headers.get("location")).searchParams.get(
      "token"
    );
    assert.ok(token);
    const newPassword = `Qa-Reset-Local-Only-${randomUUID()}!`;
    assert.equal(
      (await authPost(resetter, "reset-password", { token, newPassword }))
        .status,
      200
    );
    assert.equal(
      (await authPost(resetter, "reset-password", { token, newPassword }))
        .status,
      400
    );
    assert.equal(await rpc.query("auth.me"), null);
    assert.equal(await magicSession.rpc.query("auth.me"), null);
    assert.equal(
      (await authPost(resetter, "sign-in/email", { email, password })).status,
      401
    );
    password = newPassword;
    assert.equal(
      (await authPost(resetter, "sign-in/email", { email, password })).status,
      200
    );
    assert.equal((await resetter.rpc.query("auth.me")).id, user.id);
    record(
      "Password-reset SMTP link redirects to a usable token; reset succeeds once, rejects replay, revokes password and magic-link sessions, rejects old password and accepts new password"
    );
    const [telemetry] = await pool.query(
      "SELECT kind,outcome,COUNT(*) AS count FROM aiTaskRuns WHERE userId=? GROUP BY kind,outcome",
      [user.id]
    );
    await writeFile(
      path.join(LAB_DIR, "browser-account.json"),
      JSON.stringify(
        {
          simulated: true,
          origin: APP_ORIGIN,
          email,
          password,
          conversationId: conversation.id,
          girlfriendId: gf.id,
        },
        null,
        2
      )
    );
    const report = {
      simulatedSuppliersOnly: true,
      genuineVendorVerification: false,
      origin: APP_ORIGIN,
      database: "yumei_live_lab_test",
      generatedAt: new Date().toISOString(),
      email,
      userId: user.id,
      conversationId: conversation.id,
      girlfriendId: gf.id,
      checks,
      telemetry,
      upstreamRequests: fixture.evidence.requests,
      push: fixture.evidence.push,
      mailCount: fixture.evidence.mail.length,
      smtpAttempts: fixture.evidence.smtp,
      playableAudio: [
        "simulated-audio.wav",
        "elevenlabs-application-output.mp3",
        "fishaudio-application-output.mp3",
      ],
    };
    return report;
  } finally {
    await pool.end();
  }
}
