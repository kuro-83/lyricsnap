// ================================================
// LyricSnap — Main Application
// 全体フロー制御 + イベントリスナー登録
// ================================================

import { recognizeText, extractTitle, createPreviewURL, revokePreviewURL } from './modules/ocr.js';
import { searchLyrics, parseArtistTitle } from './modules/lyrics.js';
import { saveLyrics, getAllSaved, deleteSaved } from './modules/storage.js';
import {
  showScreen,
  updateProgress,
  setPreviewImage,
  setDetectedTitle,
  getDetectedTitle,
  showSearchingIndicator,
  displayLyrics,
  setNotFoundTitle,
  getManualLyrics,
  clearManualLyrics,
  renderHistory,
  showToast,
  changeFontSize,
} from './modules/ui.js';

// ---- App State ----
let currentTitle = '';
let currentArtist = '';
let currentLyrics = '';
let currentSource = '';
let previewURL = null;

// ---- DOM References ----
const $ = (id) => document.getElementById(id);

// ---- Initialize ----
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎵 LyricSnap initialized');
  setupEventListeners();
  registerServiceWorker();
});

// ================================================
// Event Listeners
// ================================================
function setupEventListeners() {
  // -- Upload: File Input --
  const fileInput = $('file-input');
  const dropZone = $('drop-zone');

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleImageUpload(file);
    });
  }

  // -- Upload: Drop Zone Click --
  if (dropZone) {
    dropZone.addEventListener('click', () => {
      fileInput?.click();
    });

    dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput?.click();
      }
    });

    // -- Drag & Drop --
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        handleImageUpload(file);
      }
    });
  }

  // -- Clipboard Paste --
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageUpload(file);
        break;
      }
    }
  });

  // -- Manual Search --
  const manualSearchInput = $('manual-search-input');
  const btnManualSearch = $('btn-manual-search');

  if (btnManualSearch) {
    btnManualSearch.addEventListener('click', () => {
      const query = manualSearchInput?.value?.trim();
      if (query) handleManualSearch(query);
    });
  }

  if (manualSearchInput) {
    manualSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        const query = manualSearchInput.value.trim();
        if (query) handleManualSearch(query);
      }
    });
  }

  // -- Search Screen: Search Button --
  const btnSearchLyrics = $('btn-search-lyrics');
  if (btnSearchLyrics) {
    btnSearchLyrics.addEventListener('click', () => {
      const title = getDetectedTitle();
      if (title) handleLyricsSearch(title);
    });
  }

  // -- Lyrics Screen: Save Button --
  const btnSaveLyrics = $('btn-save-lyrics');
  if (btnSaveLyrics) {
    btnSaveLyrics.addEventListener('click', () => {
      if (currentTitle && currentLyrics) {
        saveLyrics(currentTitle, currentArtist, currentLyrics);
        showToast('✅ 歌詞を保存しました');
        // バッジを更新
        displayLyrics(currentTitle, currentArtist, currentLyrics, 'saved');
        currentSource = 'saved';
      }
    });
  }

  // -- Lyrics Screen: New Search Button --
  const btnNewSearch = $('btn-new-search');
  if (btnNewSearch) {
    btnNewSearch.addEventListener('click', resetToUpload);
  }

  // -- Lyrics Screen: Edit Button --
  const btnEditLyrics = $('btn-edit-lyrics');
  if (btnEditLyrics) {
    btnEditLyrics.addEventListener('click', () => {
      // 現在の歌詞をtextareaに流し込み、手動入力画面へ
      const textarea = $('manual-lyrics-input');
      if (textarea) textarea.value = currentLyrics;
      setNotFoundTitle(currentTitle);
      showScreen('not-found');
    });
  }

  // -- Not Found: Save Manual Lyrics --
  const btnSaveManual = $('btn-save-manual');
  if (btnSaveManual) {
    btnSaveManual.addEventListener('click', () => {
      const lyrics = getManualLyrics();
      if (!lyrics) {
        showToast('⚠️ 歌詞を入力してください');
        return;
      }
      saveLyrics(currentTitle, currentArtist, lyrics);
      currentLyrics = lyrics;
      currentSource = 'saved';
      clearManualLyrics();
      displayLyrics(currentTitle, currentArtist, lyrics, 'saved');
      showScreen('lyrics');
      showToast('✅ 歌詞を保存しました');
    });
  }

  // -- Not Found: Cancel --
  const btnCancelManual = $('btn-cancel-manual');
  if (btnCancelManual) {
    btnCancelManual.addEventListener('click', resetToUpload);
  }

  // -- Header: History Button --
  const btnHistory = $('btn-history');
  if (btnHistory) {
    btnHistory.addEventListener('click', showHistoryScreen);
  }

  // -- Header: Logo (Go Home) --
  const logoHome = $('logo-home');
  if (logoHome) {
    logoHome.addEventListener('click', resetToUpload);
  }

  // -- History: Back Button --
  const btnBackFromHistory = $('btn-back-from-history');
  if (btnBackFromHistory) {
    btnBackFromHistory.addEventListener('click', resetToUpload);
  }

  // -- Lyrics: Font Size Buttons --
  $('btn-font-larger')?.addEventListener('click', () => changeFontSize('larger'));
  $('btn-font-smaller')?.addEventListener('click', () => changeFontSize('smaller'));
  $('btn-font-reset')?.addEventListener('click', () => changeFontSize('reset'));
}

