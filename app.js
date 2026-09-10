// ================================================
// LyricSnap — Main Application
// 認証 → 曲検索 → 歌詞表示 → クラウド履歴
// ================================================

import { isSupabaseConfigured } from './config.js';
import { initAuth, onAuthChange, getUser, signInWithGoogle, signOut } from './modules/auth.js';
import { searchMusic } from './modules/musicSearch.js';
import { searchLyrics, fetchSyncedLyrics } from './modules/lyrics.js';
import {
  recordView,
  findExisting,
  touchView,
  getHistory,
  suggestFromHistory,
  getHistoryById,
  setFavorite,
  updateHistory,
  deleteHistory,
  exportAll,
  getVideoMapping,
  saveVideoMapping,
} from './modules/db.js';
import {
  showScreen,
  showToast,
  showConfigWarning,
  setCandidateLoading,
  clearCandidates,
  renderCandidates,
  displayLyrics,
  openSongEdit,
  closeSongEdit,
  getSongEdit,
  setNotFoundTitle,
  getManualLyrics,
  setManualLyrics,
  clearManualLyrics,
  renderHistory,
  changeFontSize,
  highlightSyncedLine,
  showAutoBanner,
  hideAutoBanner,
} from './modules/ui.js';

const $ = (id) => document.getElementById(id);

// ---- App State ----
/** 現在表示中の曲。history レコード or 検索確定した曲 */
let current = null; // { id?, title, artist, lyrics, artwork_url?, source?, saved, synced? }
let searchDebounce = null;

// ---- 拡張機能 自動モードの状態 ----
let autoVideoId = null;      // 現在追従中の YouTube 動画ID
let autoActive = false;      // 自動検出の結果を表示中か（バナー表示中か）
let autoTitle = '';          // 直近の動画タイトル
let correctingVideoId = null;// 「違う曲？」で訂正中の動画ID（確定したら video_map を上書き）
let pendingAuto = null;      // サインイン前に届いた autoDetect を保留
const EXT_ORIGIN = 'chrome-extension://pnepaghbapdmhdpbgmabofanhnccbdmb';

// 履歴画面のフィルタ状態
const historyState = { search: '', favoritesOnly: false, sort: 'recent' };
let historySearchDebounce = null;

// ================================================
// Init
// ================================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🎵 LyricSnap initialized');
  setupEventListeners();
  registerServiceWorker();
  setupExtensionBridge();

  if (!isSupabaseConfigured) {
    showScreen('auth');
    showConfigWarning(true);
    return;
  }

  onAuthChange((user) => {
    if (user) {
      if (getCurrentScreenName() === 'auth') enterApp();
      if (pendingAuto) {
        const p = pendingAuto;
        pendingAuto = null;
        handleAutoDetect(p);
      }
    } else {
      showScreen('auth');
    }
  });

  await initAuth();
  if (getUser()) enterApp();
  else showScreen('auth');
});

function getCurrentScreenName() {
  const active = document.querySelector('.screen.active');
  return active ? active.id.replace('screen-', '') : 'auth';
}

function enterApp() {
  clearCandidates();
  const input = $('manual-search-input');
  if (input) input.value = '';
  showScreen('home');
}

