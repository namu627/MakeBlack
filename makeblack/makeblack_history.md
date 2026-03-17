# MakeBlack — 개발 히스토리 & 의사결정 기록

## 이 프로젝트가 생긴 배경
Claude와의 대화로 시작한 앱 프로토타입. 아이디어 구상부터 전체 UI/UX 구현, 버그 수정, 구조 설계까지 한 번의 세션에서 진행됨.

---

## 핵심 의사결정 기록

### 색상 혼합 방식
- **처음**: RGB 평균 → 색이 많아져도 밝은 회색이 됨 (가산혼합)
- **시도**: CMY 감산혼합 픽셀 적용 → 첫 drop부터 검정이 됨 (배경이 #0d0c0b라 CMY=1,1,1)
- **확정**: 팔레트 렌더링은 각 drop 고유색 그대로, 완료율 다크닝은 `mixRgbList`에서만 적용
- **이유**: 시각적으로 색이 살아있으면서도 진행률 칩/프로그레스바는 어두워지는 균형

### 팀 기능 구조
- **질문**: 팀 할일을 개인 팔레트에도 반영할지
- **결정**: 분리. 개인 팔레트 = 내 하루, 팀 팔레트 = 우리 프로젝트
- **이유**: 섞이면 두 의미가 다 애매해짐

### 팀 멤버 색상
- **결정**: 가입 순서대로 고유 색 계열 자동 배정 (블루→레드→그린→옐로우...)
- **효과**: 팔레트 보면 "누가 얼마나 했는지" 한눈에 파악 가능

### 친구 기능
- **원래 의도**: 친구 맺고 팀 프로젝트 같이 관리
- **검색 탭**: 친구 찾기 전용 (팀 이름 검색 아님)
- **팔로우 개념**: 단방향 (A가 B를 팔로우해도 B가 A를 팔로우한 건 아님)

### 제거한 기능들
- 팔레트 이미지 공유 버튼 — "서비스 감성에 안 맞고 실용성 낮음"
- 데이터 내보내기(CSV) — "MakeBlack의 가치는 시각적 팔레트인데 CSV로 내보내면 의미 없음"
- 진행률 퍼센트 pill — "굳이 필요없음"
- 날짜 옆 연월 표시 (2026.03) — "불필요한 정보"
- 팔레트 밝기 투명도 오버레이 — "제거 요청"

### 남겨둔 기능들
- 미래 날짜 완료 허용 — "그날 업무를 미리 끝낼 수 있으니까"
- 연속 달성 streak — 이번 달 넘어서 전달까지 거슬러 올라감

---

## 버그 수정 히스토리 (주요)

| 버그 | 원인 | 해결 |
|---|---|---|
| 팔레트 drop 추가할수록 밝아짐 | `renderPalette` 루프에서 `totalCount`를 progress 계산에 사용 | 루프에서는 darken 제거, 각 drop 고유색 사용 |
| 마지막 drop이 검정으로 보임 | `mixRgbList(drops.slice(0,i+1), drops.length)` → n/n=1 → darken≈0 | `mixRgbAvg` 함수 분리 (darken 없음) |
| BottomNav 함수 선언 깨짐 | str_replace 과정에서 `function BottomNav` 선언 누락 | 재복원 |
| 탭 전환 시 HomeScreen 초기화 | `{tab==="home" && <HomeScreen>}` 조건부 마운트 | `display:none` 방식으로 전환 |
| cats/ruts 탭 전환 시 초기화 | HomeScreen 내부 state | App root로 끌어올림 |
| 루틴 할일 회색 팔레트 drop | routineId todo의 color="#888" 하드코딩 | 카테고리 색 기반 rutHue 계산 |
| rutHue hex 파싱 오류 | `hslToRgb(rgbToHsl(hslToRgb(...)))` 이중 변환 | hex → parseInt → rgbToHsl 직접 변환 |
| DEMO_TEAMS 구버전 구조 | `todos` 플랫 배열 사용 | `todosByDate`, `paletteHistory` 구조로 통일 |
| streak 이번 달만 계산 | monthStats 배열 index 기반 루프 | `dateKey` 역순 while 루프로 전달까지 |
| SearchScreen 온보딩 중 마운트 | `display:none` wrapper가 showOnboarding 조건 밖 | `!showOnboarding &&` 조건 추가 |
| 설정 시트 라이트 모드 검정 배경 | `background: "#111"` 하드코딩 | `C.surface` 테마 토큰 사용 |

---

## 성능 최적화 기록

| 항목 | 문제 | 해결 |
|---|---|---|
| 캘린더 렌더링 | `getDateTodos` 31번 직접 호출 | `useMemo` 월별 캐시 (`calMonthTodoCache`) |
| Canvas 렌더링 | drop 추가마다 전체 재렌더 O(n²) | WeakMap 캐시 + 증분 렌더링 (새 drop만 추가) |
| 팀 캘린더 | `getTeamTodosForDate` 31번 직접 호출 | `useMemo` 월별 캐시 (`teamCalCache`) |
| todayKey | 매 렌더마다 `new Date()` 호출 | `useState(getTodayKey)`로 고정 |
| usedHues 오염 | 날짜 전환해도 누적됨 | `selectedDate` 변경 시 리셋 |

---

## 설정 항목 목록

```
calStartSunday: boolean     // 캘린더 일요일 시작
use24h: boolean             // 24시간 표기
language: "ko" | "en"       // 언어 (번역 미구현)
reminderTime: "HH:MM"       // 리마인더 시간
reminderOn: boolean         // 리마인더 on/off
blackAnimationOn: boolean   // 홈 BLACK 애니메이션
teamBlackAnimationOn: boolean // 팀 BLACK 애니메이션
paletteSize: "small"|"medium"|"large"  // 팔레트 크기
pinLock: boolean            // PIN 잠금
pin: string                 // 4자리 PIN
privacy: "public"|"followers"|"private"  // 공개 범위
theme: "dark" | "light"     // 테마
```

---

## 컴포넌트 구조

```
MakeBlack (App root)
├── OnboardingOverlay
├── HomeScreen
│   ├── PaletteCanvas
│   ├── CalendarPalette (캘린더 셀용 미니)
│   ├── FlyingOrb (BLACK 달성 애니메이션)
│   └── CategoryManager
│       └── Modal
├── SearchScreen
│   └── UserCard
├── TeamScreen
│   ├── TeamDetail
│   │   ├── TeamPaletteCanvas
│   │   ├── PaletteCanvas (재사용)
│   │   ├── FlyingOrb (재사용)
│   │   ├── InviteModal
│   │   └── Modal
│   └── CreateTeamModal
├── MyPageScreen
│   └── SettingsSheet
│       ├── SettingRow
│       └── Toggle
└── BottomNav
```

---

## 데모 데이터

**DEMO_USERS** (검색용 7명): @bora, @chan, @minjun, @sora, @yuna, @jinho, @heera

**DEMO_TEAMS** (팀 탭 초기 데이터):
- "졸업 프로젝트 A팀" — 나, 보라(@bora), 찬(@chan)
- 카테고리: 기획(블루), 개발(레드)
- 오늘 날짜에 할일 4개 (2개 완료)

**DEMO_FRIENDS** (초기 친구 목록): @bora, @chan

---

## 향후 Supabase 스키마 참고

```sql
-- 핵심 테이블
users (id, handle, name, bio, avatar_url, created_at)
categories (id, user_id, name, color, sort_order)
routines (id, user_id, cat_id, name, repeat_type, days, month_days, start_date, end_date)
todos (id, user_id, cat_id, date, text, done, hue, rgb, color, seed, routine_id)
palette_history (id, user_id, date, drops jsonb, total int)

-- 팀
teams (id, name, desc, created_by, created_at)
team_members (team_id, user_id, color_index, joined_at)
team_categories (id, team_id, name, color)
team_todos (id, team_id, cat_id, date, text, done, author_id, hue, rgb, color, seed)
team_palette_history (id, team_id, date, drops jsonb, total int)

-- 소셜
follows (follower_id, following_id, created_at)
```

**Realtime 설정**: `team_todos`, `team_palette_history` 테이블에 Realtime 활성화
→ 팀원 완료 시 즉시 팔레트 업데이트

---

## 현재 파일 상태
- 파일명: `makeblack.jsx`
- 라인 수: 약 2640줄
- 실행 방법: Claude.ai 아티팩트로 직접 실행 가능
- 마지막 업데이트: 2026년 3월 (이 대화 세션)
