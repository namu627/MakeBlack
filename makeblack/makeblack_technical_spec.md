# MakeBlack — 기술 규격서 (Technical Specification)

> Phase 1 실제 서비스 개발을 위한 기술 상세 명세

---

## 1. 시스템 아키텍처

```
┌─────────────────────────────────────────┐
│           Client (Expo/RN)              │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │  React   │  │  Canvas (Skia/RN)   │ │
│  │  Native  │  │  팔레트 렌더링       │ │
│  └──────────┘  └──────────────────────┘ │
│  ┌──────────────────────────────────┐   │
│  │  Supabase JS Client              │   │
│  │  - Auth  - DB  - Realtime        │   │
│  └──────────────────────────────────┘   │
└─────────────────┬───────────────────────┘
                  │ HTTPS / WebSocket
┌─────────────────▼───────────────────────┐
│              Supabase                   │
│  ┌──────────┐  ┌──────────┐  ┌───────┐ │
│  │   Auth   │  │ Postgres │  │  RT   │ │
│  │  (JWT)   │  │   DB     │  │ (WS)  │ │
│  └──────────┘  └──────────┘  └───────┘ │
│  ┌──────────┐                           │
│  │ Storage  │  (프로필 이미지)           │
│  └──────────┘                           │
└─────────────────────────────────────────┘
```

---

## 2. Supabase DB 스키마

### 2-1. users
```sql
create table users (
  id          uuid primary key default auth.uid(),
  handle      text unique not null,           -- @아이디
  name        text not null,
  bio         text default '',
  avatar_url  text default '',
  email       text unique not null,
  created_at  timestamptz default now()
);

-- handle 형식 제약: @로 시작, 영문/숫자/언더스코어
alter table users add constraint handle_format
  check (handle ~ '^@[a-zA-Z0-9_]{2,20}$');

-- RLS
alter table users enable row level security;
create policy "본인 수정 가능" on users
  for update using (auth.uid() = id);
create policy "전체 조회 가능" on users
  for select using (true);
```

### 2-2. categories
```sql
create table categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references users(id) on delete cascade,
  name       text not null,
  color      text not null,         -- hex 또는 hsl
  sort_order int  default 0,
  created_at timestamptz default now()
);

alter table categories enable row level security;
create policy "본인만 접근" on categories
  using (auth.uid() = user_id);
```

### 2-3. routines
```sql
create table routines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  cat_id      uuid references categories(id) on delete cascade,
  name        text not null,
  repeat_type text not null check (repeat_type in ('days', 'monthly')),
  days        int[] default '{}',       -- 0~6 요일
  month_days  int[] default '{}',       -- 1~31 날짜
  start_date  date not null,
  end_date    date,                     -- null이면 무한
  created_at  timestamptz default now()
);

alter table routines enable row level security;
create policy "본인만 접근" on routines
  using (auth.uid() = user_id);
```

### 2-4. todos
```sql
create table todos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references users(id) on delete cascade,
  cat_id     uuid references categories(id) on delete cascade,
  date       date not null,
  text       text not null,
  done       boolean default false,
  hue        float,
  rgb        float[] default '{}',      -- [r, g, b]
  color      text,
  seed       float,
  routine_id uuid references routines(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on todos(user_id, date);

alter table todos enable row level security;
create policy "본인만 접근" on todos
  using (auth.uid() = user_id);
```

### 2-5. palette_history
```sql
create table palette_history (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  date    date not null,
  drops   jsonb default '[]',   -- [{ id, hue, rgb, color, px, py, seed }]
  total   int  default 0,
  unique(user_id, date)
);

create index on palette_history(user_id, date);

alter table palette_history enable row level security;
create policy "본인만 접근" on palette_history
  using (auth.uid() = user_id);
```

