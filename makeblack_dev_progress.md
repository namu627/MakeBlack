# MakeBlack — 현재 개발 진행 상태

> 새 채팅에서 이어서 개발할 때 이 파일을 참고

---

## 현재 환경

- **OS**: Windows
- **에디터**: VS Code
- **목표 플랫폼**: Android + Web
- **Node.js**: 설치됨
- **Expo Go**: Android 설치됨 (버전 54.0.6, SDK 54 지원)

---

## 프로젝트 위치

```
C:\Users\PC\Desktop\MakeBlack\makeblack
```

---

## 완료된 작업

### ✅ Week 1 완료
- Expo 프로젝트 생성 (`create-expo-app@latest`)
- Android 폰에서 Expo Go로 실행 확인
- Supabase 프로젝트 생성 (Seoul 리전)
- Supabase 연결 완료 (`lib/supabase.js`)
- `.env` 파일 설정 완료

### 🔄 Week 2 진행 중 — Auth (로그인/회원가입)
- react-navigation 설치 완료
- 아직 로그인 화면 미완성

---

## 현재 파일 구조

```
makeblack/
├── app/                    ← expo-router 기본 템플릿 파일들 있음
├── assets/
│   └── images/
├── lib/
│   └── supabase.js         ← Supabase 클라이언트 ✅
├── .env                    ← Supabase URL, KEY 설정됨 ✅
├── app.json
├── package.json
└── ...
```

---

## 설치된 주요 패키지

```json
"expo": "~54.0.33",
"expo-router": "~6.0.23",
"@supabase/supabase-js": "^2.99.1",
"@react-native-async-storage/async-storage": "2.2.0",
"react-native-url-polyfill": "^3.0.0",
"@react-navigation/native": "^7.1.33",
"@react-navigation/native-stack": "^7.14.5",
"react-native-screens": "~4.16.0",
"react-native-safe-area-context": "~5.6.0"
```

---

## 주의사항

- `package.json`의 `main`은 `"expo-router/entry"` 로 되어있음
- 기본 템플릿이라 `app` 폴더 안에 예제 파일들이 있음 — 정리 필요
- `app.json`에 `"newArchEnabled": true` 있음 — 문제 생기면 false로 변경
- `java.lang.String cannot be cast to java.lang.Boolean` 오류가 계속 났는데 `userInterfaceStyle`, `adaptive-icon` 경로 문제였음. 새 프로젝트로 해결됨

---

## 다음에 할 일 (Week 2 이어서)

1. **`app` 폴더 기본 템플릿 파일 정리**
   - 기존 예제 파일 삭제
   - 로그인/회원가입/홈 구조로 재구성

2. **로그인 화면 구현**
   - `app/(auth)/login.js`
   - `app/(auth)/signup.js`

3. **세션 관리**
   - 로그인 상태에 따라 홈/로그인 화면 분기
   - `app/_layout.js`에서 처리

4. **Supabase Auth 연동**
   - `signUp`, `signInWithPassword` 연결
   - 이메일 인증 처리

---

## 서버 실행 방법

```bash
cd C:\Users\PC\Desktop\MakeBlack\makeblack
npx expo start
```

터미널에서 Command Prompt 사용 (PowerShell 아님)

---

## lib/supabase.js 내용

```javascript
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```
### ✅ Week 2 완료 — Auth
- 로그인/회원가입 화면 구현
- Supabase Auth 연동 (signUp, signInWithPassword, signOut)
- 세션 자동 복원 (onAuthStateChange)
- app/_layout.js에서 세션 상태에 따라 라우팅 처리
- JWT AsyncStorage 영속 저장

### 현재 파일 구조
makeblack/
├── app/
│   ├── (auth)/
│   │   ├── _layout.js
│   │   ├── login.js
│   │   └── signup.js
│   ├── (tabs)/
│   │   ├── _layout.js
│   │   ├── index.js      (홈 플레이스홀더)
│   │   ├── search.js     (플레이스홀더)
│   │   ├── team.js       (플레이스홀더)
│   │   └── mypage.js     (플레이스홀더)
│   └── _layout.js
└── lib/
    └── supabase.js

### ✅ Week 3 완료 — 개인 할일 + 팔레트
- 카테고리 CRUD (Supabase)
- 할일 CRUD + 낙관적 업데이트
- 팔레트 drops Supabase 저장
- 날짜 이동 + 데이터 영속성
- BLACK 달성 오버레이 애니메이션
- 마이페이지 기본 (프로필 + 로그아웃)

### 현재 파일 구조
makeblack/
├── app/
│   ├── (auth)/
│   │   ├── _layout.js
│   │   ├── login.js
│   │   └── signup.js
│   ├── (tabs)/
│   │   ├── _layout.js
│   │   ├── index.js      ← 홈 (완성)
│   │   ├── search.js     (플레이스홀더)
│   │   ├── team.js       (플레이스홀더)
│   │   └── mypage.js     ← 마이페이지 기본 (완성)
│   └── _layout.js
└── lib/
    ├── supabase.js
    ├── colorMath.js
    └── todoService.js