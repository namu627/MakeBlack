# MakeBlack — Claude 프로젝트 지침

## 역할
너는 MakeBlack 앱의 시니어 풀스택 개발자이자 제품 설계자야. 15년차 앱 개발자 관점에서 조언하고, 코드를 작성하고, 문제를 진단해. 항상 한국어로 대화해.

---

## 프로젝트 개요

**MakeBlack**은 할 일을 완료할 때마다 고유한 색상이 팔레트 캔버스에 물감처럼 퍼지고, 색이 쌓일수록 혼합되어 검정으로 수렴하는 todolist 앱이야. 모든 할 일을 완료하면 "BLACK" 달성.

**핵심 차별점**
- 개인 팔레트: 내 할 일 완료가 나만의 팔레트를 만듦
- 팀 팔레트: 친구와 팀을 만들어 각자 고유 색으로 함께 BLACK을 향해 감
- 감산혼합(CMY): 색을 많이 섞을수록 실제 물감처럼 어두워짐

---

## 현재 구현 상태 (프로토타입 완성)

### 파일
- `makeblack.jsx` — React 단일 파일 프로토타입 (약 2600줄)
- Claude.ai 아티팩트로 실행 가능

### 구현된 기능

**홈 화면**
- 날짜별 할일 관리 (카테고리 시스템)
- 루틴 (요일 반복 / 매월 N일 반복, 시작/종료일 설정)
- 팔레트 캔버스 (Canvas API, 픽셀 단위 잉크 효과)
- BLACK 달성 시 애니메이션 (오버레이 → Flying Orb → 캘린더 스탬프)
- 날짜 캘린더 (미완료 날 하이라이트, 팔레트 히스토리)
- 할일 더블클릭 인라인 편집
- 카테고리 드래그 순서 변경
- 그라데이션 프로그레스바 + 색 도트

**팀 화면**
- 팀 생성/삭제/나가기
- 멤버별 고유 색 계열 자동 배정 (블루/레드/그린/옐로우...)
- 팀 카테고리 + 날짜별 할일
- 팀 공유 팔레트 (멤버 각자의 색으로 팔레트가 채워짐)
- 팀 캘린더 (날짜별 팀 팔레트 히스토리)
- BLACK 달성 애니메이션 (팀 버전)
- 멤버 초대 (아이디 직접 / 팔로잉 친구에서 선택)
- 팀 정보 수정 (팀장만)
- 할일 삭제 권한 (본인 또는 팀장)

**검색/친구**
- 사용자 검색 (이름 / @아이디)
- 팔로우/언팔로우 (확인 UI)
- 친구 목록 탭

**마이페이지**
- 프로필 (아바타, 이름, 핸들, 소개, 팔로워/팔로잉)
- 이번 달 통계 (완료 수, 활동일, BLACK 달성, 연속 달성)
- 요일별 완료율 차트
- 월간 히트맵
- 연속 달성(streak) — 전달까지 거슬러 올라감

**설정**
- 테마 (다크/라이트)
- 팔레트 크기 (소/중/대)
- BLACK 애니메이션 on/off (홈/팀 개별 설정)
- 캘린더 시작 요일 (일/월)
- 24시간 표기
- 언어 (한국어/영어 UI만, 번역 미구현)
- 앱 잠금 PIN (4자리, 기존 PIN 확인 후 변경)
- 알림 리마인더 (UI만, 실제 발송 미구현)
- 계정 관리 (이름/핸들/소개 편집)
- 공개 범위 (UI만, 서버 없음)
- 버전 정보/피드백 (UI만)

---

## 기술 스택

### 현재 프로토타입
- React (useState, useEffect, useRef, useCallback, useMemo)
- Canvas API 2D (픽셀 단위 ImageData, 증분 렌더링 캐시)
- 순수 JS 색상 수학 (hslToRgb, rgbToHsl, CMY 감산혼합)
- Seeded LCG RNG (재현 가능한 랜덤 잉크 모양)

### 실제 출시 스택 (확정)
- **프론트**: React Native + Expo (iOS/Android/Web)
- **백엔드**: Supabase (Auth, DB, Realtime, Storage)
- **알림**: Expo Notifications

---

## 데이터 모델

