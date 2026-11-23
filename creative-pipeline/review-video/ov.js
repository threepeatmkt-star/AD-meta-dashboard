// 체험단 편집 영상 자막 오버레이 생성 — 힉스필드 샌드박스: NODE_PATH=$(npm root -g) node ov.js
// 폰트: fonts/Paperlogy-9Black.woff2, Paperlogy-8ExtraBold.woff2 (cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/)
// 결과: ov/o0~o3.png (1080x1920 투명) → ffmpeg overlay
// 컷 편집 예: ffmpeg -ss 0.0 -t 3.5 -i clip.mp4 -i ov/o0.png -filter_complex "[0:v]scale=1080:1920,setsar=1,fps=30[b];[b][1:v]overlay=0:0,format=yuv420p" -an seg0.mp4
const { chromium } = require('playwright'); const fs = require('fs');

const G = '#8CFF00';                       // 키워드 하이라이트 컬러 (제품 컬러로 변경)
const SOURCE = '출처 : 네이버 블로그 책 읽는 하루'; // 블로그명으로 교체 (필수)
const sp = t => `<span style="color:${G}">${t}</span>`;
const CAPS = [                             // 컷별 2줄 자막
  ['운동 전 딱 한 캔,', sp('바이퍼 에너지 그린')],
  [`고함량 ${sp('L-아르기닌 4,000mg')}`, '카페인 130mg까지 꽉'],
  [`${sp('제로슈거')}에 트로피컬향`, '시원하게 톡! 부담 없이'],
  [`냉장고에 ${sp('24캔')} 쟁여두기`, '이 링크에서만 특가'],
];
const BADGE = `<div style="position:absolute;left:50%;top:1080px;transform:translateX(-50%);width:560px;height:560px;border-radius:50%;background:#0b1206;border:10px solid ${G};display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 0 60px rgba(140,255,0,.5);font-family:P8;color:#fff;text-align:center;line-height:1.15">
<div style="background:${G};color:#0b1206;font-size:44px;padding:6px 26px;border-radius:999px;margin-bottom:14px">이 링크 한정 특가</div>
<div style="font-size:52px">24캔 <span style="text-decoration:line-through;color:#bbb;font-size:42px">29,900원</span></div>
<div style="font-family:P9;font-size:118px;color:${G};letter-spacing:-3px">22,900원</div>
<div style="font-size:42px;color:#ddd;margin-top:6px">1캔 954원꼴</div></div>`;
const CSS = `@font-face{font-family:P9;src:url(../fonts/Paperlogy-9Black.woff2)}@font-face{font-family:P8;src:url(../fonts/Paperlogy-8ExtraBold.woff2)}
*{margin:0;padding:0}html,body{width:1080px;height:1920px;background:transparent;overflow:hidden}
.cap{position:absolute;left:0;right:0;top:470px;text-align:center;font-family:P9;font-size:74px;line-height:1.32;color:#fff;letter-spacing:-1.5px;text-shadow:0 0 4px #000,0 0 4px #000,0 4px 14px rgba(0,0,0,.85),2px 2px 0 #000,-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000}
.src{position:absolute;right:46px;bottom:150px;font-family:P8;font-size:30px;color:rgba(255,255,255,.88);text-shadow:0 1px 4px rgba(0,0,0,.9)}`;

(async () => {
  fs.mkdirSync('ov', { recursive: true });
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (let i = 0; i < CAPS.length; i++) {
    const [l1, l2] = CAPS[i];
    const last = i === CAPS.length - 1;
    fs.writeFileSync('ov/o.html', `<html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="cap">${l1}<br>${l2}</div>${last ? BADGE : ''}<div class="src">${SOURCE}</div></body></html>`);
    await pg.goto('file://' + process.cwd() + '/ov/o.html'); await pg.waitForTimeout(600);
    await pg.screenshot({ path: `ov/o${i}.png`, omitBackground: true });
  }
  await b.close();
})();
