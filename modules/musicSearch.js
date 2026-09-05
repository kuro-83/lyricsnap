// ================================================
// LyricSnap — Music Search Module
// iTunes Search API で曲候補を取得する
//
// iTunes Search API は CORS 非対応のため、ブラウザからは JSONP
// （<script> タグを動的生成し callback で受け取る）で呼び出す。
// APIキー不要。 https://performance-partners.apple.com/search-api
// ================================================

let seq = 0;

/**
 * JSONP リクエスト
 * @param {string} baseUrl - callback パラメータを含まない URL
 * @param {number} [timeoutMs=6000]
 * @returns {Promise<any>}
 */
function jsonp(baseUrl, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const cbName = `__lyricsnap_itunes_cb_${Date.now()}_${++seq}`;
    const script = document.createElement('script');

    const cleanup = () => {
      clearTimeout(timer);
      delete window[cbName];
      script.remove();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, timeoutMs);

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('network error'));
    };

    const sep = baseUrl.includes('?') ? '&' : '?';
    script.src = `${baseUrl}${sep}callback=${cbName}`;
    document.head.appendChild(script);
  });
}

/**
 * @typedef {Object} MusicCandidate
 * @property {string} title   曲名
 * @property {string} artist  アーティスト名
 * @property {string} artwork ジャケット画像URL（なければ ''）
 * @property {string} album   アルバム名
 */

/**
 * 入力文字列から曲候補を検索する
 * @param {string} term
 * @param {number} [limit=8]
 * @returns {Promise<MusicCandidate[]>}
 */
export async function searchMusic(term, limit = 8) {
  const q = (term || '').trim();
  if (q.length < 2) return [];

  const url =
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}` +
    `&media=music&entity=song&limit=${limit}`;

  try {
    const data = await jsonp(url);
    const results = Array.isArray(data?.results) ? data.results : [];
    return results
      .filter((r) => r.trackName && r.artistName)
      .map((r) => ({
        title: r.trackName,
        artist: r.artistName,
        artwork: (r.artworkUrl100 || r.artworkUrl60 || '').replace(
          /\/\d+x\d+bb?\.(jpg|png)$/,
          '/200x200bb.$1'
        ),
        album: r.collectionName || '',
      }));
  } catch (e) {
    console.warn('iTunes search failed:', e);
    return [];
  }
}
