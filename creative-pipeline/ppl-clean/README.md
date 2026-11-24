# 🏃 선수 PPL 클린 포맷 (2026-11-24 샘플)

원본: NAS `Z:\10_마케팅팀\02_후원선수 소스\01_선수 PPL 영상` → device_stage_files로 컨테이너에 복사 (원본 수정 금지)
작업: Claude 컨테이너 (ffmpeg + Playwright) → 결과는 device_commit_files로 NAS `03_광고\01_META\YYMMDD_SNS_제품_선수PPL(영상)\`

레이아웃 (1080×1920)
- 배경: 같은 영상 확대 + 블러 + 어둡게 (검은 레터박스 대신)
- 상단: 작은 태그(SAMDAE500 × 선수명) → 2줄 후킹 (Paperlogy 9, 둘째 줄 #FFE14D)
- 중앙: 원본 16:9 영상 y=582
- 영상 아래: 컷별 자막 1줄 (Paperlogy 7)
- 그 아래: 제품명(A2Z) + 오퍼 pill(#FFE14D) + 출처(유튜브 채널명)
- 원형 뱃지·이모지·외곽선 없음

ffmpeg (컷별):
`-ss S -t T -i src.mp4 -i ov/oN.png -filter_complex "[0:v]crop=1080:624:0:648,split[a][b];[a]scale=-2:1920,crop=1080:1920,boxblur=30:3,eq=brightness=-0.28[bg];[bg][b]overlay=0:582[c];[c][1:v]overlay=0:0,fps=30,format=yuv420p"`
(crop 값은 원본이 9:16 레터박스 편집본일 때 — 16:9 원본이면 crop 생략)
