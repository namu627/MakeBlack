# MakeBlack — UI/UX 상세 명세서
> React Native 포팅 시 참고. 프로토타입 코드에서 직접 추출한 실제 값들.

---

## 1. 색상 토큰 (THEMES)

```javascript
const THEMES = {
  dark: {
    bg:          "#0a0a0a",   // 전체 배경
    surface:     "#141414",   // 카드/시트 배경
    card:        "#181818",   // 할일 아이템 배경
    border:      "#242424",   // 기본 테두리
    border2:     "#2e2e2e",   // 강조 테두리
    text:        "#f0ece6",   // 기본 텍스트
    muted:       "#888888",   // 보조 텍스트
    dim:         "#555555",   // 흐린 텍스트
    pill:        "#1e1e1e",   // 필 배경
    paletteBase: "#0d0c0b",   // 팔레트 캔버스 배경
  },
  light: {
    bg:          "#f5f4f0",
    surface:     "#ffffff",
    card:        "#f0eeea",
    border:      "#e0ddd8",
    border2:     "#d4d0cb",
    text:        "#1a1a1a",
    muted:       "#777777",
    dim:         "#aaaaaa",
    pill:        "#e8e5e0",
    paletteBase: "#f0eeea",
  },
};
```

---

## 2. Border Radius

```javascript
const radius = {
  sm:   10,    // 카테고리 태그, 루틴 요일 버튼
  md:   16,    // 할일 아이템, 버튼
  lg:   22,    // 카드, 팔레트 컨테이너
  full: 999,   // 필, 캘린더 버튼, 체크박스
};
```

---

## 3. 폰트

- **기본 폰트**: `system-ui, -apple-system, sans-serif`
- React Native에서는 `Platform.OS === 'ios' ? '-apple-system' : 'sans-serif'`

| 용도 | 크기 | 굵기 | 색상 |
|---|---|---|---|
| 앱 타이틀 ("makeblack") | 9 | 400 | `C.dim` |
| 날짜 텍스트 ("오늘", "3월 14일") | 17 | 700 | `C.text` |
| 섹션 헤더 | 22 | 700 | `C.text` |
| 카테고리 이름 | 12 | 600 | `cat.color` |
| 할일 텍스트 | 13 | 400 | `C.text` (미완료) / `C.muted` (완료) |
| 완료 카운트 | 10 | 400 | `C.dim` |
| 버튼 텍스트 | 11 | 400 | `C.muted` |
| 루틴 뱃지 | 9 | 400 | `C.dim` |
| 캘린더 날짜 | 9 | 400~700 | 상태별 상이 |
| 체크 아이콘 (✓) | 10 | 800 | `#080808` |

---

## 4. 홈 화면 레이아웃

### 전체 구조
```
┌─────────────────────────────┐
│  height: 100vh              │
│  flexDirection: column      │
│  overflow: hidden           │
│                             │
│  ┌─────────────────────┐    │
│  │ 상단 고정 영역       │    │  flexShrink: 0
│  │ padding: 14px 18px 0│    │
│  │                     │    │
│  │  [헤더 - 날짜/버튼] │    │  marginBottom: 10
│  │  [팔레트 캔버스]    │    │  margin: 0 auto
│  │  [프로그레스바]     │    │  margin: 10px auto 0
│  └─────────────────────┘    │
│                             │
│  [구분선]                   │  height: 1, margin: 12px 18px 0
│                             │
│  ┌─────────────────────┐    │
│  │ 하단 스크롤 영역    │    │  flex: 1, overflowY: auto
│  │ padding: 12px 18px  │    │  paddingBottom: 100px
│  │         100px       │    │
│  │  [카테고리 + 할일]  │    │
│  └─────────────────────┘    │
└─────────────────────────────┘
```

