"use strict";
// ============================================================
// ★ 여기만 바꾸면 설정이 바뀌어요
// ============================================================
const FRESH_DAYS = 7;                 // 이 기간 안에 올라온 메뉴에 '새로 올라옴'을 붙여요
const RECENT_DAYS = 30;               // '최근 30일 출시' 보기 기간
const LAST_KEY = "cafe-last-brand";   // 마지막으로 본 카페 기억용 (저장이 막혀도 괜찮아요)
const PAGE_SIZE = 12;                 // 카페 목록은 12개씩 보여주고 '더 보기'로 늘려요
const POLL_MS = 2000;                // 갱신 중일 때 진행 상태를 확인하는 간격(2초)
const POLL_MAX_MS = 4 * 60 * 1000;    // 이 시간 넘게 안 끝나면 기다리기를 멈춰요 (서버 제한은 3분)
const POLL_FAIL_MAX = 3;              // 연속으로 이만큼 연결이 실패하면 서버가 꺼진 것으로 봐요

const SERVER_OFF_MSG = "서버가 꺼져 있어요. local-web\\start.bat 을 더블클릭해 주세요.";

const $ = (id) => document.getElementById(id);
const MODE_TAG = {
  official:    ["공식 신메뉴 표시", "official"],
  estimated:   ["신메뉴 추정", "est"],
  unsupported: ["자동 확인 불가", "none"],
};

// 화면이 기억하는 값들
const S = {
  data: null,            // /api/menus 결과 (없으면 null)
  current: null,         // 선택된 카페 id
  recentOnly: false,     // '최근 출시만' 보기
  limit: PAGE_SIZE,      // 지금 보여주는 카드 개수
  menusState: "loading", // loading | ok | down | nodata | error
  menusMsg: "",          // 메뉴를 못 불러왔을 때 서버가 준 설명
  serverDown: false,
  generatedAt: null,     // /api/status 의 generatedAt
  lastRun: null,         // /api/status 의 lastRun
  resultFresh: false,    // 이 화면에서 방금 갱신한 결과인가?
  running: false,        // 갱신 진행 중인가? (중복 클릭 방지)
  cooldownEnd: 0,        // 쿨다운이 끝나는 시각(ms)
  msg: null,             // 일시적 안내 { tone, text, help }
  ready: false,          // 쿨다운이 막 끝났는가? ("이제 다시 갱신할 수 있어요" 덧붙이기)
};

// ---------- 작은 도구들 ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;   // textContent라서 외부 글이 코드로 실행되지 않아요
  return e;
}
function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장이 막혀도 괜찮아요 */ } }
const isHttps = (u) => typeof u === "string" && /^https:\/\//i.test(u);
const isHttp = (u) => typeof u === "string" && /^https?:\/\//i.test(u);

