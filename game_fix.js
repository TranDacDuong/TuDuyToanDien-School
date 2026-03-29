(function () {
  // ─── 1. ENCODING FIXES ───────────────────────────────────────────────────────
  const replacements = [
    ["Ã„â€˜", "\u0111"],
    ["Ã„Â", "\u0110"],
    ["Ã¡ÂºÂ¥", "\u1ea5"],
    ["Ã¡ÂºÂ§", "\u1ea7"],
    ["Ã¡ÂºÂ¡", "\u1ea1"],
    ["Ã¡ÂºÂ£", "\u1ea3"],
    ["Ã¡ÂºÂ¯", "\u1eaf"],
    ["Ã¡ÂºÂ·", "\u1eb7"],
    ["Ã¡ÂºÂ¿", "\u1ebf"],
    ["Ã¡Â»Â", "\u1ec1"],
    ["Ã¡Â»â€¡", "\u1ec7"],
    ["Ã¡Â»Æ'", "\u1ec3"],
    ["Ã¡Â»Â", "\u1ecf"],
    ["Ã¡Â»â€˜", "\u1ed1"],
    ["Ã¡Â»â€œ", "\u1ed3"],
    ["Ã¡Â»â„¢", "\u1ed9"],
    ["Ã¡Â»â€º", "\u1edb"],
    ["Ã¡Â»Â", "\u1edd"],
    ["Ã¡Â»Â£", "\u1ee3"],
    ["Ã¡Â»â€¹", "\u1ecb"],
    ["Ã¡Â»â€°", "\u1ec9"],
    ["Ã¡Â»Â©", "\u1ee9"],
    ["Ã¡Â»Â«", "\u1eeb"],
    ["Ã¡Â»Â±", "\u1ef1"],
    ["Ã¡Â»Â­", "\u1eed"],
    ["Ã¡Â»Â¥", "\u1ee5"],
    ["Ã¡Â»Â§", "\u1ee7"],
    ["Ã¡Â»Â", "\u1ecd"],
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
    ["Ã¢â‚¬â€", "\u2014"],
    ["Ã¢â€ Â", "\u2190"]
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

  // ─── 2. FIX: HỦY COUNTDOWN KHI SỐ NGƯỜI GIẢM XUỐNG DƯỚI 2 ─────────────────
  //
  // Root cause trong game.js (3 điểm lỗi):
  //
  // (A) queueAutoStart() dùng setTimeout nhưng KHÔNG kiểm tra lại player count
  //     khi timer kích hoạt → nếu player 2 rời trong 10 giây đếm ngược,
  //     startGameMatch() vẫn được gọi với chỉ 1 người.
  //
  // (B) removePlayerFromRoom() chỉ reset `started_at = null` khi người rời
  //     KHÔNG phải coordinator. Nếu coordinator rời → transfer host nhưng
  //     QUÊN reset started_at → player còn lại thấy countdown vẫn tiếp tục.
  //
  // (C) renderActiveRoom() không xử lý trường hợp started_at != null nhưng
  //     roomPlayers.length < 2 (nên reset started_at trên DB để ngăn auto-start).
  //
  // FIX ở đây (không sửa game.js):
  //   - Theo dõi countdown overlay bằng MutationObserver
  //   - Khi overlay hiện, poll DB mỗi 800ms để kiểm tra player count thực tế
  //   - Nếu phòng còn < 2 người: ẩn overlay ngay + reset started_at trên DB
  //   - game.js sẽ nhận Realtime event → clearWaitingCountdown() + clearAutoStartTimer()
  // ────────────────────────────────────────────────────────────────────────────

  let _guardTick = null;

  function getSb() {
    return window.sb || window.supabase || null;
  }

  /**
   * Đọc room id từ tên Supabase Realtime channel đang active.
   * game.js đặt tên: "game-room-{uuid}-{timestamp}"
   */
  function getActiveRoomId() {
    try {
      const sbClient = getSb();
      if (!sbClient?.getChannels) return null;
      for (const ch of sbClient.getChannels()) {
        const match = String(ch.topic || "").match(/game-room-([0-9a-f-]{36})-\d+/i);
        if (match) return match[1];
      }
    } catch (_) {}
    return null;
  }

  function stopGuard() {
    clearInterval(_guardTick);
    _guardTick = null;
  }

  function startGuard() {
    stopGuard();
    _guardTick = setInterval(runGuardCheck, 800);
  }

  async function runGuardCheck() {
    const overlay = document.getElementById("gameRoomCountdownOverlay");
    if (!overlay || overlay.classList.contains("hidden")) {
      stopGuard();
      return;
    }

    const roomId = getActiveRoomId();
    if (!roomId) return;

    const sbClient = getSb();
    if (!sbClient) return;

    try {
      const [{ data: room }, { data: players }] = await Promise.all([
        sbClient
          .from("game_rooms")
          .select("id,status,started_at")
          .eq("id", roomId)
          .maybeSingle(),
        sbClient
          .from("game_room_players")
          .select("id,user_id,joined_at")
          .eq("room_id", roomId)
          .order("joined_at", { ascending: true }),
      ]);

      // Phòng đã live/finished hoặc started_at đã được reset → dừng guard
      if (!room || room.status !== "waiting" || !room.started_at) {
        stopGuard();
        return;
      }

      // Vẫn đủ 2+ người → countdown hợp lệ, không làm gì
      if ((players || []).length >= 2) return;

      // Dưới 2 người → ẩn overlay ngay lập tức
      overlay.classList.add("hidden");
      stopGuard();

      // Chỉ coordinator (người vào phòng sớm nhất còn lại) mới reset DB
      const { data: authData } = await sbClient.auth.getUser();
      const currentUserId = authData?.user?.id;
      if (!currentUserId) return;

      const coordinator = (players || [])[0]?.user_id;
      if (coordinator !== currentUserId) return;

      // Reset started_at → game.js nhận Realtime event →
      // renderActiveRoom() → countdownActive = false →
      // clearWaitingCountdown() + clearAutoStartTimer()
      await sbClient
        .from("game_rooms")
        .update({ started_at: null })
        .eq("id", roomId)
        .eq("status", "waiting"); // tránh race condition nếu game vừa start
    } catch (_) {}
  }

  function watchOverlay() {
    const overlay = document.getElementById("gameRoomCountdownOverlay");
    if (!overlay) return;

    new MutationObserver(() => {
      if (overlay.classList.contains("hidden")) {
        stopGuard();
      } else {
        startGuard();
      }
    }).observe(overlay, { attributes: true, attributeFilter: ["class"] });

    // Trường hợp overlay đang hiện sẵn khi script load
    if (!overlay.classList.contains("hidden")) startGuard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchOverlay);
  } else {
    watchOverlay();
  }
  // ────────────────────────────────────────────────────────────────────────────
})();
