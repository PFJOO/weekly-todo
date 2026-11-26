// ============================================================
// 카페 신메뉴 로컬 웹 서버 (내 PC 안에서만 열리는 작은 웹사이트)
//  - 실행:  node local-web/server.mjs    →  http://127.0.0.1:5100
//  - 외부 패키지 없이 Node.js 내장 기능만 써요.
//  - 바꿔도 되는 설정(환경변수): PORT(기본 5100), COOLDOWN_SECONDS(기본 300)
// ============================================================
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PUBLIC_DIR = resolve(HERE, "public");
const DATA_FILE = resolve(ROOT, "data", "menus.json");
const COLLECTOR_FILE = resolve(ROOT, "scripts", "fetch-menus.mjs");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 5100;
const COOLDOWN_SECONDS = Number.isFinite(Number(process.env.COOLDOWN_SECONDS)) && process.env.COOLDOWN_SECONDS !== undefined && process.env.COOLDOWN_SECONDS !== ""
  ? Math.max(0, Number(process.env.COOLDOWN_SECONDS))
  : 300;                                   // 갱신이 끝난 뒤 다음 갱신까지 기다리는 시간(초)
const RUN_TIMEOUT_MS = 3 * 60 * 1000;      // 한 번의 갱신 최대 시간 (3분)

const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
};

// ---------- 갱신 상태 (서버가 켜져 있는 동안만 기억해요) ----------
let refreshing = false;      // 지금 수집 중인가요?
let collectorBusy = false;   // 시간 초과 후에도 수집 프로그램이 아직 돌고 있으면 true (겹쳐 실행 방지)
let lastRun = null;
let cooldownUntil = 0;       // 이 시각(ms)까지는 새 갱신 불가

function cooldownSeconds() {
  return Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
}

// 서버를 껐다 켜도 쿨다운이 우회되지 않게, data/menus.json 의 수정 시각으로 남은 시간을 복원해요 (최선의 노력).
async function restoreCooldown() {
  try {
    const s = await stat(DATA_FILE);
    const until = s.mtimeMs + COOLDOWN_SECONDS * 1000;
    if (until > Date.now()) cooldownUntil = until;
  } catch { /* 파일이 없으면 바로 갱신 가능 */ }
}

function friendlyError(e) {
  const code = e && e.code;
  if (code === "EPERM" || code === "EBUSY" || code === "EACCES") {
    return "데이터 파일을 저장하지 못했어요. 다른 프로그램(편집기·백신)이 파일을 쓰고 있을 수 있어요. 잠시 뒤 다시 눌러 주세요.";
  }
  if (code === "ENOSPC") return "저장 공간이 부족해서 저장하지 못했어요. 디스크 공간을 확보한 뒤 다시 눌러 주세요.";
  if (e && e.name === "TimeoutError") return "공식 사이트 응답이 너무 늦어요. 인터넷 연결을 확인하고 잠시 뒤 다시 눌러 주세요.";
  return "갱신 중 문제가 생겼어요. 인터넷 연결을 확인하고 잠시 뒤 다시 눌러 주세요. 계속 안 되면 검은 창의 메시지를 담당자에게 알려 주세요.";
}

function startRefresh() {
  refreshing = true;
  collectorBusy = true;
  const startedAt = new Date().toISOString();
  let settled = false;
  let timer;

  const finish = (result) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    lastRun = { startedAt, finishedAt: new Date().toISOString(), ...result };
    cooldownUntil = Date.now() + COOLDOWN_SECONDS * 1000;   // 성공·실패 모두 끝난 시점부터 쿨다운
    refreshing = false;
  };

  timer = setTimeout(() => {
    finish({
      ok: false,
      changed: false,
      error: "갱신이 3분 안에 끝나지 않아 멈췄어요. 인터넷 연결을 확인하고 잠시 뒤 다시 눌러 주세요.",
      summary: [],
    });
  }, RUN_TIMEOUT_MS);

  (async () => {
    const mod = await import(pathToFileURL(COLLECTOR_FILE).href);
    return mod.runCollector();
  })()
    .then((r) => {
      finish({ ok: true, changed: !!(r && r.changed), summary: Array.isArray(r?.summary) ? r.summary : [] });
    })
    .catch((e) => {
      console.error("[refresh] 실패:", e && e.message ? e.message : e);
      finish({ ok: false, changed: false, error: friendlyError(e), summary: [] });
    })
    .finally(() => { collectorBusy = false; });
}