// ================================================
// Event Listeners
// ================================================
function setupEventListeners() {
  // -- Auth --
  $('btn-google-signin')?.addEventListener('click', async () => {
    try {
      await signInWithGoogle();
    } catch (e) {
      console.error(e);
      showToast('❌ サインインに失敗しました');
    }
  });

  $('btn-signout')?.addEventListener('click', async () => {
    await signOut();
    showToast('サインアウトしました');
  });

  // -- Home: search input (debounced) --
  const searchInput = $('manual-search-input');
  const clearBtn = $('btn-search-clear');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim();
      if (clearBtn) clearBtn.hidden = q.length === 0;
      if (searchDebounce) clearTimeout(searchDebounce);
      if (!q) {
        clearCandidates();
        return;
      }
      searchDebounce = setTimeout(() => runCandidateSearch(q), 300);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        const q = searchInput.value.trim();
        if (q) {
          if (searchDebounce) clearTimeout(searchDebounce);
          runCandidateSearch(q);
        }
      }
    });
  }
  clearBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.hidden = true;
    clearCandidates();
    searchInput?.focus();
  });

  // -- Lyrics screen --
  $('btn-new-search')?.addEventListener('click', goHome);
  $('btn-edit-song')?.addEventListener('click', () => {
    if (current) openSongEdit(current);
  });
  $('btn-song-edit-cancel')?.addEventListener('click', closeSongEdit);
  $('btn-song-edit-save')?.addEventListener('click', handleSongEditSave);

  $('btn-edit-lyrics')?.addEventListener('click', () => {
    if (!current) return;
    setManualLyrics(current.lyrics || '');
    setNotFoundTitle(current.title, { found: true });
    showScreen('not-found');
  });

  // -- Not found / manual input --
  $('btn-save-manual')?.addEventListener('click', handleSaveManual);
  $('btn-cancel-manual')?.addEventListener('click', () => {
    if (current && current.lyrics) {
      displayLyrics(current, { saved: current.saved, source: current.source });
      showScreen('lyrics');
    } else {
      goHome();
    }
  });

  // -- Header --
  $('btn-history')?.addEventListener('click', openHistory);
  $('logo-home')?.addEventListener('click', () => {
    if (getUser()) goHome();
  });
  $('btn-back-from-history')?.addEventListener('click', goHome);

  // -- Font size --
  $('btn-font-larger')?.addEventListener('click', () => changeFontSize('larger'));
  $('btn-font-smaller')?.addEventListener('click', () => changeFontSize('smaller'));
  $('btn-font-reset')?.addEventListener('click', () => changeFontSize('reset'));

  // -- History controls --
  const histSearch = $('history-search-input');
  histSearch?.addEventListener('input', () => {
    historyState.search = histSearch.value.trim();
    if (historySearchDebounce) clearTimeout(historySearchDebounce);
    historySearchDebounce = setTimeout(loadHistory, 250);
  });

  $('btn-filter-fav')?.addEventListener('click', () => {
    historyState.favoritesOnly = !historyState.favoritesOnly;
    const btn = $('btn-filter-fav');
    btn.classList.toggle('active', historyState.favoritesOnly);
    btn.setAttribute('aria-pressed', String(historyState.favoritesOnly));
    loadHistory();
  });

  $('btn-sort-recent')?.addEventListener('click', () => setSort('recent'));
  $('btn-sort-most')?.addEventListener('click', () => setSort('most'));

  $('btn-export-history')?.addEventListener('click', handleExportHistory);
}

// ================================================
// Home: candidate search
// ================================================
async function runCandidateSearch(query) {
  setCandidateLoading(true);
  try {
    const [music, history] = await Promise.all([
      searchMusic(query).catch(() => []),
      suggestFromHistory(query).catch(() => []),
    ]);
    // 入力が変わっていたら破棄
    if (($('manual-search-input')?.value || '').trim() !== query) return;
    renderCandidates(
      { history, music },
      { onHistoryPick: openHistoryRecord, onMusicPick: pickMusicCandidate }
    );
  } finally {
    setCandidateLoading(false);
  }
}

// ================================================
// Candidate → confirm → lyrics
// ================================================
async function pickMusicCandidate(m) {
  showScreen('lyrics');
  displayLyrics(
    { title: m.title, artist: m.artist, lyrics: '検索しています…' },
    { source: '' }
  );
  await resolveSong(m);
}

/**
 * 確定した曲候補から歌詞を解決して表示する（手動選択・自動検出の共通処理）
 * 履歴チェック → 無ければ LRCLIB/lyrics.ovh → 無ければ手動入力画面
 * @param {{title:string, artist:string, artwork?:string}} m
 * @param {{silentNotFound?: boolean}} [opts]
 */
