// ================================================
// LyricSnap 自動モード — Background (Service Worker)
// content script のメッセージを side panel へ中継するだけ
// ================================================

// ツールバーアイコンのクリックで side panel を開く
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.warn('setPanelBehavior failed', e));
});
chrome.runtime.onStartup?.addListener?.(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// content script（YouTube タブ）→ side panel へ中継
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'video-changed' || msg.type === 'time-update') {
    // side panel は拡張ページなので runtime.sendMessage で届く。
    // 開いていなければ "Receiving end does not exist" になるので握りつぶす。
    chrome.runtime
      .sendMessage({ ...msg, _fromTabId: sender.tab && sender.tab.id })
      .catch(() => {});
    return;
  }

  // side panel が開いた直後 → 現在 YouTube タブで再生中の曲を問い合わせて中継
  if (msg.type === 'panel-ready') {
    chrome.tabs.query({ url: '*://www.youtube.com/*' }, (tabs) => {
      const list = tabs || [];
      // 音が鳴っているタブを優先、無ければ全 YouTube タブに問い合わせる
      const audible = list.filter((t) => t.audible);
      for (const tab of audible.length ? audible : list) {
        chrome.tabs.sendMessage(tab.id, { type: 'request-current' }, (resp) => {
          void chrome.runtime.lastError; // 応答なしは無視
          if (resp && resp.type) chrome.runtime.sendMessage(resp).catch(() => {});
        });
      }
    });
  }
});
