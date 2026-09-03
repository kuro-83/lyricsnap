// ================================================
// LyricSnap — UI Module
// 画面遷移、DOM操作、Toast通知の管理
// ================================================

// ---- Screen Management ----
const screens = ['upload', 'processing', 'search', 'lyrics', 'not-found', 'history'];
let currentScreen = 'upload';

// ---- Font Size State ----
const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 28;
const FONT_SIZE_STEP = 2;
const FONT_SIZE_DEFAULT = 15;
let currentFontSize = FONT_SIZE_DEFAULT;

/**
 * 画面を切り替える
 * @param {string} name - 画面名（upload, processing, search, lyrics, not-found, history）
 */
export function showScreen(name) {
  if (!screens.includes(name)) {
    console.warn(`Unknown screen: ${name}`);
    return;
  }

  screens.forEach((s) => {
    const el = document.getElementById(`screen-${s}`);
    if (el) {
      el.classList.remove('active');
    }
  });

  const target = document.getElementById(`screen-${name}`);
  if (target) {
    target.classList.add('active');
    // スクロールを先頭に戻す
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  currentScreen = name;

  // 履歴画面では履歴ボタンを非表示、それ以外では表示
  const historyBtn = document.getElementById('btn-history');
  if (historyBtn) {
    historyBtn.style.display = name === 'history' ? 'none' : '';
  }
}

/**
 * 現在のスクリーン名を取得
 * @returns {string}
 */
export function getCurrentScreen() {
  return currentScreen;
}

// ---- Progress ----

/**
 * OCR進捗を更新
 * @param {number} percent - 0〜1
 * @param {string} [message] - ステータスメッセージ
 */
export function updateProgress(percent, message) {
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  const status = document.getElementById('processing-status');

  const pct = Math.round(percent * 100);

  if (fill) fill.style.width = `${pct}%`;
  if (text) text.textContent = `${pct}%`;
  if (status && message) status.textContent = message;
}

/**
 * プレビュー画像を設定
 * @param {string} src - 画像のURL
 */
export function setPreviewImage(src) {
  const img = document.getElementById('preview-image');
  if (img) img.src = src;
}

// ---- Search Screen ----

/**
 * 検出されたタイトルを表示
 * @param {string} title 
 */
export function setDetectedTitle(title) {
  const input = document.getElementById('detected-title-input');
  if (input) input.value = title;
}

/**
 * 検出されたタイトルを取得
 * @returns {string}
 */
export function getDetectedTitle() {
  const input = document.getElementById('detected-title-input');
  return input ? input.value.trim() : '';
}

/**
 * 検索インジケーターを表示/非表示
 * @param {boolean} visible 
 */
export function showSearchingIndicator(visible) {
  const el = document.getElementById('searching-indicator');
  if (el) el.hidden = !visible;
}

// ---- Lyrics Display ----

/**
 * 歌詞を表示する
 * @param {string} title - 曲名
 * @param {string} artist - アーティスト名
 * @param {string} lyrics - 歌詞テキスト
 * @param {'saved' | 'lrclib' | 'lyricsovh'} source - ソース
 */
export function displayLyrics(title, artist, lyrics, source) {
  const songTitle = document.getElementById('lyrics-song-title');
  const artistName = document.getElementById('lyrics-artist-name');
  const lyricsText = document.getElementById('lyrics-text');
  const badge = document.getElementById('lyrics-source-badge');
  const saveBtn = document.getElementById('btn-save-lyrics');

  if (songTitle) songTitle.textContent = title || '不明な曲';
  if (artistName) artistName.textContent = artist || '';

  // ルビ変換してinnerHTMLで表示
  if (lyricsText) {
    lyricsText.innerHTML = convertRuby(lyrics);
    lyricsText.style.fontSize = `${currentFontSize}px`;
  }

  if (badge) {
    const labels = {
      saved: '保存済み',
      lrclib: 'LRCLIB',
      lyricsovh: 'lyrics.ovh',
    };
    badge.textContent = labels[source] || source;
    badge.className = `source-badge${source === 'saved' ? ' saved' : ''}`;
  }

  // 保存済みソースなら保存ボタンを非表示
  if (saveBtn) {
    saveBtn.style.display = source === 'saved' ? 'none' : '';
  }

  // Google検索リンクを更新
  const googleLink = document.getElementById('btn-google-search-lyrics');
  if (googleLink) {
    const query = encodeURIComponent(`${title} 歌詞`);
    googleLink.href = `https://www.google.com/search?q=${query}`;
  }

  // フォントサイズボタンの状態を更新
  updateFontSizeButtons();
}

// ---- Font Size Control ----

/**
 * 歌詞のフォントサイズを変更する
 * @param {'larger' | 'smaller' | 'reset'} direction
 */
export function changeFontSize(direction) {
  if (direction === 'larger') {
    currentFontSize = Math.min(currentFontSize + FONT_SIZE_STEP, FONT_SIZE_MAX);
  } else if (direction === 'smaller') {
    currentFontSize = Math.max(currentFontSize - FONT_SIZE_STEP, FONT_SIZE_MIN);
  } else {
    currentFontSize = FONT_SIZE_DEFAULT;
  }
  const lyricsText = document.getElementById('lyrics-text');
  if (lyricsText) lyricsText.style.fontSize = `${currentFontSize}px`;
  updateFontSizeButtons();
}

/**
 * フォントサイズボタンの有効/無効状態を更新
 */
function updateFontSizeButtons() {
  const btnLarger = document.getElementById('btn-font-larger');
  const btnSmaller = document.getElementById('btn-font-smaller');
  const label = document.getElementById('font-size-label');
  if (btnLarger) btnLarger.disabled = currentFontSize >= FONT_SIZE_MAX;
  if (btnSmaller) btnSmaller.disabled = currentFontSize <= FONT_SIZE_MIN;
  if (label) label.textContent = `${currentFontSize}px`;
}

// ---- Ruby Conversion ----

/**
 * 歌詞テキストのルビ表記をHTML <ruby> タグに変換する
 * 対応形式:
 *   - 漢字[かな] / 漢字(かな)
 *   - <ruby>漢字<rt>かな</rt></ruby> (そのまま通過)
 * @param {string} text
 * @returns {string} HTML文字列
 */
function convertRuby(text) {
  if (!text) return '';

  // ステップ1: 既存の <ruby>...</ruby> を保護してプレースホルダに退避
  const rubyTags = [];
  let result = text.replace(/<ruby[\s\S]*?<\/ruby>/gi, (match) => {
    rubyTags.push(match);
    return `\x01${rubyTags.length - 1}\x01`;
  });

  // ステップ2: 残りのテキストをHTMLエスケープ（< > & " のみ）
  result = result.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );

  // ステップ3: 漢字[ふりがな] パターン（半角角括弧）
  result = result.replace(
    /([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3005\u3040-\u309F]+)\[([^\]]{1,20})\]/g,
    '<ruby>$1<rt>$2</rt></ruby>'
  );

  // ステップ4: 漢字（ふりがな）パターン — 全角括弧（ひらがな・カタカナのみ）
  result = result.replace(
    /([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3005\u3040-\u309F]+)\uff08([\u3040-\u30FF]{1,20})\uff09/g,
    '<ruby>$1<rt>$2</rt></ruby>'
  );

  // ステップ5: 漢字(ふりがな)パターン — 半角括弧（ひらがな・カタカナのみ）
  result = result.replace(
    /([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3005\u3040-\u309F]+)\(([\u3040-\u30FF]{1,20})\)/g,
    '<ruby>$1<rt>$2</rt></ruby>'
  );

  // ステップ6: 漢字 + スペース + ひらがな（2文字以上）パターン
  //   例: 彩 いろどり → <ruby>彩<rt>いろどり</rt></ruby>
  //   ひらがな2文字以上に限定することで、助詞（は、が等）や英語単語間スペースを除外
  result = result.replace(
    /([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3005][\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3005\u3040-\u309F]*)[ \u3000]([\u3040-\u309F]{2,20})(?![\u3040-\u309F])/g,
    '<ruby>$1<rt>$2</rt></ruby>'
  );

  // ステップ7: 改行を <br> に変換
  result = result.replace(/\n/g, '<br>');

  // ステップ8: プレースホルダを元の <ruby> タグに戻す
  result = result.replace(/\x01(\d+)\x01/g, (_, i) => rubyTags[Number(i)]);

  return result;
}