async function resolveSong(m, opts = {}) {
  // 0. まず自分の履歴に保存済みか確認。あれば外部APIを呼ばず保存済み歌詞を表示する。
  let existing = null;
  try {
    existing = await findExisting(m.title, m.artist);
  } catch (e) {
    console.warn('findExisting failed', e);
  }
  if (existing && (existing.lyrics || '').trim()) {
    current = { ...existing, saved: true };
    displayLyrics(current, { saved: true });
    try {
      const updated = await touchView(existing);
      if (updated) current = { ...updated, saved: true };
    } catch (e) {
      console.warn('touchView failed', e);
    }
    await afterResolved();
    return;
  }

  // 1. 未保存 or 歌詞が空 → 従来通り外部歌詞APIを検索
  let result = null;
  try {
    result = await searchLyrics(m.title, m.artist);
  } catch (e) {
    console.error('lyrics search error', e);
  }

  if (result && result.lyrics) {
    // 表示用の曲名・アーティストはユーザーが確定した iTunes の値を正とする
    current = {
      title: m.title,
      artist: m.artist,
      lyrics: result.lyrics,
      artwork_url: m.artwork || null,
      source: result.source,
      saved: false,
      synced: result.synced || null,
    };
    displayLyrics(current, { source: current.source });
    await persistView({ ...current });
    await afterResolved();
  } else if (opts.silentNotFound) {
    // 自動検出で見つからないとき: 手動入力に飛ばさず、その場で案内
    current = { title: m.title, artist: m.artist, lyrics: '', artwork_url: m.artwork || null, saved: false };
    displayLyrics(
      { title: m.title, artist: m.artist, lyrics: 'この曲の歌詞は見つかりませんでした。\n「違う曲？」から手動で検索・入力できます。' },
      { source: '' }
    );
  } else {
    // 見つからない → 手動入力へ
    current = {
      title: m.title,
      artist: m.artist,
      lyrics: '',
      artwork_url: m.artwork || null,
      source: 'manual',
      saved: false,
    };
    setNotFoundTitle(m.title, { found: false });
    clearManualLyrics();
    showScreen('not-found');
  }
}

/** 曲が確定して current.id が付いた後の共通後処理（video_map への記録） */
async function afterResolved() {
  if (!current || !current.id) return;
  if (correctingVideoId) {
    await saveVideoMapping(correctingVideoId, current.id);
    showToast('✅ この動画の曲を修正しました');
    correctingVideoId = null;
    autoVideoId = autoVideoId || null;
    autoActive = true;
    showAutoBanner(current.title);
  } else if (autoVideoId && autoActive) {
    await saveVideoMapping(autoVideoId, current.id);
  }
}

async function openHistoryRecord(rec) {
  current = { ...rec, saved: true };
  displayLyrics(current, { saved: true });
  showScreen('lyrics');
  try {
    const updated = await touchView(rec);
    if (updated) current = { ...updated, saved: true };
  } catch (e) {
    console.warn('touchView failed', e);
  }
  await afterResolved();
}

// 見つかった歌詞をクラウド履歴に upsert
async function persistView(song) {
  try {
    const rec = await recordView({
      title: song.title,
      artist: song.artist,
      lyrics: song.lyrics,
      artwork_url: song.artwork_url,
    });
    if (rec) {
      current = { ...rec, source: song.source, saved: true };
      displayLyrics(current, { saved: true });
      showToast('✅ 履歴に保存しました');
    }
  } catch (e) {
    console.error('persistView failed', e);
    showToast('⚠️ 履歴の保存に失敗しました');
  }
}

// ================================================
// Manual lyrics save
// ================================================
async function handleSaveManual() {
  const lyrics = getManualLyrics();
  if (!lyrics) {
    showToast('⚠️ 歌詞を入力してください');
    return;
  }
  if (!current) return;

  current.lyrics = lyrics;
  try {
    let rec;
    if (current.id) {
      rec = await updateHistory(current.id, { lyrics });
    } else {
      rec = await recordView({
        title: current.title,
        artist: current.artist,
        lyrics,
        artwork_url: current.artwork_url,
      });
    }
    current = { ...rec, source: 'manual', saved: true };
    clearManualLyrics();
    displayLyrics(current, { saved: true });
    showScreen('lyrics');
    showToast('✅ 歌詞を保存しました');
    await afterResolved();
  } catch (e) {
    console.error(e);
    showToast('❌ 保存に失敗しました');
  }
}

