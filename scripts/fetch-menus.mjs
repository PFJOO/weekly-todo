// ============================================================
// 카페 신메뉴 자동 수집 프로그램
//  - 각 카페 "공식 사이트"에 공개된 신메뉴 정보를 읽어서 data/menus.json 에 저장해요.
//  - 실행 방법:  node scripts/fetch-menus.mjs   (Node.js 18 이상, 설치할 것 없음)
//  - 지어낸 데이터는 없어요. 사이트에서 못 읽으면 "실패/지원 안 함"으로 표시해요.
// ============================================================
import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "data", "menus.json");

// ★ 바꿔도 되는 설정
const RECENT_DAYS_FOR_ESTIMATE = 60;   // 메가커피처럼 공식 NEW 표시가 없을 때 '최근 등록'으로 볼 기간(일)
const UA = "Mozilla/5.0 (compatible; CafeNewMenuStudy/1.0; personal study project)";

// ---------- 도우미 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

function decode(s = "") {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ").trim();
}
const ymd = (s) => (s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);

async function http(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9", ...(opts.headers || {}) },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
  return res;
}

// ---------- 카페별 수집 함수 ----------
// 각 함수는 [{ key, name, en, desc, image, category, released, url }] 를 돌려줘요.

// 스타벅스: 공식 데이터에 신메뉴 표시(newicon=Y)와 시작일(new_SDATE)이 있어요.
async function starbucks() {
  const base = "https://www.starbucks.co.kr";
  const pages = [
    { path: "/menu/drink_list.do", label: "음료" },
    { path: "/menu/food_list.do", label: "푸드" },
  ];
  const seen = new Map();
  for (const p of pages) {
    const html = await (await http(base + p.path)).text();
    const codes = [...new Set(html.match(/W\d{7}/g) || [])];
    for (const code of codes) {
      let json;
      try {
        const r = await http(base + "/menu/productListAjax.do", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: base + p.path },
          body: "CATE_CD=" + code,
        });
        json = await r.json();
      } catch { continue; }
      for (const m of json.list || []) {
        if (m.newicon !== "Y") continue;
        const isSeasonName = /^\d{4}|Christmas|Pre-|Season|시즌/i.test(m.cate_NAME || "");
        const prev = seen.get(m.product_CD);
        if (prev && !(prev.seasonOnly && !isSeasonName)) continue;   // 중복은 일반 카테고리 이름을 우선
        seen.set(m.product_CD, {
          key: "sb-" + m.product_CD,
          name: m.product_NM,
          en: m.product_ENGNM || "",
          desc: decode(m.content || ""),
          image: m.file_PATH ? (m.img_UPLOAD_PATH || "https://image.istarbucks.co.kr") + m.file_PATH : "",
          category: isSeasonName ? p.label : (m.cate_NAME || p.label),
          released: ymd(m.new_SDATE),
          url: base + p.path,
          seasonOnly: isSeasonName,
        });
      }
      await sleep(150);   // 사이트에 부담을 주지 않도록 잠깐 쉬어요
    }
  }
  // 굿즈(텀블러·머그 등)는 메뉴가 아니라서 빼요.
  const MERCH = /텀블러|머그|글라스|에코백|패브릭|스트로|케이스|카드|보냉|MD/;
  let list = [...seen.values()].filter((m) => !MERCH.test(m.category));
  // "X" 와 "아이스 X" 가 둘 다 있으면 "X" 하나만 남겨요 (같은 메뉴의 HOT/ICED 버전)
  const names = new Set(list.map((m) => m.name));
  list = list.filter((m) => !(m.name.startsWith("아이스 ") && names.has(m.name.slice(4))));
  return list.map(({ seasonOnly, ...rest }) => ({ ...rest, image: encodeURI(rest.image) }));
}

// 투썸플레이스: 전체 메뉴를 받아서 공식 'New' 배지가 붙은 것만 골라요. (카페용품/굿즈는 제외)
async function twosome() {
  const base = "https://mo.twosome.co.kr";
  const r = await http(base + "/mn/menuInfoListAjax.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: base + "/mn/menuInfoList.do" },
    body: "pageNum=1&grtCd=&midCd=",
  });
  const j = await r.json();
  if (j.queryCode !== 1000) throw new Error("응답 코드 " + j.queryCode);
  return (j.fetchResultListSet || [])
    .filter((m) => m.BADG_NM === "New" && m.GRT_NM !== "상품")
    .map((m) => ({
      key: "ts-" + m.MENU_CD,
      name: m.MENU_NM,
      en: m.EN_MENU_NM || "",
      desc: "",
      image: m.MENU_IMG_01 ? base + m.MENU_IMG_01 : "",
      category: [m.GRT_NM, m.MID_NM].filter(Boolean).join(" · "),
      released: null,
      url: base + "/mn/menuInfoList.do",
    }));
}

