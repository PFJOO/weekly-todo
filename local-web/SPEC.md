# 로컬 웹 명세 (PRD.md 기반)

이 문서는 에이전트 팀(백엔드 / 프런트엔드 / UX 검수 / 검증)이 **같은 기준**으로 일하기 위한 명세다.
기준 문서: `../PRD.md` (카페 신메뉴 자동 업데이트). 이 문서와 PRD가 충돌하면 PRD가 우선이다.

## 1. 목표

내 PC에서 `node local-web/server.mjs` 한 줄(또는 더블클릭)로 켜서, 브라우저로 `http://127.0.0.1:5100` 에 접속해 쓰는 **로컬 웹앱**.
- 카페를 선택하면 그 카페의 신메뉴가 바로 보인다. (PRD F1~F4, F7~F9)
- 화면의 **"지금 최신으로 갱신"** 버튼이 공식 사이트에서 신메뉴를 다시 가져온다. 내 PC의 인터넷으로 접속하므로 GitHub 서버에서 막히는 투썸도 갱신된다.
- 배포용 파일(`cafe-menu.html`, `index.html`, `.github/`, `vercel` 관련)은 **절대 수정하지 않는다.**

## 2. 폴더 구조와 담당

```
local-web/
  SPEC.md                ← 이 문서 (오케스트레이터)
  server.mjs             ← [백엔드] 서버 진입점
  lib/*.mjs              ← [백엔드] 서버 내부 모듈 (필요하면)
  public/index.html      ← [프런트] 화면
  public/app.css         ← [프런트]
  public/app.js          ← [프런트]
scripts/fetch-menus.mjs  ← [백엔드] 수집 로직. 아래 §5의 방식으로만 수정
data/menus.json          ← 수집 결과 (서버가 읽고, 갱신 때 덮어씀)
```
**자기 담당이 아닌 파일은 수정하지 않는다.** 필요하면 오케스트레이터에게 요청한다.

## 3. 공통 제약

- **의존성 없음:** Node.js 내장 모듈만 사용 (`node:http`, `node:fs`, `node:path` 등). `npm install` 금지. Node 18+ 에서 동작.
- **127.0.0.1 에만 바인딩** (외부 접속 불가). 포트 기본 5100, 환경변수 `PORT`로 변경 가능.
- **한국어 UI.** 코딩 경험이 없는 사용자가 쓴다. 오류 문구는 쉬운 말로, 원인 + 해결 방법을 한 문장씩.
- **정직성:** 공식 사이트에서 확인되지 않은 신메뉴를 만들어 내지 않는다. 추정/불가/오류 상태는 화면에 그대로 드러낸다.
- **외부 데이터는 코드로 실행되지 않게** (`textContent`, 사진은 `https://` 주소만).
- **공식 사이트에 과도한 요청 금지.** 갱신은 서버가 최소 5분 간격(쿨다운)을 강제한다.
- **git 커밋·푸시 금지.** 파일만 만든다. 비밀번호/토큰/개인정보를 코드나 로그에 넣지 않는다.

## 4. API 계약 (백엔드 ↔ 프런트 — 이 모양을 정확히 지킨다)

모든 응답은 `Content-Type: application/json; charset=utf-8`. **모든 오류 응답은 반드시** `{ "error": "<코드>", "message": "<쉬운 한국어 설명(원인+해결)>" }` 형식이고 `message`를 포함한다 (아래 409/429/403 예시도 마찬가지).
**CORS 헤더는 절대 보내지 않는다.** `OPTIONS` 요청은 405. POST에 `Origin` 헤더가 있으면 자기 주소(`http://127.0.0.1:<port>`, `http://localhost:<port>`)일 때만 허용하고 아니면 403.

### `GET /api/menus` → 200
`data/menus.json` 의 내용 **그대로** (필드 추가·삭제 없음). 파일이 없으면 404 `{error:"no-data", message:"아직 수집된 데이터가 없어요. '지금 최신으로 갱신'을 눌러 주세요."}`.
```json
{ "generatedAt": "ISO시각",
  "brands": [ { "id","name","site","mode":"official|estimated|unsupported","note",
                "status":"ok|error|unsupported","error?","checkedAt","lastOk?",
                "items":[ {"key","name","en","desc","image","category","released","firstSeen","url"} ] } ] }
```

