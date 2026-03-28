(function () {
  const replacements = [
    ["Ä‘", "đ"],
    ["Ä", "Đ"],
    ["áº¥", "ấ"],
    ["áº§", "ầ"],
    ["áº¡", "ạ"],
    ["áº£", "ả"],
    ["áº¯", "ắ"],
    ["áº·", "ặ"],
    ["áº¿", "ế"],
    ["á»", "ề"],
    ["á»‡", "ệ"],
    ["á»ƒ", "ể"],
    ["á»", "ỏ"],
    ["á»‘", "ố"],
    ["á»“", "ồ"],
    ["á»“n", "ồn"],
    ["á»™", "ộ"],
    ["á»›", "ớ"],
    ["á»", "ờ"],
    ["á»£", "ợ"],
    ["á»“i", "ồi"],
    ["á»›i", "ới"],
    ["á»‹", "ị"],
    ["á»‰", "ỉ"],
    ["á»©", "ứ"],
    ["á»«", "ừ"],
    ["á»±", "ự"],
    ["á»­", "ử"],
    ["á»¥", "ụ"],
    ["á»§", "ủ"],
    ["á»", "ọ"],
    ["á»i", "ỏi"],
    ["á»i", "ời"],
    ["á»—", "ỗ"],
    ["á»‹ch", "ịch"],
    ["á»—i", "ỗi"],
    ["á»ng", "ờng"],
    ["Ã ", "à"],
    ["Ã¡", "á"],
    ["Ã¢", "â"],
    ["Ã£", "ã"],
    ["Ã¨", "è"],
    ["Ã©", "é"],
    ["Ãª", "ê"],
    ["Ã¬", "ì"],
    ["Ã­", "í"],
    ["Ã²", "ò"],
    ["Ã³", "ó"],
    ["Ã´", "ô"],
    ["Ãµ", "õ"],
    ["Ã¶", "ö"],
    ["Ã¹", "ù"],
    ["Ãº", "ú"],
    ["Ã½", "ý"],
    ["Ã„â€˜", "Đ"],
    ["Ã†Â°", "ư"],
    ["Ã‚", ""],
    ["Â", ""],
    ["â€¢", "•"],
    ["â€”", "—"],
    ["â†", "←"]
  ];

  function sanitizeText(value) {
    let text = String(value ?? "");
    replacements.forEach(([bad, good]) => {
      text = text.split(bad).join(good);
    });
    return text;
  }

  function sanitizeNode(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((node) => {
      const next = sanitizeText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    });
    root.querySelectorAll?.("input[placeholder], textarea[placeholder]").forEach((el) => {
      const next = sanitizeText(el.placeholder);
      if (next !== el.placeholder) el.placeholder = next;
    });
  }

  function applyKnownLabels() {
    document.title = "Game thi đấu";
    const heroTitle = document.querySelector(".hero-copy h1");
    if (heroTitle) heroTitle.textContent = "Đấu trường tri thức";
    const heroDesc = document.querySelector(".hero-copy p");
    if (heroDesc) {
      heroDesc.textContent = "Biến việc luyện đề thành một trận đấu thật sự. Học sinh có thể tạo phòng, mời bạn vào thi, trả lời câu hỏi nhanh để leo hạng và xem bảng xếp hạng ngay trong phòng.";
    }
    const modeBadge = Array.from(document.querySelectorAll(".hero-badge")).find((el) => el.textContent.includes("Mode:"));
    if (modeBadge) modeBadge.textContent = "Mode: Quick / Friends / Ranked / Survival / Speed";
  }

  function applyAll() {
    sanitizeNode(document.body);
    applyKnownLabels();
  }

  const nativeAlert = window.alert.bind(window);
  const nativeConfirm = window.confirm.bind(window);
  const nativePrompt = window.prompt.bind(window);

  window.alert = (message) => nativeAlert(sanitizeText(message));
  window.confirm = (message) => nativeConfirm(sanitizeText(message));
  window.prompt = (message, value) => nativePrompt(sanitizeText(message), sanitizeText(value));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyAll);
  } else {
    applyAll();
  }

  const observer = new MutationObserver(() => applyAll());
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
