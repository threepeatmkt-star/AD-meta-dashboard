// PPL 클린 포맷 오버레이 — 1080x1920 투명 PNG (컷별 자막만 바뀜)
const { chromium } = require('playwright');
const fs = require('fs');
const F = '/home/claude/viper-creatives/assets/fonts/';
const ACC = '#FFE14D';
const CAPS = [
  '한 입 마시자마자 “어? 맛있는데?”',
  '초코바나나 · 워터멜론 2가지 맛',
  '물에 타면 투명하게, 깔끔하게',
  '운동 전 가볍게 한 포',
  '선수가 직접 고른 운동 전 루틴',
];
const CSS = `@font-face{font-family:P9;src:url(file://${F}paperlogy9.ttf)}@font-face{font-family:P7;src:url(file://${F}023ac9bc-Paperlogy-7Bold.ttf)}
@font-face{font-family:A8;src:url(file://${F}sub8.ttf)}
*{margin:0;padding:0;box-sizing:border-box}html,body{width:1080px;height:1920px;background:transparent;overflow:hidden;color:#fff}
.logo{position:absolute;top:282px;left:50%;transform:translateX(-50%);height:52px;opacity:.92}
.hook{position:absolute;top:350px;left:0;right:0;text-align:center;font-family:P9;font-size:84px;line-height:1.18;letter-spacing:-2px}
.hook b{color:${ACC};font-weight:normal}
.cap{position:absolute;top:1236px;left:0;right:0;text-align:center;font-family:P7;font-size:46px;letter-spacing:-1px}
.prod{position:absolute;top:1340px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:18px}
.name{font-family:A8;font-size:44px}
.pill{font-family:P9;font-size:40px;background:${ACC};color:#111;padding:8px 26px 10px;border-radius:999px}
.src{position:absolute;top:1430px;left:0;right:0;text-align:center;font-family:A8;font-size:26px;color:rgba(255,255,255,.6)}`;
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (let i = 0; i < CAPS.length; i++) {
    const html = `<html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<img class="logo" src="file://${__dirname}/../assets/logo-samdae500-w.png">
<div class="hook">최재상 선수가 고른<br><b>운동 전 한 포</b></div>
<div class="cap">${CAPS[i]}</div>
<div class="prod"><span class="name">글리펌프</span><span class="pill">지금 1+1</span></div>
<div class="src">출처: 유튜브 최단백</div></body></html>`;
    fs.writeFileSync('/home/claude/ppl/ov/o.html', html);
    await pg.goto('file:///home/claude/ppl/ov/o.html'); await pg.waitForTimeout(400);
    await pg.screenshot({ path: `/home/claude/ppl/ov/o${i}.png`, omitBackground: true });
  }
  await b.close();
})();
