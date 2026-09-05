// ================================================
// LyricSnap — UI Module
// 画面遷移、DOM操作、Toast通知、各種レンダリング
// ================================================

// ---- Screen Management ----
const screens = ['auth', 'home', 'lyrics', 'not-found', 'history'];
let currentScreen = 'auth';

// ---- Font Size State ----
const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 28;
const FONT_SIZE_STEP = 2;
const FONT_SIZE_DEFAULT = 15;
const FONT_SIZE_KEY = 'lyricsnap_font_size';
let currentFontSize = loadFontSize();

function loadFontSize() {
  try {
    const v = parseInt(localStorage.getItem(FONT_SIZE_KEY), 10);
    if (v >= FONT_SIZE_MIN && v <= FONT_SIZE_MAX) return v;
  } catch {
    /* ignore */
  }
  return FONT_SIZE_DEFAULT;
}

const $ = (id) => document.getElementById(id);

/**
 * 画面を切り替える
 * @param {'auth'|'home'|'lyrics'|'not-found'|'history'} name
 */
export function showScreen(name) {
  if (!screens.includes(name)) {
    console.warn(`Unknown screen: ${name}`);
    return;
  }

  screens.forEach((s) => {
    const el = $(`screen-${s}`);
    if (el) el.classList.remove('active');
  });

  const target = $(`screen-${name}`);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  currentScreen = name;

  // ヘッダーのボタン表示制御（サインイン済みかつ auth 画面以外で表示）
  const signedIn = name !== 'auth';
  const historyBtn = $('btn-history');
  const signoutBtn = $('btn-signout');
  if (historyBtn) historyBtn.hidden = !signedIn || name === 'history';
  if (signoutBtn) signoutBtn.hidden = !signedIn;
}

export function getCurrentScreen() {
  return currentScreen;
}

// ================================================
// Auth screen
// ================================================
export function showConfigWarning(show) {
  const el = $('auth-config-warning');
  const btn = $('btn-google-signin');
  if (el) el.hidden = !show;
  if (btn) btn.disabled = show;
}

// ================================================
// Home: candidate list
// ================================================
export function setCandidateLoading(loading) {
  const el = $('candidate-loading');
  if (el) el.hidden = !loading;
}

export function clearCandidates() {
  ['candidate-history-group', 'candidate-music-group'].forEach((id) => {
    const g = $(id);
    if (g) g.hidden = true;
  });
  const h = $('candidate-history-list');
  const m = $('candidate-music-list');
  if (h) h.innerHTML = '';
  if (m) m.innerHTML = '';
  const empty = $('home-empty');
  if (empty) empty.hidden = false;
}

/**
 * 候補一覧をレンダリングする
 * @param {{history: object[], music: import('./musicSearch.js').MusicCandidate[]}} data
 * @param {{onHistoryPick: (rec: object) => void, onMusicPick: (m: object) => void}} handlers
 */
export function renderCandidates(data, handlers) {
  const { history = [], music = [] } = data;
  const empty = $('home-empty');
  const hasAny = history.length > 0 || music.length > 0;
  if (empty) empty.hidden = hasAny;

  // History group
  const histGroup = $('candidate-history-group');
  const histList = $('candidate-history-list');
  if (histList) {
    if (history.length) {
      histList.innerHTML = history
        .map(
          (rec) => `
        <button class="candidate-item" data-id="${escapeAttr(rec.id)}">
          <span class="candidate-thumb ${rec.artwork_url ? '' : 'placeholder'}">${
            rec.artwork_url
              ? `<img src="${escapeAttr(rec.artwork_url)}" alt="" loading="lazy">`
              : '♪'
          }</span>
          <span class="candidate-info">
            <span class="candidate-title">${escapeHtml(rec.title)}</span>
            <span class="candidate-artist">${escapeHtml(rec.artist || '不明')}</span>
          </span>
          <span class="candidate-tag">履歴</span>
        </button>`
        )
        .join('');
      histList.querySelectorAll('.candidate-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          const rec = history.find((r) => String(r.id) === btn.dataset.id);
          if (rec) handlers.onHistoryPick(rec);
        });
      });
      if (histGroup) histGroup.hidden = false;
    } else if (histGroup) {
      histGroup.hidden = true;
    }
  }

  // Music group
  const musicGroup = $('candidate-music-group');
  const musicList = $('candidate-music-list');
  if (musicList) {
    if (music.length) {
      musicList.innerHTML = music
        .map(
          (m, i) => `
        <button class="candidate-item" data-idx="${i}">
          <span class="candidate-thumb ${m.artwork ? '' : 'placeholder'}">${
            m.artwork ? `<img src="${escapeAttr(m.artwork)}" alt="" loading="lazy">` : '♪'
          }</span>
          <span class="candidate-info">
            <span class="candidate-title">${escapeHtml(m.title)}</span>
            <span class="candidate-artist">${escapeHtml(m.artist)}${
            m.album ? ` · ${escapeHtml(m.album)}` : ''
          }</span>
          </span>
        </button>`
        )
        .join('');
      musicList.querySelectorAll('.candidate-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          const m = music[Number(btn.dataset.idx)];
          if (m) handlers.onMusicPick(m);
        });
      });
      if (musicGroup) musicGroup.hidden = false;
    } else if (musicGroup) {
      musicGroup.hidden = true;
    }
  }
}

