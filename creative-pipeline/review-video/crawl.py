# 체험단 블로그 크롤러 — 힉스필드 샌드박스에서 실행 (python3 crawl.py)
# QUERIES / TITLE_KEY만 제품에 맞게 바꾸면 됨
import re, subprocess, json, urllib.parse

QUERIES = ['바이퍼 에너지 그린', '삼대오백 바이퍼 그린', '바이퍼 에너지드링크 체험단']
TITLE_KEY = '그린'   # 글 제목에 이 단어가 있어야 수집 (다른 맛/제품 섞임 방지)

UA_M = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
UA_D = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0'
SPON = re.compile(r'제공받|원고료|체험단|협찬|소정의')  # 체험단 글 판별

def get(u, ua=UA_M):
    return subprocess.run(['curl', '-s', '-L', '-A', ua, '--max-time', '20', u],
                          capture_output=True, text=True, errors='ignore').stdout

urls = set()
for q in QUERIES:
    for start in [1, 31]:
        h = get(ua=UA_D, u='https://search.naver.com/search.naver?ssc=tab.blog.all&start=%d&query=%s' % (start, urllib.parse.quote(q)))
        urls |= set(re.findall(r'https://blog\.naver\.com/[A-Za-z0-9_\-]+/\d{9,}', h))

res = []
for u in sorted(urls):
    bid, pid = u.rstrip('/').split('/')[-2:]
    h = get(f'https://m.blog.naver.com/PostView.naver?blogId={bid}&logNo={pid}')
    title = (re.search(r'<title>(.*?)</title>', h, re.S) or [None, ''])[1].replace(' : 네이버 블로그', '').strip()
    if TITLE_KEY not in title:
        continue
    hh = h.replace('&quot;', '"')
    gifs = sorted(set(re.findall(r'https://mblogvideo-phinf\.pstatic\.net/[^"\'\s<>]+?\.mp4|https://(?:postfiles|mblogthumb-phinf)\.pstatic\.net/[^"\'\s<>]+?\.gif[^"\'\s<>]*', hh)))
    vids = re.findall(r'"vid"\s*:\s*"([A-F0-9]{20,})"[^}]*?"inkey"\s*:\s*"([^"]+)"', hh)
    res.append(dict(blog=bid, title=title[:60], url=u, sponsored=bool(SPON.search(h)), gifs=gifs, vids=vids))

json.dump(res, open('posts.json', 'w'), ensure_ascii=False, indent=1)
for r in res:
    print(('✅체험' if r['sponsored'] else '⛔일반'), f"gif:{len(r['gifs']):2} vid:{len(r['vids'])}", r['blog'][:14], '|', r['title'][:45])

# ── 체험단 글 영상 다운로드 (최고화질) ──
import os
os.makedirs('clips', exist_ok=True)
for p in [p for p in res if p['sponsored'] and p['vids']]:
    nick = (re.search(r'<title>([^<]*)', get(f'https://m.blog.naver.com/{p["blog"]}')) or [None, p['blog']])[1].replace(' : 네이버 블로그', '').strip()
    for i, (vid, inkey) in enumerate(p['vids']):
        try:
            d = json.loads(get(f'https://apis.naver.com/rmcnmv/rmcnmv/vod/play/v2.0/{vid}?key={inkey}', UA_D))
            best = sorted(d['videos']['list'], key=lambda v: v['encodingOption']['height'])[-1]
            fn = f"clips/{p['blog']}_{i}.mp4"
            subprocess.run(['curl', '-s', '-L', '-A', UA_D, '--max-time', '60', '-o', fn, best['source']])
            print('OK', fn, best['encodingOption']['width'], 'x', best['encodingOption']['height'], '| 출처:', nick)
        except Exception as e:
            print('FAIL', p['blog'], i, str(e)[:80])