// ================================================
// Core Flow: Image Upload → OCR → Title Extraction
// ================================================
async function handleImageUpload(file) {
  // クリーンアップ
  if (previewURL) revokePreviewURL(previewURL);

  // プレビュー表示
  previewURL = createPreviewURL(file);
  setPreviewImage(previewURL);

  // 処理画面に切替
  showScreen('processing');
  updateProgress(0, 'OCRエンジンを準備中...');

  try {
    // OCR実行
    const rawText = await recognizeText(file, (prog) => {
      const messages = {
        'recognizing text': 'テキストを認識中...',
      };
      updateProgress(prog.progress, messages[prog.status] || '処理中...');
    });

    updateProgress(1, 'タイトルを抽出中...');

    // タイトル抽出
    const title = extractTitle(rawText);

    if (!title) {
      showToast('⚠️ タイトルを検出できませんでした');
      resetToUpload();
      return;
    }

    // タイトル検出 → 検索画面へ
    const parsed = parseArtistTitle(title);
    currentTitle = parsed.title || title;
    currentArtist = parsed.artist || '';

    setDetectedTitle(title);
    showScreen('search');

    // 自動で歌詞検索を開始
    await handleLyricsSearch(title);
  } catch (error) {
    console.error('OCR Error:', error);
    showToast('❌ 画像の解析に失敗しました');
    resetToUpload();
  }
}

// ================================================
// Core Flow: Manual Title Search
// ================================================
async function handleManualSearch(query) {
  const parsed = parseArtistTitle(query);
  currentTitle = parsed.title || query;
  currentArtist = parsed.artist || '';

  setDetectedTitle(query);
  showScreen('search');

  await handleLyricsSearch(query);
}

// ================================================
// Core Flow: Lyrics Search
// ================================================
async function handleLyricsSearch(title) {
  showSearchingIndicator(true);

  try {
    const result = await searchLyrics(title);

    showSearchingIndicator(false);

    if (result) {
      // 歌詞が見つかった
      currentTitle = result.title || title;
      currentArtist = result.artist || '';
      currentLyrics = result.lyrics;
      currentSource = result.source;

      displayLyrics(currentTitle, currentArtist, currentLyrics, currentSource);
      showScreen('lyrics');
    } else {
      // 歌詞が見つからなかった
      const parsed = parseArtistTitle(title);
      currentTitle = parsed.title || title;
      currentArtist = parsed.artist || '';

      setNotFoundTitle(title);
      clearManualLyrics();
      showScreen('not-found');
    }
  } catch (error) {
    console.error('Search Error:', error);
    showSearchingIndicator(false);
    showToast('❌ 検索中にエラーが発生しました');

    const parsed = parseArtistTitle(title);
    currentTitle = parsed.title || title;
    currentArtist = parsed.artist || '';

    setNotFoundTitle(title);
    clearManualLyrics();
    showScreen('not-found');
  }
}

// ================================================
// History Screen
// ================================================
function showHistoryScreen() {
  const items = getAllSaved();
  renderHistory(items, {
    onItemClick: (_key, item) => {
      currentTitle = item.title;
      currentArtist = item.artist || '';
      currentLyrics = item.lyrics;
      currentSource = 'saved';
      displayLyrics(item.title, item.artist, item.lyrics, 'saved');
      showScreen('lyrics');
    },
    onDeleteClick: (key) => {
      deleteSaved(key);
      showToast('🗑️ 削除しました');
      // リストを再レンダリング
      const updated = getAllSaved();
      renderHistory(updated, {
        onItemClick: (_k, item) => {
          currentTitle = item.title;
          currentArtist = item.artist || '';
          currentLyrics = item.lyrics;
          currentSource = 'saved';
          displayLyrics(item.title, item.artist, item.lyrics, 'saved');
          showScreen('lyrics');
        },
        onDeleteClick: (k) => {
          // 再帰的に呼び出し（簡易実装）
          deleteSaved(k);
          showToast('🗑️ 削除しました');
          showHistoryScreen();
        },
      });
    },
  });
  showScreen('history');
}

// ================================================
// Reset
// ================================================
function resetToUpload() {
  currentTitle = '';
  currentArtist = '';
  currentLyrics = '';
  currentSource = '';

  if (previewURL) {
    revokePreviewURL(previewURL);
    previewURL = null;
  }

  // フォームをリセット
  const fileInput = $('file-input');
  if (fileInput) fileInput.value = '';

  const manualSearchInput = $('manual-search-input');
  if (manualSearchInput) manualSearchInput.value = '';

  showScreen('upload');
}

// ================================================
// Service Worker Registration
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
