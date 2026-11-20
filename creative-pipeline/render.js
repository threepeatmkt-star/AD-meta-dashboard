/**
 * 바이퍼 에너지 그린 — 1:1 소재 3종 렌더러
 * 승자(image_a_1p1) 구조 DNA: 상단 뱃지 → 초대형 후킹 텍스트(흰 테두리) → 보조라인
 *   → 제품 대형 배치 → 우하단 원형 뱃지 → 하단 오퍼바
 * 출력: 2000×2000 PNG (viewport 1000 @2x)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const CAN = 'assets/can.png'; // HTML 기준 상대경로 (이식성)

// FORCE_BG=1 이면 AI 사진 배경 모드로 HTML 생성 (샌드박스 합성용)
const FORCE_BG = process.env.FORCE_BG === '1';
const EMIT_ONLY = process.env.EMIT_ONLY === '1'; // HTML만 쓰고 스크린샷 생략

function hasPhotoBg(n) {
  return FORCE_BG || fs.existsSync(path.join(DIR, `assets/bg${n}.jpg`));
}
function bgLayer(n) {
  if (hasPhotoBg(n)) return `background:#000 url('assets/bg${n}.jpg') center/cover no-repeat;`;
  // CSS 폴백: 그린 코스믹
  return `background:
    radial-gradient(ellipse 60% 45% at 50% 28%, rgba(127,230,46,.38), transparent 70%),
    radial-gradient(ellipse 85% 60% at 15% 75%, rgba(40,120,20,.30), transparent 70%),
    radial-gradient(ellipse 85% 60% at 88% 70%, rgba(90,200,40,.22), transparent 70%),
    radial-gradient(ellipse 120% 90% at 50% 115%, rgba(0,0,0,.9), transparent 60%),
    #050a03;`;
}

// 그린 플라즈마 FX 레이어 — 꽉 찬 실루엣 번개(이중 글로우) + 입자 + 그레인
const FX_FULL = `
  <svg style="position:absolute;inset:0;width:1000px;height:1000px;" viewBox="0 0 1000 1000">
    <defs>
      <filter id="glowWide" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="22"/></filter>
      <filter id="glowSoft" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="5" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/><feColorMatrix type="saturate" values="0"/></filter>
      <radialGradient id="burstTop" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#8CFF00" stop-opacity=".30"/>
        <stop offset="60%" stop-color="#3f8f10" stop-opacity=".12"/>
        <stop offset="100%" stop-color="#3f8f10" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="burstCan" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#9BFF3D" stop-opacity=".50"/>
        <stop offset="55%" stop-color="#3c9410" stop-opacity=".20"/>
        <stop offset="100%" stop-color="#3c9410" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="boltFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#F4FFD0"/>
        <stop offset="45%" stop-color="#C8FF5E"/>
        <stop offset="100%" stop-color="#7FE62E"/>
      </linearGradient>
    </defs>

    <ellipse cx="500" cy="260" rx="520" ry="300" fill="url(#burstTop)"/>
    <ellipse cx="500" cy="720" rx="430" ry="320" fill="url(#burstCan)"/>
    <ellipse cx="500" cy="955" rx="330" ry="55" fill="#6FD41F" opacity=".35" filter="url(#glowWide)"/>

    <!-- 실루엣 번개: 글로우 밑판 + 본체 -->
    <g>
      <path id="boltL" d="M190,-20 L120,215 L178,200 L74,470 L196,442 L120,700 L245,415 L168,438 L262,170 L205,186 L262,-20 Z"
        fill="#8CFF00" opacity=".55" filter="url(#glowWide)"/>
      <path d="M190,-20 L120,215 L178,200 L74,470 L196,442 L120,700 L245,415 L168,438 L262,170 L205,186 L262,-20 Z"
        fill="url(#boltFill)" opacity=".9" filter="url(#glowSoft)"/>
      <path d="M810,-20 L880,215 L822,200 L926,470 L804,442 L880,700 L755,415 L832,438 L738,170 L795,186 L738,-20 Z"
        fill="#8CFF00" opacity=".55" filter="url(#glowWide)"/>
      <path d="M810,-20 L880,215 L822,200 L926,470 L804,442 L880,700 L755,415 L832,438 L738,170 L795,186 L738,-20 Z"
        fill="url(#boltFill)" opacity=".9" filter="url(#glowSoft)"/>
    </g>

    <!-- 잔가지 스파크 -->
    <g stroke="#D6FF8A" fill="none" stroke-linecap="round" filter="url(#glowSoft)" opacity=".8">
      <path d="M140,330 L60,392 L96,400 L20,470" stroke-width="5"/>
      <path d="M860,330 L940,392 L904,400 L980,470" stroke-width="5"/>
      <path d="M470,30 L452,96 L478,90 L458,160" stroke-width="4" opacity=".7"/>
      <path d="M540,40 L558,100 L534,95 L556,158" stroke-width="4" opacity=".7"/>
    </g>

    <!-- 입자 -->
    <g fill="#B8FF5E">
      <circle cx="120" cy="120" r="4" opacity=".7"/><circle cx="300" cy="70" r="3" opacity=".5"/>
      <circle cx="700" cy="60" r="4" opacity=".6"/><circle cx="880" cy="130" r="3" opacity=".5"/>
      <circle cx="60" cy="620" r="5" opacity=".5"/><circle cx="940" cy="600" r="5" opacity=".5"/>
      <circle cx="150" cy="800" r="4" opacity=".45"/><circle cx="860" cy="820" r="4" opacity=".45"/>
      <circle cx="240" cy="540" r="3" opacity=".6"/><circle cx="760" cy="520" r="3" opacity=".6"/>
      <circle cx="400" cy="880" r="3" opacity=".4"/><circle cx="620" cy="900" r="3" opacity=".4"/>
    </g>

    <rect width="1000" height="1000" filter="url(#grain)" opacity="0.05"/>
  </svg>`;

// 사진 배경용 라이트 FX — 배경이 이미 번개/플라즈마를 가지므로 입자·그레인·바닥 글로우만
const FX_LITE = `
  <svg style="position:absolute;inset:0;width:1000px;height:1000px;" viewBox="0 0 1000 1000">
    <defs>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/><feColorMatrix type="saturate" values="0"/></filter>
      <filter id="gw" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="22"/></filter>
      <filter id="gdark" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="48"/></filter>
    </defs>
    <!-- 텍스트 가독성용 어두운 블러 패널 (헤드라인 존) -->
    <ellipse cx="500" cy="275" rx="470" ry="245" fill="#000" opacity=".52" filter="url(#gdark)"/>
    <ellipse cx="500" cy="955" rx="330" ry="55" fill="#6FD41F" opacity=".30" filter="url(#gw)"/>
    <g fill="#B8FF5E">
      <circle cx="120" cy="150" r="3" opacity=".5"/><circle cx="880" cy="170" r="3" opacity=".5"/>
      <circle cx="80" cy="640" r="4" opacity=".4"/><circle cx="930" cy="620" r="4" opacity=".4"/>
      <circle cx="200" cy="840" r="3" opacity=".35"/><circle cx="800" cy="860" r="3" opacity=".35"/>
    </g>
    <rect width="1000" height="1000" filter="url(#grain)" opacity="0.04"/>
  </svg>`;

const FX = (FORCE_BG || fs.existsSync(path.join(DIR, 'assets/bg1.jpg'))) ? FX_LITE : FX_FULL;

const BASE_CSS = `
  @font-face{font-family:'Paperlogy';src:url('assets/fonts/paperlogy9.ttf');font-weight:900;}
  @font-face{font-family:'A2Z';src:url('assets/fonts/sub9.ttf');font-weight:900;}
  @font-face{font-family:'A2Z';src:url('assets/fonts/sub8.ttf');font-weight:800;}
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{width:1000px;height:1000px;overflow:hidden;}
  /* 기본 = A2Z (서브/작은 텍스트), 메인 카피만 Paperlogy */
  body{font-family:'A2Z','Noto Sans CJK KR',sans-serif;color:#fff;position:relative;}
  .hook, .hook *{font-family:'Paperlogy',sans-serif;}
  .vignette{position:absolute;inset:0;background:radial-gradient(ellipse 120% 100% at 50% 45%, transparent 45%, rgba(0,0,0,.72) 100%);}
  .badge{position:absolute;top:52px;left:50%;transform:translateX(-50%);
    padding:14px 38px;border-radius:999px;border:3px solid #7FE62E;
    background:rgba(5,15,2,.82);font-weight:900;font-size:33px;letter-spacing:-.5px;
    color:#CFFF9E;white-space:nowrap;box-shadow:0 0 30px rgba(127,230,46,.45);font-weight:800;}
  .hook{position:absolute;left:0;right:0;text-align:center;font-weight:900;line-height:1.04;letter-spacing:-2px;
    transform:skewX(-8deg);} /* 이탤릭 기울기 */
  .stroke{} /* 플랫 (스트로크 없음) */
  .green{color:#EDFF94;}
  .red{color:#FF3B30;}
  .sub{position:absolute;left:0;right:0;text-align:center;font-weight:900;color:#fff;
    text-shadow:0 4px 18px rgba(0,0,0,.9);letter-spacing:-1px;}
  .can{position:absolute;left:50%;transform:translateX(-50%);
    filter:drop-shadow(0 0 70px rgba(127,230,46,.55)) drop-shadow(0 26px 50px rgba(0,0,0,.75));}
  .circle{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;
    border-radius:50%;font-weight:900;text-align:center;line-height:1.1;
    box-shadow:0 10px 36px rgba(0,0,0,.6);}
  .offerbar{position:absolute;left:0;right:0;bottom:0;height:108px;
    display:flex;align-items:center;justify-content:center;gap:16px;
    font-weight:900;letter-spacing:-1px;}
  .strike{position:relative;opacity:.92;}
  .strike::after{content:'';position:absolute;left:-4%;right:-4%;top:52%;height:6px;background:#FF3B30;transform:rotate(-6deg);border-radius:3px;}
`;

// ───────── V1 가격파괴형 (승자 공식 직이식) ─────────
const V1 = (bg) => `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
  body{${bg}}
</style></head><body>
  ${FX}
  <div class="vignette"></div>
  <div class="badge">고함량 아르기닌 · 고카페인 에너지드링크</div>
  <div class="hook" style="top:128px;">
    <span style="display:block;font-size:52px;font-weight:900;color:#ddd;letter-spacing:-1px;margin-bottom:2px;">
      24캔 정가 <span class="strike">29,900원</span>이
    </span>
    <span class="stroke green" style="font-size:168px;display:block;">22,900원</span>
  </div>
  <div class="sub" style="top:412px;font-size:46px;">오직 이 링크에서만</div>
  <img class="can" src="${CAN}" style="width:620px;top:452px;">
  <div class="circle" style="right:64px;bottom:170px;width:218px;height:218px;background:#FF3B30;border:7px solid #fff;">
    <span style="font-size:34px;line-height:1;">▼</span>
    <span style="font-size:45px;letter-spacing:-2px;white-space:nowrap;">7,000원</span>
    <span style="font-size:32px;">할인</span>
  </div>
  <div class="offerbar" style="background:linear-gradient(90deg,#51B40A,#7FE62E);color:#072100;font-size:42px;">
    제로슈거 <span style="opacity:.55">·</span> 트로피컬향 <span style="opacity:.55">·</span> 운동 전 한 캔
  </div>
</body></html>`;

// ───────── V2 성분 스펙형 ─────────
const V2 = (bg) => `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
  body{${bg}}
</style></head><body>
  ${FX}
  <div class="vignette"></div>
  <div class="badge">VIPER ENERGY GREEN</div>
  <div class="hook" style="top:122px;">
    <span class="stroke green" style="font-size:112px;display:block;white-space:nowrap;">아르기닌 4,000<span style="font-size:76px;">mg</span></span>
    <span class="stroke" style="font-size:88px;display:block;white-space:nowrap;color:#fff;">카페인 130<span style="font-size:62px;">mg</span></span>
  </div>
  <div class="sub" style="top:360px;font-size:46px;">운동 전, 딱 한 캔</div>
  <img class="can" src="${CAN}" style="width:620px;top:452px;">
  <div class="circle" style="right:64px;bottom:170px;width:218px;height:218px;background:#0a1a04;border:7px solid #7FE62E;color:#9BFF3D;">
    <span style="font-size:50px;letter-spacing:0;">ZERO</span>
    <span style="font-size:42px;">SUGAR</span>
  </div>
  <div class="offerbar" style="background:linear-gradient(90deg,#E42C1F,#FF3B30);color:#fff;font-size:42px;">
    24캔 이 링크 전용&nbsp; <span class="strike" style="font-size:36px;opacity:.85;">29,900원</span>&nbsp;→&nbsp;<span style="font-size:52px;">22,900원</span>
  </div>
</body></html>`;

// ───────── V3 제로슈거/트로피컬형 ─────────
const V3 = (bg) => `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
  body{${bg}}
</style></head><body>
  ${FX}
  <div class="vignette"></div>
  <div class="badge">트로피컬향 에너지드링크</div>
  <div class="hook" style="top:122px;">
    <span class="stroke green" style="font-size:176px;display:block;">제로슈거</span>
  </div>
  <div class="sub" style="top:338px;font-size:54px;">맛은 트로피컬 그대로, 당은 제로</div>
  <div class="sub" style="top:415px;font-size:40px;color:#CFFF9E;">아르기닌 4,000mg + 카페인 130mg</div>
  <img class="can" src="${CAN}" style="width:620px;top:452px;">
  <div class="circle" style="right:64px;bottom:170px;width:218px;height:218px;background:#FF3B30;border:7px solid #fff;">
    <span style="font-size:40px;letter-spacing:-1px;">24캔</span>
    <span style="font-size:41px;letter-spacing:-2px;white-space:nowrap;">22,900원</span>
  </div>
  <div class="offerbar" style="background:linear-gradient(90deg,#51B40A,#7FE62E);color:#072100;font-size:42px;">
    오직 이 링크에서만&nbsp; <span class="strike" style="font-size:36px;">29,900원</span>&nbsp;→&nbsp;<span style="font-size:52px;">22,900원</span>
  </div>
</body></html>`;

(async () => {
  const variants = [
    ['viper_v1_price', V1(bgLayer(1))],
    ['viper_v2_spec',  V2(bgLayer(2))],
    ['viper_v3_zero',  V3(bgLayer(1))],
  ];
  for (const [name, html] of variants) {
    fs.writeFileSync(path.join(DIR, name + '.html'), html);
    console.log('wrote', name + '.html');
  }
  if (EMIT_ONLY) return;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 2 });
  for (const [name] of variants) {
    await page.goto('file://' + path.join(DIR, name + '.html'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(DIR, name + '.png') });
    console.log('rendered', name + '.png');
  }
  await browser.close();
})();
