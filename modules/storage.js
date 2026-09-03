// ================================================
// LyricSnap — Storage Module
// localStorage を使った歌詞の保存・取得・削除
// ================================================

const STORAGE_KEY = 'lyricsnap_lyrics';

/**
 * タイトルを正規化して一貫したキーにする
 * @param {string} title 
 * @returns {string}
 */
function normalizeTitle(title) {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[【】「」『』（）()[\]]/g, '')
    .replace(/\s*[-–—\/]\s*/g, ' - ');
}

/**
 * 全保存データを取得
 * @returns {Object}
 */
function getAllData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * 全データを保存
 * @param {Object} data 
 */
function setAllData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * タイトルに一致する保存済み歌詞を取得
 * @param {string} title 
 * @returns {{ title: string, artist: string, lyrics: string, savedAt: string } | null}
 */
export function getSavedLyrics(title) {
  const data = getAllData();
  const key = normalizeTitle(title);
  return data[key] || null;
}

/**
 * 歌詞を保存
 * @param {string} title - 曲タイトル（表示用）
 * @param {string} artist - アーティスト名
 * @param {string} lyrics - 歌詞テキスト
 */
export function saveLyrics(title, artist, lyrics) {
  const data = getAllData();
  const key = normalizeTitle(title);
  data[key] = {
    title: title.trim(),
    artist: artist.trim(),
    lyrics: lyrics.trim(),
    savedAt: new Date().toISOString(),
  };
  setAllData(data);
}

/**
 * 全保存済み歌詞をリストで取得（新しい順）
 * @returns {Array<{ key: string, title: string, artist: string, lyrics: string, savedAt: string }>}
 */
export function getAllSaved() {
  const data = getAllData();
  return Object.entries(data)
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

/**
 * 保存済み歌詞を削除
 * @param {string} key - 正規化されたキー
 */
export function deleteSaved(key) {
  const data = getAllData();
  delete data[key];
  setAllData(data);
}

/**
 * 保存件数を取得
 * @returns {number}
 */
export function getSavedCount() {
  return Object.keys(getAllData()).length;
}
