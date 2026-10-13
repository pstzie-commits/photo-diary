# 사진 일기 — 개발 계획

기준 문서: [PRD.md](PRD.md). 단계마다 결과를 보고하고 승인 후 다음 단계로 넘어간다.

| 단계 | 내용 | 결과물 | 사용자 할 일 |
|---|---|---|---|
| 1 ✅ | 화면 만들기 (데모 모드) | 내 PC에서 써볼 수 있는 앱 | 화면·동작 확인 |
| ~~2~~ | ~~Supabase 준비~~ → 가입 문제로 **GitHub 저장 방식으로 변경** (2026-10-13) | `supabase/` 폴더는 보관만 | — |
| 2 ✅ | GitHub 저장 연결 — 기록·사진을 저장소 파일로 저장, 열쇠(토큰) 로그인, 가짜 GitHub로 자동 시험 | 실제 GitHub에 저장할 수 있는 앱 | 결과 확인 |
| 3 ✅ | 공개 배포 — 저장소 만들기·앱 올리기·GitHub Pages 켜기, 열쇠 만들기 안내 | 공유 가능한 링크 | 저장소 생성 승인, 열쇠 만들기 |
| 4 | 휴대폰 최종 확인 — 작성·수정·삭제, 다른 기기에서 보기 | 완성 | 휴대폰 테스트 |

## 구조 (빌드 도구 없이 GitHub Pages에 바로 올리는 정적 웹앱)
```
index.html
css/style.css
js/app.js        화면 이동(주소 #/...)과 4개 화면
js/store-demo.js 데모 저장소 (브라우저 IndexedDB, 저장소 설정이 비어 있을 때)
js/store-github.js GitHub 저장소 (data/entries.json + data/photos/)
js/store.js      저장소 선택
js/image.js      사진 줄이기 (긴 변 1600px, JPEG 80%)
js/ui.js         확인 창, 알림, 기분 아이콘, 날짜 형식
js/config.js     GitHub 사용자·저장소 이름 (비어 있으면 데모 모드)
data/            기록·사진 (앱이 직접 올림)
```
