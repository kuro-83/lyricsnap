// ================================================
// LyricSnap — Main Application
// 認証 → 曲検索 → 歌詞表示 → クラウド履歴
// ================================================

import { isSupabaseConfigured } from './config.js';
import { initAuth, onAuthChange, getUser, signInWithGoogle, signOut } from './modules/auth.js';
import { searchMusic } from './modules/musicSearch.js';
import { searchLyrics } from './modules/lyrics.js';
import {
  recordView,
  getHistory,
  suggestFromHistory,
  getHistoryById,
  setFavorite,
  updateHistory,
  deleteHistory,
  exportAll,
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
} from './modules/ui.js';

const $ = (id) => document.getElementById(id);

// ---- App State ----
/** 現在表示中の曲。history レコード or 検索確定した曲 */
let current = null; // { id?, title, artist, lyrics, artwork_url?, source?, saved }
let searchDebounce = null;

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

  if (!isSupabaseConfigured) {
    showScreen('auth');
    showConfigWarning(true);
    return;
  }

  onAuthChange((user) => {
    if (user) {
      if (getCurrentScreenName() === 'auth') enterApp();
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

  let result = null;
  try {
    result = await searchLyrics(m.title, m.artist);
  } catch (e) {
    console.error('lyrics search error', e);
  }

  if (result && result.lyrics) {
    // 表示用の曲名・アーティストはユーザーが確定した iTunes の値を正とする
    // （歌詞APIが返すタイトルには "(inst)" 等の装飾が混じることがあるため）
    current = {
      title: m.title,
      artist: m.artist,
      lyrics: result.lyrics,
      artwork_url: m.artwork || null,
      source: result.source,
      saved: false,
    };
    displayLyrics(current, { source: current.source });
    await persistView({ ...current, source: result.source });
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

async function openHistoryRecord(rec) {
  current = { ...rec, saved: true };
  displayLyrics(current, { saved: true });
  showScreen('lyrics');
  try {
    const updated = await recordView({
      title: rec.title,
      artist: rec.artist,
      lyrics: rec.lyrics,
      artwork_url: rec.artwork_url,
    });
    if (updated) current = { ...updated, saved: true };
  } catch (e) {
    console.warn('recordView failed', e);
  }
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
  const input = $('manual-search-input');
  if (input) input.value = '';
  const clearBtn = $('btn-search-clear');
  if (clearBtn) clearBtn.hidden = true;
  clearCandidates();
  showScreen('home');
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