### 2-6. teams
```sql
create table teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  desc       text default '',
  created_by uuid references users(id),
  created_at timestamptz default now()
);

alter table teams enable row level security;
create policy "멤버만 조회" on teams
  for select using (
    exists (
      select 1 from team_members
      where team_id = id and user_id = auth.uid()
    )
  );
create policy "팀장만 수정" on teams
  for update using (created_by = auth.uid());
create policy "팀장만 삭제" on teams
  for delete using (created_by = auth.uid());
```

### 2-7. team_members
```sql
create table team_members (
  team_id     uuid references teams(id) on delete cascade,
  user_id     uuid references users(id) on delete cascade,
  color_index int default 0,         -- 0~7 멤버 색 인덱스
  joined_at   timestamptz default now(),
  primary key (team_id, user_id)
);

alter table team_members enable row level security;
create policy "멤버 조회 가능" on team_members
  for select using (
    exists (
      select 1 from team_members tm
      where tm.team_id = team_id and tm.user_id = auth.uid()
    )
  );
```

### 2-8. team_categories
```sql
create table team_categories (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid references teams(id) on delete cascade,
  name       text not null,
  color      text not null,
  sort_order int default 0,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

alter table team_categories enable row level security;
create policy "팀 멤버만 접근" on team_categories
  using (
    exists (
      select 1 from team_members
      where team_id = team_id and user_id = auth.uid()
    )
  );
```

### 2-9. team_todos
```sql
create table team_todos (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid references teams(id) on delete cascade,
  cat_id     uuid references team_categories(id) on delete cascade,
  date       date not null,
  text       text not null,
  done       boolean default false,
  author_id  uuid references users(id),
  hue        float,
  rgb        float[] default '{}',
  color      text,
  seed       float,
  px         float,
  py         float,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on team_todos(team_id, date);

-- Realtime 활성화 필수
alter publication supabase_realtime add table team_todos;

alter table team_todos enable row level security;
create policy "팀 멤버만 접근" on team_todos
  using (
    exists (
      select 1 from team_members
      where team_id = team_todos.team_id and user_id = auth.uid()
    )
  );
create policy "본인 또는 팀장만 삭제" on team_todos
  for delete using (
    author_id = auth.uid() or
    exists (
      select 1 from teams
      where id = team_id and created_by = auth.uid()
    )
  );
```

### 2-10. team_palette_history
```sql
create table team_palette_history (
  id      uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  date    date not null,
  drops   jsonb default '[]',
  total   int  default 0,
  unique(team_id, date)
);

create index on team_palette_history(team_id, date);

-- Realtime 활성화 필수
alter publication supabase_realtime add table team_palette_history;

alter table team_palette_history enable row level security;
create policy "팀 멤버만 접근" on team_palette_history
  using (
    exists (
      select 1 from team_members
      where team_id = team_palette_history.team_id and user_id = auth.uid()
    )
  );
```

### 2-11. follows
```sql
create table follows (
  follower_id  uuid references users(id) on delete cascade,
  following_id uuid references users(id) on delete cascade,
  created_at   timestamptz default now(),
  primary key (follower_id, following_id)
);

alter table follows enable row level security;
create policy "본인 팔로우 관리" on follows
  using (auth.uid() = follower_id);
create policy "팔로우 조회" on follows
  for select using (true);
```

---

## 3. Realtime 설계

팀의 가장 중요한 순간: **팀원이 할일을 완료할 때 내 팔레트가 실시간으로 변하는 것**

### 구독 방식
```javascript
// 팀 상세 화면 진입 시
const channel = supabase
  .channel(`team:${teamId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'team_todos',
    filter: `team_id=eq.${teamId}`
  }, (payload) => {
    // 할일 완료/추가/삭제 반영
    handleTodoChange(payload);
  })
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'team_palette_history',
    filter: `team_id=eq.${teamId}`
  }, (payload) => {
    // 팔레트 실시간 업데이트
    handlePaletteChange(payload);
  })
  .subscribe();