// 빽다방: 공식 '신메뉴' 페이지의 목록을 그대로 읽어요.
async function paik() {
  const url = "https://paikdabang.com/menu/menu_new/";
  const html = await (await http(url)).text();
  const start = html.indexOf("new_menu_slider");
  if (start < 0) throw new Error("신메뉴 영역을 찾지 못했어요 (사이트 구조가 바뀐 것 같아요)");
  const area = html.slice(start);
  const items = [];
  const seen = new Set();
  for (const chunk of area.split('class="swiper-slide"').slice(1)) {
    const name = decode((chunk.match(/class="best_tit">([\s\S]*?)<\/p>/) || [])[1]);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    items.push({
      key: "pk-" + name,
      name,
      en: decode((chunk.match(/class="menu_tit2[^"]*">([\s\S]*?)<\/div>/) || [])[1]),
      desc: decode((chunk.match(/<p class="txt">([\s\S]*?)<\/p>/) || [])[1]),
      image: encodeURI((chunk.match(/<img src="([^"]+)"/) || [])[1] || ""),
      category: "신메뉴",
      released: null,
      url,
    });
  }
  return items;
}

// 이디야커피: 메뉴마다 붙은 공식 NEW 아이콘(new_icon)이 있는 것만 골라요.
async function ediya() {
  const base = "https://www.ediya.com";
  const url = base + "/contents/drink.html";
  const html = await (await http(url)).text();
  const re = /show_slide_detail\('(\d+)'\)"><span class="new_icon">[\s\S]*?<\/span><img src="([^"]+)" alt="([^"]*)"/g;
  const seen = new Map();
  let m;
  while ((m = re.exec(html))) {
    const name = decode(m[3]).replace(/^\((L|EX)\)\s*/, "");   // (L)/(EX) 사이즈 표시는 합쳐요
    if (seen.has(name)) continue;
    seen.set(name, {
      key: "ed-" + name,
      name,
      en: "",
      desc: "",
      image: m[2].startsWith("http") ? m[2] : base + m[2],
      category: "음료",
      released: null,
      url,
    });
  }
  return [...seen.values()];
}

// 메가커피: 공식 NEW 표시가 없어요. 메뉴 이미지가 최근에 올라온 것을 '신메뉴로 추정'해요.
async function mega() {
  const url = "https://www.mega-mgccoffee.com/menu/";
  const html = await (await http(url + "menu.php?menu_category1=&menu_category2=&category=", { headers: { Referer: url } })).text();
  const cutoff = Date.now() - RECENT_DAYS_FOR_ESTIMATE * 86400e3;
  const items = [];
  const seen = new Set();
  for (const li of html.split("<li>").slice(1)) {
    const name = decode((li.match(/<b>([\s\S]*?)<\/b>/) || [])[1]);
    const img = (li.match(/<img src="([^"]+\/upload\/menu\/[^"]+)"/) || [])[1] || "";
    const stamp = (img.match(/\/(\d{14})_/) || [])[1];
    if (!name || !stamp || seen.has(name)) continue;
    const d = Date.UTC(+stamp.slice(0, 4), +stamp.slice(4, 6) - 1, +stamp.slice(6, 8));
    if (d < cutoff) continue;
    seen.add(name);
    items.push({
      key: "mg-" + name,
      name,
      en: decode((li.match(/text text1">\s*([A-Za-z][^<]*)</) || [])[1]),
      desc: "",
      image: img,
      category: decode((li.match(/cont_gallery_list_label[^>]*>([^<]*)</) || [])[1]) === "HOT" ? "HOT" : "ICE",
      released: `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`,
      url,
    });
  }
  return items;
}

// 컴포즈커피: 공식 NEW 표시도 등록일도 없어요. 대신 메뉴마다 붙는 '등록 번호(item_srl)'가
// 새로 등록할수록 커져서, 번호가 큰(=최근 등록된) 메뉴를 '신메뉴로 추정'해요.
const COMPOSE_LATEST_COUNT = 12;   // ★ 상위 몇 개를 신메뉴로 볼지 (바꾸면 개수가 달라져요)
const COMPOSE_CATEGORIES = [       // 컴포즈 메뉴 카테고리 번호와 이름
  [301298, "추천메뉴"], [303364, "커피ㆍ콜드브루"], [303365, "베버리지"], [303366, "프라페ㆍ스무디"],
  [303367, "밀크쉐이크"], [303368, "에이드ㆍ주스"], [303369, "티"], [308857, "푸드ㆍ디저트"], [303371, "아이스크림"],
];
async function compose() {
  const base = "https://composecoffee.com";
  const listUrl = (c) => `${base}/index.php?mid=compose&act=dispCafemenuGalleryList&category_srl=${c}`;
  const all = [];
  let okPages = 0;
  for (const [code, catName] of COMPOSE_CATEGORIES) {
    try {
      const html = await (await http(listUrl(code))).text();
      okPages++;
      // 메뉴 하나는 <a href="...item_srl=번호" class="cafemenu-menu-item"> ... </a> 모양이에요.
      // (번호가 class 앞쪽 주소에 있어서, 한 칸으로 묶어서 읽어야 번호가 어긋나지 않아요)
      const itemRe = /item_srl=(\d+)"[^>]*class="cafemenu-menu-item">([\s\S]*?)<\/a>/g;
      for (const m of html.matchAll(itemRe)) {
        const srl = +m[1];
        const name = decode((m[2].match(/cafemenu-menu-name">([\s\S]*?)<\/div>/) || [])[1]);
        const img = (m[2].match(/<img src="([^"]+)"/) || [])[1] || "";
        if (srl && name) all.push({ srl, name, img, catName, code });
      }
    } catch { /* 카테고리 하나가 실패해도 나머지는 계속해요 */ }
    await sleep(300);
  }
  if (okPages === 0) throw new Error("컴포즈 메뉴 페이지를 하나도 읽지 못했어요");
  if (all.length === 0) throw new Error("메뉴 목록을 찾지 못했어요 (사이트 구조가 바뀐 것 같아요)");

  // 같은 메뉴의 HOT(H-)/ICE(I-) 버전은 하나로 합치고, 번호가 가장 큰 것을 기준으로 삼아요.
  const merged = new Map();
  for (const m of all) {
    const name = m.name.replace(/^[HI]-\s*/, "");
    const cur = merged.get(name);
    if (!cur || m.srl > cur.srl) merged.set(name, { ...m, name });
  }
  return [...merged.values()]
    .sort((a, b) => b.srl - a.srl)
    .slice(0, COMPOSE_LATEST_COUNT)
    .map((m) => ({
      key: "cp-" + m.name,
      name: m.name,
      en: "",
      desc: "",
      image: m.img ? encodeURI(m.img.startsWith("http") ? m.img : base + m.img) : "",
      category: m.catName,
      released: null,
      url: listUrl(m.code),
    }));
}

// ---------- 카페 목록 ----------
// mode: official = 공식 신메뉴 표시를 읽음 / estimated = 추정 / unsupported = 자동 수집 불가
const BRANDS = [
  { id: "starbucks", name: "스타벅스", site: "https://www.starbucks.co.kr/menu/drink_list.do", mode: "official", run: starbucks,
    note: "공식 사이트의 '신메뉴' 표시와 출시일을 그대로 가져와요." },
  { id: "ediya", name: "이디야커피", site: "https://www.ediya.com/contents/drink.html", mode: "official", run: ediya,
    note: "공식 메뉴판에서 NEW 아이콘이 붙은 메뉴만 가져와요. 출시일은 공개되지 않아요." },
  { id: "twosome", name: "투썸플레이스", site: "https://mo.twosome.co.kr/mn/menuInfoList.do", mode: "official", run: twosome,
    note: "공식 메뉴판의 'New' 배지가 붙은 메뉴만 가져와요. 굿즈(텀블러 등)는 뺐어요. 출시일은 공개되지 않아요." },
  { id: "paik", name: "빽다방", site: "https://paikdabang.com/menu/menu_new/", mode: "official", run: paik,
    note: "공식 사이트의 '신메뉴' 페이지 목록을 그대로 가져와요. 출시일은 공개되지 않아요." },
  { id: "mega", name: "메가커피", site: "https://www.mega-mgccoffee.com/menu/", mode: "estimated", run: mega,
    note: `공식 사이트에 신메뉴 표시가 없어요. 메뉴 이미지가 최근 ${RECENT_DAYS_FOR_ESTIMATE}일 안에 올라온 메뉴를 '신메뉴로 추정'해서 보여줘요. 실제와 다를 수 있어요.` },
  { id: "hollys", name: "할리스", site: "https://www.hollys.co.kr/menu/signature.do", mode: "unsupported", run: null,
    note: "공식 메뉴판에 신메뉴 표시가 없어서 자동으로 구분할 수 없어요. 공식 사이트에서 직접 확인해 주세요." },
  { id: "compose", name: "컴포즈커피", site: "https://composecoffee.com/index.php?mid=compose&act=dispCafemenuGalleryList&category_srl=301298", mode: "estimated", run: compose,
    note: `공식 사이트에 신메뉴 표시와 등록일이 없어요. 메뉴마다 붙는 등록 번호가 큰(최근 등록된) 순서로 ${COMPOSE_LATEST_COUNT}개를 '신메뉴로 추정'해서 보여줘요. 실제와 다를 수 있어요.` },
];

// ---------- 실행 ----------
// 안전한 저장: 임시 파일에 쓴 뒤 이름을 바꿔요. 윈도우에서 EPERM/EBUSY 이면 잠깐 쉬고 다시 시도해요.
async function saveAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tmp, text, "utf8");
    for (let i = 0; ; i++) {
      try { await rename(tmp, file); return; }
      catch (e) {
        if (i >= 4 || (e.code !== "EPERM" && e.code !== "EBUSY")) throw e;
        await sleep(100);
      }
    }
  } catch (e) {
    try { await unlink(tmp); } catch {}
    throw e;
  }
}

// 수집을 실행하고 { summary, changed } 를 돌려줘요. 오류는 throw 만 해요(출력·종료는 CLI 쪽에서).
// onBrand(info): 카페 하나가 끝날 때마다 불러 줘요 (선택).
export async function runCollector({ onBrand } = {}) {
  let prev = null;
  try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch {}
  const firstRun = !prev;                       // 처음 실행이면 '지금 있는 메뉴'는 기준선(이미 있던 메뉴)으로 처리
  const today = todayKST();
  const now = new Date().toISOString();
  const brands = [];
  const summary = [];

  for (const b of BRANDS) {
    const old = prev?.brands?.find((x) => x.id === b.id);
    const base = { id: b.id, name: b.name, site: b.site, mode: b.mode, note: b.note };
    if (!b.run) {
      brands.push({ ...base, status: "unsupported", checkedAt: now, items: [] });
      summary.push({ id: b.id, name: b.name, status: "unsupported", count: 0 });
      continue;
    }

    try {
      const found = await b.run();
      if (found.length === 0 && (old?.items?.length || 0) > 0) {
        // 갑자기 0개가 되면 사이트 구조가 바뀐 것일 수 있어요. 지우지 않고 오류로 표시해요.
        throw new Error("신메뉴가 0개로 읽혔어요 (사이트 구조 변경 가능성). 이전 목록을 유지해요.");
      }
      const oldByKey = new Map((old?.items || []).map((i) => [i.key, i]));
      // 이 카페를 처음 수집하는 경우(파일 자체가 처음이거나, 새로 지원이 추가된 카페)는
      // 지금 있는 메뉴를 '기존 메뉴'로 봐요. 안 그러면 전부 "오늘 새로 올라옴"으로 잘못 표시돼요.
      const baseline = firstRun || !old || !old.lastOk;
      const items = found.map((i) => ({
        ...i,
        // 처음 우리가 발견한 날. 기준선으로 처리한 메뉴는 null(= 기존 메뉴)
        firstSeen: oldByKey.has(i.key) ? oldByKey.get(i.key).firstSeen : (baseline ? null : today),
      }));
      brands.push({ ...base, status: "ok", checkedAt: now, lastOk: now, items });
      const row = { id: b.id, name: b.name, status: "ok", count: items.length };
      summary.push(row);
      onBrand?.(row);
    } catch (e) {
      brands.push({ ...base, status: "error", error: e.message, checkedAt: now, lastOk: old?.lastOk || null, items: old?.items || [] });
      const row = { id: b.id, name: b.name, status: "error", count: (old?.items || []).length, error: e.message };
      summary.push(row);
      onBrand?.(row);
    }
    await sleep(300);
  }

  await mkdir(dirname(OUT), { recursive: true });
  // 내용이 같으면 시각만 바뀐 파일을 만들지 않도록, 비교용으로 시각을 뺀 글자를 비교해요.
  // checkedAt/lastOk 는 확인할 때마다 달라지는 시각이라 비교에서 빼요. (그래야 신메뉴가 실제로 바뀐 때만 저장·배포돼요)
  const strip = (o) => JSON.stringify(o, (k, v) => (k === "checkedAt" || k === "generatedAt" || k === "lastOk" ? undefined : v));
  const next = { generatedAt: now, brands };
  if (prev && strip(prev) === strip(next)) return { summary, changed: false };
  await saveAtomic(OUT, JSON.stringify(next, null, 2) + "\n");
  return { summary, changed: true };
}

// 터미널에서 직접 실행했을 때만 자동으로 돌려요 (다른 파일이 import 할 땐 실행하지 않아요).
function isDirectRun() {
  if (!process.argv[1]) return false;
  const norm = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
  try { return norm(resolve(fileURLToPath(import.meta.url))) === norm(resolve(process.argv[1])); }
  catch { return false; }
}

if (isDirectRun()) {
  runCollector({
    onBrand: (r) => {
      if (r.status === "ok") console.log(`✔ ${r.name}: 신메뉴 ${r.count}개`);
      else console.error(`✘ ${r.name}: ${r.error}`);
    },
  })
    .then(({ changed }) => {
      if (changed) console.log("저장 완료:", OUT);
      else console.log("변경 없음 — 파일을 그대로 둡니다.");
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