function parseDay(s) {
  const m = typeof s === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function daysAgo(s) {
  const then = parseDay(s);
  if (!then) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((now - then) / 86400000);
}
function isFresh(i) {
  const a = daysAgo(i.released), b = daysAgo(i.firstSeen);
  return (a !== null && a >= 0 && a <= FRESH_DAYS) || (b !== null && b >= 0 && b <= FRESH_DAYS);
}
function fmtDay(s) { const d = parseDay(s); return d ? (d.getMonth() + 1) + "/" + d.getDate() : ""; }
function fmtDateTime(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return "";
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtLeft(sec) {   // 스크린리더도 읽기 쉽게 "4분 32초" 형태로 써요
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? m + "분 " + s + "초" : s + "초";
}
// 카페 사이트의 오류 글(HTTP 403 등)을 쉬운 말로 바꿔요. 원문은 괄호 안에 남겨요.
function friendlyReason(raw) {
  const t = String(raw || "").trim();
  const m = /(?:HTTP\s*)?\b([45]\d\d)\b/i.exec(t);
  const code = m ? Number(m[1]) : 0;
  if (code === 401 || code === 403 || code === 429) return "공식 사이트가 접속을 막았어요(HTTP " + code + ")";
  if (code === 404) return "공식 사이트 주소가 바뀐 것 같아요(HTTP 404)";
  if (code >= 500) return "공식 사이트가 지금 응답하지 않아요(HTTP " + code + ")";
  return "공식 사이트를 읽지 못했어요" + (t ? "(" + t + ")" : "");
}
// 분류 앞의 원본 코드 "(CF)" 같은 것은 화면에서만 지워요 (데이터는 그대로)
function cleanCategory(c) { return String(c || "").replace(/^\s*\([A-Za-z]{1,5}\)\s*/, "").trim(); }
// 출시일 최신순 → 처음 발견한 날 최신순 → 원래 순서
function sorted(items) {
  return items.map((it, idx) => ({ it, idx })).sort((x, y) => {
    const rx = x.it.released || "", ry = y.it.released || "";
    if (rx !== ry) return ry.localeCompare(rx);
    const fx = x.it.firstSeen || "", fy = y.it.firstSeen || "";
    if (fx !== fy) return fy.localeCompare(fx);
    return x.idx - y.idx;
  }).map((o) => o.it);
}

// ---------- 서버와 이야기하기 ----------
// 연결 자체가 안 되면(서버 꺼짐) network:true 인 오류를 던져요.
async function api(path, opts) {
  let res;
  try {
    res = await fetch(path, Object.assign({ cache: "no-store" }, opts));
  } catch (e) {
    const err = new Error("network"); err.network = true; throw err;
  }
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  return { ok: res.ok, status: res.status, body };
}
const bodyMsg = (b, fallback) => (b && typeof b.message === "string" && b.message) ? b.message : fallback;

// ---------- 중요한 안내(서버 꺼짐) ----------
function setServerDown(down) {
  S.serverDown = down;
  const box = $("notice");
  renderRefresh();   // 서버가 꺼지면 갱신 버튼도 함께 잠가요
  if (!down) { box.hidden = true; box.textContent = ""; return; }
  if (!box.hidden) return;
  box.textContent = "";
  const first = el("p", "");
  first.append("서버가 꺼져 있어요. ", el("code", "", "local-web\\start.bat"), " 을 더블클릭해 주세요.");   // 윈도우 글꼴이 \ 를 ₩ 로 보여 줘서 고정폭 글꼴로 써요
  box.append(first);
  box.append(el("p", "help", "서버를 켠 뒤에 아래 '다시 확인' 버튼을 눌러 주세요. (검은 창을 닫으면 서버가 꺼져요.)"));
  const b = el("button", "btn", "다시 확인");
  b.type = "button";
  b.onclick = () => { init(); };
  box.append(b);
  box.hidden = false;
}

// ---------- 메뉴 불러오기 ----------
async function loadMenus() {
  if (!S.data) { S.menusState = "loading"; renderAll(); }
  let r;
  try {
    r = await api("/api/menus");
  } catch (e) {
    setServerDown(true);
    if (!S.data) { S.menusState = "down"; }
    renderAll();
    return false;
  }
  setServerDown(false);
  if (!r.ok) {
    if (!S.data) {
      S.menusState = r.status === 404 ? "nodata" : "error";
      S.menusMsg = bodyMsg(r.body, r.status === 404
        ? "아직 수집된 데이터가 없어요. '지금 최신으로 갱신'을 눌러 주세요."
        : "신메뉴 목록을 불러오지 못했어요. 잠시 뒤 '다시 불러오기'를 눌러 주세요.");
    }
    renderAll();
    return false;
  }
  const j = r.body;
  if (!j || !Array.isArray(j.brands)) {
    if (!S.data) { S.menusState = "error"; S.menusMsg = "신메뉴 파일의 모양이 이상해요. '지금 최신으로 갱신'을 눌러 새로 받아 보세요."; }
    renderAll();
    return false;
  }
  j.brands = j.brands.filter((b) => b && typeof b === "object").map((b) => Object.assign({}, b, {
    items: Array.isArray(b.items) ? b.items.filter((i) => i && typeof i === "object") : [],
  }));
  S.data = j;
  S.menusState = j.brands.length ? "ok" : "nodata";
  if (!j.brands.length) S.menusMsg = "카페 목록이 비어 있어요. '지금 최신으로 갱신'을 눌러 새로 받아 보세요.";
  if (!S.data.brands.some((b) => b.id === S.current)) {
    const last = safeGet(LAST_KEY);
    const pick = S.data.brands.find((b) => b.id === last) || S.data.brands.find((b) => b.items.length) || S.data.brands[0];
    S.current = pick ? pick.id : null;
  }
  renderAll();
  return true;
}

// ---------- 화면 그리기: 위쪽 ----------
function lastCheckedIso() {
  return (S.lastRun && S.lastRun.finishedAt) || S.generatedAt || (S.data && S.data.generatedAt) || null;
}
function renderUpdated() {
  const p = $("updated");
  const t = fmtDateTime(lastCheckedIso());
  if (!t) { setText(p, S.menusState === "loading" ? "불러오는 중..." : "마지막 확인 시각을 알 수 없어요"); return; }
  let text = "마지막 확인: " + t;
  const saved = S.generatedAt || (S.data && S.data.generatedAt);
  const savedText = fmtDateTime(saved);
  if (savedText && savedText !== t) text += " · 목록이 마지막으로 바뀐 때: " + savedText;   // 같은 시각이면 한 번만 보여줘요
  setText(p, text);
}

function renderBanner() {
  const banner = $("banner");
  if (!S.data) { banner.hidden = true; return; }
  const fresh = S.data.brands.map((b) => ({ b, n: b.items.filter(isFresh).length })).filter((x) => x.n > 0);
  const total = fresh.reduce((s, x) => s + x.n, 0);
  banner.hidden = false;
  banner.className = "banner" + (total ? " has-new" : "");
  banner.textContent = "";
  if (total) {
    banner.append("🔔 최근 " + FRESH_DAYS + "일 안에 새로 올라온 메뉴가 ");
    banner.append(el("b", "", total + "개"));
    banner.append(" 있어요 — " + fresh.map((x) => (x.b.name || x.b.id) + " " + x.n).join(", "));
  } else {
    banner.textContent = "최근 " + FRESH_DAYS + "일 안에 새로 올라온 메뉴는 아직 없어요. 카페를 눌러 현재 신메뉴를 확인해 보세요.";
  }
}

function renderChips() {
  const chips = $("chips");
  const focusId = document.activeElement && document.activeElement.parentNode === chips ? document.activeElement.dataset.id : null;
  chips.textContent = "";
  if (!S.data) return;
  S.data.brands.forEach((b) => {
    const btn = el("button", "chip" + (b.id === S.current ? " active" : ""));
    btn.type = "button";
    btn.dataset.id = b.id;
    btn.setAttribute("aria-pressed", b.id === S.current ? "true" : "false");
    btn.append(b.name || b.id);
    if (b.status !== "unsupported") btn.append(el("span", "cnt", b.items.length + "개"));
    if (b.status === "error") {
      const w = el("span", "warnmark", "⚠");
      w.setAttribute("aria-hidden", "true");
      btn.append(w, el("span", "sr-only", " (최근 갱신 실패, 이전 목록)"));
    }
    if (b.items.some(isFresh)) {
      btn.append(el("span", "dot"));
      btn.append(el("span", "sr-only", " (새로 올라온 메뉴 있음)"));
    }
    btn.onclick = () => selectBrand(b.id);
    chips.append(btn);
    if (b.id === focusId) btn.focus();
  });
}

function selectBrand(id) {
  S.current = id;
  S.recentOnly = false;
  S.limit = PAGE_SIZE;
  safeSet(LAST_KEY, id);
  const chips = $("chips").children;
  for (const c of chips) {
    const on = c.dataset.id === id;
    c.classList.toggle("active", on);
    c.setAttribute("aria-pressed", on ? "true" : "false");
  }
  renderPanel();
}

// ---------- 화면 그리기: 선택한 카페 ----------
function stateCard(title, msg, btnLabel, onClick) {
  const card = el("div", "state-card");
  card.setAttribute("role", "status");
  card.append(el("h2", "", title));
  if (msg) card.append(el("p", "", msg));
  if (btnLabel) {
    const b = el("button", "btn", btnLabel);
    b.type = "button"; b.onclick = onClick;
    card.append(b);
  }
  return card;
}

function renderPanel() {
  const panel = $("panel");
  panel.textContent = "";

  if (S.menusState === "loading" && !S.data) {
    const c = el("div", "state-card");
    c.setAttribute("role", "status");
    c.append(el("span", "spin on"));
    c.firstChild.setAttribute("aria-hidden", "true");
    c.append(el("span", "", "신메뉴를 불러오는 중이에요..."));
    panel.append(c);
    return;
  }
  if (!S.data) {
    if (S.menusState === "down") {
      panel.append(stateCard("신메뉴를 아직 불러오지 못했어요", "서버가 꺼져 있어서 목록을 가져올 수 없어요. 위의 안내대로 서버를 켠 뒤 '다시 불러오기'를 눌러 주세요.", "다시 불러오기", init));
    } else if (S.menusState === "nodata") {
      panel.append(stateCard("보여 드릴 신메뉴가 아직 없어요", S.menusMsg, "다시 불러오기", loadMenus));
    } else {
      panel.append(stateCard("신메뉴를 불러오지 못했어요", S.menusMsg, "다시 불러오기", loadMenus));
    }
    return;
  }

  const b = S.data.brands.find((x) => x.id === S.current);
  if (!b) {
    panel.append(stateCard("카페를 골라 주세요", "위의 카페 버튼을 누르면 그 카페의 신메뉴가 보여요."));
    return;
  }

  if (S.serverDown) {
    const a = el("div", "alert", "⚠ 서버와 연결되지 않아서, 화면에 이미 불러온 이전 목록을 보여 드리고 있어요. 최신과 다를 수 있어요.");
    panel.append(a);
  }

  const head = el("div", "panel-head");
  head.append(el("h2", "", b.name || b.id));
  const isErr = b.status === "error";
  const [label, cls] = isErr ? ["이전 목록(갱신 실패)", "est"] : (MODE_TAG[b.mode] || MODE_TAG.unsupported);
  head.append(el("span", "tag " + cls, label));
  if (isHttp(b.site) && b.status !== "unsupported") {
    const a = el("a", "site", "공식 사이트에서 보기 ↗");
    a.href = b.site; a.target = "_blank"; a.rel = "noopener noreferrer";
    head.append(a);
  }
  panel.append(head);
  if (b.note) panel.append(el("p", "note", b.note));

  // 확인 시각: 오류 카페의 checkedAt 은 '실패한 시도'의 시각이라, 성공한 시각(lastOk)만 보여줘요
  if (b.status !== "unsupported") {
    const when = fmtDateTime(isErr ? b.lastOk : b.checkedAt);
    if (when) panel.append(el("p", "checked", (isErr ? "마지막으로 성공한 확인: " : "이 카페는 ") + when + (isErr ? "" : "에 확인했어요.")));
  }

  if (isErr) {
    const when = fmtDateTime(b.lastOk) || "기록 없음";
    panel.append(el("div", "alert", "⚠ 최근 갱신에서 " + friendlyReason(b.error) + ". 아래는 " + when + "에 마지막으로 확인한 목록(이전 목록)이라 최신과 다를 수 있어요. PC에서 '신메뉴갱신.bat'을 실행하거나 위의 '지금 최신으로 갱신' 버튼으로 다시 시도해 보세요."));
  }
  if (b.mode === "estimated" && !isErr) {
    panel.append(el("div", "alert", "공식 신메뉴 표시가 아니에요. 최근 등록된 메뉴를 추정한 거예요."));
  }
  if (b.status === "unsupported") {
    const box = el("div", "empty", "이 카페는 신메뉴를 자동으로 확인할 수 없어요. 아래 버튼으로 공식 사이트에서 직접 확인해 주세요.");
    if (isHttp(b.site)) {
      box.append(el("br"));
      const a = el("a", "btn", (b.name || "카페") + " 공식 사이트 열기 ↗");
      a.href = b.site; a.target = "_blank"; a.rel = "noopener noreferrer";
      box.append(a);
    }
    panel.append(box);
    return;
  }

  const hasDates = b.items.some((i) => parseDay(i.released));
  const gridBox = el("div", "");
  if (hasDates) {
    const tools = el("div", "tools");
    tools.setAttribute("role", "group");
    tools.setAttribute("aria-label", "보기 방식");
    [["전체 신메뉴 " + b.items.length + "개", false], ["최근 " + RECENT_DAYS + "일 출시", true]].forEach(([text, flag]) => {
      const t = el("button", "", text);
      t.type = "button";
      t.setAttribute("aria-pressed", flag === S.recentOnly ? "true" : "false");
      t.onclick = () => {
        S.recentOnly = flag;
        S.limit = PAGE_SIZE;
        for (const x of tools.children) x.setAttribute("aria-pressed", x === t ? "true" : "false");
        renderGrid(gridBox, b);
      };
      tools.append(t);
    });
    panel.append(tools);
  }
  panel.append(gridBox);
  renderGrid(gridBox, b);
}

function renderGrid(box, b) {
  box.textContent = "";
  let items = sorted(b.items);
  if (S.recentOnly) items = items.filter((i) => { const d = daysAgo(i.released); return d !== null && d >= 0 && d <= RECENT_DAYS; });
  if (items.length === 0) {
    const e = el("div", "empty", S.recentOnly ? "최근 " + RECENT_DAYS + "일 안에 출시된 신메뉴가 없어요. '전체 신메뉴'를 눌러 보세요." : "지금 공식 사이트에 표시된 신메뉴가 없어요.");
    e.setAttribute("role", "status");
    box.append(e);
    return;
  }
  const grid = el("ul", "grid");
  items.slice(0, S.limit).forEach((i) => {
    const card = el("li", "item");
    const pic = el("div", "pic");
    const fallback = () => {
      pic.textContent = "";
      pic.append(el("span", "", "☕"), el("small", "", "사진 없음"));
      pic.firstChild.setAttribute("aria-hidden", "true");
    };
    if (isHttps(i.image)) {
      const img = document.createElement("img");
      img.alt = "";                       // 바로 아래에 메뉴 이름이 있어서 사진 설명은 비워요
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.onerror = fallback;             // 사진이 안 열리면 컵 모양으로 대신해요
      img.src = i.image;
      pic.append(img);
    } else { fallback(); }
    card.append(pic);

    const body = el("div", "body");
    const badges = el("div", "badges");
    if (isFresh(i)) badges.append(el("span", "badge fresh", "새로 올라옴"));
    if (b.status === "error") badges.append(el("span", "badge est", "이전 목록"));
    else badges.append(el("span", b.mode === "estimated" ? "badge est" : "badge", b.mode === "estimated" ? "신메뉴 추정" : "공식 NEW"));
    body.append(badges);
    body.append(el("div", "name", String(i.name || "이름 없음")));
    if (i.en) body.append(el("div", "en", String(i.en)));
    const day = fmtDay(i.released);
    const meta = [cleanCategory(i.category), day ? (b.mode === "estimated" ? "사이트 등록 " + day : day + " 출시") : ""].filter(Boolean).join(" · ");
    if (meta) body.append(el("div", "cat", meta));
    if (i.desc) body.append(el("div", "desc", String(i.desc)));
    card.append(body);
    grid.append(card);
  });
  box.append(grid);
  const rest = items.length - S.limit;
  if (rest > 0) {
    const wrap = el("div", "more");
    const more = el("button", "btn", "더 보기 (" + Math.min(PAGE_SIZE, rest) + "개 더, 남은 " + rest + "개)");
    more.type = "button";
    more.onclick = () => {
      const firstNew = S.limit;
      S.limit += PAGE_SIZE;
      renderGrid(box, b);
      const again = box.querySelector(".more .btn");
      if (again) again.focus();                                   // 계속 누를 수 있게 버튼에 포커스 유지
      else { const c = box.querySelectorAll(".item")[firstNew]; if (c) { c.tabIndex = -1; c.focus(); } }
    };
    wrap.append(more);
    box.append(wrap);
  }
}

function renderAll() {
  renderUpdated();
  renderBanner();
  renderChips();
  renderPanel();
}

// ---------- 갱신 영역 ----------
function cooldownLeft() { return Math.max(0, Math.ceil((S.cooldownEnd - Date.now()) / 1000)); }

// 마지막 실행 결과를 쉬운 말로 바꿔요
function resultView(lr) {
  const prefix = S.resultFresh ? "" : "서버를 켠 뒤 마지막 갱신: ";
  const summary = Array.isArray(lr.summary) ? lr.summary : [];
  if (!lr.ok) {
    return {
      tone: "error",
      text: prefix + "갱신하지 못했어요. " + (lr.error || "원인을 알 수 없어요."),
      help: "화면의 이전 목록은 그대로예요. 인터넷 연결을 확인하고 5분쯤 뒤에 다시 눌러 보세요. 계속 안 되면 서버(검은 창)를 껐다 켜 보세요.",
      summary,
    };
  }
  const bad = summary.filter((s) => s.status === "error");
  if (bad.length) {
    return {
      tone: "warn",
      text: prefix + "갱신을 마쳤어요. 다만 " + bad.map((s) => s.name || s.id).join(", ") + " 쪽은 공식 사이트를 읽지 못해서 이전 목록을 그대로 보여 드려요.",
      help: "공식 사이트가 잠시 막혔거나 모양이 바뀌었을 수 있어요. 잠시 뒤 다시 눌러 보세요.",
      summary,
    };
  }
  if (lr.changed === false) {
    return { tone: "ok", text: prefix + "갱신을 마쳤어요. 새로 바뀐 신메뉴는 없어요. (확인은 정상적으로 끝났어요.)", summary };
  }
  return { tone: "ok", text: prefix + "갱신을 마쳤어요. 신메뉴 목록을 새로 불러왔어요.", summary };
}

function renderRefresh() {
  const btn = $("refreshBtn");
  const status = $("refreshStatus");
  const detail = $("refreshDetail");
  const timer = $("refreshTimer");
  const left = cooldownLeft();
  const spin = btn.querySelector(".spin");

  const down = S.serverDown && !S.running;
  const disabled = S.running || left > 0 || down;
  btn.setAttribute("aria-disabled", disabled ? "true" : "false");   // disabled 대신 aria-disabled: 키보드 포커스가 사라지지 않게
  spin.classList.toggle("on", S.running);
  setText($("refreshLabel"), S.running ? "가져오는 중..." : (down ? "서버를 먼저 켜 주세요" : (left > 0 ? "잠시 뒤 다시 갱신할 수 있어요" : "지금 최신으로 갱신")));

  if (S.running) {
    setText(timer, S.runStart ? Math.floor((Date.now() - S.runStart) / 1000) + "초 지남" : "");
  } else if (left > 0 && !down) {
    setText(timer, "다시 누를 수 있을 때까지 " + fmtLeft(left));   // 글자로 써 두어 스크린리더가 읽을 수 있어요 (자동 낭독은 하지 않아요)
  } else {
    setText(timer, "");
  }

  // 상태 문장: 진행 중 > 일시 안내(S.msg) > 마지막 실행 결과 > 기본 안내
  // 완료 요약(summary)은 다음 갱신을 시작할 때까지 계속 보여줘요 (쿨다운이 끝나도 사라지지 않아요)
  let tone = "", text = "", help = "", summary = null;
  const res = S.lastRun ? resultView(S.lastRun) : null;
  if (S.running) {
    text = "공식 사이트에서 가져오는 중... 보통 몇십 초에서 2분 걸려요. 창을 닫지 말고 기다려 주세요.";
  } else if (down) {
    if (S.msg) ({ tone, text, help } = S.msg);   // 서버 꺼짐 안내는 위쪽 박스가 하므로 여기서는 겹치지 않게 비워요
  } else {
    if (S.msg) ({ tone, text, help } = S.msg);
    else if (res) ({ tone, text, help } = res);
    if (res) summary = res.summary;
    if (!S.msg && S.ready && left === 0) text = (text ? text + " " : "") + "이제 다시 갱신할 수 있어요.";
    if (!text) text = left > 0
      ? "방금 갱신해서 잠시 쉬는 중이에요. 공식 사이트에 부담을 주지 않도록 갱신은 5분에 한 번만 할 수 있어요."
      : "공식 사이트에서 신메뉴를 다시 가져와요. 보통 몇십 초에서 2분 걸려요.";
  }
  status.className = "status" + (tone ? " " + tone : "");
  setText(status, text);

  detail.textContent = "";
  const hasSummary = summary && summary.length;
  if (!S.running && (help || hasSummary)) {
    if (help) detail.append(el("p", "help", help));
    if (hasSummary) {
      const ul = el("ul");
      summary.forEach((s) => {
        const name = s.name || s.id || "";
        let li;
        if (s.status === "ok") li = el("li", "", "✔ " + name + " " + (typeof s.count === "number" ? s.count + "개" : "확인함"));
        else if (s.status === "error") li = el("li", "err", "✘ " + name + " 읽지 못함" + (s.error ? " — " + friendlyReason(s.error) : ""));
        else li = el("li", "na", "– " + name + " 자동 확인 불가");
        ul.append(li);
      });
      detail.append(ul);
    }
    detail.hidden = false;
  } else {
    detail.hidden = true;
  }
}

// ----- 쿨다운 / 진행 시간 표시 (1초마다) -----
let tickTimer = null;
function ensureTick() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    if (!S.running && cooldownLeft() === 0) {
      clearInterval(tickTimer); tickTimer = null;
      if (S.cooldownEnd) {   // 방금 쿨다운이 끝났어요
        S.cooldownEnd = 0;
        S.msg = null;
        S.ready = true;      // 결과 요약은 그대로 두고 "이제 다시 갱신할 수 있어요"만 덧붙여요
        renderRefresh();
        loadStatus();        // 서버 시계와 어긋났는지 한 번 더 확인해요
      }
      return;
    }
    renderRefresh();
  }, 1000);
}
function startCooldown(sec) {
  S.cooldownEnd = sec > 0 ? Date.now() + sec * 1000 : 0;
  if (sec > 0) ensureTick();
}