### 헤더 상세
```
┌─────────────────────────────────────────┐
│ [날짜 영역 - 왼쪽]     [버튼들 - 오른쪽] │
│                                          │
│  ┌────────────────────┐  ┌──────┐ ┌───┐ │
│  │ makeblack (9px)    │  │캘린더│ │카테│ │
│  │ ◀  오늘  ▶        │  └──────┘ └───┘ │
│  └────────────────────┘                  │
└─────────────────────────────────────────┘
```

**날짜 영역**
- `flexDirection: column`, `alignItems: center`
- "makeblack" 레이블: `fontSize: 9`, `color: C.dim`, `letterSpacing: "0.3em"`, `textTransform: uppercase`, `marginBottom: 2`
- 날짜 행: `flexDirection: row`, `alignItems: center`, `gap: 4`
- ◀ ▶ 버튼: `width: 13`, `fontSize: 9`, `opacity: 0.55`, 배경/테두리 없음
- 날짜 텍스트: `fontSize: 17`, `fontWeight: 700`, `letterSpacing: "-0.02em"`, `width: 88`, `textAlign: center`

**오른쪽 버튼들**
- `height: 28`, `padding: 0 11px`, `borderRadius: radius.full`
- `background: C.surface`, `border: 1px solid C.border`, `color: C.muted`
- `fontSize: 11`

---

## 5. 팔레트 캔버스

### 크기
| 설정 | 크기 |
|---|---|
| small | min(38vw, 140px) |
| medium (기본) | min(52vw, 200px) |
| large | min(66vw, 260px) |

### 컨테이너
- `aspectRatio: 1` (정사각형)
- `borderRadius: radius.lg` (22px)
- `overflow: hidden`
- `border: 1px solid C.border`
- `margin: 0 auto`

### 캔버스 내부
- 정적 레이어 + 애니메이션 레이어 두 개 겹침
- 정적 레이어: `renderPalette()` 호출
- 애니메이션 레이어: `position: absolute, inset: 0`, `pointerEvents: none`
- 캔버스 자체 크기: `S = 300` (내부 해상도), 화면에는 CSS로 stretch

---

## 6. Drop 애니메이션 (할일 완료 시)

```
FRAMES = 68  (~약 1.1초 @ 60fps)

t = frame / 68

eExpand = 1 - (1 - min(t * 1.15, 1))^3.5   // ease-out cubic
eFade   = t < 0.52 ? 1 : max(0, 1 - (t - 0.52) / 0.48)

curR = eExpand * maxR    // 0 → maxR
opacity = eFade * 0.85

maxR = cornerDist * 0.55
cornerDist = 팔레트 중심에서 가장 먼 코너까지의 거리
```

**동작 설명:**
1. drop 위치(px, py)에서 잉크가 0px 반지름으로 시작
2. 68프레임에 걸쳐 maxR까지 팽창 (약 코너까지 닿는 크기)
3. 52% 지점까지는 완전 불투명
4. 52% 이후 점점 페이드아웃
5. 완전히 사라지면 정적 레이어에 최종 상태 렌더링

---

## 7. BLACK 달성 시퀀스

### 타이밍 (ms)
```
0ms      → blackPhase = "in" → blackIn 애니메이션 (0.4s)
1000ms   → blackPhase = "out" → blackOut 애니메이션 (0.45s)
1150ms   → 캘린더 시트 열림 (slideDown 0.2s)
1400ms   → blackPhase = null, FlyingOrb 발사
1880ms   → FlyingOrb 도착, stampDate 설정
2280ms   → stampDate 해제, 캘린더 닫힘 (slideUp 0.3s)
```

### BLACK 오버레이
```javascript
// 전체 화면 덮음
position: fixed, inset: 0, zIndex: 300
background: rgba(0,0,0,0.97)
alignItems: center, justifyContent: center
cursor: pointer  // 클릭 시 스킵

// 흰 원
width: 80, height: 80, borderRadius: 50%
background: "#fff" (in) → "#000" (out)
boxShadow: "0 0 40px rgba(255,255,255,0.4)"
animation: pulse 2s 0.4s ease-in-out infinite (in 중)
marginBottom: 28

// "BLACK" 텍스트
fontSize: 28, letterSpacing: "0.55em"
color: "#fff", fontWeight: 200

// 부제
fontSize: 12, color: "#555"
marginTop: 14, letterSpacing: "0.12em"
"모든 색이 하나가 됐어요"
```

