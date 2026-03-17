# MakeBlack — Phase 1 개발 체크리스트

> 프로토타입 → 실제 서비스. Week 단위 작업 순서.

---

## Week 1: 프로젝트 세팅 + Supabase 연결

### Expo 세팅
- [ ] `npx create-expo-app makeblack --template blank-typescript`
- [ ] `expo-router` 설치 (탭 네비게이션)
- [ ] `react-native-skia` 설치 (Canvas 대체)
- [ ] 폴더 구조 설계
  ```
  app/
  ├── (tabs)/
  │   ├── index.tsx       (홈)
  │   ├── search.tsx      (검색)
  │   ├── team.tsx        (팀)
  │   └── mypage.tsx      (마이페이지)
  ├── auth/
  │   ├── login.tsx
  │   └── signup.tsx
  components/
  ├── palette/
  │   ├── PaletteCanvas.tsx
  │   └── inkEngine.ts
  ├── home/
  ├── team/
  └── shared/
  lib/
  ├── supabase.ts
  ├── colorMath.ts        (프로토타입 색상 로직 이식)
  └── dateUtils.ts
  ```

### Supabase 세팅
- [ ] Supabase 프로젝트 생성
- [ ] `technical_spec.md` 스키마 순서대로 실행
  - [ ] users
  - [ ] categories
  - [ ] routines
  - [ ] todos
  - [ ] palette_history
  - [ ] teams
  - [ ] team_members
  - [ ] team_categories
  - [ ] team_todos
  - [ ] team_palette_history
  - [ ] follows
- [ ] RLS 정책 모두 적용
- [ ] Realtime 활성화 (team_todos, team_palette_history)
- [ ] `@supabase/supabase-js` 설치
- [ ] `lib/supabase.ts` 클라이언트 설정

### 환경변수
- [ ] `.env` 파일 설정
- [ ] `app.config.ts`에 env 연결
- [ ] `.gitignore`에 `.env` 추가

---

## Week 2: Auth (회원가입/로그인)

### 화면
- [ ] 로그인 화면 (이메일 + 비밀번호)
- [ ] 회원가입 화면 (이메일 + 비밀번호 + 이름)
- [ ] 이메일 인증 안내 화면
- [ ] 핸들(@아이디) 설정 화면 (최초 1회)
- [ ] 비밀번호 재설정 화면

### 로직
- [ ] `supabase.auth.signUp()` 연결
- [ ] `supabase.auth.signInWithPassword()` 연결
- [ ] `supabase.auth.signOut()` 연결
- [ ] 세션 자동 복원 (`onAuthStateChange`)
- [ ] JWT를 `expo-secure-store`에 저장
- [ ] 앱 시작 시 세션 확인 → 로그인/홈 분기

### 검증
- [ ] 이메일 형식 검증
- [ ] 비밀번호 최소 8자
- [ ] 핸들 중복 확인 (실시간)
- [ ] 핸들 형식 검증 (`@영문숫자_` 2~20자)

---

## Week 3: 개인 할일 + 팔레트 서버 저장

### 데이터 연결
- [ ] 카테고리 CRUD (Supabase)
- [ ] 루틴 CRUD (Supabase)
- [ ] 할일 CRUD (Supabase)
- [ ] 팔레트 히스토리 upsert

### 로컬 캐시
- [ ] `@react-native-async-storage/async-storage` 설치
- [ ] 최근 30일치 로컬 캐시 구현
- [ ] 오프라인 낙관적 업데이트
- [ ] 온라인 복구 시 동기화

### Canvas → Skia 이식
- [ ] `drawInkOnWater` → Skia Path/Paint로 이식
- [ ] 증분 렌더링 캐시 유지
- [ ] 애니메이션 (drop 등장) Skia로 구현

### 검증
- [ ] 날짜 이동 시 데이터 로드
- [ ] 루틴 날짜별 자동 생성
- [ ] 팔레트 drop과 todo 연동 일치

---

## Week 4: 팀 기능 + Realtime

### 팀 기능
- [ ] 팀 생성/삭제/수정
- [ ] 멤버 초대 (핸들로 검색 후 초대)
- [ ] 팀 나가기 (마지막 멤버 자동 삭제)
- [ ] 팀 할일/카테고리 CRUD
- [ ] 팀 팔레트 히스토리

### Realtime
- [ ] `team_todos` Realtime 구독
- [ ] `team_palette_history` Realtime 구독
- [ ] 팀 화면 진입/이탈 시 구독/해제
- [ ] 실시간 drop 애니메이션 (다른 멤버 완료 시)
- [ ] "OOO님이 방금 완료했어요" 토스트

### 멤버 색상
- [ ] `color_index` DB 자동 배정
- [ ] `MEMBER_HUE_PALETTE` 상수 이식

---

## Week 5: 푸시 알림

- [ ] `expo-notifications` 설치
- [ ] 알림 권한 요청 (최초 실행 시)
- [ ] 디바이스 토큰 Supabase users 테이블에 저장
- [ ] 매일 리마인더 예약 (`scheduleNotificationAsync`)
- [ ] Supabase Edge Function 작성
  - [ ] 팀원 완료 시 나머지 멤버에게 알림 발송
  - [ ] Expo Push API 연동
- [ ] 알림 수신 시 해당 화면으로 딥링크

---

## Week 6: 베타 배포 준비

### 앱스토어 준비
- [ ] 앱 아이콘 (1024x1024)
- [ ] 스플래시 스크린
- [ ] 스크린샷 (iPhone, iPad, Android)
- [ ] 앱 설명 문구 (한국어)
- [ ] 개인정보 처리방침 페이지 (필수)

### EAS Build
- [ ] `eas.json` 설정
- [ ] iOS: Apple Developer 계정 연결
- [ ] Android: Keystore 생성
- [ ] `eas build --profile preview` 테스트 빌드

### TestFlight / Play Console
- [ ] iOS: TestFlight 내부 테스트 (본인 + 지인 10명)
- [ ] Android: Internal Testing Track
- [ ] 피드백 수집 채널 마련 (오픈카톡 or 노션 폼)

### 최소 체크
- [ ] 앱 크래시 없음
- [ ] 로그인/로그아웃 정상
- [ ] 데이터 영속성 확인 (앱 재시작 후 데이터 유지)
- [ ] Realtime 동작 확인 (두 디바이스로 테스트)
- [ ] 오프라인 동작 확인

---

## 공통 주의사항

### 보안
- [ ] RLS 모든 테이블 적용 확인
- [ ] API 키 절대 클라이언트 코드에 노출 금지
- [ ] `SUPABASE_SERVICE_ROLE_KEY`는 Edge Function에서만 사용

### 에러 처리
- [ ] 모든 Supabase 쿼리에 try/catch
- [ ] 네트워크 에러 시 사용자 안내 토스트
- [ ] 인증 만료 시 자동 로그인 화면 이동

### 코드 품질
- [ ] TypeScript strict mode
- [ ] ESLint + Prettier 설정
- [ ] 컴포넌트 단위 분리 (파일당 200줄 이하 목표)