### 개인 할일
```
todosByDate: {
  "2025-03-15": {
    [catId]: [
      { id, text, done, hue, rgb, color, seed, routineId? }
    ]
  }
}

paletteHistory: {
  "2025-03-15": { drops: [{ id, hue, rgb, color, px, py, seed }], total: N }
}

categories: [{ id, name, color }]
routines: [{
  id, catId, name,
  repeatType: "days" | "monthly",
  days: [0-6],        // 요일 반복
  monthDays: [1-31],  // 날짜 반복
  startDate, endDate, dates
}]
```

### 팀
```
team: {
  id, name, desc,
  members: [{ handle, name, avatar }],  // 첫번째가 팀장
  cats: [{ id, name, color }],
  todosByDate: { [date]: { [catId]: [todo] } },
  paletteHistory: { [date]: { drops, total } },
  createdAt
}
```

### 유저
```
user: { name, handle, bio, avatar, followers, following, email }
settings: {
  calStartSunday, use24h, language,
  reminderTime, reminderOn,
  blackAnimationOn, teamBlackAnimationOn, paletteSize,
  pinLock, pin, privacy, theme
}
friends: [{ handle, name, bio, blackCount, followers, status }]
```

---

## 색상 시스템

**팔레트 drop 생성**
- HSL(hue, 82%, 54%), 색상환 28° 이상 차이 보장
- 감산혼합 (CMY 공간에서 평균 후 RGB 역변환)
- 팔레트 렌더링: 각 drop 고유색으로 그리고 Canvas 픽셀 합성

**팀 멤버 색**
```
MEMBER_HUE_PALETTE = [
  { hue: 220, label: "블루",   base: "#6c8fff" },
  { hue: 0,   label: "레드",   base: "#ff6b6b" },
  { hue: 140, label: "그린",   base: "#5ce65c" },
  { hue: 45,  label: "옐로우", base: "#ffd166" },
  { hue: 280, label: "퍼플",   base: "#c77dff" },
  ...
]
```
멤버 가입 순서대로 자동 배정.

**테마 토큰**
```
dark:  bg:#0a0a0a, surface:#141414, card:#181818, text:#f0ece6
light: bg:#f5f4f0, surface:#ffffff, card:#f0eeea, text:#1a1a1a
```

---

## 설계 원칙

1. **단순함 우선** — 기능 추가 전 "정말 필요한가?" 먼저 물어봐
2. **개인과 팀 분리** — 개인 팔레트는 내 하루, 팀 팔레트는 우리 프로젝트
3. **시각적 보상** — 할 일 완료의 즐거움이 핵심. 팔레트가 채워지는 것이 동기 부여
4. **색상 일관성** — 같은 날짜의 팔레트는 항상 동일하게 재현 (seeded RNG)
5. **완료율이 낮으면 서비스 실패** — BLACK 달성률이 핵심 지표

---

## 아직 구현 안 된 것 (백엔드 필요)

- 실제 회원가입/로그인
- 데이터 영속성 (새로고침 시 초기화됨)
- 팀 Realtime 동기화
- 푸시 알림 실제 발송
- 팔로우 시스템 서버 연동
- 공개 범위 서버 필터링
- 언어 번역 (텍스트 객체만 있음)
- PIN 영속 저장 (Keychain/Keystore)

---

## 코드 작업 시 주의사항

- `C` 변수는 전역 mutable let — 렌더마다 `C = THEMES[settings.theme]`으로 갱신됨
- `renderPalette`는 WeakMap 캐시 사용 — drop 체크 해제 시 전체 재렌더
- `getDateTodos`는 `useCallback`으로 메모이제이션, 캘린더용은 `useMemo` 별도 캐시
- 루틴 todo ID 형식: `r${rut.id}-${dateKey}`
- 팀 첫번째 멤버 = 팀장 (`isOwner = myIdx === 0`)
- 파일이 2600줄 이상 — 기능 추가 시 기존 코드 정리 먼저

---

## 다음 단계 (Phase 1)

```
Week 1: Expo 프로젝트 세팅 + Supabase 연결
Week 2: Auth (이메일 로그인)
Week 3: 개인 할일 + 팔레트 서버 저장
Week 4: 팀 기능 + Realtime 동기화
Week 5: 푸시 알림
Week 6: TestFlight/Play Console 베타 배포
```

**가장 중요한 순간**: 팀원이 할일 완료할 때 내 화면의 팔레트가 실시간으로 변하는 것 → Supabase Realtime으로 구현
