// ================================================
// LyricSnap 自動モード — Side Panel
// iframe に既存 Web アプリを埋め込み、background からのメッセージを
// postMessage で Web アプリへ転送するだけ
// ================================================

const APP_ORIGIN = 'https://kuro-83.github.io';
const frame = document.getElementById('frame');

let appReady = false;
/** iframe(app) の準備完了前に来たメッセージを貯めておく */
const pending = [];

function forward(payload) {
  if (!frame.contentWindow) return;
  if (!appReady) {
    pending.push(payload);
    return;
  }
  frame.contentWindow.postMessage(payload, APP_ORIGIN);
}

// background（= content script 由来）からのメッセージ
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'video-changed') {
    forward({ type: 'lyricsnap:autoDetect', videoId: msg.videoId, title: msg.title });
  } else if (msg.type === 'time-update') {
    forward({ type: 'lyricsnap:timeUpdate', videoId: msg.videoId, currentTime: msg.currentTime });
  }
});

// Web アプリからの「準備できた」通知
window.addEventListener('message', (e) => {
  if (e.origin !== APP_ORIGIN) return;
  if (e.data && e.data.type === 'lyricsnap:ready') {
    appReady = true;
    while (pending.length) {
      frame.contentWindow.postMessage(pending.shift(), APP_ORIGIN);
    }
    // 準備完了後、現在の再生曲をもう一度要求
    chrome.runtime.sendMessage({ type: 'panel-ready' }).catch(() => {});
  }
});

// iframe ロード失敗時の表示
frame.addEventListener('error', () => {
  document.getElementById('offline').style.display = 'flex';
});

// パネルが開いたことを background に伝える（現在の再生曲を取りに行かせる）
chrome.runtime.sendMessage({ type: 'panel-ready' }).catch(() => {});

// フォールバック: ready が来なくても数秒後には送信を開始する
setTimeout(() => {
  if (!appReady) {
    appReady = true;
    while (pending.length) {
      frame.contentWindow.postMessage(pending.shift(), APP_ORIGIN);
    }
  }
}, 5000);
