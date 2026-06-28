const button = document.getElementById("findButton");
const status = document.getElementById("status");

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "候補を探しています...";

  const response = await chrome.runtime.sendMessage({ type: "RUN_FINDER" });

  if (response?.ok) {
    const count = response.summary?.candidates || 0;
    status.textContent = count
      ? `${count} 件の候補を表示しました。番号順に確認してください。`
      : "候補が見つかりませんでした。";
  } else {
    status.textContent = response?.error || "このページでは実行できませんでした。";
  }

  button.disabled = false;
});