// 화면 이탈 시 반드시 구독 해제
return () => supabase.removeChannel(channel);
```

### Realtime 이벤트 처리
```javascript
const handleTodoChange = (payload) => {
  const { eventType, new: newRow, old: oldRow } = payload;
  switch (eventType) {
    case 'INSERT':
      // 새 할일 추가
      setTeamTodos(prev => [...prev, newRow]);
      break;
    case 'UPDATE':
      // 완료 상태 변경 → 팔레트 애니메이션 트리거
      setTeamTodos(prev => prev.map(t => t.id === newRow.id ? newRow : t));
      if (newRow.done && !oldRow.done) triggerDropAnimation(newRow);
      break;
    case 'DELETE':
      setTeamTodos(prev => prev.filter(t => t.id !== oldRow.id));
      break;
  }
};
```

---

## 4. Auth 흐름

### 회원가입
```
1. 이메일 + 비밀번호 입력
2. supabase.auth.signUp() 호출
3. 이메일 인증 메일 발송
4. 인증 후 users 테이블에 프로필 INSERT
5. 핸들(@아이디) 설정 화면으로 이동
```

### 로그인
```
1. supabase.auth.signInWithPassword()
2. JWT 토큰 자동 저장 (Expo SecureStore)
3. 앱 재시작 시 자동 로그인
```

### 세션 관리
```javascript
// App 최상단에서
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
  });
}, []);
```

---

## 5. 오프라인 처리 전략

실제 앱에서 네트워크 없을 때 대응:

```
할일 추가/완료
  → 로컬 state 즉시 반영 (낙관적 업데이트)
  → 백그라운드에서 서버 동기화
  → 실패 시 로컬 큐에 저장
  → 네트워크 복구 시 큐 순서대로 재시도

팔레트 히스토리
  → AsyncStorage에 최근 30일치 캐시
  → 서버 응답 오면 덮어쓰기
```

---

## 6. 팀 멤버 color_index 배정

```javascript
// 팀 초대 수락 시
const assignColorIndex = async (teamId) => {
  const { data: members } = await supabase
    .from('team_members')
    .select('color_index')
    .eq('team_id', teamId)
    .order('joined_at');

  const usedIndices = members.map(m => m.color_index);
  let idx = 0;
  while (usedIndices.includes(idx)) idx++;
  return idx % 8; // 최대 8가지 색
};
```

---

## 7. 푸시 알림 설계

```javascript
// Expo Notifications 설정
import * as Notifications from 'expo-notifications';

// 리마인더 등록
const scheduleReminder = async (time) => {
  const [hour, minute] = time.split(':').map(Number);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "오늘 팔레트를 채워볼까요? 🎨",
      body: "할 일을 완료하고 BLACK에 도전해보세요",
    },
    trigger: {
      hour, minute,
      repeats: true,
    },
  });
};

// 팀원 완료 알림 (서버에서 Supabase Edge Function으로 발송)
// Edge Function → Expo Push API
```

---

## 8. 환경 변수

```bash
# .env
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Supabase Edge Functions용 (서버 전용)
SUPABASE_SERVICE_ROLE_KEY=eyJ...
EXPO_PUSH_TOKEN=ExponentPushToken[...]
```

---

## 9. 성능 최적화 포인트

### Canvas 렌더링
- OffscreenCanvas + requestAnimationFrame 활용
- drop 추가 시 전체 재렌더 금지 → 증분 렌더링 (WeakMap 캐시)
- React Native에서는 `react-native-skia` 사용 권장

### DB 쿼리
- todos: `(user_id, date)` 복합 인덱스 필수
- 캘린더 조회: 월 단위 범위 쿼리 사용
  ```sql
  where user_id = $1
    and date >= $2  -- 월 첫째날
    and date <= $3  -- 월 마지막날
  ```
- palette_history: `(user_id, date)` UNIQUE 제약으로 upsert 활용

### 이미지
- 아바타: Supabase Storage + CDN
- 캐시: `expo-image` 라이브러리 사용 (자동 캐싱)
