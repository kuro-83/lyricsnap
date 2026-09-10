// ================================================
// LyricSnap 自動モード — Content Script
// YouTube の再生中動画と再生位置を検出して background へ送る
// （isolated world で動作。ページの JS 変数には触れず DOM のみ参照）
// ================================================

(() => {
  'use strict';

  let lastVideoId = null;
  let lastTitleSent = '';
  let lastTimeSent = -1;

  /** URL から現在の動画ID（watch ページのみ） */
  function getVideoId() {
    const u = new URL(location.href);
    if (u.pathname !== '/watch') return null;
    return u.searchParams.get('v');
  }

  /** 動画タイトルを取得（DOM 優先、無ければ document.title を整形） */
  function getTitle() {
    const el = document.querySelector(
      'ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string'
    );
    const domTitle = el && el.textContent ? el.textContent.trim() : '';
    if (domTitle) return domTitle;

    // "(3) 曲名 - アーティスト - YouTube" → "曲名 - アーティスト"
    return document.title
      .replace(/^\(\d+\)\s*/, '')
      .replace(/\s*-\s*YouTube\s*$/, '')
      .trim();
  }

  /** メイン動画要素（広告用の <video> を避ける） */
  function getVideo() {
    return (
      document.querySelector('video.html5-main-video') ||
      document.querySelector('#movie_player video') ||
      document.querySelector('video')
    );
  }

  function send(msg) {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (_) {
      /* 拡張のリロード直後など。無視 */
    }
  }

  function checkVideoChange(force) {
    const videoId = getVideoId();
    if (!videoId) return;
    const title = getTitle();

    if (videoId !== lastVideoId || (force && title && title !== lastTitleSent)) {
      // タイトルがまだ空（DOM 未描画）なら少し待って再試行
      if (!title) {
        setTimeout(() => checkVideoChange(true), 600);
        return;
      }
      lastVideoId = videoId;
      lastTitleSent = title;
      lastTimeSent = -1;
      send({ type: 'video-changed', videoId, title });
    }
  }

  function checkTime() {
    const videoId = getVideoId();
    if (!videoId) return;
    const v = getVideo();
    if (!v || v.paused || v.readyState < 2) return;
    const t = v.currentTime;
    if (Math.abs(t - lastTimeSent) < 0.25) return;
    lastTimeSent = t;
    send({ type: 'time-update', videoId, currentTime: t });
  }

  // YouTube の SPA 遷移完了イベント（取れれば即反応、取れなくてもポーリングが拾う）
  document.addEventListener('yt-navigate-finish', () => setTimeout(() => checkVideoChange(true), 300));
  window.addEventListener('yt-page-data-updated', () => setTimeout(() => checkVideoChange(true), 300));

  // 保険のポーリング
  setInterval(() => checkVideoChange(false), 1000);
  setInterval(checkTime, 500);

  // 初回
  setTimeout(() => checkVideoChange(true), 500);

  // side panel が後から開いたときに現在の曲を再送できるよう、要求に応答する
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'request-current') {
      const videoId = getVideoId();
      if (videoId) {
        sendResponse({ type: 'video-changed', videoId, title: getTitle() });
      } else {
        sendResponse(null);
      }
    }
    return false;
  });
})();
