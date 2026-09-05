// ================================================
// LyricSnap — 設定
// ================================================
//
// ▼ SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY について
//   ここに書くキーは「ブラウザに公開される前提」の低権限キーです。
//   公開リポジトリ・公開サイトに含まれていても問題ありません。
//   実際のデータ保護は Supabase の Row Level Security (RLS) ポリシーが担います
//   （history テーブルは user_id = auth.uid() の行だけを本人が読み書きできる設定）。
//
//   - 新方式: publishable key（例: sb_publishable_xxxxx）… Dashboard > Project Settings > API Keys
//   - 旧方式: anon key（長い JWT）でも動作します（2026年末まで有効）
//   参考: https://supabase.com/docs/guides/api/api-keys
//
export const SUPABASE_URL = 'https://gjbczzbhuebauilgysrj.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ZiQfURhmDPiZyGnzgCLAXA_m-XiryOg';

// Supabase の設定が未入力かどうか（未設定なら UI で案内を出す）
export const isSupabaseConfigured =
  !SUPABASE_URL.includes('YOUR_PROJECT_REF') &&
  !SUPABASE_PUBLISHABLE_KEY.startsWith('YOUR_');
