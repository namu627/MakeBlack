import { supabase } from './supabase';

// ── 카테고리 ───────────────────────────────────────────
export const fetchCategories = async (userId) => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order');
  if (error) throw error;
  return data;
};

export const createCategory = async (userId, name, color) => {
  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: userId, name, color, sort_order: 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteCategory = async (catId) => {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', catId);
  if (error) throw error;
};

// ── 할일 ───────────────────────────────────────────────
export const fetchTodos = async (userId, date) => {
  const { data, error } = await supabase
    .from('todos')
    .select('*, categories(name, color)')
    .eq('user_id', userId)
    .eq('date', date)
    .order('created_at');
  if (error) throw error;
  return data;
};

export const createTodo = async (userId, catId, date, text, colorData) => {
  const { data, error } = await supabase
    .from('todos')
    .insert({
      user_id: userId,
      cat_id: catId,
      date,
      text,
      done: false,
      ...colorData,   // hue, rgb, color, seed
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const toggleTodo = async (todoId, done) => {
  const { data, error } = await supabase
    .from('todos')
    .update({ done, updated_at: new Date().toISOString() })
    .eq('id', todoId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateTodoText = async (todoId, text) => {
  const { data, error } = await supabase
    .from('todos')
    .update({ text, updated_at: new Date().toISOString() })
    .eq('id', todoId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteTodo = async (todoId) => {
  const { error } = await supabase
    .from('todos')
    .delete()
    .eq('id', todoId);
  if (error) throw error;
};

// ── 팔레트 히스토리 ────────────────────────────────────
export const fetchPaletteHistory = async (userId, date) => {
  const { data, error } = await supabase
    .from('palette_history')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found (정상)
  return data ?? { drops: [], total: 0 };
};

export const upsertPaletteHistory = async (userId, date, drops, total) => {
  const { error } = await supabase
    .from('palette_history')
    .upsert({ user_id: userId, date, drops, total }, { onConflict: 'user_id,date' });
  if (error) throw error;
};