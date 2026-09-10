// ================================================
// LyricSnap — Auth Module
// Supabase Auth による「Googleでサインイン」
// ================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, isSupabaseConfigured } from '../config.js';

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

let currentUser = null;
const listeners = new Set();

/**
 * 認証状態の変化を購読する
 * @param {(user: object | null) => void} cb
 * @returns {() => void} 購読解除関数
 */
export function onAuthChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 現在のユーザー（未サインインなら null） */
export function getUser() {
  return currentUser;
}

/** アクセストークンの user_id */
export function getUserId() {
  return currentUser?.id ?? null;
}

/**
 * 起動時に一度だけ呼ぶ。既存セッションを復元し、以降の変化を監視する。
 * @returns {Promise<object | null>}
 */
export async function initAuth() {
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  currentUser = data.session?.user ?? null;

  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    listeners.forEach((cb) => {
      try {
        cb(currentUser);
      } catch (e) {
        console.error('auth listener error', e);
      }
    });
  });

  // OAuth リダイレクト後、URL に残るトークン付きハッシュを掃除する
  if (window.location.hash.includes('access_token')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  return currentUser;
}

/**
 * Google アカウントでサインイン（リダイレクト方式）
 */
export async function signInWithGoogle() {
  if (!supabase) throw new Error('Supabase が設定されていません');
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      // ブラウザに既にサインイン済みの Google アカウントがあっても
      // 毎回アカウント選択画面を出す（YouTube 用など別アカウントを避けるため）
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
}

/** サインアウト */
export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
