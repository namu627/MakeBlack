import { supabase } from './supabase';

const MEMBER_HUE_PALETTE = [
  { hue: 220, color: '#6c8fff' },
  { hue: 0,   color: '#ff6b6b' },
  { hue: 140, color: '#5ce65c' },
  { hue: 45,  color: '#ffd166' },
  { hue: 280, color: '#c77dff' },
  { hue: 180, color: '#4ecdc4' },
  { hue: 25,  color: '#f77f00' },
  { hue: 320, color: '#ff6eb4' },
];

export const getMemberColor = (colorIndex) =>
  MEMBER_HUE_PALETTE[colorIndex % MEMBER_HUE_PALETTE.length];

// ── 팀 목록 ───────────────────────────────────────────
export const fetchMyTeams = async (userId) => {
  const { data, error } = await supabase
    .from('team_members')
    .select(`
      color_index,
      joined_at,
      teams (
        id, name, description, created_by, created_at
      )
    `)
    .eq('user_id', userId);
  if (error) throw error;
  return data.map(row => ({ ...row.teams, myColorIndex: row.color_index }));
};

// ── 팀 생성 ───────────────────────────────────────────
export const createTeam = async (userId, name, description) => {
  console.log('createTeam 시도:', userId, name, description);
  
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .insert({ name, description, created_by: userId })
    .select()
    .single();
  
  if (teamError) {
    console.log('팀 생성 에러:', JSON.stringify(teamError));
    throw teamError;
  }

  const { error: memberError } = await supabase
    .from('team_members')
    .insert({ team_id: team.id, user_id: userId, color_index: 0 });
  
  if (memberError) {
    console.log('멤버 추가 에러:', JSON.stringify(memberError));
    throw memberError;
  }

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
        users (id, name, handle, email)
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
  const usedIndices = members.map(m => m.color_index);
  let idx = 0;
  while (usedIndices.includes(idx)) idx++;

  // 4. 멤버 추가
  const { error: insertError } = await supabase
    .from('team_members')
    .insert({ team_id: teamId, user_id: user.id, color_index: idx % 8 });
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

// ── 유저 검색 ─────────────────────────────────────────
export const searchUsers = async (query) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, handle, email')
    .or(`name.ilike.%${query}%,handle.ilike.%${query}%`)
    .limit(10);
  if (error) throw error;
  return data;
};