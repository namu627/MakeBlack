import { supabase } from './supabase';
import { MEMBER_HUE_PALETTE } from '../constants/theme';

export const getMemberColor = (colorIndex) => {
  const idx = typeof colorIndex === 'number' && isFinite(colorIndex)
    ? colorIndex % MEMBER_HUE_PALETTE.length
    : 0;
  const p = MEMBER_HUE_PALETTE[idx] ?? MEMBER_HUE_PALETTE[0];
  return { hue: p.hue, color: p.base };
};

// 사용 중인 color_index 배열에서 비어있는 가장 작은 번호 반환
const getNextColorIndex = (usedIndices) => {
  let idx = 0;
  while (usedIndices.includes(idx)) idx++;
  return idx % MEMBER_HUE_PALETTE.length;
};

// ── 팀 목록 (members 포함 — 팀 목록 카드에서 별도 fetchTeamDetail 불필요) ──
export const fetchMyTeams = async (userId) => {
  const { data, error } = await supabase
    .from('team_members')
    .select(`
      color_index,
      joined_at,
      teams (
        id, name, description, created_by, created_at,
        team_members (
          user_id, color_index, joined_at,
          users (id, name, handle, avatar_url)
        )
      )
    `)
    .eq('user_id', userId);
  if (error) throw error;
  return data.map(row => ({ ...row.teams, myColorIndex: row.color_index }));
};

// ── 팀 생성 ───────────────────────────────────────────
export const createTeam = async (userId, name, description) => {
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .insert({ name, description, created_by: userId })
    .select()
    .single();
  if (teamError) throw teamError;

  const { error: memberError } = await supabase
    .from('team_members')
    .insert({ team_id: team.id, user_id: userId, color_index: 0 });
  if (memberError) throw memberError;

  return team;
};

// ── 팀 상세 (멤버 포함) ───────────────────────────────
export const fetchTeamDetail = async (teamId) => {
  const { data, error } = await supabase
    .from('teams')
    .select(`
      *,
      team_members (
        user_id, color_index, joined_at,
        users (id, name, handle, email, avatar_url)
      )
    `)
    .eq('id', teamId)
    .single();
  if (error) throw error;
  return data;
};

// ── 팀 수정 ───────────────────────────────────────────
export const updateTeam = async (teamId, name, description) => {
  const { error } = await supabase
    .from('teams')
    .update({ name, description })
    .eq('id', teamId);
  if (error) throw error;
};

// ── 팀 삭제 ───────────────────────────────────────────
export const deleteTeam = async (teamId) => {
  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', teamId);
  if (error) throw error;
};

// ── 팀 나가기 ─────────────────────────────────────────
export const leaveTeam = async (teamId, userId) => {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId);
  if (error) throw error;
};

// ── 멤버 초대 (핸들로 검색 후 추가) ──────────────────
export const inviteMember = async (teamId, handle) => {
  // 1. 핸들로 유저 검색
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, name, handle')
    .eq('handle', handle)
    .single();
  if (userError) throw new Error('존재하지 않는 아이디예요');

  // 2. 이미 멤버인지 확인
  const { data: existing } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .single();
  if (existing) throw new Error('이미 팀원이에요');

  // 3. color_index 배정
  const { data: members } = await supabase
    .from('team_members')
    .select('color_index')
    .eq('team_id', teamId);
  const idx = getNextColorIndex((members ?? []).map(m => m.color_index));

  // 4. 멤버 추가
  const { error: insertError } = await supabase
    .from('team_members')
    .insert({ team_id: teamId, user_id: user.id, color_index: idx });
  if (insertError) throw insertError;

  return user;
};

// ── 팀 카테고리 ───────────────────────────────────────
export const fetchTeamCategories = async (teamId) => {
  const { data, error } = await supabase
    .from('team_categories')
    .select('*')
    .eq('team_id', teamId)
    .order('sort_order');
  if (error) throw error;
  return data;
};