// ================================================
// Lyrics Display
// ================================================
/**
 * 歌詞を表示する
 * @param {{title: string, artist: string, lyrics: string}} song
 * @param {{source?: string, saved?: boolean}} [meta]
 */
export function displayLyrics(song, meta = {}) {
  const { source = '', saved = false } = meta;
  const title = song.title || '不明な曲';
  const artist = song.artist || '';

  const songTitle = $('lyrics-song-title');
  const artistName = $('lyrics-artist-name');
  const lyricsText = $('lyrics-text');
  const badge = $('lyrics-source-badge');

  if (songTitle) songTitle.textContent = title;
  if (artistName) artistName.textContent = artist;

  if (lyricsText) {
    lyricsText.innerHTML = convertRuby(song.lyrics || '');
    lyricsText.style.fontSize = `${currentFontSize}px`;
  }

  if (badge) {
    const labels = { lrclib: 'LRCLIB', lyricsovh: 'lyrics.ovh', manual: '手動入力' };
    if (saved) {
      badge.textContent = '保存済み';
      badge.className = 'source-badge saved';
    } else {
      badge.textContent = labels[source] || source || 'API';
      badge.className = 'source-badge';
    }
  }

  // 「Googleで歌詞を検索」は未保存のときだけ表示
  const googleLink = $('btn-google-search-lyrics');
  if (googleLink) {
    googleLink.hidden = saved;
    googleLink.href = `https://www.google.com/search?q=${encodeURIComponent(
      `${title} ${artist} 歌詞`
    )}`;
  }

  closeSongEdit();
  updateFontSizeButtons();
}

// ================================================
// Song (title/artist) edit form
// ================================================
export function openSongEdit(song) {
  const form = $('song-edit-form');
  const t = $('edit-song-title');
  const a = $('edit-song-artist');
  if (t) t.value = song.title || '';
  if (a) a.value = song.artist || '';
  if (form) form.hidden = false;
}

export function closeSongEdit() {
  const form = $('song-edit-form');
  if (form) form.hidden = true;
}

export function getSongEdit() {
  return {
    title: ($('edit-song-title')?.value || '').trim(),
    artist: ($('edit-song-artist')?.value || '').trim(),
  };
}

// ================================================
// Font Size Control
// ================================================
export function changeFontSize(direction) {
  if (direction === 'larger') {
    currentFontSize = Math.min(currentFontSize + FONT_SIZE_STEP, FONT_SIZE_MAX);
  } else if (direction === 'smaller') {
    currentFontSize = Math.max(currentFontSize - FONT_SIZE_STEP, FONT_SIZE_MIN);
  } else {
    currentFontSize = FONT_SIZE_DEFAULT;
  }
  try {
    localStorage.setItem(FONT_SIZE_KEY, String(currentFontSize));
  } catch {
    /* ignore */
  }
  const lyricsText = $('lyrics-text');
  if (lyricsText) lyricsText.style.fontSize = `${currentFontSize}px`;
  updateFontSizeButtons();
}

function updateFontSizeButtons() {
  const btnLarger = $('btn-font-larger');
  const btnSmaller = $('btn-font-smaller');
  const label = $('font-size-label');
  if (btnLarger) btnLarger.disabled = currentFontSize >= FONT_SIZE_MAX;
  if (btnSmaller) btnSmaller.disabled = currentFontSize <= FONT_SIZE_MIN;
  if (label) label.textContent = `${currentFontSize}px`;
}

// ================================================
// Not Found / Manual Input
// ================================================
/**
 * @param {string} title
 * @param {{found?: boolean}} [opts] found=true なら「歌詞を編集」モードの文言にする
 */
export function setNotFoundTitle(title, opts = {}) {
  const el = $('not-found-title');
  if (el) el.textContent = title;

  const banner = $('not-found-banner-text');
  if (banner) {
    banner.textContent = opts.found ? '歌詞を編集しています' : '歌詞が見つかりませんでした';
  }

  const googleLink = $('btn-google-search-notfound');
  if (googleLink) {
    googleLink.href = `https://www.google.com/search?q=${encodeURIComponent(`${title} 歌詞`)}`;
  }
}

export function getManualLyrics() {
  return ($('manual-lyrics-input')?.value || '').trim();
}

export function setManualLyrics(text) {
  const el = $('manual-lyrics-input');
  if (el) el.value = text || '';
}

export function clearManualLyrics() {
  setManualLyrics('');
}