// ================================================
// Song title/artist edit
// ================================================
async function handleSongEditSave() {
  if (!current) return;
  const { title, artist } = getSongEdit();
  if (!title) {
    showToast('⚠️ 曲名を入力してください');
    return;
  }
  try {
    if (current.id) {
      const rec = await updateHistory(current.id, { title, artist });
      current = { ...rec, source: current.source, saved: true };
    } else {
      current.title = title;
      current.artist = artist;
    }
    closeSongEdit();
    displayLyrics(current, { saved: current.saved, source: current.source });
    showToast('✅ 更新しました');
  } catch (e) {
    console.error(e);
    showToast('❌ 更新に失敗しました');
  }
}

// ================================================
// History screen
// ================================================
function openHistory() {
  showScreen('history');
  loadHistory();
}

async function loadHistory() {
  try {
    const items = await getHistory(historyState);
    renderHistory(
      items,
      {
        onItemClick: openHistoryRecord,
        onToggleFavorite: handleToggleFavorite,
        onDelete: handleDeleteHistory,
      },
      { filtered: !!(historyState.search || historyState.favoritesOnly) }
    );
  } catch (e) {
    console.error('loadHistory failed', e);
    showToast('❌ 履歴の取得に失敗しました');
  }
}

function setSort(sort) {
  historyState.sort = sort;
  $('btn-sort-recent')?.classList.toggle('active', sort === 'recent');
  $('btn-sort-most')?.classList.toggle('active', sort === 'most');
  loadHistory();
}

async function handleToggleFavorite(rec) {
  try {
    await setFavorite(rec.id, !rec.favorite);
    loadHistory();
  } catch (e) {
    console.error(e);
    showToast('❌ 更新に失敗しました');
  }
}

async function handleDeleteHistory(rec) {
  try {
    await deleteHistory(rec.id);
    showToast('🗑️ 削除しました');
    loadHistory();
  } catch (e) {
    console.error(e);
    showToast('❌ 削除に失敗しました');
  }
}

async function handleExportHistory() {
  try {
    const data = await exportAll();
    if (!data.length) {
      showToast('エクスポートする履歴がありません');
      return;
    }
    const payload = {
      app: 'LyricSnap',
      exported_at: new Date().toISOString(),
      count: data.length,
      history: data,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lyricsnap-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`✅ ${data.length}件をエクスポートしました`);
  } catch (e) {
    console.error(e);
    showToast('❌ エクスポートに失敗しました');
  }
}

// ================================================
// Navigation helpers
// ================================================
function goHome() {
  current = null;
  closeSongEdit();
  // 自動モードから通常操作でホームに戻ったら追従を止める
  autoActive = false;
  correctingVideoId = null;
  hideAutoBanner();
  const input = $('manual-search-input');
  if (input) input.value = '';
  const clearBtn = $('btn-search-clear');
  if (clearBtn) clearBtn.hidden = true;
  clearCandidates();
  showScreen('home');
}

// ================================================
// 拡張機能ブリッジ（side panel の iframe 経由で YouTube 連動）
// ================================================
function setupExtensionBridge() {
  // side panel（親フレーム）に「準備完了」を通知
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'lyricsnap:ready' }, '*');
    }
  } catch (_) {
    /* ignore */
  }

  window.addEventListener('message', (e) => {
    // 送信元は拡張機能の side panel（chrome-extension://<固定ID>）のみ許可
    if (e.origin !== EXT_ORIGIN && !e.origin.startsWith('chrome-extension://')) return;
    const data = e.data;
    if (!data || typeof data.type !== 'string') return;

    if (data.type === 'lyricsnap:autoDetect') {
      handleAutoDetect({ videoId: data.videoId, title: data.title });
    } else if (data.type === 'lyricsnap:timeUpdate') {
      handleTimeUpdate({ videoId: data.videoId, currentTime: data.currentTime });
    }
  });

  // 「違う曲？」→ 検索し直し（動画IDは保持し、確定したら video_map を上書き）
  $('btn-auto-wrong')?.addEventListener('click', () => {
    correctingVideoId = autoVideoId;
    current = null;
    closeSongEdit();
    clearCandidates();
    const input = $('manual-search-input');
    if (input) input.value = autoTitle || '';
    showScreen('home');
    if (autoTitle) runCandidateSearch(autoTitle);
    input?.focus();
  });
}