### `GET /api/status` → 200
```json
{ "refreshing": false,
  "cooldownSeconds": 0,
  "generatedAt": "ISO시각 | null",
  "lastRun": null | { "startedAt":"ISO","finishedAt":"ISO","ok":true,"changed":true,"error?":"...",
      "summary":[ {"id":"starbucks","name":"스타벅스","status":"ok|error|unsupported","count":56,"error?":"..."} ] } }
```
- `cooldownSeconds`: 다음 갱신까지 남은 초 (0이면 지금 가능). `lastRun`은 서버가 켜진 뒤의 마지막 실행 (재시작하면 null).
- **`ok` 의 뜻:** 일부 카페만 실패 = `ok:true` + 해당 카페 `summary[].status:"error"`. 저장 실패·시간 초과 등 **전체 실패 = `ok:false` + `error`(쉬운 한국어)** 이고 이때 `summary`는 빈 배열일 수 있다.
- **`changed`:** 수집 결과가 이전과 같아서 `data/menus.json` 을 다시 저장하지 않았으면 `false`. 이 경우 `generatedAt` 은 그대로이므로, **프런트는 "마지막 확인 시각"으로 `lastRun.finishedAt`(없으면 `generatedAt`)을 보여주고** "새로 바뀐 신메뉴 없음"이라고 알려준다 (갱신 실패로 오해하지 않게).
- **쿨다운 규칙:** 실행이 **끝난 시점부터** 5분 (성공·실패 모두 적용). 서버를 재시작해도 우회되지 않도록, 시작할 때 `data/menus.json` 의 수정 시각으로 남은 시간을 복원한다(최선의 노력). 테스트용으로 환경변수 `COOLDOWN_SECONDS` 로 길이를 바꿀 수 있다 (기본 300).
- **전체 제한 시간:** 한 번의 갱신은 최대 3분. 넘으면 `ok:false` + 쉬운 오류로 끝내고 서버는 계속 동작한다.

### `POST /api/refresh` → 202 / 409 / 429
- 202 `{ "started": true }` — 백그라운드로 수집 시작. 진행 상태는 `GET /api/status` 를 폴링해서 `refreshing` 이 false가 되면 끝.
- 409 `{error:"already-running"}` — 이미 실행 중.
- 429 `{error:"cooldown", retryAfterSeconds:<n>}` — 쿨다운 중.
- **요청에 헤더 `X-Requested-With: cafe-local` 이 없으면 403** `{error:"forbidden"}` (다른 웹페이지가 몰래 호출하는 것을 막기 위함).

### 정적 파일
- `GET /` → `public/index.html`. `public/` 아래 파일만 제공. `..` 경로 이탈 차단. 알 수 없는 경로는 404 JSON.
- 올바른 `Content-Type` (html/css/js/json/png/svg/ico).
- **보안:** `Host` 헤더가 `127.0.0.1:<port>` 또는 `localhost:<port>` 가 아니면 403 (DNS rebinding 방지).

## 5. 백엔드 담당 상세

1. `local-web/server.mjs` 구현 (§4 전부).
2. `scripts/fetch-menus.mjs` 를 **동작을 바꾸지 않고** 재사용 가능하게 수정:
   - `export async function runCollector()` 추가 → **항상 `{ summary, changed }` 를 반환** (summary: 카페별 요약, §4 형식 / changed: 파일을 새로 저장했는지). 결과가 이전과 같아 저장을 건너뛰는 경로(현재 "변경 없음" 분기)에서도 `summary` 를 반환해야 한다. 오류는 **throw 만** 한다 (`process.exit`·`console.log` 는 CLI 분기에서만).
   - **직접 실행 판별:** 파일을 직접 실행했을 때(`node scripts/fetch-menus.mjs`)만 자동 실행. `import` 될 땐 절대 실행 금지(서버가 꺼질 수 있음). 비교는 `fileURLToPath(import.meta.url)` 와 `path.resolve(process.argv[1])` 를 **윈도우에서는 소문자로 바꿔** 비교한다. 이 프로젝트 경로에는 **한글(김연주)과 역슬래시**가 있으므로 `file://` 문자열끼리 비교하지 말 것. 판별이 틀리면 CLI가 아무것도 안 하고 종료 코드 0으로 끝나 Actions/bat이 실패를 못 알아챈다.
   - **기존 CLI 출력/동작/저장 결과/종료 코드는 동일해야 한다** (GitHub Actions 와 `신메뉴갱신.bat` 이 이 파일을 쓴다). 수정 전 `node scripts/fetch-menus.mjs` 의 출력과 종료 코드를 기록해 두고 수정 후 비교한다.
   - `data/menus.json` 저장은 임시 파일(이름이 겹치지 않게 pid/시각 포함)에 쓴 뒤 rename. 윈도우에서 `EPERM`/`EBUSY` 이면 짧게(예: 100ms×5) 재시도. 서버는 파일을 한 번에 읽는다.
3. 서버 시작 시 `Local web: http://127.0.0.1:5100` 한 줄을 출력. 포트가 사용 중이면 쉬운 한국어로 안내하고 종료.
4. 갱신 중 오류가 나도 서버가 죽지 않는다 (`status` 에 반영). 처리되지 않은 예외(`unhandledRejection`)로 서버가 종료되지 않게 한다.
5. **`local-web/start.bat` 하나로 확정**(한글 파일명 사용 금지). 기능: ① `node` 가 없으면 "Node.js 가 설치되어 있지 않아요 (https://nodejs.org)" 안내 후 종료 ② 서버 시작 ③ 서버가 준비될 때까지 잠깐 기다린 뒤 기본 브라우저로 `http://127.0.0.1:5100` 열기 ④ "이 검은 창을 닫으면 사이트가 꺼져요" 출력. 기존 루트 `시작.bat` 은 수정 금지. bat 안 문구는 영어(인코딩 문제 방지).
6. **알려둘 점(문서/안내에 반영):** `data/menus.json` 은 git이 관리하는 파일이라, 로컬 갱신을 하면 커밋되지 않은 변경이 생긴다. 이 때문에 `신메뉴갱신.bat` 의 `pull --autostash` 에서 충돌할 수 있다. 서버 갱신과 `신메뉴갱신.bat` 을 **동시에** 돌리지 않는다.