// ----- 상태 읽기 -----
function applyStatus(s) {
  if (!s || typeof s !== "object") return;
  S.generatedAt = typeof s.generatedAt === "string" ? s.generatedAt : null;
  S.lastRun = s.lastRun && typeof s.lastRun === "object" ? s.lastRun : null;
  const sec = Number(s.cooldownSeconds);
  if (!s.refreshing && sec > 0) {
    startCooldown(Math.ceil(sec));
    S.ready = false;
  } else if (!s.refreshing) {
    S.cooldownEnd = 0;
  }
  renderUpdated();
  renderRefresh();
}

async function loadStatus() {
  let r;
  try { r = await api("/api/status"); } catch (e) { return null; }
  if (!r.ok || !r.body) return null;
  if (r.body.refreshing && !S.running) {   // 다른 곳에서 이미 갱신 중이면 이어서 지켜봐요
    S.msg = null;
    beginRunning(Date.now() - 1000, false);
  }
  applyStatus(r.body);
  return r.body;
}

// ----- 갱신 진행 지켜보기 -----
let pollTimer = null, pollStart = 0, pollFails = 0, staleTries = 0, clickTime = 0;
function beginRunning(since, expectFresh) {
  S.running = true;
  S.runStart = since;
  S.lastRun = null; S.ready = false;   // 새 갱신을 시작하면 지난 결과 요약을 치워요
  clickTime = expectFresh ? since : 0;
  staleTries = 0; pollFails = 0; pollStart = Date.now();
  renderRefresh();
  ensureTick();
  clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, POLL_MS);
}
function stopRunning() {
  S.running = false;
  clearTimeout(pollTimer); pollTimer = null;
}

