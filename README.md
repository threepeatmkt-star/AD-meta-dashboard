# 삼대오백 광고 대시보드 — 설정 가이드

## 📋 사전 준비 체크리스트

### Meta 쪽

- [ ] **Meta 광고 계정 ID** 확인
  - Meta Business Suite → 설정 → 광고 계정 → 계정 ID (숫자만)

- [ ] **Meta 장기 액세스 토큰** 발급
  1. [developers.facebook.com](https://developers.facebook.com) 접속
  2. 내 앱 만들기 (또는 기존 앱 사용) → 마케팅 API 제품 추가
  3. Graph API Explorer → 토큰 발급 → `ads_read` 권한 체크
  4. 장기 토큰으로 교환 (유효기간 60일, 만료 전 갱신 필요)

### GA4 쪽

- [ ] **GA4 속성 ID** 확인
  - GA4 → 관리 → 속성 설정 → 속성 ID

- [ ] **서비스 계정 JSON 키** 발급
  1. [console.cloud.google.com](https://console.cloud.google.com) 접속
  2. IAM 및 관리자 → 서비스 계정 → 새 서비스 계정 생성
  3. 키 탭 → 키 추가 → JSON → 다운로드
  4. **GA4 → 관리 → 속성 액세스 관리 → 사용자 추가 → 서비스 계정 이메일 입력 → 뷰어**

### UTM 파라미터 확인

대시보드가 정확히 작동하려면 Meta 광고 URL에 다음 UTM이 설정되어 있어야 해요:

| UTM 파라미터 | Meta 동적 변수 | 용도 |
|---|---|---|
| `utm_campaign` | `{{campaign.name}}` | 캠페인별 매출 매칭 |
| `utm_content` | `{{ad.name}}` | 소재별 매출 매칭 |

예시: `?utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`

---

## 🚀 Vercel 배포 방법

### 방법 A: GitHub 연동 (권장)
1. 이 폴더를 GitHub에 올리기 (Private 레포 권장)
2. [vercel.com](https://vercel.com) → New Project → GitHub 레포 선택
3. Environment Variables 탭에서 4개 변수 입력
4. Deploy!

### 방법 B: Vercel CLI
```bash
npm install -g vercel
cd samdae-dashboard
vercel --prod
```

### 환경변수 설정 (Vercel 대시보드)
Settings → Environment Variables에서 아래 4개 추가:

| Key | Value |
|---|---|
| `META_AD_ACCOUNT_ID` | 광고 계정 ID (숫자만) |
| `META_ACCESS_TOKEN` | EAAxxxxx... |
| `GA4_PROPERTY_ID` | GA4 속성 ID |
| `GA4_SERVICE_ACCOUNT_KEY` | JSON 한 줄로 변환한 문자열 |

> ⚠️ `GA4_SERVICE_ACCOUNT_KEY`는 JSON 파일을 열어서 전체 내용을 **줄바꿈 없이 한 줄**로 붙여넣으세요.

---

## 🛠 로컬 테스트 방법

```bash
# 1. 패키지 설치
npm install

# 2. 환경변수 파일 생성
cp .env.local.example .env.local
# .env.local 열어서 실제 값 입력

# 3. 개발 서버 실행
npm run dev

# 4. 브라우저에서 확인
# http://localhost:3000
```

---

## 📊 ROAS 기준

| ROAS | 의미 |
|---|---|
| 300% 이상 | 🟢 우수 |
| 150~299% | 🟡 보통 |
| 150% 미만 | 🔴 주의 |

---

## ❓ 자주 묻는 문제

**Q. 매출이 0원으로 표시돼요**
- Meta 광고 URL에 `utm_content={{ad.name}}`이 설정되어 있는지 확인
- GA4 서비스 계정에 속성 뷰어 권한이 부여되어 있는지 확인

**Q. Meta 액세스 토큰 오류가 납니다**
- 토큰 유효기간(60일) 만료 여부 확인 → 재발급 필요
- `ads_read` 권한이 포함되어 있는지 확인

**Q. 나중에 엠엑시브 광고계정도 추가하려면?**
- Vercel 환경변수에 `MXSSIVE_AD_ACCOUNT_ID`, `MXSSIVE_ACCESS_TOKEN` 등 추가
- pages/index.js에 브랜드 전환 탭 추가 (요청 시 업데이트 가능)
