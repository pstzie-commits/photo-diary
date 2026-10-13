# 사진 일기 사용 안내

앱 주소: **https://pstzie-commits.github.io/photo-diary/**
누구나 이 주소로 일기를 볼 수 있어요. 기록을 쓰려면 아래 "열쇠"로 로그인하세요.

---

## 열쇠(토큰) 만들기 — 처음 한 번, 약 3분

> 💡 **휴대폰 브라우저에서 만드는 것을 추천해요.** 만든 열쇠를 바로 붙여넣을 수 있고,
> 카톡·메일로 옮기다가 열쇠가 남는 일이 없어요. (PC에서 쓸 거라면 PC에서 만들어도 돼요)

1. GitHub에 로그인한 상태에서 이 주소 열기
   **https://github.com/settings/personal-access-tokens/new**
   (메뉴로 가려면: 프로필 사진 → Settings → 맨 아래 Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token)
2. **Token name**: `photo-diary 휴대폰` (기기를 구분할 수 있는 이름)
3. **Expiration**: 원하는 기간 선택 (예: 1년). 만료되면 같은 방법으로 새로 만들면 돼요.
4. **Repository access**: **Only select repositories** → `photo-diary` 하나만 선택
5. **Permissions** → **Repository permissions** → **Contents** 를 **Read and write** 로
   (Metadata는 자동으로 Read-only가 돼요. 다른 권한은 건드리지 마세요)
6. 맨 아래 **Generate token** → 확인 창이 나오면 다시 **Generate token**
7. `github_pat_` 로 시작하는 열쇠가 나오면 **복사** — 이 화면을 벗어나면 다시 볼 수 없어요

## 로그인하기
1. 앱 주소 열기 → 오른쪽 위 사람 아이콘
2. 복사한 열쇠 붙여넣기 → **로그인**
3. 오른쪽 아래 **+** 버튼이 보이면 성공

## 홈 화면에 앱처럼 추가 (선택)
- 아이폰 Safari: 공유 버튼 → **홈 화면에 추가**
- 안드로이드 Chrome: 오른쪽 위 ⋮ → **홈 화면에 추가**

---

## 알아둘 점
- 새 기록은 나에게는 바로, **다른 사람에게는 1~2분 뒤** 보여요.
- **삭제해도 저장소의 변경 이력에는 남아요.** 공개되면 곤란한 사진은 올리지 마세요.
- 열쇠가 만료되면 저장할 때 "열쇠가 만료됐어요" 안내가 나와요 → 로그아웃 후 새 열쇠로 로그인.
- 휴대폰을 잃어버렸다면: 위 1번 주소의 열쇠 목록에서 그 열쇠를 **Delete** 하면 바로 쓸 수 없게 돼요.
