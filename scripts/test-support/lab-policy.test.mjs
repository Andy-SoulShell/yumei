/** 无真实供应商凭据的实验边界回归，使用 Node 内置测试运行器。 */
import process from "node:process";
import test from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  assertLabDatabase,
  assertLabEgress,
  classifyQaRequest,
  QA_KEYS,
  ROOT,
  DATABASE,
  DATABASE_GRANT,
  assertLabGrants,
} from "./lab-config.mjs";

function safeProcessEnvironment() {
  const env = {};
  for (const name of [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "COMSPEC",
    "PATHEXT",
  ])
    if (process.env[name]) env[name] = process.env[name];
  return env;
}

test("fixed lab database rejects shared, production and remote targets", () => {
  assertLabDatabase(`mysql://qa:synthetic@127.0.0.1:3307/${DATABASE}`);
  for (const target of [
    "mysql://qa:synthetic@127.0.0.1:3307/yumei_test",
    "mysql://qa:synthetic@127.0.0.1:3306/yumei",
    `mysql://qa:synthetic@remote.invalid/${DATABASE}`,
  ])
    assert.throws(() => assertLabDatabase(target));
});

test("only the exact QA Whisper credential and endpoint are rerouted", () => {
  const headers = { Authorization: `Bearer ${QA_KEYS.whisper}` };
  assert.equal(
    classifyQaRequest(
      "https://api.openai.com/v1/audio/transcriptions",
      headers
    ),
    "/whisper/v1/audio/transcriptions"
  );
  for (const [url, value] of [
    [
      "https://api.openai.com/v1/audio/transcriptions",
      "sk-real-shaped-do-not-send",
    ],
    ["https://api.openai.com/v1/chat/completions", QA_KEYS.whisper],
    [
      "https://api.openai.com.attacker.invalid/v1/audio/transcriptions",
      QA_KEYS.whisper,
    ],
  ])
    assert.equal(
      classifyQaRequest(url, { Authorization: `Bearer ${value}` }),
      null
    );
});

test("ElevenLabs/Fish mapping requires QA credential plus exact origin and route", () => {
  assert.equal(
    classifyQaRequest("https://api.elevenlabs.io/v1/voices", {
      "xi-api-key": QA_KEYS.elevenlabs,
    }),
    "/elevenlabs/v1/voices"
  );
  assert.equal(
    classifyQaRequest("https://api.fish.audio/model?page_number=1", {
      Authorization: `Bearer ${QA_KEYS.fish}`,
    }),
    "/fish/model?page_number=1"
  );
  assert.equal(
    classifyQaRequest("https://api.elevenlabs.io/v1/voices", {
      "xi-api-key": "another-user-key",
    }),
    null
  );
  assert.equal(
    classifyQaRequest("https://api.fish.audio/v1/tts", {
      Authorization: `Bearer ${QA_KEYS.whisper}`,
    }),
    null
  );
});

test("official DeepSeek destination is never rewritten, even with a QA key", () => {
  for (const key of Object.values(QA_KEYS))
    assert.equal(
      classifyQaRequest("https://api.deepseek.com/chat/completions", {
        Authorization: `Bearer ${key}`,
      }),
      null
    );
  assert.throws(
    () => assertLabEgress("https://api.deepseek.com/chat/completions"),
    /blocked/
  );
});

test("database grants reject global, foreign database, role and grant-option privileges", () => {
  const usage = "GRANT USAGE ON *.* TO `yumei_service_lab`@`%`";
  const own = `GRANT ALL PRIVILEGES ON \`${DATABASE_GRANT}\`.* TO \`yumei_service_lab\`@\`%\``;
  assert.doesNotThrow(() => assertLabGrants([usage, own]));
  for (const invalid of [
    "GRANT ALL PRIVILEGES ON *.* TO `yumei_service_lab`@`%`",
    "GRANT SELECT ON `yumei`.* TO `yumei_service_lab`@`%`",
    "GRANT `operator_role`@`%` TO `yumei_service_lab`@`%`",
    `${own} WITH GRANT OPTION`,
    `GRANT ALL PRIVILEGES ON \`${DATABASE}\`.* TO \`yumei_service_lab\`@\`%\``,
  ])
    assert.throws(() => assertLabGrants([usage, own, invalid]), /privileges/);
});

test("lab blocks external SMTP/payment/push/API HTTP destinations", () => {
  for (const url of [
    "https://api.resend.com/emails",
    "https://api.lemonsqueezy.com/v1/subscriptions",
    "https://fcm.googleapis.com/fcm/send/device",
    "https://api.openai.com/v1/audio/transcriptions",
    "https://example.com",
  ])
    assert.throws(() => assertLabEgress(url), /blocked/);
});

