// ================================================
// LyricSnap — Lyrics Search Module
// 複数APIを使った歌詞検索
// ================================================

/**
 * YouTubeタイトルからアーティスト名と曲名を分離する
 * @param {string} rawTitle 
 * @returns {{ artist: string, title: string, query: string }}
 */
export function parseArtistTitle(rawTitle) {
  const cleaned = rawTitle
    .trim()
    // よくある接尾辞を除去
    .replace(/\s*[\[【（(]?\s*(Official\s*(Music\s*)?Video|MV|PV|公式|Lyric\s*Video|Audio|Full\s*Ver\.?|歌詞付き|歌ってみた|弾いてみた|cover|カバー)\s*[\]】）)]?\s*/gi, '')
    .replace(/\s*[\[【].*?[\]】]\s*/g, ' ')  // 【】内の情報を除去
    .trim();

  // 区切り文字で分割を試みる
  const separators = [
    /\s*[-–—]\s*/,   // ハイフン系
    /\s*[\/／]\s*/,  // スラッシュ
    /\s*[「」]\s*/,  // 鉤括弧（アーティスト「曲名」パターン）
  ];

  for (const sep of separators) {
    const parts = cleaned.split(sep).filter((p) => p.trim().length > 0);
    if (parts.length >= 2) {
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(' ').trim(),
        query: cleaned,
      };
    }
  }

  // 分離できなかった場合
  return {
    artist: '',
    title: cleaned,
    query: cleaned,
  };
}

/**
 * 歌詞を検索する（LRCLIB → lyrics.ovh の順。両者を並列で叩き先に成功した方を採用）
 * @param {string} rawTitle - 曲名（確定済みが望ましい）
 * @param {string} [knownArtist] - 確定済みのアーティスト名（あれば検索精度が上がる）
 * @returns {Promise<{ lyrics: string, artist: string, title: string, source: 'lrclib' | 'lyricsovh' } | null>}
 */
export async function searchLyrics(rawTitle, knownArtist = '') {
  // アーティストが確定していればそれを最優先で使う。無ければタイトル文字列から推定。
  const parsed = knownArtist
    ? {
        artist: knownArtist.trim(),
        title: (rawTitle || '').trim(),
        query: `${knownArtist.trim()} ${(rawTitle || '').trim()}`.trim(),
      }
    : parseArtistTitle(rawTitle);

  // 2. LRCLIBとlyrics.ovhを並列で検索し、先に成功した結果を採用
  const promises = [searchLRCLIB(parsed)];
  if (parsed.artist && parsed.title) {
    promises.push(searchLyricsOvh(parsed.artist, parsed.title));
  }

  // nullを「失敗」として扱うラッパー
  const nonNull = (p) => p.then((r) => (r ? r : Promise.reject(null)));

  try {
    return await Promise.any(promises.map(nonNull));
  } catch {
    // 全API失敗
    return null;
  }
}

/**
 * LRCLIB API で歌詞を検索
 * @param {{ artist: string, title: string, query: string }} parsed
 * @returns {Promise<{ lyrics: string, artist: string, title: string, source: 'lrclib' } | null>}
 */
async function searchLRCLIB(parsed) {
  try {
    const query = parsed.query || `${parsed.artist} ${parsed.title}`;
    const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'LyricSnap/1.0.0 (https://github.com/lyricsnap)',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const results = await response.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    // 最もマッチする結果を取得
    const best = results[0];
    const lyrics = best.plainLyrics || best.syncedLyrics || '';

    if (!lyrics.trim()) return null;

    // syncedLyricsの場合、タイムスタンプを除去
    const cleanLyrics = lyrics
      .replace(/^\[\d{2}:\d{2}\.\d{2,3}\]\s*/gm, '')
      .trim();

    return {
      lyrics: cleanLyrics,
      artist: best.artistName || parsed.artist || '',
      title: best.trackName || parsed.title || '',
      source: 'lrclib',
    };
  } catch (error) {
    console.warn('LRCLIB search failed:', error);
    return null;
  }
}

/**
 * lyrics.ovh API で歌詞を検索
 * @param {string} artist 
 * @param {string} title 
 * @returns {Promise<{ lyrics: string, artist: string, title: string, source: 'lyricsovh' } | null>}
 */
async function searchLyricsOvh(artist, title) {
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.lyrics || !data.lyrics.trim()) return null;

    return {
      lyrics: data.lyrics.trim(),
      artist,
      title,
      source: 'lyricsovh',
    };
  } catch (error) {
    console.warn('lyrics.ovh search failed:', error);
    return null;
  }
}
