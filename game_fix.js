(function () {
  const replacements = [
    ["Ã„â€˜", "\u0111"],
    ["Ã„Â", "\u0110"],
    ["Ã¡ÂºÂ¥", "\u1ea5"],
    ["Ã¡ÂºÂ§", "\u1ea7"],
    ["Ã¡ÂºÂ¡", "\u1ea1"],
    ["Ã¡ÂºÂ£", "\u1ea3"],
    ["Ã¡ÂºÂ¯", "\u1eaf"],
    ["Ã¡ÂºÂ·", "\u1eb7"],
    ["Ã¡ÂºÂ¿", "\u1ebf"],
    ["Ã¡Â»Â", "\u1ec1"],
    ["Ã¡Â»â€¡", "\u1ec7"],
    ["Ã¡Â»Æ’", "\u1ec3"],
    ["Ã¡Â»Â", "\u1ecf"],
    ["Ã¡Â»â€˜", "\u1ed1"],
    ["Ã¡Â»â€œ", "\u1ed3"],
    ["Ã¡Â»â„¢", "\u1ed9"],
    ["Ã¡Â»â€º", "\u1edb"],
    ["Ã¡Â»Â", "\u1edd"],
    ["Ã¡Â»Â£", "\u1ee3"],
    ["Ã¡Â»â€¹", "\u1ecb"],
    ["Ã¡Â»â€°", "\u1ec9"],
    ["Ã¡Â»Â©", "\u1ee9"],
    ["Ã¡Â»Â«", "\u1eeb"],
    ["Ã¡Â»Â±", "\u1ef1"],
    ["Ã¡Â»Â­", "\u1eed"],
    ["Ã¡Â»Â¥", "\u1ee5"],
    ["Ã¡Â»Â§", "\u1ee7"],
    ["Ã¡Â»Â", "\u1ecd"],
    ["Ãƒ ", "\u00e0"],
    ["ÃƒÂ¡", "\u00e1"],
    ["ÃƒÂ¢", "\u00e2"],
    ["ÃƒÂ£", "\u00e3"],
    ["ÃƒÂ¨", "\u00e8"],
    ["ÃƒÂ©", "\u00e9"],
    ["ÃƒÂª", "\u00ea"],
    ["ÃƒÂ¬", "\u00ec"],
    ["ÃƒÂ­", "\u00ed"],
    ["ÃƒÂ²", "\u00f2"],
    ["ÃƒÂ³", "\u00f3"],
    ["ÃƒÂ´", "\u00f4"],
    ["ÃƒÂµ", "\u00f5"],
    ["ÃƒÂ¹", "\u00f9"],
    ["ÃƒÂº", "\u00fa"],
    ["ÃƒÂ½", "\u00fd"],
    ["Ã¢â‚¬Â¢", "\u2022"],
    ["Ã¢â‚¬â€", "\u2014"],
    ["Ã¢â€ Â", "\u2190"]
  ];

  function sanitizeText(value) {
    let text = String(value ?? "");
    for (const [bad, good] of replacements) {
      text = text.split(bad).join(good);
    }
    return text;
  }

  function sanitizeTree(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      const next = sanitizeText(root.nodeValue);
      if (next !== root.nodeValue) root.nodeValue = next;
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root !== document && root !== document.body) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const next = sanitizeText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    });

    root.querySelectorAll?.("input[placeholder], textarea[placeholder]").forEach((el) => {
      const next = sanitizeText(el.placeholder);
      if (next !== el.placeholder) el.placeholder = next;
    });
  }

  function applyKnownLabels() {
    document.title = "Game thi \u0111\u1ea5u";
    const heroTitle = document.querySelector(".hero-copy h1");
    if (heroTitle) heroTitle.textContent = "\u0110\u1ea5u tr\u01b0\u1eddng tri th\u1ee9c";
    const heroDesc = document.querySelector(".hero-copy p");
    if (heroDesc) {
      heroDesc.textContent = "Bi\u1ebfn vi\u1ec7c luy\u1ec7n \u0111\u1ec1 th\u00e0nh m\u1ed9t tr\u1eadn \u0111\u1ea5u th\u1eadt s\u1ef1. H\u1ecdc sinh c\u00f3 th\u1ec3 t\u1ea1o ph\u00f2ng, m\u1eddi b\u1ea1n v\u00e0o thi, tr\u1ea3 l\u1eddi c\u00e2u h\u1ecfi nhanh \u0111\u1ec3 leo h\u1ea1ng v\u00e0 xem b\u1ea3ng x\u1ebfp h\u1ea1ng ngay trong ph\u00f2ng.";
    }
    const modeBadge = Array.from(document.querySelectorAll(".hero-badge")).find((el) => el.textContent.includes("Mode:"));
    if (modeBadge) {
      modeBadge.textContent = "Mode: Quick / Friends / Ranked / Survival / Speed";
    }
  }

  function applyAll(root = document.body) {
    sanitizeTree(root);
    applyKnownLabels();
  }

  const rawAlert = window.alert.bind(window);
  const rawConfirm = window.confirm.bind(window);
  const rawPrompt = window.prompt.bind(window);

  window.alert = (message) => rawAlert(sanitizeText(message));
  window.confirm = (message) => rawConfirm(sanitizeText(message));
  window.prompt = (message, value) => rawPrompt(sanitizeText(message), sanitizeText(value));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyAll);
  } else {
    applyAll();
  }

  let scheduledNodes = [];
  let scheduled = false;

  function flushScheduledNodes() {
    scheduled = false;
    const nodes = scheduledNodes;
    scheduledNodes = [];
    nodes.forEach((node) => sanitizeTree(node));
    applyKnownLabels();
  }

  function scheduleSanitize(node) {
    if (!node) return;
    scheduledNodes.push(node);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(flushScheduledNodes);
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
          scheduleSanitize(node);
        }
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