### FlyingOrb 애니메이션
```
FRAMES = 30  (~480ms @ 60fps)
시작 위치: 화면 중앙 (vw/2, vh/2)
종료 위치: 캘린더 셀 중앙 (targetCellRef.getBoundingClientRect())

t = frame / 30
et = 1 - (1 - t)^3  // ease-out cubic

// 베지어 경로
cx1 = sx + (tx - sx) * 0.3
cy1 = min(sy, ty) - abs(tx - sx) * 0.25  // 위로 살짝 아치

// 구체 크기: 40px → 16px
r = 40 - et * 24

// 색상: 흰색 → 검정
lum = 255 * (1 - et)

// 투명도: 80% 전까지 1.0, 이후 페이드
alpha = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2

// 글로우 (lum > 80일 때)
radialGradient: 0~r*2.5, alpha*0.25 → transparent

// 꼬리: 3개, 각각 et - i*0.06 위치, r*(1-i*0.2) 크기, alpha*(0.25-i*0.07) 투명도
```

### 캘린더 셀 스탬프 애니메이션
```
@keyframes stamp:
  0%   { transform: scale(2.4); opacity: 0; }
  45%  { transform: scale(0.85); opacity: 1; }
  68%  { transform: scale(1.12); }
  100% { transform: scale(1); opacity: 1; }
duration: 0.55s, cubic-bezier(0.36, 0.07, 0.19, 0.97)

@keyframes ripple:
  0%   { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(2.8); opacity: 0; }
duration: 0.7s, delay: 0.15s, ease-out

// 리플 링
position: absolute, inset: -4
borderRadius: 50%
border: 1.5px solid rgba(255,255,255,0.6)
```

---

## 8. 캘린더 시트

### 컨테이너
```javascript
// 배경 오버레이
position: fixed, inset: 0, zIndex: 150
background: rgba(0,0,0,0.65)
backdropFilter: blur(10px)

// 시트 본체
position: absolute, top: 0
left: 50%, transform: translateX(-50%)
width: 100%, maxWidth: 480
background: C.surface
borderRadius: 0 0 28px 28px
padding: 20px 18px 28px

// 열림 애니메이션
@keyframes slideDown:
  from { transform: translateX(-50%) translateY(-100%) }
  to   { transform: translateX(-50%) translateY(0) }
duration: 0.2s, cubic-bezier(0.22, 1, 0.36, 1)

// 닫힘 애니메이션
@keyframes slideUp:
  from { transform: translateX(-50%) translateY(0) }
  to   { transform: translateX(-50%) translateY(-108%) }
duration: 0.3s, cubic-bezier(0.4, 0, 0.6, 1)
```

### 헤더
- 좌우 ‹ › 버튼: `width: 34`, `height: 34`, `borderRadius: 50%`
- 월 텍스트: `fontSize: 15`, `fontWeight: 700`, `letterSpacing: "-0.02em"`

### 요일 행
- `fontSize: 10`
- 일요일: `#ff7070`, 토요일: `#7090ff`, 나머지: `C.dim`

