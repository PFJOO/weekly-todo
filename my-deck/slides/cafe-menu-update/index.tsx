import type { DesignSystem, Page, SlideMeta } from '@open-slide/core';
import type { ReactNode } from 'react';
import compose from './assets/compose.png';
import hollys from './assets/hollys.png';
import qr from './assets/qr.png';
import starbucks from './assets/starbucks.png';

export const design: DesignSystem = {
  palette: { bg: '#fbf7f1', text: '#2a1f18', accent: '#b4532a' },
  fonts: {
    display: '"Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif',
    body: '"Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif',
  },
  typeScale: { hero: 150, body: 40 },
  radius: 20,
};

// 팔레트 밖에서 추가로 쓰는 색
const muted = '#7a6a5e';
const card = '#ffffff';
const line = '#e8dccd';
const green = '#2f7d4f';
const amber = '#a8741a';
const gray = '#8a8178';

const fill = {
  width: '100%',
  height: '100%',
  background: 'var(--osd-bg)',
  color: 'var(--osd-text)',
  fontFamily: 'var(--osd-font-body)',
  letterSpacing: '-0.01em',
  boxSizing: 'border-box',
} as const;

const page = { ...fill, padding: 120 } as const;

const H2 = ({ children }: { children: string }) => (
  <h2
    style={{
      fontFamily: 'var(--osd-font-display)',
      fontSize: 80,
      fontWeight: 800,
      lineHeight: 1.2,
      margin: 0,
    }}
  >
    {children}
  </h2>
);

const Eyebrow = ({ children }: { children: string }) => (
  <div
    style={{
      fontSize: 28,
      fontWeight: 700,
      color: 'var(--osd-accent)',
      letterSpacing: '0.12em',
      marginBottom: 20,
    }}
  >
    {children}
  </div>
);