// ---------- 응답 도우미 ----------
const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function sendJson(req, res, status, obj, extra = {}) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  res.writeHead(status, {
    ...BASE_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    ...extra,
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

const sendError = (req, res, status, error, message, extra = {}, headers = {}) =>
  sendJson(req, res, status, { error, message, ...extra }, headers);

async function sendStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return notFound(req, res); }
  if (rel === "/") rel = "/index.html";

  // 경로 이탈·이상한 경로 차단: 역슬래시, 널 문자, 윈도우 드라이브/스트림(:), '..' 구간
  if (/[\\\0:]/.test(rel) || rel.split("/").some((seg) => seg === "..")) return notFound(req, res);

  const file = resolve(PUBLIC_DIR, "." + rel);
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + sep)) return notFound(req, res);

  const type = MIME[extname(file).toLowerCase()];
  if (!type) return notFound(req, res);

  let data;
  try {
    const s = await stat(file);
    if (!s.isFile()) return notFound(req, res);
    data = await readFile(file);
  } catch { return notFound(req, res); }

  const headers = { ...BASE_HEADERS, "Content-Type": type, "Content-Length": data.length, "Cache-Control": "no-cache" };
  if (type.startsWith("text/html")) {
    headers["Content-Security-Policy"] =
      "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
  }
  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : data);
}

const notFound = (req, res) =>
  sendError(req, res, 404, "not-found", "찾을 수 없는 주소예요. 주소를 다시 확인하거나 첫 화면(/)으로 돌아가 주세요.");