async function poll() {
  let r = null;
  try { r = await api("/api/status"); } catch (e) { r = null; }
  if (!r || !r.ok || !r.body) {
    pollFails++;
    if (pollFails >= POLL_FAIL_MAX) {
      stopRunning();
      setServerDown(true);
      S.msg = { tone: "error", text: "서버와 연결이 끊겨서 갱신이 끝났는지 알 수 없어요.", help: "서버를 켠 뒤 화면을 새로고침(F5)해서 결과를 확인해 주세요." };
      renderAll(); renderRefresh();
      return;
    }
    pollTimer = setTimeout(poll, POLL_MS);
    return;
  }
  pollFails = 0;
  setServerDown(false);
  const s = r.body;
  if (s.refreshing) {
    if (Date.now() - pollStart > POLL_MAX_MS) {
      stopRunning();
      S.msg = { tone: "error", text: "갱신이 너무 오래 걸려서 기다리기를 멈췄어요.", help: "서버가 계속 작업 중일 수 있어요. 몇 분 뒤 화면을 새로고침(F5)해서 결과를 확인해 주세요." };
      renderRefresh();
      return;
    }
    renderRefresh();
    pollTimer = setTimeout(poll, POLL_MS);
    return;
  }
  // 끝났다고 하지만, 우리가 방금 누른 실행의 결과가 아직 아닐 수 있어요
  if (clickTime) {
    const fin = s.lastRun && Date.parse(s.lastRun.finishedAt);
    if (!(fin >= clickTime - 2000) && staleTries < 5) {
      staleTries++;
      pollTimer = setTimeout(poll, POLL_MS);
      return;
    }
  }
  await finishRun(s);
}