/* ---------- 1. 표지 ---------- */
const Cover: Page = () => (
  <div
    style={{
      ...fill,
      padding: '0 160px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    }}
  >
    <Eyebrow>AX-STARTUP 부트캠프 · 프로젝트 발표</Eyebrow>
    <h1
      style={{
        fontFamily: 'var(--osd-font-display)',
        fontSize: 'var(--osd-size-hero)',
        fontWeight: 900,
        lineHeight: 1.1,
        margin: '0 0 40px',
      }}
    >
      프랜차이즈 카페
      <br />
      신메뉴 리스트
    </h1>
    <p style={{ fontSize: 44, color: muted, margin: 0, lineHeight: 1.5 }}>
      카페를 고르면, 최신 신메뉴가 바로 보여요
    </p>
  </div>
);

/* ---------- 2. 문제 ---------- */
const ProblemCard = ({ title, desc }: { title: string; desc: string }) => (
  <div
    style={{
      flex: 1,
      background: card,
      border: `2px solid ${line}`,
      borderRadius: 'var(--osd-radius)',
      padding: '48px 44px',
    }}
  >
    <div style={{ fontSize: 56, fontWeight: 800, marginBottom: 20 }}>{title}</div>
    <div style={{ fontSize: 34, color: muted, lineHeight: 1.5 }}>{desc}</div>
  </div>
);

const Problem: Page = () => (
  <div style={page}>
    <Eyebrow>WHY · 왜 만들었나</Eyebrow>
    <H2>신메뉴 소식은 여기저기 흩어져 있어요</H2>
    <div style={{ display: 'flex', gap: 40, marginTop: 72 }}>
      <ProblemCard title="공식 사이트" desc="카페마다 메뉴판 위치와 모양이 달라요" />
      <ProblemCard title="앱" desc="카페 수만큼 앱을 열어봐야 해요" />
      <ProblemCard title="SNS" desc="올라오는 시점도 제각각이에요" />
    </div>
    <p style={{ fontSize: 44, fontWeight: 700, color: 'var(--osd-accent)', marginTop: 72 }}>
      → 한곳에서 카페만 눌러 확인하자
    </p>
  </div>
);

/* ---------- 3. 사용 흐름 ---------- */
const FlowStep = ({ n, title, desc }: { n: string; title: string; desc: string }) => (
  <div style={{ flex: 1 }}>
    <div
      style={{
        width: 96,
        height: 96,
        borderRadius: 48,
        background: 'var(--osd-accent)',
        color: '#fff',
        fontSize: 48,
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 36,
      }}
    >
      {n}
    </div>
    <div style={{ fontSize: 56, fontWeight: 800, marginBottom: 16 }}>{title}</div>
    <div style={{ fontSize: 34, color: muted, lineHeight: 1.5 }}>{desc}</div>
  </div>
);

const Flow: Page = () => (
  <div style={page}>
    <Eyebrow>HOW IT WORKS · 이렇게 써요</Eyebrow>
    <H2>누르면 바로 보여요</H2>
    <div style={{ display: 'flex', gap: 72, marginTop: 88 }}>
      <FlowStep n="1" title="카페 선택" desc="버튼 7개 중 보고 싶은 카페를 눌러요" />
      <FlowStep n="2" title="신메뉴 확인" desc="사진·이름·분류·설명·출시일이 카드로 나와요" />
      <FlowStep n="3" title="공식 사이트로" desc="더 궁금하면 링크로 바로 이동해요" />
    </div>
    <p style={{ fontSize: 36, color: muted, marginTop: 88 }}>
      사용자는 아무것도 입력하지 않아요. 데이터는 자동으로 갱신돼요.
    </p>
  </div>
);

/* ---------- 4. 실제 화면 ---------- */
const Callout = ({ title, desc }: { title: string; desc: string }) => (
  <div
    style={{
      background: card,
      border: `2px solid ${line}`,
      borderRadius: 'var(--osd-radius)',
      padding: '28px 36px',
    }}
  >
    <div style={{ fontSize: 40, fontWeight: 800, marginBottom: 8 }}>{title}</div>
    <div style={{ fontSize: 30, color: muted, lineHeight: 1.5 }}>{desc}</div>
  </div>
);

const Demo: Page = () => (
  <div style={page}>
    <Eyebrow>DEMO · 실제 화면</Eyebrow>
    <H2>스타벅스를 누르면 이렇게 나와요</H2>
    <div style={{ display: 'flex', gap: 64, marginTop: 48, alignItems: 'flex-start' }}>
      <img
        src={starbucks}
        alt="스타벅스 신메뉴 화면"
        style={{
          width: 880,
          height: 627,
          objectFit: 'cover',
          borderRadius: 'var(--osd-radius)',
          border: `2px solid ${line}`,
        }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Callout title="카페 버튼" desc="누르면 그 카페의 신메뉴가 바로 나와요" />
        <Callout title="새로 올라옴 알림" desc="최근 7일 안 새 메뉴를 상단에 알려줘요" />
        <Callout title="신메뉴 카드" desc="사진·이름·분류·설명·출시일을 보여줘요" />
      </div>
    </div>
  </div>
);

/* ---------- 5. 카페별 수집 수준 ---------- */
const BrandRow = ({ name, count }: { name: string; count: string }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 36,
      padding: '14px 0',
      borderBottom: `1px solid ${line}`,
    }}
  >
    <span>{name}</span>
    <span style={{ fontWeight: 700 }}>{count}</span>
  </div>
);

const Level = ({
  badge,
  color,
  desc,
  children,
}: {
  badge: string;
  color: string;
  desc: string;
  children: ReactNode;
}) => (
  <div
    style={{
      flex: 1,
      background: card,
      border: `2px solid ${line}`,
      borderTop: `10px solid ${color}`,
      borderRadius: 'var(--osd-radius)',
      padding: '36px 40px',
    }}
  >
    <div style={{ fontSize: 48, fontWeight: 800, color, marginBottom: 12 }}>{badge}</div>
    <div style={{ fontSize: 28, color: muted, lineHeight: 1.5, marginBottom: 20 }}>{desc}</div>
    {children}
  </div>
);

const Levels: Page = () => (
  <div style={page}>
    <Eyebrow>DATA · 카페별 수집 수준</Eyebrow>
    <H2>카페마다 얻을 수 있는 정보가 달라요</H2>
    <div style={{ display: 'flex', gap: 40, marginTop: 56 }}>
      <Level badge="공식" color={green} desc="공식 사이트의 NEW 표시를 그대로 가져와요">
        <BrandRow name="스타벅스" count="56개" />
        <BrandRow name="빽다방" count="15개" />
        <BrandRow name="투썸플레이스" count="10개" />
        <BrandRow name="이디야커피" count="9개" />
      </Level>
      <Level badge="추정" color={amber} desc="공식 표시가 없어 최근 등록 기준으로 추정해요">
        <BrandRow name="컴포즈커피" count="12개" />
        <BrandRow name="메가커피" count="6개" />
      </Level>
      <Level badge="확인 불가" color={gray} desc="신메뉴 표시가 없어 링크만 안내해요">
        <BrandRow name="할리스" count="—" />
      </Level>
    </div>
    <p style={{ fontSize: 28, color: muted, marginTop: 32 }}>2026-11-26 수집 기준 개수</p>
  </div>
);

/* ---------- 6. 자동 갱신 구조 ---------- */
const Box = ({ label, sub }: { label: string; sub: string }) => (
  <div
    style={{
      width: 340,
      height: 220,
      background: card,
      border: `2px solid ${line}`,
      borderRadius: 'var(--osd-radius)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '0 20px',
      boxSizing: 'border-box',
    }}
  >
    <div style={{ fontSize: 44, fontWeight: 800, marginBottom: 12 }}>{label}</div>
    <div style={{ fontSize: 26, color: muted, lineHeight: 1.4 }}>{sub}</div>
  </div>
);

const Arrow = () => (
  <div style={{ fontSize: 64, color: 'var(--osd-accent)', fontWeight: 800 }}>→</div>
);

const Pipeline: Page = () => (
  <div style={page}>
    <Eyebrow>AUTOMATION · 자동 갱신</Eyebrow>
    <H2>사람이 입력하지 않아도 갱신돼요</H2>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 80,
      }}
    >
      <Box label="공식 사이트" sub="카페 7곳의 메뉴판" />
      <Arrow />
      <Box label="수집 프로그램" sub="fetch-menus.mjs" />
      <Arrow />
      <Box label="데이터 파일" sub="data/menus.json" />
      <Arrow />
      <Box label="웹 화면" sub="Vercel에 배포" />
    </div>
    <div style={{ fontSize: 36, lineHeight: 1.6, marginTop: 72 }}>
      <div>• GitHub Actions가 3시간마다 확인해요</div>
      <div>• 신메뉴 목록이 바뀐 때만 저장·배포해요</div>
      <div>• 투썸·컴포즈는 내 PC 예약 작업으로 갱신해요</div>
    </div>
  </div>
);