// ---------- 요청 처리 ----------
async function handle(req, res) {
  // 1) Host 검사 (DNS rebinding 방지)
  if (!ALLOWED_HOSTS.has(String(req.headers.host || "").toLowerCase())) {
    return sendError(req, res, 403, "forbidden", "허용되지 않은 접속 주소예요. 주소창에 http://127.0.0.1:" + PORT + " 를 입력해 접속해 주세요.");
  }

  let url;
  try { url = new URL(req.url, `http://127.0.0.1:${PORT}`); }
  catch { return notFound(req, res); }
  const pathname = url.pathname;
  const method = req.method;

  if (method === "OPTIONS") {
    return sendError(req, res, 405, "method-not-allowed", "이 방식의 요청은 지원하지 않아요.", {}, { Allow: "GET, HEAD, POST" });
  }

  if (method === "POST") {
    req.resume();   // 본문은 쓰지 않아요
    if (pathname !== "/api/refresh") {
      return sendError(req, res, 405, "method-not-allowed", "이 주소는 POST 요청을 받지 않아요.");
    }
    // 2) Origin 검사 (다른 웹페이지가 몰래 호출하는 것 방지)
    const origin = req.headers.origin;
    if (origin !== undefined && !ALLOWED_ORIGINS.has(String(origin).toLowerCase())) {
      return sendError(req, res, 403, "forbidden", "허용되지 않은 곳에서 온 요청이에요. 이 사이트 화면의 '지금 최신으로 갱신' 버튼을 눌러 주세요.");
    }
    // 3) 사용자 정의 헤더 검사
    if (req.headers["x-requested-with"] !== "cafe-local") {
      return sendError(req, res, 403, "forbidden", "허용되지 않은 요청이에요. 이 사이트 화면의 '지금 최신으로 갱신' 버튼을 눌러 주세요.");
    }
    if (refreshing || collectorBusy) {
      return sendError(req, res, 409, "already-running", "이미 갱신하는 중이에요. 1~2분 정도 기다려 주세요.");
    }
    const wait = cooldownSeconds();
    if (wait > 0) {
      return sendError(req, res, 429, "cooldown",
        `공식 사이트에 부담을 주지 않도록 갱신은 ${Math.ceil(COOLDOWN_SECONDS / 60) || 1}분에 한 번만 할 수 있어요. ${wait}초 뒤에 다시 눌러 주세요.`,
        { retryAfterSeconds: wait }, { "Retry-After": String(wait) });
    }
    startRefresh();
    return sendJson(req, res, 202, { started: true });
  }

  if (method !== "GET" && method !== "HEAD") {
    return sendError(req, res, 405, "method-not-allowed", "이 방식의 요청은 지원하지 않아요.", {}, { Allow: "GET, HEAD, POST" });
  }

  if (pathname === "/api/menus") {
    let text;
    try { text = await readFile(DATA_FILE, "utf8"); }
    catch (e) {
      if (e && e.code === "ENOENT") {
        return sendError(req, res, 404, "no-data", "아직 수집된 데이터가 없어요. '지금 최신으로 갱신'을 눌러 주세요.");
      }
      throw e;
    }
    try { JSON.parse(text); }
    catch {
      return sendError(req, res, 500, "bad-data", "저장된 메뉴 데이터가 깨져 있어요. '지금 최신으로 갱신'을 눌러 새로 받아 주세요.");
    }
    const body = Buffer.from(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, "utf8");
    res.writeHead(200, { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length, "Cache-Control": "no-store" });
    return res.end(method === "HEAD" ? undefined : body);
  }

  if (pathname === "/api/status") {
    let generatedAt = null;
    try { generatedAt = JSON.parse(await readFile(DATA_FILE, "utf8")).generatedAt ?? null; } catch { /* 없으면 null */ }
    // 시간 초과로 끝났어도 수집 프로그램이 뒤에서 아직 돌고 있으면(collectorBusy) '갱신 중'으로 알려서,
    // 새 갱신 요청이 409로 거절되는 것과 화면 상태가 어긋나지 않게 해요.
    const busy = refreshing || collectorBusy;
    return sendJson(req, res, 200, { refreshing: busy, cooldownSeconds: busy ? 0 : cooldownSeconds(), generatedAt, lastRun });
  }

  if (pathname.startsWith("/api/")) return notFound(req, res);
  return sendStatic(req, res, pathname);
}

// ---------- 서버 켜기 ----------
// 어떤 예외가 나도 서버가 꺼지지 않게 해요.
process.on("unhandledRejection", (e) => console.error("[경고] 처리되지 않은 오류(서버는 계속 동작):", e && e.message ? e.message : e));
process.on("uncaughtException", (e) => console.error("[경고] 예상치 못한 오류(서버는 계속 동작):", e && e.message ? e.message : e));

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error("[요청 오류]", e && e.message ? e.message : e);
    if (!res.headersSent) {
      sendError(req, res, 500, "server-error", "서버에서 문제가 생겼어요. 페이지를 새로고침해 보고, 계속 안 되면 start.bat 을 다시 실행해 주세요.");
    } else {
      res.destroy();
    }
  });
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;

server.on("error", (e) => {
  if (e && e.code === "EADDRINUSE") {
    console.error(`포트 ${PORT} 번이 이미 사용 중이에요. 이 사이트가 이미 켜져 있거나 다른 프로그램이 쓰고 있어요.`);
    console.error(`이미 켜져 있다면 브라우저에서 http://127.0.0.1:${PORT} 를 열어 보세요. 아니라면 다른 창을 닫거나 PORT 환경변수로 다른 번호를 지정해 주세요.`);
  } else {
    console.error("서버를 켜지 못했어요:", e && e.message ? e.message : e);
  }
  process.exit(1);
});

await restoreCooldown();
server.listen(PORT, HOST, () => {
  console.log(`Local web: http://127.0.0.1:${PORT}`);
  console.log("끄려면 이 창에서 Ctrl+C 를 누르거나 창을 닫으세요.");
});