async function finishRun(s) {
  stopRunning();
  S.msg = null;
  S.resultFresh = true;
  applyStatus(s);
  if (s.lastRun && s.lastRun.ok) {
    const ok = await loadMenus();   // 선택한 카페는 그대로 두고 목록만 새로 불러와요
    if (!ok && S.data) {
      S.msg = { tone: "warn", text: "갱신은 끝났지만 새 목록을 화면에 불러오지 못했어요.", help: "화면을 새로고침(F5)해 보세요." };
    }
  }
  renderRefresh();
}

// ----- 버튼 누르기 -----
async function onRefresh() {
  if (S.running) return;                        // 갱신 중에는 눌러도 아무 일도 없어요 (중복 방지)
  const left = cooldownLeft();
  if (left > 0) {                               // 쿨다운 중에 눌러도 무반응이 아니라 이유를 알려줘요 (role=status 영역)
    S.msg = { tone: "warn", text: "방금 갱신했어요. " + fmtLeft(left) + " 뒤에 다시 누를 수 있어요." };
    renderRefresh();
    return;
  }
  if (S.serverDown) return;                     // 서버가 꺼져 있으면 위쪽 안내의 '다시 확인'을 쓰게 해요
  S.running = true;                             // await 전에 바로 잠가서 빠른 두 번 클릭도 막아요
  S.msg = null; S.resultFresh = true;
  const t0 = Date.now();
  S.runStart = t0;
  renderRefresh();
  ensureTick();

  let r;
  try {
    r = await api("/api/refresh", { method: "POST", headers: { "X-Requested-With": "cafe-local" } });
  } catch (e) {
    S.running = false;
    setServerDown(true);   // 안내는 위쪽 '서버가 꺼져 있어요' 박스가 맡아요 (같은 말을 두 번 쓰지 않아요)
    renderRefresh();
    return;
  }
  setServerDown(false);
  if (r.status === 202) { beginRunning(t0, true); return; }
  if (r.status === 409) {
    S.msg = null;
    beginRunning(t0 - 1000, false);
    return;
  }
  S.running = false;
  if (r.status === 429) {
    const sec = Number(r.body && r.body.retryAfterSeconds);
    startCooldown(sec > 0 ? Math.ceil(sec) : 300);
    // 서버 문구의 남은 시간은 금방 낡아서, 줄어드는 숫자는 버튼 옆 카운트다운으로만 보여줘요
    S.msg = { tone: "warn", text: "방금 갱신해서 잠시 쉬는 중이에요. 공식 사이트에 부담을 주지 않도록 5분에 한 번만 갱신할 수 있어요. 버튼 옆 시간이 끝나면 다시 눌러 주세요." };
  } else if (r.status === 403) {
    S.msg = { tone: "error", text: bodyMsg(r.body, "서버가 이 요청을 허락하지 않았어요."), help: "화면을 새로고침(F5)한 뒤 다시 눌러 보세요. 그래도 안 되면 주소창이 " + location.origin + " 인지 확인해 주세요." };
  } else {
    S.msg = { tone: "error", text: bodyMsg(r.body, "갱신을 시작하지 못했어요."), help: "잠시 뒤 다시 눌러 보세요. 계속 안 되면 서버(검은 창)를 껐다 켜 주세요." };
  }
  renderRefresh();
}

$("refreshBtn").addEventListener("click", onRefresh);

// 다른 창을 보다가 돌아왔을 때, 쿨다운이나 서버 상태가 어긋났으면 다시 맞춰요
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !S.running && (S.cooldownEnd || S.serverDown)) loadStatus();
});

// ---------- 시작 ----------
async function init() {
  await Promise.all([loadMenus(), loadStatus()]);
  renderAll();
  renderRefresh();
}
renderRefresh();
init();
