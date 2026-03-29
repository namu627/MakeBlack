# MakeBlack — 현재 개발 진행 상태

## 현재 환경
- OS: Windows
- 에디터: VS Code
- 목표 플랫폼: Android + Web
- Node.js: 설치됨
- Expo Go: Android 설치됨 (SDK 54)

## 프로젝트 위치
C:\Users\PC\Desktop\MakeBlack\makeblack

## 완료된 작업

### ✅ Week 1 — Expo + Supabase 연결
- Expo 프로젝트 생성
- Supabase 프로젝트 생성 (Seoul 리전)
- lib/supabase.js 연결 완료

### ✅ Week 2 — Auth
- 로그인/회원가입 화면
- Supabase Auth 연동 (signUp, signInWithPassword, signOut)
- 세션 자동 복원 (onAuthStateChange)
- app/_layout.js에서 세션 상태에 따라 라우팅

### ✅ Week 3 — 개인 할일 + 팔레트
- 카테고리 CRUD (Supabase)
- 할일 CRUD + 낙관적 업데이트
- 팔레트 drops Supabase 저장
- 날짜 이동 + 데이터 영속성
- BLACK 달성 오버레이
- 마이페이지 기본 (프로필 + 로그아웃)

### ✅ Week 4 — 팀 기능 + Realtime
- teams, team_members, team_categories, team_todos, team_palette_history 테이블
- 팀 생성/수정/삭제/나가기
- 멤버 초대 (이름/아이디 검색)
- 팀 카테고리 + 할일 CRUD
- 담당자 지정 기능 (assignee_id 컬럼)
- Realtime 동기화 (team_todos, team_palette_history)
- 작성자/담당자 뱃지

### ✅ Week 5 — 푸시 알림
- expo-notifications 설치
- 알림 권한 요청
- 매일 로컬 리마인더 예약/취소
- 마이페이지에 알림 시간 설정 UI

### ✅ Week 6 — APK 빌드
- EAS 설정 완료 (프로젝트 ID: 19b2f35d-188b-4d1f-a5d8-58911833b22d)
- Android APK 빌드 완료 + 폰에 설치 확인

### ✅ Week 7 — UI Polish (완료)
- PaletteCanvas WebView 방식으로 구현
  - androidLayerType="software" 로 Android getImageData 문제 해결
  - baseUrl: 'http://localhost' 로 CORS 해결
  - drawInkOnWater 알고리즘 (프로토타입과 동일)
  - drop 애니메이션 FRAMES=45, maxR=cornerDist*0.42 (속도/범위 최적화)
- 홈 화면 UI 스펙 반영 (makeblack_ui_spec.md 기준)
- BLACK 달성 시퀀스 구현 (오버레이 → Flying Orb → 캘린더 스탬프)
  - Flying Orb 목표 셀 수학적 좌표 계산 방식으로 수정 (spring 애니메이션 타이밍 오류 해결)
- 캘린더 셀 상태 구현 (팔레트 미니 원, 흰 테두리, 검정 오버레이, paletteHistory 연동)
- 팀 팔레트 PaletteCanvas 적용

## 현재 파일 구조
makeblack/
├── app/
│   ├── (auth)/
│   │   ├── _layout.js
│   │   ├── login.js
│   │   └── signup.js
│   ├── (tabs)/
│   │   ├── _layout.js
│   │   ├── index.js      ← 홈 (BLACK 시퀀스, 캘린더, 팔레트)
│   │   ├── search.js     ← 사용자 검색 (Supabase 연동)
│   │   ├── team.js       ← 팀 (팀 카드 PaletteCanvas, BLACK 시퀀스)
│   │   └── mypage.js     ← 마이페이지 (통계, 히트맵, 알림설정)
│   └── _layout.js
├── components/
│   ├── PaletteCanvas.js  ← WebView Canvas 방식
│   └── FlyingOrb.js      ← 베지어 아크 흰 구슬 애니메이션
└── lib/
    ├── supabase.js
    ├── colorMath.js
    ├── todoService.js
    ├── teamService.js
    └── notifications.js

## 설치된 주요 패키지
"expo": "~54.0.33"
"expo-router": "~6.0.23"
"@supabase/supabase-js": "^2.99.1"
"@react-native-async-storage/async-storage": "2.2.0"
"react-native-webview": (설치됨)
"@shopify/react-native-skia": (설치됨, 현재 미사용)
"expo-notifications": (설치됨)
"expo-device": (설치됨)
"expo-constants": (설치됨)
"eas-cli": (전역 설치됨)

## Supabase 테이블 목록
- users (push_token 컬럼 포함)
- categories
- routines (미구현)
- todos
- palette_history
- teams
- team_members
- team_categories
- team_todos (assignee_id 컬럼 포함)
- team_palette_history

## EAS / 배포 정보
- Expo 계정: namu627
- 프로젝트 ID: 19b2f35d-188b-4d1f-a5d8-58911833b22d
- 최근 APK 빌드: https://expo.dev/accounts/namu627/projects/makeblack/builds/6b90a473-5cf1-42e1-ae1b-3821903c957d

## 서버 실행 방법
cd C:\Users\PC\Desktop\MakeBlack\makeblack
npx expo start
(터미널은 Command Prompt 사용, PowerShell 아님)