/** 動画タイトルに最も合致する候補を選ぶ（アーティスト名がタイトルに含まれるものを優先） */
function pickBestCandidate(candidates, videoTitle) {
  if (!candidates || !candidates.length) return null;
  const norm = (s) => (s || '').toLowerCase().replace(/[\s'’"“”()（）\[\]【】]/g, '');
  const t = norm(videoTitle);
  const withArtist = candidates.filter((c) => c.artist && t.includes(norm(c.artist)));
  if (withArtist.length) {
    // さらに曲名もタイトルに含まれるものを最優先
    const both = withArtist.find((c) => c.title && t.includes(norm(c.title)));
    return both || withArtist[0];
  }
  return candidates[0];
}

async function handleAutoDetect({ videoId, title }) {
  if (!videoId) return;

  if (!isSupabaseConfigured || !getUser()) {
    pendingAuto = { videoId, title }; // サインイン後に処理
    return;
  }

  // 同じ動画を処理中/表示中なら何もしない
  if (videoId === autoVideoId && autoActive) return;

  autoVideoId = videoId;
  autoActive = true;
  autoTitle = title || '';
  correctingVideoId = null;

  showAutoBanner(title || '自動検出中…');
  showScreen('lyrics');
  displayLyrics({ title: title || '自動検出中…', artist: '', lyrics: '🎬 この動画の曲を特定しています…' }, { source: '' });

  // 1. video_map キャッシュ命中なら外部APIを一切呼ばない
  let mapped = null;
  try {
    mapped = await getVideoMapping(videoId);
  } catch (e) {
    console.warn('getVideoMapping failed', e);
  }
  if (videoId !== autoVideoId) return; // 途中で別の曲に変わった
  if (mapped && (mapped.lyrics || '').trim()) {
    current = { ...mapped, saved: true, _syncedTried: false };
    displayLyrics(current, { saved: true });
    showAutoBanner(mapped.title);
    try {
      const updated = await touchView(mapped);
      if (updated && videoId === autoVideoId) current = { ...updated, saved: true };
    } catch (e) {
      console.warn('touchView failed', e);
    }
    return;
  }

  // 2. 動画タイトルから iTunes 候補 → 最有力を自動選択
  let candidates = [];
  try {
    candidates = await searchMusic(title);
  } catch (e) {
    console.warn('searchMusic failed', e);
  }
  if (videoId !== autoVideoId) return;

  const best = pickBestCandidate(candidates, title);
  if (!best) {
    displayLyrics(
      { title: title || '不明', artist: '', lyrics: 'この動画の曲を自動で特定できませんでした。\n「違う曲？」から手動で検索してください。' },
      { source: '' }
    );
    return;
  }

  // 3. 既存フロー（履歴チェック → LRCLIB/lyrics.ovh）。確定したら afterResolved() が video_map に保存
  await resolveSong(best, { silentNotFound: true });
}

async function handleTimeUpdate({ videoId, currentTime }) {
  if (!autoActive || videoId !== autoVideoId || !current) return;
  if (typeof currentTime !== 'number') return;

  if (Array.isArray(current.synced) && current.synced.length) {
    highlightSyncedLine(currentTime);
    return;
  }

  // 同期歌詞がまだ無ければ一度だけ LRCLIB に取りに行く
  if (current.id && !current._syncedTried) {
    current._syncedTried = true;
    const vid = videoId;
    const title = current.title;
    const artist = current.artist;
    fetchSyncedLyrics(title, artist).then((synced) => {
      if (!synced || !current || vid !== autoVideoId) return;
      if (current.title !== title) return;
      current.synced = synced;
      displayLyrics(current, { saved: current.saved, source: current.source });
      highlightSyncedLine(currentTime);
    });
  }
}

// ================================================
// Service Worker
// ================================================
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
      console.log('Service Worker registered');
    } catch (error) {
      console.warn('Service Worker registration failed:', error);
    }
  }
}
