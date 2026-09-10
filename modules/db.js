// ================================================
// LyricSnap — Database Module
// Supabase `history` テーブルの読み書き
//
// テーブル定義（Supabase 側で作成 / 詳細は claude-code-report.md）:
//   id            uuid  primary key default gen_random_uuid()
//   user_id       uuid  references auth.users(id)  -- RLS: auth.uid() のみ
//   title         text
//   artist        text
//   lyrics        text
//   artwork_url   text  nullable
//   favorite      boolean default false
//   view_count    integer default 1
//   last_viewed_at timestamptz
//   created_at    timestamptz default now()
// ================================================

import { supabase, getUserId } from './auth.js';

const TABLE = 'history';

/** LIKE パターンに使う文字列をエスケープ（%,_,カンマを無害化） */
function likeEscape(s) {
  return String(s).replace(/[%_,]/g, ' ').trim();
}

/**
 * 曲の閲覧を履歴に記録する（upsert）。
 * 同じ title + artist の行があれば view_count を +1 して last_viewed_at を更新、
 * 無ければ新規作成する。
 * @param {{title: string, artist?: string, lyrics: string, artwork_url?: string|null}} song
 * @returns {Promise<object>} 保存された履歴レコード
 */
export async function recordView(song) {
  const user_id = getUserId();
  if (!supabase || !user_id) throw new Error('サインインが必要です');

  const title = (song.title || '').trim();
  const artist = (song.artist || '').trim();
  const now = new Date().toISOString();

  // 既存レコードを探す（title/artist を大文字小文字無視で完全一致）
  const { data: existing, error: findErr } = await supabase
    .from(TABLE)
    .select('id, view_count')
    .eq('user_id', user_id)
    .ilike('title', title)
    .ilike('artist', artist)
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    const patch = {
      view_count: (existing.view_count || 1) + 1,
      last_viewed_at: now,
    };
    if (song.lyrics) patch.lyrics = song.lyrics;
    if (song.artwork_url) patch.artwork_url = song.artwork_url;

    const { data, error } = await supabase
      .from(TABLE)
      .update(patch)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id,
      title,
      artist,
      lyrics: song.lyrics || '',
      artwork_url: song.artwork_url || null,
      view_count: 1,
      last_viewed_at: now,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * 履歴一覧を取得する
 * @param {{search?: string, favoritesOnly?: boolean, sort?: 'recent'|'most'}} [opts]
 * @returns {Promise<object[]>}
 */
export async function getHistory(opts = {}) {
  const user_id = getUserId();
  if (!supabase || !user_id) return [];

  const { search = '', favoritesOnly = false, sort = 'recent' } = opts;

  let query = supabase.from(TABLE).select('*').eq('user_id', user_id);

  if (favoritesOnly) query = query.eq('favorite', true);

  if (search.trim()) {
    const s = likeEscape(search);
    if (s) query = query.or(`title.ilike.%${s}%,artist.ilike.%${s}%,lyrics.ilike.%${s}%`);
  }

  if (sort === 'most') {
    query = query
      .order('view_count', { ascending: false })
      .order('last_viewed_at', { ascending: false });
  } else {
    query = query.order('last_viewed_at', { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * 入力文字列に一致する自分の履歴（検索候補用・少数）
 * @param {string} q
 * @returns {Promise<object[]>}
 */
export async function suggestFromHistory(q) {
  const user_id = getUserId();
  if (!supabase || !user_id || !q.trim()) return [];
  const s = likeEscape(q);
  if (!s) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', user_id)
    .or(`title.ilike.%${s}%,artist.ilike.%${s}%`)
    .order('last_viewed_at', { ascending: false })
    .limit(5);
  if (error) {
    console.warn('suggestFromHistory failed', error);
    return [];
  }
  return data || [];
}

/**
 * 確定した「曲名＋アーティスト」に一致する自分の既存レコードを1件返す。
 * （recordView() と同じ一致基準: 大文字小文字を無視した完全一致）
 * @param {string} title
 * @param {string} artist
 * @returns {Promise<object|null>}
 */
export async function findExisting(title, artist) {
  const user_id = getUserId();
  if (!supabase || !user_id) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', user_id)
    .ilike('title', (title || '').trim())
    .ilike('artist', (artist || '').trim())
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('findExisting failed', error);
    return null;
  }
  return data;
}

/**
 * 既存レコードの閲覧回数を +1 し last_viewed_at を更新する（新規作成しない）
 * @param {object} rec - 対象の履歴レコード（id, view_count を含む）
 * @returns {Promise<object>}
 */
export async function touchView(rec) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      view_count: (rec.view_count || 1) + 1,
      last_viewed_at: new Date().toISOString(),
    })
    .eq('id', rec.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** id で 1 件取得 */
export async function getHistoryById(id) {
  const user_id = getUserId();
  if (!supabase || !user_id) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .eq('user_id', user_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** お気に入りフラグを更新 */
export async function setFavorite(id, favorite) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ favorite })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** 任意フィールドを更新（曲名・アーティスト・歌詞の編集用） */
export async function updateHistory(id, fields) {
  const allowed = {};
  for (const k of ['title', 'artist', 'lyrics', 'artwork_url']) {
    if (k in fields) allowed[k] = fields[k];
  }
  const { data, error } = await supabase
    .from(TABLE)
    .update(allowed)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** 履歴を 1 件削除 */
export async function deleteHistory(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

// ================================================
// video_map — 動画ID → history レコードの対応（拡張機能の自動モード用）
// ================================================

/**
 * 動画IDに対応する history レコードを返す（無ければ null）
 * @param {string} videoId
 * @returns {Promise<object|null>}
 */
export async function getVideoMapping(videoId) {
  const user_id = getUserId();
  if (!supabase || !user_id || !videoId) return null;

  const { data: map, error } = await supabase
    .from('video_map')
    .select('history_id')
    .eq('user_id', user_id)
    .eq('video_id', videoId)
    .maybeSingle();
  if (error) {
    console.warn('getVideoMapping failed', error);
    return null;
  }
  if (!map) return null;

  return getHistoryById(map.history_id);
}

/**
 * 動画ID → history の対応を保存（既存があれば上書き）
 * @param {string} videoId
 * @param {string} historyId
 */
export async function saveVideoMapping(videoId, historyId) {
  const user_id = getUserId();
  if (!supabase || !user_id || !videoId || !historyId) return;

  const { error } = await supabase
    .from('video_map')
    .upsert(
      { user_id, video_id: videoId, history_id: historyId },
      { onConflict: 'user_id,video_id' }
    );
  if (error) console.warn('saveVideoMapping failed', error);
}

/**
 * 全履歴を取得してエクスポート用の配列で返す
 * @returns {Promise<object[]>}
 */
export async function exportAll() {
  const user_id = getUserId();
  if (!supabase || !user_id) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}
