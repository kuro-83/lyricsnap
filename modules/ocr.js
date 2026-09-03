// ================================================
// LyricSnap — OCR Module
// Tesseract.js を使った画像からのテキスト認識
// ================================================

/** @type {Tesseract.Worker | null} */
let worker = null;

/**
 * OCRワーカーを初期化（シングルトン）
 * @returns {Promise<Tesseract.Worker>}
 */
async function getWorker() {
  if (worker) return worker;

  // Tesseract.js がグローバルに読み込まれていることを確認
  const Tesseract = window.Tesseract;
  if (!Tesseract) {
    throw new Error('Tesseract.js がロードされていません');
  }

  worker = await Tesseract.createWorker('jpn+eng', 1, {
    logger: () => {}, // デフォルトは無効（呼び出し側で進捗管理）
  });

  return worker;
}

/**
 * 画像からテキストを認識する
 * @param {File|Blob|string} image - 画像ファイル、Blob、またはURL
 * @param {(progress: { status: string, progress: number }) => void} [onProgress] - 進捗コールバック
 * @returns {Promise<string>} 認識されたテキスト
 */
export async function recognizeText(image, onProgress) {
  const Tesseract = window.Tesseract;
  if (!Tesseract) {
    throw new Error('Tesseract.js がロードされていません');
  }

  // 進捗通知付きでワーカーを作成（毎回新規で進捗を正しく取得）
  const w = await Tesseract.createWorker('jpn+eng', 1, {
    logger: (m) => {
      if (onProgress && m.status === 'recognizing text') {
        onProgress({
          status: m.status,
          progress: m.progress,
        });
      }
    },
  });

  try {
    const { data } = await w.recognize(image);
    return data.text;
  } finally {
    await w.terminate();
  }
}

/**
 * OCRで読み取ったテキストからYouTubeの動画タイトルを抽出する
 * @param {string} rawText - OCRの生テキスト
 * @returns {string} 推定されたタイトル
 */
export function extractTitle(rawText) {
  // 行に分割してフィルタリング
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return '';

  // YouTubeのUIテキストを除外するパターン
  const uiPatterns = [
    /^(再生回数|回視聴|万回|億回)/,
    /チャンネル登録/,
    /^(高評価|低評価|共有|保存|報告)/,
    /^(コメント|件のコメント)/,
    /^(自動再生|次の動画|関連動画)/,
    /^\d+:\d+/, // タイムスタンプ
    /^(概要欄|もっと見る|もっと読む)/,
    /^(ライブ配信|プレミア公開)/,
    /^(チャプター|字幕)/,
    /^(ショート|Shorts)/,
    /^(ホーム|探索|ライブラリ|登録チャンネル)/,
    /^(YouTube|Google)/i,
    /^(Music|Official|Video|MV|PV|Lyrics?)$/i,
    /^\d+$/,  // 数字のみの行
    /^[\d,.]+\s*(回|件|人|万|億)/, // 再生回数・登録者数
    /^(ago|前|時間前|日前|週間前|か月前|年前)/,
    /^(公開済み|ストリーミング)/,
    /^(すべて再生|シャッフル)/,
  ];

  // スコアリング: タイトルらしさを評価
  const candidates = lines
    .filter((line) => {
      // UI文字列を除外
      if (uiPatterns.some((p) => p.test(line))) return false;
      // 短すぎる行を除外
      if (line.length < 3) return false;
      // 記号のみの行を除外
      if (/^[^\p{L}\p{N}]+$/u.test(line)) return false;
      return true;
    })
    .map((line) => {
      let score = 0;

      // 文字数に基づくスコア（タイトルは適度な長さ）
      if (line.length >= 5 && line.length <= 100) score += 3;
      if (line.length >= 10) score += 2;

      // アーティスト - 曲名 のパターン
      if (/[-–—\/]/.test(line)) score += 3;

      // 日本語を含む（日本語楽曲の場合）
      if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(line)) score += 1;

      // 括弧付きの情報（feat., Official Video等）
      if (/[()（）[\]【】「」]/.test(line)) score += 1;

      // 最初の方の行を優先（タイトルは通常上部にある）
      const lineIndex = lines.indexOf(line);
      if (lineIndex <= 2) score += 3;
      else if (lineIndex <= 5) score += 1;

      return { text: line, score };
    })
    .sort((a, b) => b.score - a.score);

  const raw = candidates.length > 0 ? candidates[0].text : lines[0] || '';
  // OCRが日本語テキストに挿入する余計なスペースを除去（半角・全角ともに）
  return raw.replace(/[\s\u3000]+/g, '');
}

/**
 * 画像ファイルを読み込んでプレビュー用のURLを生成
 * @param {File} file 
 * @returns {string} Object URL
 */
export function createPreviewURL(file) {
  return URL.createObjectURL(file);
}

/**
 * プレビューURLを解放
 * @param {string} url 
 */
export function revokePreviewURL(url) {
  URL.revokeObjectURL(url);
}