### 날짜 셀
```javascript
// 셀 컨테이너
display: flex, flexDirection: column
alignItems: center, gap: 2
padding: 3px 1px, borderRadius: radius.sm
background: 선택됨 ? "#222" : "transparent"
outline:
  미완료 있음 → "1px solid rgba(255,255,255,0.18)"
  완료됨     → "1px solid rgba(255,255,255,0.06)"
  없음       → "none"

// 팔레트 원 (30x30)
borderRadius: 50%
opacity:
  완료됨 → 1.0
  진행중 → 0.35 + (drops.length / total) * 0.65

// 완료 링 (isDone)
position: absolute, inset: 0
borderRadius: 50%
border: 1.5px solid rgba(255,255,255,0.5)

// 오늘 (팔레트 없을 때)
background: #1a1a1a
border: 1px solid C.border2
중앙 점: width: 4, height: 4, background: C.dim

// 날짜 숫자
fontSize: 9
fontWeight: 오늘 → 700, 미완료 → 600, 나머지 → 400
color:
  일요일    → #ff7070
  토요일    → #7090ff
  미완료    → C.text (흰색)
  완료됨    → #444
  할일없음  → #3a3a3a
```

---

## 9. 카테고리 UI

### 카테고리 헤더 행
```javascript
display: flex, alignItems: center, gap: 8
marginBottom: 8

// 카테고리 태그
display: flex, alignItems: center, gap: 6
padding: 4px 12px 4px 8px
background: cat.color + "15"   // 15% 투명도
borderRadius: radius.full
border: 1px solid cat.color + "28"   // 28% 투명도

// 색 점
width: 6, height: 6, borderRadius: 50%
background: cat.color
boxShadow: 0 0 5px cat.color

// 이름
fontSize: 12, fontWeight: 600, color: cat.color

// 카운트
fontSize: 10, color: C.dim

// + 버튼
width: 26, height: 26, borderRadius: 50%
background: C.surface, border: 1px solid C.border2
color: C.muted, fontSize: 16
```

---

## 10. 할일 아이템 UI

```javascript
// 아이템 컨테이너
display: flex, alignItems: center, gap: 10
padding: 11px 13px
borderRadius: radius.md  // 16px
border: 1px solid (editing ? C.border2 : done ? C.border : C.border2)
background: editing ? C.surface : done ? "transparent" : C.card
opacity: done && !editing ? 0.42 : 1
transition: all 0.2s
marginBottom: 5px (gap)

// 체크박스
width: 20, height: 20, borderRadius: 50%
border: 2px solid (done ? todo.color : C.border2)
background: done ? todo.color : "transparent"
transition: all 0.2s
// 완료 시 내부 ✓
fontSize: 10, fontWeight: 800, color: #080808

// 텍스트
flex: 1, fontSize: 13
color: done ? C.muted : C.text
textDecoration: done ? "line-through" : "none"

// 루틴 뱃지
fontSize: 9, color: C.dim
background: C.surface, padding: 2px 6px
borderRadius: 4

// 삭제 버튼
fontSize: 14, color: C.dim
background/border: none
```

---

## 11. 할일 입력창

```javascript
// 인풋 영역
display: flex, gap: 7, marginTop: 7

// TextInput
flex: 1
background: C.surface, border: 1px solid C.border2
borderRadius: radius.md, padding: 11px 14px
color: C.text, fontSize: 13

// 확인 버튼 (↵)
width: 42, height: 42
background: C.text, color: C.bg
border: none, borderRadius: radius.md
fontSize: 18, fontWeight: 700
```

---

## 12. 프로그레스바

```javascript
// 바 컨테이너
height: 4, borderRadius: 4
background: C.surface, overflow: hidden

// 진행 바
height: 100%, borderRadius: 4
width: `${progress}%`
background:
  isBlack    → linear-gradient(90deg, #333, #111)
  drops > 0  → linear-gradient(90deg, firstDropColor, mixedColor)
  기본       → C.border
transition: width 0.8s ease, background 1s ease
boxShadow: drops > 0 && !isBlack ? 0 0 6px mixedColor88 : none

// 색 도트 행
display: flex, alignItems: center, gap: 4
marginTop: 6, minHeight: 14

// 도트
width: 8, height: 8, borderRadius: 50%
background: drop.color
boxShadow: 0 0 4px drop.color66
최대 10개, 초과 시 "+N" (fontSize: 9, color: C.dim)

// 카운트
fontSize: 10, color: C.dim
marginLeft: auto
"{doneCount} / {totalCount}"
```

