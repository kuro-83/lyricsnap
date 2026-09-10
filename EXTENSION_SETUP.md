# LyricSnap 自動モード（Chrome拡張）— セットアップ手順

Phase 1 の Web アプリ（https://kuro-83.github.io/lyricsnap/）はそのまま使い、
YouTube で再生中の曲を自動検出してサイドパネルに歌詞を表示・自動スクロールする拡張機能です。

進める順番:
1. STEP 1 … Supabase に `video_map` テーブルを作成（あなたの作業）
2. STEP 2 … Chrome に拡張機能を読み込む（あなたの作業）
3. STEP 3 … 動作確認

---

## STEP 1. Supabase に `video_map` テーブルを作成

Supabase ダッシュボード → **SQL Editor** → **New query** に貼り付けて **Run**:

```sql
create table public.video_map (
  user_id     uuid not null references auth.users(id) on delete cascade,
  video_id    text not null,
  history_id  uuid not null references public.history(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, video_id)
);

alter table public.video_map enable row level security;

create policy "video_map: select own" on public.video_map
  for select to authenticated using ( (select auth.uid()) = user_id );
create policy "video_map: insert own" on public.video_map
  for insert to authenticated with check ( (select auth.uid()) = user_id );
create policy "video_map: update own" on public.video_map
  for update to authenticated using ( (select auth.uid()) = user_id ) with check ( (select auth.uid()) = user_id );
create policy "video_map: delete own" on public.video_map
  for delete to authenticated using ( (select auth.uid()) = user_id );
```

実行後、**Table Editor → video_map** ができていること、**RLS enabled** バッジが付いていることを確認。

> `history` テーブル（Phase 1）とはリレーションで繋がっています。
> `history` の行が消えると対応する `video_map` の行も自動で消えます。

---

## STEP 2. Chrome に拡張機能を読み込む

1. Chrome で `chrome://extensions` を開く
2. 右上の **デベロッパー モード** を ON
3. **パッケージ化されていない拡張機能を読み込む** をクリック
4. このリポジトリの **`歌詞検索/extension`** フォルダ を選択
5. 「LyricSnap 自動モード」がカードで表示されれば成功
   （拡張機能ID は `pnepaghbapdmhdpbgmabofanhnccbdmb` に固定されています。
   Web アプリ側はこの ID からのメッセージだけを受け付けます）

### 使い方
- YouTube（`www.youtube.com`）で動画/ミックスリストを再生
- ツールバーの LyricSnap アイコンをクリック → 右側にサイドパネルが開く
- 初回はパネル内でいつもの Google サインインをする（Web アプリと同じ）
- 以降、再生中の曲が自動でパネルに表示され、曲が変わると自動で追従します

> パネルを閉じても拡張機能は動いています。もう一度アイコンを押すと再表示。
> ピン留め（拡張機能アイコンのパズルマーク → LyricSnap のピン）しておくと便利です。

---

## STEP 3. 動作確認（このあと一緒に見ます）

- [ ] YouTube でミックス再生 → パネルを開く → 自動で曲が検出され歌詞が出る
- [ ] 次の曲に変わったら自動で追従する
- [ ] 時間タグ付き歌詞がある曲（例: 有名な J-POP）で、再生位置に合わせて行がハイライト＆自動スクロール
- [ ] 同じ動画をもう一度再生 → API を呼ばず即座に正しい曲が出る（`video_map` キャッシュ）
- [ ] 検出が違ったら「違う曲？」ボタン → 正しい候補を選ぶ → 次回から その動画は正しい曲になる

うまくいかない時は、以下のログを教えてください:
- `chrome://extensions` の「LyricSnap 自動モード」→ **service worker** リンク →
  DevTools の Console
- サイドパネルを右クリック →「検証」→ Console（iframe 内 Web アプリのログ）
- YouTube タブの DevTools Console（content script のログ）
