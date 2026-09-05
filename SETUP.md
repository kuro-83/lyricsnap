# LyricSnap — Supabase / Google OAuth セットアップ手順

> フロントエンドのコード（Phase 1）は実装・コミット済みです。
> このドキュメントの手順を進めて、最後に **A〜C の値** を教えてください。
> こちらで `config.js` に反映 → commit / push → 動作確認します。
>
> 公開サイト: `https://kuro-83.github.io/lyricsnap/`
> 参考: 手順はすべて Supabase 公式ドキュメント (https://supabase.com/docs) に基づいています。

---

## STEP 1. Supabase プロジェクトを作成

1. https://supabase.com/dashboard にログイン（GitHub アカウントでOK）
2. **New project** をクリック
   - Organization: 任意（無ければ作成）
   - Name: `lyricsnap`
   - Database Password: 強めのパスワードを生成して**控えておく**（今回のアプリでは直接使いません）
   - Region: `Northeast Asia (Tokyo)` を推奨
   - Plan: Free
3. 作成完了まで 1〜2 分待つ

### 📋 教えてほしい値（その1）

**Project Settings → API Keys**（左メニュー歯車 → API Keys）を開く:

- **A. Project URL** … `https://xxxxxxxxxxxx.supabase.co`
- **B. publishable key** … `sb_publishable_xxxxxxxx`
  （画面に無ければ従来の **anon public** key（`eyJ...` の長い文字列）でも可）

> ℹ️ このキーはブラウザに公開される前提の低権限キーです。GitHub に含めて問題ありません。
> データ保護は次の STEP で設定する RLS ポリシーが担います。

---

## STEP 2. `history` テーブルと RLS ポリシーを作成

Supabase ダッシュボード左メニュー **SQL Editor** → **New query** に以下を貼り付けて **Run**:

```sql
-- 拡張（gen_random_uuid 用）
create extension if not exists pgcrypto;

-- history テーブル
create table public.history (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  title          text not null,
  artist         text not null default '',
  lyrics         text not null default '',
  artwork_url    text,
  favorite       boolean not null default false,
  view_count     integer not null default 1,
  last_viewed_at timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index history_user_recent_idx
  on public.history (user_id, last_viewed_at desc);

-- Row Level Security
alter table public.history enable row level security;

create policy "history: select own"
  on public.history for select
  to authenticated
  using ( (select auth.uid()) = user_id );

create policy "history: insert own"
  on public.history for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "history: update own"
  on public.history for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "history: delete own"
  on public.history for delete
  to authenticated
  using ( (select auth.uid()) = user_id );
```

- `to authenticated` … 未認証（anon ロール）のリクエストはそもそも対象外 → 全拒否
- `auth.uid() = user_id` … 自分の行だけ読み書き可能

実行後、**Table Editor → history** でテーブルが出来ていること、
テーブル名の横に **「RLS enabled」** バッジが付いていることを確認してください。

---

## STEP 3. Google OAuth クライアントを作成（Google Cloud Console）

### 3-1. Supabase 側のコールバック URL を控える

Supabase ダッシュボード → **Authentication → Sign In / Providers → Google** を開く。
（まだ有効化しなくてOK）。ページ内に表示される **Callback URL (for OAuth)** をコピー:

```
https://<プロジェクトRef>.supabase.co/auth/v1/callback
```

### 3-2. Google Cloud Console

1. https://console.cloud.google.com/ にログイン
2. 上部のプロジェクト選択 → **新しいプロジェクト**（名前: `lyricsnap`）→ 作成 → 選択
3. 左メニュー **APIとサービス → OAuth 同意画面**（新UI名: **Google Auth Platform**）
   - User Type: **外部 (External)** → 作成
   - アプリ名: `LyricSnap`
   - ユーザーサポートメール: 自分のメール
   - デベロッパーの連絡先情報: 自分のメール
   - **保存して次へ**
   - スコープ: **スコープを追加または削除** →
     `.../auth/userinfo.email` / `.../auth/userinfo.profile` / `openid` にチェック → 更新 → 保存して次へ
   - テストユーザー: 自分の Google アカウントを追加（← これで「未確認アプリ」でも自分はログインできます）
   - 保存して次へ → ダッシュボードに戻る
4. 左メニュー **認証情報 (Credentials)** → **認証情報を作成 → OAuth クライアント ID**
   - アプリケーションの種類: **ウェブ アプリケーション**
   - 名前: `LyricSnap Web`
   - **承認済みの JavaScript 生成元** に追加:
     - `https://kuro-83.github.io`
     - `https://<プロジェクトRef>.supabase.co`
   - **承認済みのリダイレクト URI** に追加:
     - `https://<プロジェクトRef>.supabase.co/auth/v1/callback` （← 3-1 で控えた URL）
   - 作成
5. 表示される **クライアント ID** と **クライアント シークレット** をコピー

### 3-3. Supabase に登録

Supabase → **Authentication → Sign In / Providers → Google**:

- **Enable Sign in with Google**: ON
- **Client IDs**: 上でコピーしたクライアント ID
- **Client Secret (for OAuth)**: 上でコピーしたシークレット
- **Save**

---

## STEP 4. Supabase の URL 設定（リダイレクト許可リスト）

Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://kuro-83.github.io/lyricsnap/`
- **Redirect URLs** に **Add URL** で追加:
  - `https://kuro-83.github.io/lyricsnap/`
  - `http://localhost:8765/`  ← ローカル動作確認用（任意）

**Save**。

---

## STEP 5. 完了報告

以下を教えてください。こちらで `config.js` に反映して push → 実機確認します。

| キー | 値 |
|---|---|
| A. Project URL | `https://________.supabase.co` |
| B. publishable / anon key | `sb_publishable_____` または `eyJ____` |
| C. STEP 2〜4 が完了したか | 完了 / つまずいた箇所 |

> C でエラーやわからない箇所があれば、そのスクリーンショットや文言を貼ってください。