export const createTeamCategory = async (teamId, userId, name, color) => {
  const { data, error } = await supabase
    .from('team_categories')
    .insert({ team_id: teamId, created_by: userId, name, color, sort_order: 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteTeamCategory = async (catId) => {
  const { error } = await supabase
    .from('team_categories')
    .delete()
    .eq('id', catId);
  if (error) throw error;
};

// ── 팀 할일 ───────────────────────────────────────────
export const fetchTeamTodos = async (teamId, date) => {
  const { data, error } = await supabase
    .from('team_todos')
    .select('*, team_categories(name, color)')
    .eq('team_id', teamId)
    .eq('date', date)
    .order('created_at');
  if (error) throw error;
  return data;
};

export const createTeamTodo = async (teamId, catId, authorId, date, text, colorData, assigneeId = null) => {
  const { data, error } = await supabase
    .from('team_todos')
    .insert({
      team_id: teamId,
      cat_id: catId,
      author_id: authorId,
      date,
      text,
      done: false,
      assignee_id: assigneeId,
      ...colorData,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const toggleTeamTodo = async (todoId, done) => {
  const { data, error } = await supabase
    .from('team_todos')
    .update({ done, updated_at: new Date().toISOString() })
    .eq('id', todoId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteTeamTodo = async (todoId) => {
  const { error } = await supabase
    .from('team_todos')
    .delete()
    .eq('id', todoId);
  if (error) throw error;
};

// ── 팀 팔레트 히스토리 ────────────────────────────────
export const fetchTeamPaletteHistory = async (teamId, date) => {
  const { data, error } = await supabase
    .from('team_palette_history')
    .select('*')
    .eq('team_id', teamId)
    .eq('date', date)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data ?? { drops: [], total: 0 };
};

export const upsertTeamPaletteHistory = async (teamId, date, drops, total) => {
  const { error } = await supabase
    .from('team_palette_history')
    .upsert({ team_id: teamId, date, drops, total }, { onConflict: 'team_id,date' });
  if (error) throw error;
};

// ── 팀 코드로 팀 검색 ─────────────────────────────────
// 팀 코드 = team.id(UUID) 앞 8자리 대문자
// UUID 범위 쿼리로 인덱스 활용 — 전체 테이블 스캔 방지
export const findTeamByCode = async (code) => {
  const lower = code.toLowerCase();
  // UUID 앞 8자리가 같은 범위: lo ~ hi 로 좁힌 후 정확히 비교
  const lo = `${lower}-0000-0000-0000-000000000000`;
  const hi = `${lower}-ffff-ffff-ffff-ffffffffffff`;
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, description, created_by')
    .gte('id', lo)
    .lte('id', hi)
    .limit(5);
  if (error) throw error;
  const found = data?.find(t => t.id.slice(0, 8).toUpperCase() === code.toUpperCase());
  if (!found) throw new Error('존재하지 않는 팀 코드예요');
  return found;
};

// ── 유저 검색 ─────────────────────────────────────────
export const searchUsers = async (query) => {
  // PostgREST .or() 필터 문자열에 사용자 입력이 직접 삽입되므로
  // 쉼표·괄호 등 필터 구문을 깨는 문자를 제거
  const safe = query.replace(/[,.()\[\]]/g, '').trim();
  if (!safe) return [];
  const { data, error } = await supabase
    .from('users')
    .select('id, name, handle')
    .or(`name.ilike.%${safe}%,handle.ilike.%${safe}%`)
    .limit(10);
  if (error) throw error;
  return data;
};

// ── 팀 참여 요청 ──────────────────────────────────────
// Supabase 테이블 필요:
// CREATE TABLE team_join_requests (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
//   requester_id uuid REFERENCES users(id),
//   status text DEFAULT 'pending',  -- pending | accepted | rejected
//   created_at timestamptz DEFAULT now(),
//   UNIQUE(team_id, requester_id)
// );
// ALTER TABLE team_join_requests ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "team member can read" ON team_join_requests FOR SELECT USING (true);
// CREATE POLICY "anyone can insert" ON team_join_requests FOR INSERT WITH CHECK (auth.uid() = requester_id);
// CREATE POLICY "team owner can update" ON team_join_requests FOR UPDATE USING (true);

export const createJoinRequest = async (teamId, requesterId) => {
  const { data, error } = await supabase
    .from('team_join_requests')
    .insert({ team_id: teamId, requester_id: requesterId, status: 'pending' })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const fetchPendingRequests = async (teamId) => {
  const { data, error } = await supabase
    .from('team_join_requests')
    .select('*, users(id, name, handle)')
    .eq('team_id', teamId)
    .eq('status', 'pending')
    .order('created_at');
  if (error) throw error;
  return data ?? [];
};

export const acceptJoinRequest = async (requestId, teamId, requesterId) => {
  // 1. color_index 배정
  const { data: members } = await supabase
    .from('team_members')
    .select('color_index')
    .eq('team_id', teamId);
  const idx = getNextColorIndex((members ?? []).map(m => m.color_index));

  // 2. team_members INSERT
  const { error: memberError } = await supabase
    .from('team_members')
    .insert({ team_id: teamId, user_id: requesterId, color_index: idx });
  if (memberError) throw memberError;

  // 3. request status 업데이트
  const { error } = await supabase
    .from('team_join_requests')
    .update({ status: 'accepted' })
    .eq('id', requestId);
  if (error) throw error;
};

export const rejectJoinRequest = async (requestId) => {
  const { error } = await supabase
    .from('team_join_requests')
    .update({ status: 'rejected' })
    .eq('id', requestId);
  if (error) throw error;
};

// ── 방장의 직접 초대 (userId로 즉시 팀원 추가) ───────────
export const addTeamMember = async (teamId, userId) => {
  // 이미 멤버인지 확인
  const { data: existing } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();
  if (existing) throw new Error('이미 팀원이에요');

  // color_index 배정 (빈 슬롯 중 가장 작은 번호)
  const { data: members } = await supabase
    .from('team_members')
    .select('color_index')
    .eq('team_id', teamId);
  const idx = getNextColorIndex((members ?? []).map(m => m.color_index));

  const { error } = await supabase
    .from('team_members')
    .insert({ team_id: teamId, user_id: userId, color_index: idx });
  if (error) throw error;
};