/* ---------- 7. 정직성 ---------- */
const Shot = ({
  src,
  h,
  caption,
}: {
  src: string;
  h: number;
  caption: string;
}) => (
  <div style={{ width: 800 }}>
    <img
      src={src}
      alt={caption}
      style={{
        width: 800,
        height: h,
        objectFit: 'cover',
        objectPosition: 'top',
        borderRadius: 'var(--osd-radius)',
        border: `2px solid ${line}`,
        display: 'block',
      }}
    />
    <div style={{ fontSize: 30, color: muted, marginTop: 20, lineHeight: 1.5 }}>{caption}</div>
  </div>
);

const Honesty: Page = () => (
  <div style={page}>
    <Eyebrow>PRINCIPLE · 정직하게 보여주기</Eyebrow>
    <H2>확인 안 된 정보는 만들지 않아요</H2>
    <div style={{ display: 'flex', gap: 80, marginTop: 48 }}>
      <Shot src={compose} h={524} caption="컴포즈: ‘신메뉴 추정’이라고 눈에 띄게 표시해요" />
      <Shot src={hollys} h={475} caption="할리스: 이유를 밝히고 공식 사이트 링크를 줘요" />
    </div>
  </div>
);

/* ---------- 8. 한계 ---------- */
const Risk = ({ title, desc }: { title: string; desc: string }) => (
  <div
    style={{
      background: card,
      border: `2px solid ${line}`,
      borderRadius: 'var(--osd-radius)',
      padding: '40px 44px',
    }}
  >
    <div style={{ fontSize: 44, fontWeight: 800, marginBottom: 12 }}>{title}</div>
    <div style={{ fontSize: 32, color: muted, lineHeight: 1.5 }}>{desc}</div>
  </div>
);

const Limits: Page = () => (
  <div style={page}>
    <Eyebrow>LIMITS · 알려진 한계</Eyebrow>
    <H2>아직 부족한 점도 솔직하게</H2>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 40,
        marginTop: 64,
      }}
    >
      <Risk title="사이트 개편에 약함" desc="공식 사이트 구조가 바뀌면 수집이 실패할 수 있어요" />
      <Risk title="추정은 틀릴 수 있어요" desc="메가·컴포즈는 실제 신메뉴와 다를 수 있어요" />
      <Risk title="사용자 조사 전" desc="대상 사용자는 아직 가정이에요" />
      <Risk title="이용약관 미검토" desc="상업적으로 쓰기 전에 약관 확인이 필요해요" />
    </div>
  </div>
);

/* ---------- 9. 마무리 ---------- */
const Next = ({ n, text }: { n: string; text: string }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 32,
      fontSize: 44,
      fontWeight: 700,
    }}
  >
    <span style={{ color: 'var(--osd-accent)', fontSize: 56, fontWeight: 900, width: 60 }}>
      {n}
    </span>
    <span>{text}</span>
  </div>
);