test("lab configuration drops inherited service sentinels without reading real process keys", () => {
  const configUrl = pathToFileURL(
    path.join(ROOT, "scripts/test-support/lab-config.mjs")
  ).href;
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import assert from 'node:assert/strict'; import {buildLabEnvironment} from '${configUrl}'; const env=await buildLabEnvironment({publicKey:'synthetic-public',privateKey:'synthetic-private'}); assert.equal(env.OPERATOR_DEEPSEEK_KEY,undefined); assert.equal(env.RESEND_API_KEY,undefined); assert.equal(env.PORT,'3100'); assert.equal(new URL(env.DATABASE_URL).pathname,'/${DATABASE}'); assert.equal(env.SMTP_HOST,'127.0.0.1'); assert.ok(env.DOTENV_CONFIG_PATH.endsWith('empty.env')); assert.notEqual(env.JWT_SECRET,env.KEY_ENCRYPTION_KEY);`,
    ],
    {
      cwd: ROOT,
      env: {
        ...safeProcessEnvironment(),
        OPERATOR_DEEPSEEK_KEY: "do-not-inherit-synthetic-sentinel",
        RESEND_API_KEY: "do-not-inherit-synthetic-sentinel",
      },
      encoding: "utf8",
    }
  );
  assert.equal(child.status, 0, child.stderr);
});

test("preload rejects non-lab processes before installing adapters", () => {
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(path.join(ROOT, "scripts/test-support/lab-preload.mjs"))
        .href,
      "--input-type=module",
      "-e",
      "",
    ],
    {
      cwd: ROOT,
      env: { ...safeProcessEnvironment(), YUMEI_SERVICE_LAB: "0" },
      encoding: "utf8",
    }
  );
  assert.notEqual(child.status, 0);
  assert.ok(child.stderr.includes("explicit isolated lab configuration"));
});

test("real-shaped credentials are blocked before outbound fetch or axios HTTP", () => {
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(path.join(ROOT, "scripts/test-support/lab-preload.mjs"))
        .href,
      "--input-type=module",
      "-e",
      `import assert from 'node:assert/strict'; import axios from 'axios'; await assert.rejects(fetch('https://api.openai.com/v1/audio/transcriptions',{headers:{authorization:'Bearer sk-never-send-real-shaped'}}),/blocked/); await assert.rejects(axios.get('https://api.elevenlabs.io/v1/voices',{headers:{'xi-api-key':'never-send-real-shaped'}}),/blocked/);`,
    ],
    {
      cwd: ROOT,
      env: {
        ...safeProcessEnvironment(),
        YUMEI_SERVICE_LAB: "1",
        PORT: "3100",
        DATABASE_URL: `mysql://qa:synthetic@127.0.0.1:3307/${DATABASE}`,
      },
      encoding: "utf8",
      timeout: 10000,
    }
  );
  assert.equal(child.status, 0, child.stderr);
});

test("fetch, axios and every native HTTP request/get block DeepSeek and external targets before transport", () => {
  const sentinel = `import http from 'node:http'; import https from 'node:https'; import {syncBuiltinESMExports} from 'node:module'; const fail=()=>{throw new Error('UNEXPECTED_TRANSPORT_REACHED')}; for(const client of [http,https]){client.request=fail;client.get=fail;} globalThis.fetch=async()=>fail();syncBuiltinESMExports();`;
  const code = `import assert from 'node:assert/strict';import http from 'node:http';import https from 'node:https';import axios from 'axios'; await assert.rejects(fetch('https://api.deepseek.com/chat/completions'),/blocked/); await assert.rejects(axios.get('https://api.deepseek.com/chat/completions'),/blocked/);for(const client of [http,https])for(const method of ['request','get']){const protocol=client===https?'https:':'http:';assert.throws(()=>client[method](protocol+'//api.deepseek.com/chat/completions'),/blocked/);assert.throws(()=>client[method](new URL(protocol+'//outside.invalid/')),/blocked/);assert.throws(()=>client[method]({hostname:'outside.invalid',path:'/'}),/blocked/);assert.throws(()=>client[method](protocol+'//127.0.0.1/',{hostname:'outside.invalid'}),/blocked/);} `;
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      `data:text/javascript,${encodeURIComponent(sentinel)}`,
      "--import",
      pathToFileURL(path.join(ROOT, "scripts/test-support/lab-preload.mjs"))
        .href,
      "--input-type=module",
      "-e",
      code,
    ],
    {
      cwd: ROOT,
      env: {
        ...safeProcessEnvironment(),
        YUMEI_SERVICE_LAB: "1",
        PORT: "3100",
        DATABASE_URL: `mysql://qa:synthetic@127.0.0.1:3307/${DATABASE}`,
      },
      encoding: "utf8",
      timeout: 10000,
    }
  );
  assert.equal(child.status, 0, child.stderr);
});

test("fetch and axios cannot follow a local redirect to a disallowed loopback target", () => {
  // 第二服务只在回环网卡，不会在防护回归失败时向公网发送。
  const code = `import assert from 'node:assert/strict';import http from 'node:http';import axios from 'axios';let reached=0;const sink=http.createServer((_q,r)=>{reached++;r.end('should not reach');});const source=http.createServer((_q,r)=>{r.writeHead(302,{location:'http://127.0.0.3:'+sink.address().port+'/private'});r.end();});const listen=(s,h)=>new Promise(r=>s.listen(0,h,r));await listen(sink,'127.0.0.3');await listen(source,'127.0.0.1');try{const url='http://127.0.0.1:'+source.address().port+'/redirect';assert.equal((await fetch(url,{redirect:'follow'})).status,302);await assert.rejects(axios.get(url,{maxRedirects:5}),e=>e.response?.status===302);assert.equal(reached,0);}finally{for(const s of [source,sink]){s.closeAllConnections();await new Promise(r=>s.close(r));}}`;
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(path.join(ROOT, "scripts/test-support/lab-preload.mjs"))
        .href,
      "--input-type=module",
      "-e",
      code,
    ],
    {
      cwd: ROOT,
      env: {
        ...safeProcessEnvironment(),
        YUMEI_SERVICE_LAB: "1",
        PORT: "3100",
        DATABASE_URL: `mysql://qa:synthetic@127.0.0.1:3307/${DATABASE}`,
      },
      encoding: "utf8",
      timeout: 10000,
    }
  );
  assert.equal(child.status, 0, child.stderr);
});
