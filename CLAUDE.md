# MakeBlack — Claude Code 프로젝트 지침

## 역할
너는 MakeBlack 앱의 시니어 풀스택 개발자야. 15년차 앱 개발자 관점에서 조언하고, 코드를 작성하고, 문제를 진단해. 항상 한국어로 대화해.

---

## 프로젝트 개요
할 일을 완료할 때마다 고유한 색상이 팔레트 캔버스에 물감처럼 퍼지고, 색이 쌓일수록 혼합되어 검정으로 수렴하는 todolist 앱.
모든 할 일을 완료하면 "BLACK" 달성.

---

## 기술 스택
- **프론트**: React Native + Expo (SDK 54)
- **라우팅**: expo-router
- **백엔드**: Supabase (Auth, DB, Realtime)
- **팔레트**: react-native-webview (Canvas + drawInkOnWater 알고리즘)
- **알림**: expo-notifications

---

## 파일 구조
```
makeblack/
├── app/
│   ├── _layout.js              # 루트 레이아웃 (세션 분기)
│   ├── (auth)/
│   │   ├── _layout.js
│   │   ├── login.js            # 로그인
│   │   └── signup.js           # 회원가입
│   └── (tabs)/
│       ├── _layout.js
│       ├── index.js            # 홈 화면 (할일 + 팔레트)
│       ├── team.js             # 팀 화면
│       ├── search.js           # 검색 (플레이스홀더)
│       └── mypage.js           # 마이페이지 + 알림설정
├── components/
│   └── PaletteCanvas.js        # WebView 기반 잉크 팔레트
└── lib/
    ├── supabase.js             # Supabase 클라이언트
    ├── colorMath.js            # 색상 수학 (hslToRgb, mixRgbList 등)
    ├── todoService.js          # 개인 할일 Supabase 쿼리
    ├── teamService.js          # 팀 Supabase 쿼리
    └── notifications.js        # 푸시 알림
```

---

## 색상 토큰 (다크 테마)
```javascript
bg:          '#0a0a0a'   // 전체 배경
surface:     '#141414'   // 카드/시트 배경
card:        '#181818'   // 할일 아이템 배경
border:      '#242424'   // 기본 테두리
border2:     '#2e2e2e'   // 강조 테두리
text:        '#f0ece6'   // 기본 텍스트
muted:       '#888888'   // 보조 텍스트
dim:         '#555555'   // 흐린 텍스트
paletteBase: '#0d0c0b'   // 팔레트 캔버스 배경
```

## Border Radius
```javascript
sm: 10, md: 16, lg: 22, full: 999
```

---

## Supabase 테이블 목록
- users (id, handle, name, bio, email, push_token)
- categories (id, user_id, name, color, sort_order)
- todos (id, user_id, cat_id, date, text, done, hue, rgb, color, seed)
- palette_history (id, user_id, date, drops jsonb, total)
- teams (id, name, description, created_by)
- team_members (team_id, user_id, color_index, joined_at)
- team_categories (id, team_id, name, color, created_by)
- team_todos (id, team_id, cat_id, date, text, done, author_id, assignee_id, hue, rgb, color, seed)
- team_palette_history (id, team_id, date, drops jsonb, total)

---

## PaletteCanvas 핵심 사항
- WebView + `androidLayerType="software"` (Android getImageData 문제 해결)
- `baseUrl: 'http://localhost'` (CORS 해결)
- 내부 해상도 S=300, CSS로 stretch
- `drawInkOnWater` 알고리즘: smoothNoise 기반 불규칙 경계 픽셀 연산
- 정적 레이어(#s) + 애니메이션 레이어(#a) 두 개 겹침
- drop 애니메이션: FRAMES=45, maxR = cornerDist * 0.42
- postMessage로 통신: { type: 'render'|'animDrop', drops, totalCount }

---

## 팀 멤버 색상 팔레트
```javascript
[
  { hue: 220, color: '#6c8fff' },  // 블루 (팀장)
  { hue: 0,   color: '#ff6b6b' },  // 레드
  { hue: 140, color: '#5ce65c' },  // 그린
  { hue: 45,  color: '#ffd166' },  // 옐로우
  { hue: 280, color: '#c77dff' },  // 퍼플
  { hue: 180, color: '#4ecdc4' },  // 민트
  { hue: 25,  color: '#f77f00' },  // 오렌지
  { hue: 320, color: '#ff6eb4' },  // 핑크
]
```

---

## 개발 환경
- OS: Windows
- 터미널: Command Prompt (PowerShell 아님)
- Expo Go: Android 설치됨 (SDK 54)
- Expo 계정: namu627
- EAS 프로젝트 ID: 19b2f35d-188b-4d1f-a5d8-58911833b22d

## 서버 실행
```bash
cd C:\Users\PC\Desktop\MakeBlack\makeblack
npx expo start
```

---

## 완료된 작업
- Week 1 ✅ Expo + Supabase 연결
- Week 2 ✅ 로그인/회원가입/세션 관리
- Week 3 ✅ 개인 할일 CRUD + 팔레트 서버 저장 + BLACK 달성
- Week 4 ✅ 팀 기능 + Realtime + 담당자 지정
- Week 5 ✅ 로컬 리마인더 알림
- Week 6 ✅ Android APK 빌드 + 폰 설치 확인
- Week 7 🔄 UI Polish 진행중

---

## Week 7 남은 작업
1. **Flying Orb 위치 오류** — BLACK 달성 시 흰 구체가 캘린더 해당 날짜 셀로 정확히 날아가지 않고 위로 올라가버림. `ref.measure()` 타이밍 문제.

2. **캘린더 셀 상태 미적용**
   - paletteHistory 데이터를 캘린더에 연동해야 함
   - 미완료 날: 팔레트 미니 원 + 흰 테두리 (`rgba(255,255,255,0.18)`)
   - 완료 날: 팔레트 미니 원 + 흰 테두리 + 검정 오버레이 (`rgba(0,0,0,0.82)`)
   - 팔레트 없는 날: 오늘이면 어두운 원 + 중앙 점, 아니면 투명
   - 날짜 숫자 색상: 미완료→흰색, 완료→#444, 없음→#3a3a3a, 일요일→#ff7070, 토요일→#7090ff
   - Supabase에서 월별 palette_history 조회 후 state로 관리

3. **팀 팔레트 PaletteCanvas 미적용**
   - team.js에 `import PaletteCanvas from '../../components/PaletteCanvas'` 추가
   - 기존 색 도트 프리뷰를 `<PaletteCanvas drops={paletteDrops} totalCount={todos.length} size={160} />` 로 교체

4. **물감 속도/범위** — PaletteCanvas.js에서 FRAMES=45, maxR=cornerDist*0.42 확인

---

## 코드 작업 시 주의사항
- 낙관적 업데이트 패턴 사용 (로컬 state 먼저 → 서버 동기화 → 실패 시 롤백)
- 모든 Supabase 쿼리는 try/catch
- 네트워크 에러 시 Alert로 사용자 안내
- expo-notifications는 Expo Go에서 경고 뜨지만 무시해도 됨 (APK에서는 정상)
- RLS 정책: team_members 조회 시 재귀 방지를 위해 security definer 함수 사용중