// ---- Not Found / Manual Input ----

/**
 * 歌詞未発見画面のタイトルを設定
 * @param {string} title 
 */
export function setNotFoundTitle(title) {
  const el = document.getElementById('not-found-title');
  if (el) el.textContent = title;

  // Google検索リンクを更新
  const googleLink = document.getElementById('btn-google-search-notfound');
  if (googleLink) {
    const query = encodeURIComponent(`${title} 歌詞`);
    googleLink.href = `https://www.google.com/search?q=${query}`;
  }
}

/**
 * 手動入力テキストを取得
 * @returns {string}
 */
export function getManualLyrics() {
  const el = document.getElementById('manual-lyrics-input');
  return el ? el.value.trim() : '';
}

/**
 * 手動入力テキストをクリア
 */
export function clearManualLyrics() {
  const el = document.getElementById('manual-lyrics-input');
  if (el) el.value = '';
}

// ---- History ----

/**
 * 履歴リストをレンダリング
 * @param {Array<{ key: string, title: string, artist: string, savedAt: string }>} items
 * @param {{ onItemClick: (key: string, item: Object) => void, onDeleteClick: (key: string) => void }} handlers
 */
export function renderHistory(items, handlers) {
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');

  if (!list) return;

  if (items.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }

  if (empty) empty.style.display = 'none';

  list.innerHTML = items
    .map(
      (item) => `
    <div class="history-item" data-key="${escapeHtml(item.key)}">
      <div class="history-item-icon">🎵</div>
      <div class="history-item-info">
        <div class="history-item-title">${escapeHtml(item.title)}</div>
        <div class="history-item-date">${formatDate(item.savedAt)}</div>
      </div>
      <button class="history-item-delete" data-delete-key="${escapeHtml(item.key)}" aria-label="削除">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>
  `
    )
    .join('');

  // イベント委譲
  list.onclick = (e) => {
    const deleteBtn = e.target.closest('[data-delete-key]');
    if (deleteBtn) {
      e.stopPropagation();
      handlers.onDeleteClick(deleteBtn.dataset.deleteKey);
      return;
    }

    const item = e.target.closest('.history-item');
    if (item) {
      const key = item.dataset.key;
      const found = items.find((i) => i.key === key);
      if (found) handlers.onItemClick(key, found);
    }
  };
}

// ---- Toast ----

let toastTimer = null;

/**
 * トースト通知を表示
 * @param {string} message 
 * @param {number} [duration=2500] - 表示時間（ミリ秒）
 */
export function showToast(message, duration = 2500) {
  const toast = document.getElementById('toast');
  const msg = document.getElementById('toast-message');

  if (!toast || !msg) return;

  // 既存のトーストをクリア
  if (toastTimer) {
    clearTimeout(toastTimer);
    toast.classList.remove('show');
  }

  msg.textContent = message;
  toast.hidden = false;

  // 次フレームでアニメーション開始
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.hidden = true;
    }, 300);
    toastTimer = null;
  }, duration);
}

// ---- Utility ----

/**
 * HTMLエスケープ
 * @param {string} str 
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 日付をフォーマット
 * @param {string} isoString 
 * @returns {string}
 */
function formatDate(isoString) {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'たった今';
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days < 7) return `${days}日前`;

    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}