## 6. 프런트엔드 담당 상세

기준 디자인: 루트 `cafe-menu.html` 의 색상 토큰·카드 구성(복사해서 쓰되 원본은 수정 금지). 그 화면의 기능(F1~F4, F7~F9)을 **`/api/menus`** 기반으로 구현하고 아래를 추가한다.
1. **"지금 최신으로 갱신" 버튼**: 상태 5가지 — 대기 / 진행 중(스피너+"공식 사이트에서 가져오는 중... 보통 1~2분 걸려요") / 완료(카페별 성공·실패 요약. `changed:false` 면 "새로 바뀐 신메뉴는 없어요") / 쿨다운(남은 시간 표시, 버튼 비활성) / 오류(`message` + 해결 방법).
2. 갱신이 끝나면 화면 목록을 자동으로 새로 불러온다 (선택한 카페 유지).
3. **"마지막 확인 시각"(`lastRun.finishedAt`, 없으면 `generatedAt`)** 과 카페별 상태(공식/추정/불가/오류+마지막 성공 시각)를 보여준다.
4. 서버 연결 실패 시(서버가 꺼졌을 때): "서버가 꺼져 있어요. `local-web\start.bat` 을 더블클릭해 주세요."
5. 로딩 / 빈 목록 / 오류 상태를 모두 설계한다 (빈 화면 금지).
6. **접근성·반응형:** 키보드로 모든 버튼 조작 가능 + 포커스 표시, 상태 변화는 `aria-live`, 터치 영역 44px 이상, 글자 대비 충분, 다크 모드, 폭 375px 에서 가로 스크롤 없음, 사진 로딩 실패 시 대체 표시.
7. 모든 갱신 요청에 헤더 `X-Requested-With: cafe-local` 를 붙인다.
8. 프레임워크·CDN 금지 (순수 HTML/CSS/JS, 외부 주소 요청 없음).

## 7. 완료 기준 (검증 담당이 확인)

검증은 **확인 명령/절차**와 함께 적는다. 쿨다운 때문에 오래 걸리지 않게 테스트는 `COOLDOWN_SECONDS=10 node local-web/server.mjs` 로 켠다.

- [ ] `node local-web/server.mjs` 실행 → 출력에 `Local web: http://127.0.0.1:5100`. 브라우저로 접속하면 카페 7곳 버튼과 신메뉴가 보인다.
- [ ] 카페를 누르면 바로 해당 카페 목록으로 바뀐다. 할리스/컴포즈는 "자동 확인 불가" 안내 + 공식 사이트 링크.
- [ ] `curl http://127.0.0.1:5100/api/menus` → 200, `brands` 7개. `curl http://127.0.0.1:5100/api/status` → 200.
- [ ] 헤더 없이 `curl -X POST http://127.0.0.1:5100/api/refresh` → **403**. 헤더(`-H "X-Requested-With: cafe-local"`) 포함 → **202**. 직후 다시 → **409** (실행 중) 또는 **429** (쿨다운).
- [ ] 화면에서 "지금 최신으로 갱신" → 진행 표시 → 완료 요약 → 목록 새로고침. 완료 후 바로 누르면 쿨다운 안내(버튼 비활성). 실행 중 빠르게 두 번 눌러도 한 번만 실행된다.
- [ ] 결과가 이전과 같을 때 "새로 바뀐 신메뉴는 없어요"가 나오고, "마지막 확인 시각"은 갱신된다.
- [ ] `http://127.0.0.1:5100/../server.mjs`, `/..%2fserver.mjs`, `/%2e%2e/SPEC.md` 등 경로 이탈 → 404/403 (파일 내용이 나오면 실패). `Host: evil.com` 으로 요청 → 403. `OPTIONS` → 405. 응답에 `Access-Control-*` 헤더 없음.
- [ ] 서버를 끄면 화면에 쉬운 안내가 나온다. **처리되지 않은 JS 예외 없음** (연결 거부 네트워크 오류 로그는 정상).
- [ ] **CLI 동일성:** `node scripts/fetch-menus.mjs` 의 출력(카페별 ✔/✘ 줄)·종료 코드·`data/menus.json` 이 수정 전과 같은 형식이다. `node -e "import('./scripts/fetch-menus.mjs')"` 는 **아무것도 출력/실행하지 않고** 바로 끝난다.
- [ ] 폭 375px / 1280px 에서 레이아웃이 깨지지 않고 가로 스크롤이 없다. 키보드(Tab/Enter)만으로 카페 선택과 갱신이 가능하다.
- [ ] `local-web/start.bat` 이 존재하고 §5-5 4가지 기능이 들어 있다 (실제 더블클릭 실행은 사람이 확인).