// ================================================
// History list
// ================================================
/**
 * @param {object[]} items
 * @param {{
 *   onItemClick: (rec: object) => void,
 *   onToggleFavorite: (rec: object) => void,
 *   onDelete: (rec: object) => void
 * }} handlers
 * @param {{filtered?: boolean}} [state]
 */
export function renderHistory(items, handlers, state = {}) {
  const list = $('history-list');
  const empty = $('history-empty');
  const emptyText = $('history-empty-text');
  if (!list) return;

  if (items.length === 0) {
    list.innerHTML = '';
    if (empty) empty.hidden = false;
    if (emptyText) {
      emptyText.textContent = state.filtered
        ? '条件に一致する曲がありません'
        : 'まだ履歴がありません';
    }
    return;
  }
  if (empty) empty.hidden = true;

  list.innerHTML = items
    .map(
      (rec) => `
    <div class="history-item" data-id="${escapeAttr(rec.id)}">
      <span class="history-item-icon ${rec.artwork_url ? 'has-art' : ''}">${
        rec.artwork_url
          ? `<img src="${escapeAttr(rec.artwork_url)}" alt="" loading="lazy">`
          : '🎵'
      }</span>
      <div class="history-item-info">
        <div class="history-item-title">${escapeHtml(rec.title)}</div>
        <div class="history-item-artist">${escapeHtml(rec.artist || '不明')}</div>
        <div class="history-item-meta">
          <span>${formatDate(rec.last_viewed_at || rec.created_at)}</span>
          <span>·</span>
          <span>${rec.view_count || 1}回</span>
        </div>
      </div>
      <button class="history-fav ${rec.favorite ? 'on' : ''}" data-fav-id="${escapeAttr(
        rec.id
      )}" aria-label="お気に入り" aria-pressed="${rec.favorite ? 'true' : 'false'}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${
          rec.favorite ? 'currentColor' : 'none'
        }" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </button>
      <button class="history-item-delete" data-delete-id="${escapeAttr(
        rec.id
      )}" aria-label="削除">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>`
    )
    .join('');

  list.onclick = (e) => {
    const favBtn = e.target.closest('[data-fav-id]');
    if (favBtn) {
      e.stopPropagation();
      const rec = items.find((r) => String(r.id) === favBtn.dataset.favId);
      if (rec) handlers.onToggleFavorite(rec);
      return;
    }
    const delBtn = e.target.closest('[data-delete-id]');
    if (delBtn) {
      e.stopPropagation();
      const rec = items.find((r) => String(r.id) === delBtn.dataset.deleteId);
      if (rec) handlers.onDelete(rec);
      return;
    }
    const item = e.target.closest('.history-item');
    if (item) {
      const rec = items.find((r) => String(r.id) === item.dataset.id);
      if (rec) handlers.onItemClick(rec);
    }
  };
}

// ================================================
// Toast
// ================================================
let toastTimer = null;
export function showToast(message, duration = 2500) {
  const toast = $('toast');
  const msg = $('toast-message');
  if (!toast || !msg) return;

  if (toastTimer) {
    clearTimeout(toastTimer);
    toast.classList.remove('show');
  }
  msg.textContent = message;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('show'));
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.hidden = true;
    }, 300);
    toastTimer = null;
  }, duration);
}

// ================================================
// Ruby Conversion（歌詞のふりがな表記を <ruby> に変換）
// ================================================
function convertRuby(text) {
  if (!text) return '';

  const rubyTags = [];
  let result = text.replace(/<ruby[\s\S]*?<\/ruby>/gi, (match) => {
    rubyTags.push(match);
    return `\x01${rubyTags.length - 1}\x01`;
  });

  result = result.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );

  result = result.replace(
    /([一-鿿㐀-䶿豈-﫿々぀-ゟ]+)\[([^\]]{1,20})\]/g,
    '<ruby>$1<rt>$2</rt></ruby>'
  );
  result = result.replace(
    /([一-鿿㐀-䶿豈-﫿々぀-ゟ]+)（([぀-ヿ]{1,20})）/g,
    '<ruby>$1<rt>$2</rt></ruby>'
  );
  result = result.replace(
    /([一-鿿㐀-䶿豈-﫿々぀-ゟ]+)\(([぀-ヿ]{1,20})\)/g,
    '<ruby>$1<rt>$2</rt></ruby>'
  );
  result = result.replace(
    /([一-鿿㐀-䶿豈-﫿々][一-鿿㐀-䶿豈-﫿々぀-ゟ]*)[ 　]([぀-ゟ]{2,20})(?![぀-ゟ])/g,
    '<ruby>$1<rt>$2</rt></ruby>'
  );

  result = result.replace(/\n/g, '<br>');
  result = result.replace(/\x01(\d+)\x01/g, (_, i) => rubyTags[Number(i)]);
  return result;
}

// ================================================
// Utility
// ================================================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

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

    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
