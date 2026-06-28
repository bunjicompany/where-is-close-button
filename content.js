(() => {
  const ROOT_ID = "real-close-button-finder-root";
  const MARK_DURATION_MS = 12000;
  const CLOSE_WORDS = [
    "close",
    "dismiss",
    "hide",
    "skip",
    "no thanks",
    "not now",
    "閉じる",
    "とじる",
    "閉じ",
    "スキップ",
    "キャンセル",
    "不要",
    "あとで"
  ];
  const CLOSE_SYMBOLS = ["×", "✕", "✖", "✗", "╳"];
  const DECORATIVE_X_RE = /^[xX]$/;
  const POPUP_CONTEXT_RE = /(^|[^a-z0-9])(ad|ads|banner|interstitial|modal|overlay|popup)([^a-z0-9]|$)/i;
  const CLOSE_HINT_RE = /close|dismiss|cross|(^|[^a-z0-9])x([^a-z0-9]|$)/i;
  const CLOSE_CHECK_DELAYS_MS = [350, 1000];

  let renderedCandidates = [];
  let markerClickHandler = null;

  function removeRoot() {
    document.getElementById(ROOT_ID)?.remove();
    renderedCandidates = [];
    if (markerClickHandler) {
      document.removeEventListener("click", markerClickHandler, true);
      markerClickHandler = null;
    }
  }

  function isVisible(element, rect) {
    const style = getComputedStyle(element);
    return (
      rect.width >= 6 &&
      rect.height >= 6 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < innerHeight &&
      rect.left < innerWidth &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity || "1") > 0.05
    );
  }

  function textFor(element) {
    const ownText = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ");
    const pseudoText = ["::before", "::after"]
      .map((pseudoElement) => getComputedStyle(element, pseudoElement).content)
      .filter((content) => content && content !== "none" && content !== "normal")
      .map((content) => content.replace(/^["']|["']$/g, ""))
      .join(" ");

    return [
      ownText,
      pseudoText,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("alt")
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
  }

  function compactVisibleTextFor(element) {
    const text =
      element instanceof HTMLElement
        ? element.innerText
        : element.textContent;
    return (text || "").replace(/\s+/g, "").trim().slice(0, 80);
  }

  function contextFor(element) {
    const parts = [];
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      parts.push(node.getAttribute("class"), node.id, node.getAttribute("role"));
    }
    return parts.filter(Boolean).join(" ");
  }

  function closeHintFor(element) {
    return [
      element.getAttribute("class"),
      element.id,
      element.getAttribute("src"),
      element.getAttribute("currentSrc"),
      element.getAttribute("href")
    ]
      .filter(Boolean)
      .join(" ");
  }

  function hasStandaloneCloseSymbol(text) {
    const compact = text.trim().replace(/\s+/g, "");
    return compact.length > 0 && [...compact].every((char) => CLOSE_SYMBOLS.includes(char));
  }

  function isCloseWordOnly(text) {
    const compact = text.trim().replace(/\s+/g, "").toLowerCase();
    return CLOSE_WORDS.some((word) => compact === word.replace(/\s+/g, ""));
  }

  function isClickable(element, style) {
    return (
      element.matches("button,a,input,[role='button'],[onclick]") ||
      style.cursor === "pointer" ||
      element.tabIndex >= 0
    );
  }

  function cornerScore(rect) {
    const nearTop = rect.top <= 140;
    const nearBottom = innerHeight - rect.bottom <= 140;
    const nearRight = innerWidth - rect.right <= 140;
    const nearLeft = rect.left <= 140;
    return Number((nearTop || nearBottom) && (nearLeft || nearRight));
  }

  function isNearFloatingLayerCorner(element, rect) {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      const nodeRect = node.getBoundingClientRect();
      const context = contextFor(node);
      const isFloatingLayer =
        style.position === "fixed" ||
        style.position === "sticky" ||
        style.position === "absolute" ||
        zIndexValue(style) > 0 ||
        POPUP_CONTEXT_RE.test(context);

      if (!isFloatingLayer || nodeRect.width < rect.width * 2 || nodeRect.height < rect.height * 2) continue;

      const nearTop = Math.abs(rect.top - nodeRect.top) <= 18;
      const nearBottom = Math.abs(rect.bottom - nodeRect.bottom) <= 18;
      const nearRight = Math.abs(rect.right - nodeRect.right) <= 40;
      const nearLeft = Math.abs(rect.left - nodeRect.left) <= 40;

      if ((nearTop || nearBottom) && (nearLeft || nearRight)) return true;
    }

    return false;
  }

  function isRelatedElement(element, other) {
    return Boolean(
      other &&
        (element === other ||
          element.contains(other) ||
          other.contains(element))
    );
  }

  function isCurrentlyClickable(element, rect) {
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    return isRelatedElement(element, document.elementFromPoint(x, y));
  }

  function zIndexValue(style) {
    const zIndex = Number.parseInt(style.zIndex, 10);
    return Number.isFinite(zIndex) ? zIndex : 0;
  }

  function centerScore(rect) {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxDistance = Math.hypot(innerWidth / 2, innerHeight / 2) || 1;
    const distance = Math.hypot(centerX - innerWidth / 2, centerY - innerHeight / 2);
    return Math.max(0, 1 - distance / maxDistance);
  }

  function zIndexScore(zIndex) {
    if (zIndex >= 2147480000) return 120;
    if (zIndex >= 100000) return 105;
    if (zIndex >= 1000) return 85;
    if (zIndex >= 10) return Math.min(60, 25 + Math.log10(zIndex + 1) * 10);
    return 0;
  }

  function layerInfoFor(element) {
    let maxZIndex = 0;
    let layerScore = 0;
    let hasBlockingLayer = false;

    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const zIndex = zIndexValue(style);
      const context = contextFor(node);
      const isPopupLayer =
        POPUP_CONTEXT_RE.test(context) ||
        node.getAttribute("role") === "dialog" ||
        node.getAttribute("aria-modal") === "true";
      const isFloatingLayer =
        style.position === "fixed" ||
        style.position === "sticky" ||
        (style.position === "absolute" && zIndex > 0);

      maxZIndex = Math.max(maxZIndex, zIndex);

      if (!isPopupLayer && !isFloatingLayer && zIndex <= 0) continue;

      const areaRatio = Math.min(1, (rect.width * rect.height) / Math.max(1, innerWidth * innerHeight));
      const blocksScreen =
        style.position === "fixed" ||
        node.getAttribute("role") === "dialog" ||
        node.getAttribute("aria-modal") === "true" ||
        areaRatio >= 0.08;
      if (blocksScreen) hasBlockingLayer = true;

      const candidateLayerScore =
        zIndexScore(zIndex) +
        centerScore(rect) * 35 +
        areaRatio * 18 +
        (isPopupLayer ? 35 : 0) +
        (isFloatingLayer ? 12 : 0);

      layerScore = Math.max(layerScore, candidateLayerScore);
    }

    return {
      maxZIndex,
      layerScore,
      hasBlockingLayer
    };
  }

  function scoreElement(element) {
    if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return null;

    const rect = element.getBoundingClientRect();
    if (!isVisible(element, rect)) return null;

    const style = getComputedStyle(element);
    const layer = layerInfoFor(element);
    const rawText = textFor(element);
    const normalized = rawText.toLowerCase();
    const context = contextFor(element);
    const area = rect.width * rect.height;
    const squareish = Math.abs(rect.width - rect.height) <= Math.max(rect.width, rect.height) * 0.65;
    const smallish = rect.width <= 96 && rect.height <= 96;
    const compactVisibleText = compactVisibleTextFor(element).toLowerCase();
    const tinyIconish = rect.width >= 10 && rect.height >= 10 && rect.width <= 44 && rect.height <= 44 && squareish;

    let score = 0;
    let reason = "";
    let hasCloseEvidence = false;
    let explicitCloseText = false;

    if (hasStandaloneCloseSymbol(rawText)) {
      score += 60;
      reason = "×記号";
      hasCloseEvidence = true;
    }

    if (DECORATIVE_X_RE.test(rawText.trim()) && smallish) {
      score += 45;
      reason = reason || "X表記";
      hasCloseEvidence = true;
    }

    const matchedWord = CLOSE_WORDS.find((word) => normalized.includes(word));
    if (matchedWord) {
      score += 45;
      reason = reason || matchedWord;
      hasCloseEvidence = true;
      explicitCloseText = isCloseWordOnly(rawText);
    }

    const matchedVisibleWord = CLOSE_WORDS.find((word) => compactVisibleText.includes(word.replace(/\s+/g, "")));
    if (!hasCloseEvidence && matchedVisibleWord && isCloseWordOnly(compactVisibleText) && rect.width <= 260 && rect.height <= 180) {
      score += 58;
      reason = matchedVisibleWord;
      hasCloseEvidence = true;
      explicitCloseText = true;
    }

    if (!hasCloseEvidence && tinyIconish && CLOSE_HINT_RE.test(closeHintFor(element))) {
      score += 46;
      reason = "閉じるアイコン";
      hasCloseEvidence = true;
    }

    if (!hasCloseEvidence && tinyIconish && isClickable(element, style) && isNearFloatingLayerCorner(element, rect)) {
      score += 43;
      reason = "広告の角アイコン";
      hasCloseEvidence = true;
    }

    if (isClickable(element, style)) score += 18;
    if (style.position === "fixed" || style.position === "sticky") score += 14;
    if (style.position === "absolute") score += 8;
    if (cornerScore(rect)) score += 18;
    if (smallish && squareish) score += 12;
    if (area > 13000) score -= 24;
    if (normalized.includes("download") || normalized.includes("install") || normalized.includes("購入")) score -= 35;

    if (layer.maxZIndex > 10) score += Math.min(16, Math.log10(layer.maxZIndex + 1) * 4);

    if (!hasCloseEvidence) return null;
    if (!layer.hasBlockingLayer) return null;
    if (score < 42) return null;
    const clickableNow = isCurrentlyClickable(element, rect);

    return {
      element,
      rect: {
        left: Math.max(0, rect.left),
        top: Math.max(0, rect.top),
        width: rect.width,
        height: rect.height
      },
      score,
      orderScore: score + layer.layerScore + (clickableNow ? 200 : 0) + (explicitCloseText ? 260 : 0),
      clickableNow,
      explicitCloseText,
      reason: reason || "閉じる候補"
    };
  }

  function getCandidates() {
    const selectors = [
      "button",
      "a",
      "img",
      "svg",
      "input",
      "[role='button']",
      "[aria-label]",
      "[title]",
      "[onclick]",
      "[class*='close' i]",
      "[id*='close' i]",
      "[class*='dismiss' i]",
      "[id*='dismiss' i]",
      "[class*='skip' i]",
      "[id*='skip' i]"
    ].join(",");

    const elements = new Set([...document.querySelectorAll(selectors)]);

    for (const element of document.querySelectorAll("body *")) {
      const rect = element.getBoundingClientRect();
      const text = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join(" ")
        .trim();
      const compactVisibleText = compactVisibleTextFor(element).toLowerCase();
      const closeWordOnlyElement = isCloseWordOnly(compactVisibleText) && rect.width <= 260 && rect.height <= 180;

      if (text.length <= 12 && (CLOSE_SYMBOLS.some((symbol) => text.includes(symbol)) || DECORATIVE_X_RE.test(text))) {
        elements.add(element);
      }
      if (closeWordOnlyElement) {
        elements.add(element);
      }
    }

    const candidates = [...elements]
      .map(scoreElement)
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    const unique = [];
    for (const candidate of candidates) {
      const overlaps = unique.some((item) => {
        const a = item.rect;
        const b = candidate.rect;
        return Math.abs(a.left - b.left) < 8 && Math.abs(a.top - b.top) < 8;
      });
      if (!overlaps) unique.push(candidate);
      if (unique.length >= 5) break;
    }

    return unique;
  }

  function markerStyle() {
    return `
      #${ROOT_ID} {
        all: initial;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
        font-family: Arial, sans-serif;
      }
      #${ROOT_ID} .rcbf-ring {
        position: fixed;
        box-sizing: border-box;
        border: 4px solid #ff2d55;
        border-radius: 999px;
        box-shadow: 0 0 0 9999px rgba(0,0,0,0.08), 0 0 0 3px #fff, 0 0 24px rgba(255,45,85,0.7);
        animation: rcbf-pulse 1s ease-in-out infinite;
      }
      #${ROOT_ID} .rcbf-label {
        position: fixed;
        min-width: 24px;
        height: 24px;
        padding: 0 7px;
        border-radius: 999px;
        background: #ff2d55;
        color: #fff;
        font: 700 14px/24px Arial, sans-serif;
        text-align: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.25);
      }
      #${ROOT_ID} .rcbf-toast {
        position: fixed;
        left: 50%;
        bottom: 22px;
        transform: translateX(-50%);
        max-width: min(520px, calc(100vw - 32px));
        padding: 10px 14px;
        border-radius: 8px;
        background: rgba(20, 22, 28, 0.94);
        color: #fff;
        font: 13px/1.5 Arial, sans-serif;
        text-align: center;
        white-space: pre-line;
        box-shadow: 0 8px 28px rgba(0,0,0,0.35);
      }
      @keyframes rcbf-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.08); }
      }
    `;
  }

  function removeMarker(markerId) {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    root.querySelectorAll(`[data-rcbf-marker="${markerId}"]`).forEach((node) => node.remove());
    renderedCandidates = renderedCandidates.filter((item) => item.markerId !== markerId);

    if (!renderedCandidates.length) removeRoot();
  }

  function isElementStillVisible(element) {
    if (!element?.isConnected) return false;
    return isVisible(element, element.getBoundingClientRect());
  }

  function markerAtPoint(x, y) {
    return renderedCandidates.find((candidate) => {
      const dx = x - candidate.center.x;
      const dy = y - candidate.center.y;
      return Math.hypot(dx, dy) <= candidate.radius;
    });
  }

  function watchMarkerClicks() {
    if (markerClickHandler) document.removeEventListener("click", markerClickHandler, true);

    markerClickHandler = (event) => {
      const candidate = markerAtPoint(event.clientX, event.clientY);
      if (!candidate) return;

      for (const delay of CLOSE_CHECK_DELAYS_MS) {
        setTimeout(() => {
          if (!isElementStillVisible(candidate.element)) removeMarker(candidate.markerId);
        }, delay);
      }
    };

    document.addEventListener("click", markerClickHandler, true);
  }

  function render(candidates) {
    removeRoot();

    const root = document.createElement("div");
    root.id = ROOT_ID;

    const style = document.createElement("style");
    style.textContent = markerStyle();
    root.append(style);

    renderedCandidates = candidates.map((candidate, index) => {
      const size = Math.max(28, Math.min(112, Math.max(candidate.rect.width, candidate.rect.height) + 20));
      const left = candidate.rect.left + candidate.rect.width / 2 - size / 2;
      const top = candidate.rect.top + candidate.rect.height / 2 - size / 2;
      const markerId = `marker-${index}`;

      const ring = document.createElement("div");
      ring.className = "rcbf-ring";
      ring.dataset.rcbfMarker = markerId;
      ring.style.left = `${left}px`;
      ring.style.top = `${top}px`;
      ring.style.width = `${size}px`;
      ring.style.height = `${size}px`;
      ring.title = `${candidate.reason} / score ${Math.round(candidate.score)}`;

      const label = document.createElement("div");
      label.className = "rcbf-label";
      label.dataset.rcbfMarker = markerId;
      label.textContent = String(candidate.label || index + 1);
      label.style.left = `${Math.max(6, left - 6)}px`;
      label.style.top = `${Math.max(6, top - 28)}px`;

      root.append(ring, label);
      return {
        ...candidate,
        markerId,
        center: {
          x: candidate.rect.left + candidate.rect.width / 2,
          y: candidate.rect.top + candidate.rect.height / 2
        },
        radius: size / 2
      };
    });

    const toast = document.createElement("div");
    toast.className = "rcbf-toast";
    toast.textContent = candidates.length
      ? `閉じるボタン候補を ${candidates.length} 件見つけました。\n番号順に赤いリングの中心をクリックしてみてください。`
      : "このフレームでは閉じるボタン候補を見つけられませんでした。";
    root.append(toast);

    document.documentElement.append(root);
    watchMarkerClicks();
    setTimeout(removeRoot, MARK_DURATION_MS);
  }

  window.realCloseButtonFinder = {
    find() {
      removeRoot();
      const candidates = getCandidates();
      window.realCloseButtonFinder.lastCandidates = candidates;
      return {
        count: candidates.length,
        candidates: candidates.map((candidate, index) => ({
          index,
          score: candidate.score,
          orderScore: candidate.orderScore,
          clickableNow: candidate.clickableNow,
          explicitCloseText: candidate.explicitCloseText,
          reason: candidate.reason,
          rect: candidate.rect
        }))
      };
    },
    show(items) {
      const candidates = window.realCloseButtonFinder.lastCandidates || getCandidates();
      const selected = Array.isArray(items)
        ? items
            .map((item) => {
              const index = typeof item === "number" ? item : item.index;
              const candidate = candidates[index];
              if (!candidate) return null;
              return {
                ...candidate,
                label: typeof item === "number" ? undefined : item.label
              };
            })
            .filter(Boolean)
        : candidates;
      render(selected);
      return { count: selected.length };
    },
    clear() {
      removeRoot();
      return { count: 0 };
    },
    run() {
      const candidates = getCandidates();
      render(candidates);
      return { count: candidates.length };
    }
  };
})();
