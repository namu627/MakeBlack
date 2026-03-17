# MakeBlack — 에러 핸들링 & 주의사항 가이드

> 실서비스 개발 시 자주 놓치는 것들. 프로토타입에서 실제 앱으로 갈 때 반드시 챙겨야 할 항목.

---

## 1. Supabase 에러 패턴

### 기본 패턴
```typescript
// ❌ 잘못된 방식
const { data } = await supabase.from('todos').select('*');

// ✅ 올바른 방식
const { data, error } = await supabase.from('todos').select('*');
if (error) {
  console.error('todos 조회 실패:', error.message);
  showToast('할 일을 불러오지 못했어요');
  return;
}
```

### 자주 발생하는 에러
```typescript
// 1. RLS 위반 — 권한 없는 데이터 접근
// error.code === 'PGRST301'
// 대응: 로그인 상태 확인, RLS 정책 재검토

// 2. 중복 키 — unique 제약 위반
// error.code === '23505'
// 대응: 핸들 중복, palette_history upsert 등

// 3. 네트워크 에러
// error.message === 'Failed to fetch'
// 대응: 로컬 캐시 데이터 표시, 재시도 버튼

// 4. 세션 만료
// error.message includes 'JWT expired'
// 대응: 자동 로그아웃 → 로그인 화면
```

### 전역 에러 핸들러
```typescript
// lib/supabase.ts
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED') return;
  if (event === 'SIGNED_OUT') {
    // 로그인 화면으로 이동
    router.replace('/auth/login');
  }
});
```

---

## 2. Realtime 주의사항

### 구독 누수 — 가장 흔한 실수
```typescript
// ❌ 잘못된 방식 — cleanup 없음
useEffect(() => {
  const channel = supabase.channel('team').subscribe();
}, []);

// ✅ 올바른 방식
useEffect(() => {
  const channel = supabase
    .channel(`team:${teamId}`)
    .on('postgres_changes', { ... }, handler)
    .subscribe();

  return () => {
    supabase.removeChannel(channel); // 반드시 해제
  };
}, [teamId]);
```

### Realtime 연결 끊김 처리
```typescript
channel.on('system', {}, (status) => {
  if (status === 'CHANNEL_ERROR') {
    // 재연결 시도
    setTimeout(() => channel.subscribe(), 2000);
  }
});
```

---

## 3. 팔레트 데이터 동기화 주의사항

### paletteHistory.total 불일치 방지
```typescript
// 할일 추가/삭제 시 total을 항상 실제 할일 수와 동기화
const syncPaletteTotal = async (userId: string, date: string) => {
  const { data: todos } = await supabase
    .from('todos')
    .select('id')
    .eq('user_id', userId)
    .eq('date', date);

  await supabase
    .from('palette_history')
    .upsert({
      user_id: userId,
      date,
      total: todos?.length ?? 0
    }, { onConflict: 'user_id,date' });
};
```

### 팔레트 drop과 todo 불일치
```typescript
// todo 삭제 시 drop도 반드시 제거
const deleteTodo = async (todoId: string, date: string) => {
  // 1. todo 삭제
  await supabase.from('todos').delete().eq('id', todoId);

  // 2. palette_history에서 해당 drop 제거
  const { data: hist } = await supabase
    .from('palette_history')
    .select('drops, total')
    .eq('user_id', userId)
    .eq('date', date)
    .single();

  if (hist) {
    const newDrops = hist.drops.filter((d: any) => d.id !== todoId);
    await supabase
      .from('palette_history')
      .update({ drops: newDrops, total: Math.max(0, hist.total - 1) })
      .eq('user_id', userId)
      .eq('date', date);
  }
};
```

---

## 4. 오프라인 낙관적 업데이트

```typescript
const toggleTodo = async (todoId: string) => {
  // 1. 로컬 state 즉시 업데이트 (UX)
  setTodos(prev => prev.map(t =>
    t.id === todoId ? { ...t, done: !t.done } : t
  ));

  // 2. 서버 업데이트
  const { error } = await supabase
    .from('todos')
    .update({ done: !currentDone })
    .eq('id', todoId);

  // 3. 실패 시 롤백
  if (error) {
    setTodos(prev => prev.map(t =>
      t.id === todoId ? { ...t, done: currentDone } : t
    ));
    showToast('완료 처리에 실패했어요. 다시 시도해주세요');
  }
};
```

---

## 5. 날짜 처리 주의사항

### 타임존 버그 — 가장 자주 나오는 버그
```typescript
// ❌ 잘못된 방식 — 타임존에 따라 날짜가 하루 틀릴 수 있음
const today = new Date().toISOString().split('T')[0];

// ✅ 올바른 방식
const dateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const today = dateKey(new Date());
```

### DB 날짜 저장
```typescript
// Supabase에 date 타입으로 저장 시 반드시 'YYYY-MM-DD' 형식
// PostgreSQL date 타입은 타임존 없이 저장됨 — 의도한 동작
```

---

## 6. 팀 Realtime 충돌 처리

여러 멤버가 동시에 같은 팔레트를 수정할 때:

```typescript
// palette_history는 UNIQUE(team_id, date) — upsert 사용
const updateTeamPalette = async (teamId: string, date: string, newDrop: Drop) => {
  // 현재 데이터 먼저 조회
  const { data } = await supabase
    .from('team_palette_history')
    .select('drops, total')
    .eq('team_id', teamId)
    .eq('date', date)
    .single();

  const currentDrops = data?.drops ?? [];

  // 중복 drop 방지 (같은 todo를 두 명이 동시에 완료하는 경우)
  if (currentDrops.some((d: Drop) => d.id === newDrop.id)) return;

  await supabase
    .from('team_palette_history')
    .upsert({
      team_id: teamId,
      date,
      drops: [...currentDrops, newDrop],
      total: data?.total ?? 0
    }, { onConflict: 'team_id,date' });
};
```

---

## 7. PIN 보안

```typescript
// PIN은 평문으로 저장하지 않는다
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

// PIN 저장
const savePin = async (pin: string) => {
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin
  );
  await SecureStore.setItemAsync('app_pin', hashed);
};

// PIN 검증
const verifyPin = async (input: string): Promise<boolean> => {
  const stored = await SecureStore.getItemAsync('app_pin');
  const inputHashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input
  );
  return stored === inputHashed;
};
```

---

## 8. 앱 배포 전 체크리스트

### 보안
- [ ] `console.log` 전체 제거 (민감 정보 노출 방지)
- [ ] API 키 환경변수 확인
- [ ] RLS 모든 테이블 적용 여부 확인
- [ ] 개인정보 처리방침 URL 등록

### 성능
- [ ] 이미지 최적화 (WebP 사용)
- [ ] 번들 사이즈 확인 (`expo export --analyze`)
- [ ] 메모리 누수 확인 (Realtime 구독 cleanup)

### UX
- [ ] 네트워크 없을 때 적절한 안내 메시지
- [ ] 로딩 상태 모든 비동기 작업에 표시
- [ ] 에러 발생 시 사용자 친화적 메시지 (서버 에러 코드 노출 금지)
- [ ] 빈 상태(Empty State) 모든 목록에 처리

### iOS 심사
- [ ] 개인정보 처리방침 필수
- [ ] 앱이 요청하는 권한(알림 등) 모두 설명
- [ ] 테스트 계정 심사팀에 제공
