# UXPWA — uxpwa.com 랜딩

`https://uxpwa.com` 에 올릴 정적 홈 페이지입니다.

## Vercel 연결

1. GitHub에 이 폴더(`home`) 저장소를 push
2. Vercel **New Project** → 저장소 선택 → **Root Directory** = `home` (저장소 루트가 이 폴더면 그대로)
3. **Framework Preset** = Other (또는 vercel.json 의 `framework: null`)
4. **Domains** → `uxpwa.com` · `www.uxpwa.com` 추가

## 로컬 미리보기

`serve.cmd` → `dev-ports.json` 의 `home` 포트 (기본 5172)

## 스마트스토어 링크

`index.html` 의 `support-link` `href` 를 실제 스토어 주소로 바꾸면 됩니다.