# Supabase 설정 안내 (약 15분)

사진 일기의 기록·사진·로그인을 저장할 Supabase를 준비합니다.
화면 메뉴 이름은 Supabase 업데이트에 따라 조금 다를 수 있어요. 막히면 화면을 캡처해서 보여주세요.

---

## 1. 가입하기
1. https://supabase.com 접속 → 오른쪽 위 **Start your project**
2. **Continue with GitHub** → GitHub 로그인 → 권한 허용(Authorize)

## 2. 프로젝트 만들기
1. **New project** (처음이면 Organization 만들기 화면이 먼저 나옴 → 이름 아무거나, Plan은 **Free**)
2. 입력
   - Project name: `photo-diary`
   - Database Password: **Generate a password** 누르고, 비밀번호를 메모장 등에 보관 (앱에는 쓰지 않지만 나중에 필요할 수 있음)
   - Region: **Northeast Asia (Seoul)**
3. **Create new project** → 준비될 때까지 1~2분 기다리기

## 3. 내 계정 만들기 (일기를 쓸 계정)
1. 왼쪽 메뉴 **Authentication** → **Users**
2. 오른쪽 위 **Add user** → **Create new user**
3. 내 이메일과 앱에서 쓸 비밀번호 입력
4. **Auto Confirm User** 체크 ✔ (확인 메일 없이 바로 사용)
5. **Create user**

## 4. 새 가입 막기
나 말고 아무도 계정을 만들 수 없게 합니다.
1. **Authentication** → **Sign In / Providers** (또는 Settings)
2. **Allow new users to sign up** 끄기 → **Save**

> SQL의 권한 규칙이 "일기 주인 계정만 쓰기"로 한 번 더 막고 있어서, 혹시 이 설정을 놓쳐도 다른 계정은 기록을 쓸 수 없어요.

## 5. 설정 SQL 실행하기
1. 왼쪽 메뉴 **SQL Editor** → **New query** (또는 + 버튼)
2. 이 폴더의 [`setup.sql`](setup.sql) 파일을 메모장으로 열어 **전체 복사** → 편집기에 붙여넣기
3. 파일 안의 `me@example.com` **두 곳**을 3단계에서 만든 내 이메일로 바꾸기
   (편집기에서 `Ctrl + H` → 찾을 내용 `me@example.com`, 바꿀 내용 내 이메일 → 모두 바꾸기)
4. 오른쪽 아래 **Run** (또는 `Ctrl + Enter`)
   - "destructive operation" 경고 창이 뜨면 **Run this query** 눌러도 괜찮아요 (기존 규칙을 지우고 다시 만드는 부분 때문에 뜨는 경고예요)
5. 결과 확인
   - ✅ 아래 Results에 `설정 완료 | 내 이메일` 이 보이면 성공
   - ❌ "계정을 찾을 수 없어요" → 3단계 계정의 이메일과 SQL의 이메일이 같은지 확인 후 다시 Run

## 6. 연결 정보 알려주기
1. 왼쪽 아래 **Project Settings**(톱니바퀴) → **API Keys** (또는 Data API)
2. 아래 두 가지를 복사해서 대화창에 붙여넣어 주세요
   - **Project URL**: `https://xxxx.supabase.co` 형태
   - **Publishable key** (`sb_publishable_...`) — 없으면 **anon public** 키
3. ⚠️ **secret 키 / service_role 키는 절대 보내지 마세요.** 모든 권한을 가진 키예요.
   위 두 가지는 웹앱에 들어가 공개돼도 괜찮은 정보예요(권한 규칙이 보호).

---

## 알아둘 점
- **무료 프로젝트는 7일 동안 아무도 접속하지 않으면 일시 중지돼요.** 중지되면 앱에서 기록이 안 보이고, Supabase 대시보드에서 프로젝트를 열어 **Restore**를 누르면 다시 켜져요. 데이터는 지워지지 않아요.
- 무료 용량: 사진 저장 1GB (약 2,500장), 데이터베이스 500MB.
- 앱 비밀번호를 잊으면: Authentication → Users → 내 계정 → 비밀번호 재설정.
