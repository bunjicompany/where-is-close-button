async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
}

async function runFinder(tabId) {
  // メインフレームに注入・実行
  await chrome.scripting.executeScript({ target: { tabId, allFrames: false }, files: ["content.js"] }).catch(() => {});
  await chrome.scripting.executeScript({ target: { tabId, allFrames: false }, func: () => window.realCloseButtonFinder?.clear() }).catch(() => {});

  const mainResults = await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    func: () => window.realCloseButtonFinder?.find()
  });

  // 同一オリジンiframeのframeIdをallFrames:trueのfind結果から特定
  // （注入済みのフレームだけresult!=nullになる）
  const mainFrameId = mainResults[0]?.frameId ?? 0;
  const mainHasCandidates = mainResults.some(r => (r.result?.candidates||[]).length > 0);

  // webNavigationで全フレームを取得し、同一オリジンiframeのframeIdを特定
  const pageUrl = new URL((await chrome.tabs.get(tabId)).url);
  const allFrames = await chrome.webNavigation.getAllFrames({ tabId }).catch(() => []);
  const sameOriginFrameIds = allFrames
    .filter(f => {
      if (f.frameId === 0) return false;
      if (f.url === "about:blank" || f.url === "") return true; // src無しiframeは同一オリジン扱い
      try { return new URL(f.url).origin === pageUrl.origin; } catch(e) { return false; }
    })
    .map(f => f.frameId);

  console.log("[runFinder] sameOriginFrameIds:", sameOriginFrameIds);

  let iframeResults = [];
  for (const frameId of sameOriginFrameIds) {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: ["content.js"] }).catch(() => {});
    const r = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: () => window.realCloseButtonFinder?.find()
    }).catch(() => []);
    iframeResults.push(...r);
  }

  const allResults = [...mainResults, ...iframeResults];

  const frameResults = allResults.filter((result) => result.result);
  const hasExplicitCloseText = frameResults.some((result) =>
    (result.result.candidates || []).some((candidate) => candidate.explicitCloseText)
  );
  const candidates = frameResults
    .flatMap((result) =>
      (result.result.candidates || []).map((candidate) => ({
        ...candidate,
        frameId: result.frameId
      }))
    )
    .filter((candidate, _index, allCandidates) => {
      const frameHasExplicitCloseText = allCandidates.some(
        (item) => item.frameId === candidate.frameId && item.explicitCloseText
      );
      return !(hasExplicitCloseText || frameHasExplicitCloseText) || candidate.explicitCloseText;
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.explicitCloseText)) - Number(Boolean(a.explicitCloseText)) ||
        Number(Boolean(b.clickableNow)) - Number(Boolean(a.clickableNow)) ||
        (b.orderScore || b.score) - (a.orderScore || a.score) ||
        b.score - a.score
    )
    .slice(0, 3)
    .map((candidate, index) => ({
      ...candidate,
      label: index + 1
    }));

  const selectedByFrame = new Map();
  for (const candidate of candidates) {
    if (!selectedByFrame.has(candidate.frameId)) selectedByFrame.set(candidate.frameId, []);
    selectedByFrame.get(candidate.frameId).push({
      index: candidate.index,
      label: candidate.label
    });
  }

  let shownCount = 0;
  for (const [frameId, items] of selectedByFrame) {
    const showResults = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: (selectedItems) => window.realCloseButtonFinder?.show(selectedItems),
      args: [items]
    });
    shownCount += showResults.reduce((count, result) => count + (result.result?.count || 0), 0);
  }

  const selectedFrameIds = new Set(selectedByFrame.keys());
  for (const result of frameResults) {
    if (selectedFrameIds.has(result.frameId)) continue;
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [result.frameId] },
      func: () => window.realCloseButtonFinder?.clear()
    });
  }

  return {
    frames: frameResults.length,
    candidates: shownCount
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "RUN_FINDER") return false;

  getActiveTab()
    .then((tab) => {
      if (!tab?.id) throw new Error("アクティブなタブが見つかりません。");
      return runFinder(tab.id);
    })
    .then((summary) => sendResponse({ ok: true, summary }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "find-close-buttons") return;
  const tab = await getActiveTab();
  if (tab?.id) await runFinder(tab.id);
});