const Closing: Page = () => (
  <div style={page}>
    <Eyebrow>NEXT · 다음 단계</Eyebrow>
    <H2>앞으로 해볼 일</H2>
    <div style={{ display: 'flex', gap: 80, marginTop: 56, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 40 }}>
        <Next n="1" text="실제 사용자에게 써보게 하고 의견 듣기" />
        <Next n="2" text="공식 사이트 이용약관 확인하기" />
        <Next n="3" text="할리스 신메뉴 확인 방법 찾기" />
        <Next n="4" text="알림 기능(이메일·메신저) 검토하기" />
      </div>
      <div style={{ width: 340, textAlign: 'center' }}>
        <img
          src={qr}
          alt="서비스 소개서로 연결되는 QR코드"
          style={{
            width: 340,
            height: 340,
            display: 'block',
            background: '#ffffff',
            borderRadius: 'var(--osd-radius)',
            border: `2px solid ${line}`,
          }}
        />
        <div style={{ fontSize: 34, fontWeight: 800, marginTop: 16 }}>소개서 보러 가기</div>
        <div style={{ fontSize: 24, color: muted, marginTop: 4 }}>휴대폰 카메라로 찍어보세요</div>
      </div>
    </div>
    <p style={{ fontSize: 56, fontWeight: 800, marginTop: 64 }}>감사합니다</p>
  </div>
);

export const meta: SlideMeta = {
  title: '프랜차이즈 카페 신메뉴 리스트',
  createdAt: '2026-11-26T08:24:00.737Z',
};

export const notes: (string | undefined)[] = [
  `안녕하세요. 제가 만든 '프랜차이즈 카페 신메뉴 리스트'를 소개하겠습니다.
한 줄 요약: 카페를 고르면 그 카페의 최신 신메뉴가 바로 보이는 웹 화면입니다.`,
  `카페 신메뉴 소식은 공식 사이트, 앱, SNS에 흩어져 있어서 카페마다 따로 찾아야 합니다.
그래서 한곳에서 카페만 누르면 확인되는 서비스를 만들었습니다.`,
  `사용 방법은 세 단계입니다. 카페 선택, 신메뉴 카드 확인, 필요하면 공식 사이트로 이동.
사용자가 입력하는 것은 없고, 데이터는 자동으로 갱신됩니다.`,
  `실제 화면입니다. 스타벅스를 누르면 신메뉴 카드가 나옵니다.
상단에는 최근 7일 안에 새로 올라온 메뉴 개수를 알려주는 배너가 있고, 카페 버튼에는 빨간 점이 붙습니다.`,
  `카페마다 공개된 정보가 달라서 세 가지로 나눴습니다.
공식(스타벅스·빽다방·투썸·이디야)은 공식 사이트의 NEW 표시를 그대로 가져옵니다.
추정(컴포즈·메가)은 공식 표시가 없어서 최근 등록 기준으로 추정합니다.
할리스는 자동 확인이 불가능해서 링크만 안내합니다.
개수는 2026년 11월 26일 수집 기준입니다.`,
  `구조는 공식 사이트 → 수집 프로그램 → 데이터 파일 → 웹 화면입니다.
GitHub Actions가 3시간마다 확인하고, 신메뉴 목록이 실제로 바뀐 때만 저장·배포합니다.
투썸과 컴포즈는 GitHub 서버에서 접속이 막혀서 제 PC의 예약 작업으로 갱신합니다.
(주의: 배포 후 자동 갱신이 며칠간 안정적으로 도는지는 아직 확인 중이라고 말씀드리세요.)`,
  `가장 중요하게 생각한 원칙은 확인되지 않은 정보를 만들지 않는 것입니다.
추정인 카페는 '신메뉴 추정'이라고 화면에 그대로 표시하고, 할리스는 이유를 밝힙니다.`,
  `한계도 있습니다. 공식 사이트가 개편되면 수집이 실패할 수 있고, 추정은 틀릴 수 있습니다.
실제 사용자 조사는 아직 안 했고, 사이트 이용약관도 아직 검토하지 못했습니다.`,
  `다음 단계는 실제 사용자 의견 듣기, 이용약관 확인, 할리스 확인 방법 찾기, 알림 기능 검토입니다.
화면 오른쪽 QR을 휴대폰 카메라로 찍으면 서비스 소개서가 열립니다. 링크가 필요한 분은 지금 찍어 가세요.
들어주셔서 감사합니다. 질문 받겠습니다.`,
];

export default [
  Cover,
  Problem,
  Flow,
  Demo,
  Levels,
  Pipeline,
  Honesty,
  Limits,
  Closing,
] satisfies Page[];