---

## 13. 하단 네비게이션

```javascript
position: fixed, bottom: 0
left: 50%, transform: translateX(-50%)
width: 100%, maxWidth: 480
background: C.bg + "e0"   // e0 = 약 88% 불투명
backdropFilter: blur(16px)
borderTop: 1px solid C.border
height: 68, zIndex: 100
display: flex

// 탭 버튼
flex: 1, background: none, border: none
flexDirection: column, alignItems: center
justifyContent: center, gap: 4

// 아이콘
fontSize: 20
color: active ? C.text : "#333"
transition: color 0.18s

// 레이블
fontSize: 9, letterSpacing: "0.04em"
color: active ? C.text : "#333"

// 활성 인디케이터 점
position: absolute, bottom: 6
width: 3, height: 3, borderRadius: 50%
background: C.text

// 탭 구성
홈(⌂) | 검색(◎) | 팀(◈) | 마이페이지(◉)
```

---

## 14. keyframe 애니메이션 목록

```css
@keyframes fadeIn {
  from { opacity: 0 }
  to   { opacity: 1 }
}

@keyframes blackIn {
  from { opacity: 0; transform: scale(1.04) }
  to   { opacity: 1; transform: scale(1) }
  duration: 0.4s, cubic-bezier(0.22, 1, 0.36, 1)
}

@keyframes blackOut {
  from { opacity: 1; transform: scale(1) }
  to   { opacity: 0; transform: scale(0.97) }
  duration: 0.45s, ease
}

@keyframes stamp {
  0%   { transform: scale(2.4); opacity: 0; }
  45%  { transform: scale(0.85); opacity: 1; }
  68%  { transform: scale(1.12); }
  100% { transform: scale(1); opacity: 1; }
  duration: 0.55s, cubic-bezier(0.36, 0.07, 0.19, 0.97)
}

@keyframes ripple {
  0%   { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(2.8); opacity: 0; }
  duration: 0.7s, delay: 0.15s, ease-out
}

@keyframes slideDown {
  from { transform: translateX(-50%) translateY(-100%) }
  to   { transform: translateX(-50%) translateY(0) }
  duration: 0.2s, cubic-bezier(0.22, 1, 0.36, 1)
}

@keyframes slideUp {
  from { transform: translateX(-50%) translateY(0) }
  to   { transform: translateX(-50%) translateY(-108%) }
  duration: 0.3s, cubic-bezier(0.4, 0, 0.6, 1)
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1) }
  50%       { opacity: 0.4; transform: scale(1.08) }
  duration: 2s, delay: 0.4s, ease-in-out, infinite
}
```

---

## 15. React Native 포팅 시 주의사항

### Canvas → react-native-skia
- `drawInkOnWater` 함수를 Skia Path + Paint로 재구현 필요
- `S = 300` 내부 해상도 유지, 화면에는 `width: '100%'`로 stretch
- WeakMap 캐시 패턴은 동일하게 유지 가능

### 애니메이션
- drop 퍼짐 → `Animated.timing` 또는 `react-native-reanimated`
- BLACK 시퀀스 타이밍 → `setTimeout` 체인 그대로 사용 가능
- FlyingOrb → Skia Canvas 위에 `requestAnimationFrame` 대신 `useFrameCallback`

### 레이아웃
- `height: 100vh` → `flex: 1`
- `min(52vw, 200px)` → `Math.min(width * 0.52, 200)`
- `overflowY: auto` → `ScrollView`
- `backdropFilter: blur` → `@react-native-community/blur` 라이브러리

### 제스처
- 더블클릭 편집 → `onLongPress` (모바일에서 더블탭보다 자연스러움)
- 드래그 순서 변경 → `react-native-draggable-flatlist`
