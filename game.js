(function () {
  const GAME = {
    user: null,
    role: "student",
    initialClassId: "",
    initialAction: "",
    initialRoomId: "",
    grades: [],
    subjects: [],
    classes: [],
    classIds: [],
    friends: [],
    roomsRaw: [],
    rooms: [],
    players: [],
    activeRoom: null,
    roomPlayers: [],
    roomQuestions: [],
    roomAnswers: [],
    myAnswers: [],
    roomPoll: null,
    questionTick: null,
    waitingTick: null,
    localCountdownStartedAt: null,
    roomNoticeTimer: null,
    roomChannel: null,
    listChannel: null,
    accessToken: "",
    unloadingLeaveSent: false,
    leaderboardPeriod: "day",
    leavingRoom: false,
    selectedAutoMode: "",
    questionDifficultyMap: {},
    liveRenderKey: "",
    autoStartTimer: null,
  };

  const EL = {
    keyword: document.getElementById("gameKeyword"),
    gradeFilter: document.getElementById("gameGradeFilter"),
    subjectFilter: document.getElementById("gameSubjectFilter"),
    modeFilter: document.getElementById("gameModeFilter"),
    visibilityFilter: document.getElementById("gameVisibilityFilter"),
    sortFilter: document.getElementById("gameSortFilter"),
    statusFilter: document.getElementById("gameStatusFilter"),
    roomGrid: document.getElementById("gameRoomGrid"),
    roomEmpty: document.getElementById("gameRoomEmpty"),
    heroBadges: document.getElementById("gameHeroBadges"),
    statsGrid: document.getElementById("gameStatsGrid"),
    historyList: document.getElementById("gameHistoryList"),
    historyModal: document.getElementById("gameHistoryModal"),
    historyModalBody: document.getElementById("gameHistoryModalBody"),
    globalLeaderboard: document.getElementById("gameGlobalLeaderboard"),
    openRoomBtn: document.getElementById("openGameRoomBtn"),
    quickMatchBtn: document.getElementById("quickMatchBtn"),
    reloadRoomsBtn: document.getElementById("reloadGameRoomsBtn"),
    joinCode: document.getElementById("gameJoinCode"),
    joinByCodeBtn: document.getElementById("joinByCodeBtn"),
    roomModal: document.getElementById("gameRoomModal"),
    roomForm: document.getElementById("gameRoomForm"),
    roomTitle: document.getElementById("gameRoomTitle"),
    roomCode: document.getElementById("gameRoomCode"),
    roomMode: document.getElementById("gameRoomMode"),
    roomVisibility: document.getElementById("gameRoomVisibility"),
    roomMaxPlayers: document.getElementById("gameRoomMaxPlayers"),
    roomClass: document.getElementById("gameRoomClass"),
    roomGrade: document.getElementById("gameRoomGrade"),
    roomSubject: document.getElementById("gameRoomSubject"),
    roomQuestionCount: document.getElementById("gameRoomQuestionCount"),
    roomTimePerQuestion: document.getElementById("gameRoomTimePerQuestion"),
    roomDescription: document.getElementById("gameRoomDescription"),
    roomScreen: document.getElementById("gameRoomScreen"),
    roomScreenTitle: document.getElementById("gameRoomScreenTitle"),
    startGameBtn: document.getElementById("startGameBtn"),
    toggleReadyBtn: document.getElementById("toggleReadyBtn"),
    leaveGameBtn: document.getElementById("leaveGameBtn"),
    waitingView: document.getElementById("gameWaitingView"),
    roomSummary: document.getElementById("gameRoomSummary"),
    roomDescriptionView: document.getElementById("gameRoomDescriptionView"),
    roomStartHint: document.getElementById("gameRoomStartHint"),
    roomPresenceNotice: document.getElementById("gameRoomPresenceNotice"),
    roomCountdownOverlay: document.getElementById("gameRoomCountdownOverlay"),
    roomCountdownValue: document.getElementById("gameRoomCountdownValue"),
    roomCountdownLabel: document.getElementById("gameRoomCountdownLabel"),
    inviteCode: document.getElementById("gameInviteCode"),
    inviteVisibility: document.getElementById("gameInviteVisibility"),
    copyGameCodeBtn: document.getElementById("copyGameCodeBtn"),
    shareGameCodeBtn: document.getElementById("shareGameCodeBtn"),
    friendInviteList: document.getElementById("gameFriendInviteList"),
    playerList: document.getElementById("gamePlayerList"),
    liveView: document.getElementById("gameLiveView"),
    questionTitle: document.getElementById("gameQuestionTitle"),
    questionClock: document.getElementById("gameQuestionClock"),
    progressText: document.getElementById("gameProgressText"),
    progressFill: document.getElementById("gameProgressFill"),
    questionBody: document.getElementById("gameQuestionBody"),
    questionImg: document.getElementById("gameQuestionImg"),
    answerArea: document.getElementById("gameAnswerArea"),
    answerFeedback: document.getElementById("gameAnswerFeedback"),
    leaderboard: document.getElementById("gameLeaderboard"),
    myScore: document.getElementById("myGameScore"),
    myRank: document.getElementById("myGameRank"),
    myCombo: document.getElementById("myGameCombo"),
    myBestCombo: document.getElementById("myGameBestCombo"),
    finishedView: document.getElementById("gameFinishedView"),
    finishedMeta: document.getElementById("gameFinishedMeta"),
    myStats: document.getElementById("gameMyStats"),
    resultsList: document.getElementById("gameResultsList"),
  };

  init();
  normalizeStaticGameText();

  if (EL.roomMode?.closest(".field")) {
    const modeLabels = EL.roomMode.closest(".field").querySelectorAll("label");
    if (modeLabels[0]) modeLabels[0].textContent = "Chế độ";
    if (modeLabels[1]) modeLabels[1].remove();
  }
  if (EL.roomVisibility?.closest(".field")) {
    const visibilityLabel = EL.roomVisibility.closest(".field").querySelector("label");
    if (visibilityLabel) visibilityLabel.textContent = "Hiển thị phòng";
  }
  if (EL.modeFilter) {
    EL.modeFilter.innerHTML = `
      <option value="">Mọi chế độ</option>
      <option value="quick">Đấu nhanh</option>
      <option value="friends">Phòng bạn bè</option>
      <option value="ranked">Leo hạng</option>
      <option value="survival">Sinh tồn</option>
      <option value="speed">Đua tốc độ</option>
    `;
  }
  if (EL.roomMode) {
    EL.roomMode.innerHTML = `
      <option value="quick">Đấu nhanh</option>
      <option value="friends">Phòng bạn bè</option>
      <option value="ranked">Leo hạng</option>
      <option value="survival">Sinh tồn</option>
      <option value="speed">Đua tốc độ</option>
    `;
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escAttr(value) {
    return esc(value).replace(/`/g, "&#96;");
  }

  function triggerMathJax(el) {
    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([el]).catch(() => {});
    } else if (window.MathJax?.Hub) {
      window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub, el]);
    }
  }

  function renderMathText(el, text) {
    if (!el) return;
    const safeText = String(text || "Xem nội dung câu hỏi.");
    el.innerHTML = esc(safeText).replace(/\n/g, "<br>");
    triggerMathJax(el);
  }

  function showRoomNotice(message) {
    if (!EL.roomPresenceNotice) return;
    clearTimeout(GAME.roomNoticeTimer);
    EL.roomPresenceNotice.textContent = message || "";
    if (!message) return;
    GAME.roomNoticeTimer = setTimeout(() => {
      if (EL.roomPresenceNotice?.textContent === message) {
        EL.roomPresenceNotice.textContent = "";
      }
    }, 3500);
  }

  function formatPlayerNames(userIds) {
    const names = (userIds || []).map((userId) => getPlayerName(userId)).filter(Boolean);
    if (!names.length) return "Người chơi";
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} và ${names[1]}`;
    return `${names.slice(0, -1).join(", ")} và ${names[names.length - 1]}`;
  }

  function announceRoomPresenceChanges(prevPlayers, nextPlayers) {
    const previousIds = new Set((prevPlayers || []).map((item) => item.user_id));
    const nextIds = new Set((nextPlayers || []).map((item) => item.user_id));
    const joined = [...nextIds].filter((userId) => !previousIds.has(userId));
    const left = [...previousIds].filter((userId) => !nextIds.has(userId));
    if (left.length) {
      showRoomNotice(`${formatPlayerNames(left)} đã rời phòng.`);
      return;
    }
    if (joined.length) {
      showRoomNotice(`${formatPlayerNames(joined)} đã vào phòng.`);
    }
  }

  function getRestBaseUrl() {
    return typeof SUPABASE_URL === "string" ? `${SUPABASE_URL}/rest/v1` : "";
  }

  function getRestHeaders(preferJson) {
    const headers = {
      apikey: typeof SUPABASE_KEY === "string" ? SUPABASE_KEY : "",
      Authorization: `Bearer ${GAME.accessToken || SUPABASE_KEY || ""}`,
      Prefer: preferJson || "return=minimal",
    };
    return headers;
  }

  function sendKeepaliveRequest(url, options) {
    try {
      fetch(url, { ...options, keepalive: true });
    } catch (_) {}
  }

  function leaveRoomOnUnload() {
    if (GAME.unloadingLeaveSent) return;
    const room = GAME.activeRoom;
    const player = (GAME.roomPlayers || []).find((item) => item.user_id === GAME.user?.id);
    if (!room || !player || room.status === "finished") return;
    GAME.unloadingLeaveSent = true;
    const baseUrl = getRestBaseUrl();
    if (!baseUrl) return;
    sendKeepaliveRequest(`${baseUrl}/game_room_answers?player_id=eq.${encodeURIComponent(player.id)}`, {
      method: "DELETE",
      headers: getRestHeaders(),
    });
    sendKeepaliveRequest(`${baseUrl}/game_room_players?id=eq.${encodeURIComponent(player.id)}`, {
      method: "DELETE",
      headers: getRestHeaders(),
    });
    const remain = (GAME.roomPlayers || []).filter((item) => item.id !== player.id);
    if (!remain.length) {
      sendKeepaliveRequest(`${baseUrl}/game_room_questions?room_id=eq.${encodeURIComponent(room.id)}`, {
        method: "DELETE",
        headers: getRestHeaders(),
      });
      sendKeepaliveRequest(`${baseUrl}/game_rooms?id=eq.${encodeURIComponent(room.id)}`, {
        method: "DELETE",
        headers: getRestHeaders(),
      });
      return;
    }
    if (room.host_id === GAME.user?.id) {
      sendKeepaliveRequest(`${baseUrl}/game_rooms?id=eq.${encodeURIComponent(room.id)}`, {
        method: "PATCH",
        headers: { ...getRestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          host_id: remain[0].user_id,
          started_at: remain.length >= 2 ? room.started_at : null,
        }),
      });
    } else if (remain.length < 2) {
      sendKeepaliveRequest(`${baseUrl}/game_rooms?id=eq.${encodeURIComponent(room.id)}`, {
        method: "PATCH",
        headers: { ...getRestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ started_at: null }),
      });
    }
  }

  function normalizeStaticGameText() {
    document.title = "Game thi đấu";
    const heroTitle = document.querySelector(".hero-copy h1");
    if (heroTitle) heroTitle.textContent = "Đấu trường tri thức";
    const heroDesc = document.querySelector(".hero-copy p");
    if (heroDesc) {
      heroDesc.textContent = "Biến việc luyện đề thành một trận đấu thật sự. Học sinh có thể tạo phòng, mời bạn vào thi, trả lời câu hỏi nhanh để leo hạng và xem bảng xếp hạng ngay trong phòng.";
    }
    if (EL.openRoomBtn) EL.openRoomBtn.textContent = "+ Tạo phòng mới";
    if (EL.quickMatchBtn) EL.quickMatchBtn.textContent = "Ghép nhanh";
    if (EL.reloadRoomsBtn) EL.reloadRoomsBtn.textContent = "Tải lại";
    if (EL.joinCode) EL.joinCode.placeholder = "Nhập mã phòng";
    if (EL.joinByCodeBtn) EL.joinByCodeBtn.textContent = "Vào phòng";

    if (EL.keyword) EL.keyword.placeholder = "Tìm theo tên phòng hoặc mã phòng";
    if (EL.gradeFilter?.options[0]) EL.gradeFilter.options[0].text = "Tất cả khối";
    if (EL.subjectFilter?.options[0]) EL.subjectFilter.options[0].text = "Tất cả môn";
    if (EL.visibilityFilter) {
      EL.visibilityFilter.innerHTML = `
        <option value="">Mọi kiểu phòng</option>
        <option value="public">Công khai</option>
        <option value="private">Riêng tư</option>
      `;
    }
    if (EL.sortFilter) {
      EL.sortFilter.innerHTML = `
        <option value="recommended">Phù hợp nhất</option>
        <option value="hot">Đang đông</option>
        <option value="new">Mới nhất</option>
        <option value="spots">Còn nhiều chỗ</option>
      `;
    }
    if (EL.sortFilter) {
      EL.sortFilter.innerHTML = `
        <option value="players">ÄÃ´ng ngÆ°á»i nháº¥t</option>
        <option value="recommended">PhÃ¹ há»£p nháº¥t</option>
        <option value="hot">Äang sá»‘i Ä‘á»™ng</option>
        <option value="new">Má»›i nháº¥t</option>
        <option value="spots">CÃ²n nhiá»u chá»—</option>
      `;
      EL.sortFilter.value = "players";
    }
    if (EL.statusFilter) {
      EL.statusFilter.innerHTML = `
        <option value="">Tất cả trạng thái</option>
        <option value="waiting">Đang chờ</option>
        <option value="live">Đang đấu</option>
        <option value="finished">Đã kết thúc</option>
      `;
    }

    const emptyTitle = document.querySelector("#gameRoomEmpty strong");
    if (emptyTitle) emptyTitle.textContent = "Chưa có phòng nào phù hợp";
    const emptyDesc = document.querySelector("#gameRoomEmpty div");
    if (emptyDesc) emptyDesc.textContent = "Hãy đổi bộ lọc hoặc tạo một phòng mới để bắt đầu thi đấu.";

    document.querySelectorAll(".section-card h3")[0] && (document.querySelectorAll(".section-card h3")[0].textContent = "Lịch sử thi đấu gần đây");
    document.querySelectorAll(".section-card h3")[1] && (document.querySelectorAll(".section-card h3")[1].textContent = "Bảng xếp hạng");
    document.querySelectorAll("[data-rank-period='day']").forEach((el) => el.textContent = "Hôm nay");
    document.querySelectorAll("[data-rank-period='week']").forEach((el) => el.textContent = "Tuần");
    document.querySelectorAll("[data-rank-period='month']").forEach((el) => el.textContent = "Tháng");

    const modalTitle = document.querySelector("#gameRoomModal .mh h2");
    if (modalTitle) modalTitle.textContent = "Tạo phòng thi đấu";
    const modalClose = document.querySelector("#gameRoomModal .mh .btn");
    if (modalClose) modalClose.textContent = "Đóng";
    if (EL.roomTitle?.closest(".field")?.querySelector("label")) EL.roomTitle.closest(".field").querySelector("label").textContent = "Tên phòng";
    if (EL.roomCode?.closest(".field")?.querySelector("label")) EL.roomCode.closest(".field").querySelector("label").textContent = "Mã phòng";
    if (EL.roomCode) EL.roomCode.placeholder = "Để trống sẽ tự tạo";
    if (EL.roomMaxPlayers?.closest(".field")?.querySelector("label")) EL.roomMaxPlayers.closest(".field").querySelector("label").textContent = "Số người tối đa";
    if (EL.roomClass?.closest(".field")?.querySelector("label")) EL.roomClass.closest(".field").querySelector("label").textContent = "Lớp liên kết";
    if (EL.roomGrade?.closest(".field")?.querySelector("label")) EL.roomGrade.closest(".field").querySelector("label").textContent = "Khối";
    if (EL.roomSubject?.closest(".field")?.querySelector("label")) EL.roomSubject.closest(".field").querySelector("label").textContent = "Môn";
    if (EL.roomQuestionCount?.closest(".field")?.querySelector("label")) EL.roomQuestionCount.closest(".field").querySelector("label").textContent = "Số câu hỏi";
    if (EL.roomTimePerQuestion?.closest(".field")?.querySelector("label")) EL.roomTimePerQuestion.closest(".field").querySelector("label").textContent = "Giây cho mỗi câu";
    if (EL.roomDescription?.closest(".field")?.querySelector("label")) EL.roomDescription.closest(".field").querySelector("label").textContent = "Mô tả";
    if (EL.roomDescription) EL.roomDescription.placeholder = "Ví dụ: Thi đấu 10 câu Toán 12 trong 1 lượt, ai nhanh và chính xác hơn sẽ thắng.";
    const roomHint = document.querySelector("#gameRoomForm .field.full .hint");
    if (roomHint) roomHint.innerHTML = "Bản đầu tiên sẽ dùng lại câu hỏi từ <b>Ngân hàng câu hỏi</b>, ưu tiên các câu trắc nghiệm, đúng/sai và trả lời ngắn. Tự luận sẽ chưa đưa vào game để giữ nhịp thi đấu nhanh.";
    const footerBtns = document.querySelectorAll("#gameRoomForm + div .btn, #gameRoomForm .btn");
    footerBtns.forEach((btn) => {
      if (btn.type === "submit") btn.textContent = "Tạo phòng";
      else if (btn.getAttribute("onclick") === "closeGameRoomModal()") btn.textContent = "Hủy";
    });

    if (EL.roomScreenTitle) EL.roomScreenTitle.textContent = "Phòng thi đấu";
    const backBtn = document.querySelector("#gameRoomScreen .topbar .btn");
    if (backBtn) backBtn.textContent = "← Quay lại";
    if (EL.toggleReadyBtn) EL.toggleReadyBtn.textContent = "Sẵn sàng";
    if (EL.leaveGameBtn) EL.leaveGameBtn.textContent = "Rời phòng";
    if (EL.startGameBtn) EL.startGameBtn.textContent = "Bắt đầu trận";
    document.querySelector("#gameWaitingView .panel h3") && (document.querySelector("#gameWaitingView .panel h3").textContent = "Thông tin phòng");
    document.querySelectorAll("#gameWaitingView .panel h3")[1] && (document.querySelectorAll("#gameWaitingView .panel h3")[1].textContent = "Người chơi trong phòng");
    document.querySelectorAll("#gameWaitingView .panel h3")[2] && (document.querySelectorAll("#gameWaitingView .panel h3")[2].textContent = "Mời bạn bè");
    if (EL.inviteVisibility?.parentElement) EL.inviteVisibility.parentElement.firstChild.textContent = "Hiển thị: ";
    if (EL.copyGameCodeBtn) EL.copyGameCodeBtn.textContent = "Sao chép mã";
    if (EL.shareGameCodeBtn) EL.shareGameCodeBtn.textContent = "Sao chép lời mời";
    if (EL.questionTitle) EL.questionTitle.textContent = "Câu hỏi";
    if (EL.questionClock?.parentElement?.firstChild) EL.questionClock.parentElement.firstChild.textContent = "Còn lại";
    if (EL.progressText) EL.progressText.textContent = "Tiến độ trận đấu";
    document.querySelectorAll("#gameLiveView .panel h3")[0] && (document.querySelectorAll("#gameLiveView .panel h3")[0].textContent = "Đáp án của bạn");
    document.querySelectorAll("#gameLiveView .panel h3")[1] && (document.querySelectorAll("#gameLiveView .panel h3")[1].textContent = "Bảng xếp hạng");
    if (EL.finishedView?.querySelector("h3")) EL.finishedView.querySelector("h3").textContent = "Kết quả trận đấu";
    if (backBtn) backBtn.textContent = "Rá»i phÃ²ng";
    if (EL.leaveGameBtn) EL.leaveGameBtn.textContent = "ThoÃ¡t háº³n";
    if (EL.myScore?.previousElementSibling) EL.myScore.previousElementSibling.textContent = "Äiá»ƒm trÃ¢n";
    if (EL.myRank?.previousElementSibling) EL.myRank.previousElementSibling.textContent = "Vá»‹ trÃ­ hiá»‡n táº¡i";
    const historyModalTitle = document.querySelector("#gameHistoryModal .mh h2");
    if (historyModalTitle) historyModalTitle.textContent = "Chi tiết trận đấu";
    const historyClose = document.querySelector("#gameHistoryModal .mh .btn");
    if (historyClose) historyClose.textContent = "Đóng";
  }

  function fmtDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("vi-VN");
  }

  function randomCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  function getRoomDisplayTitle(room) {
    const modeLabel = roomModeLabel(roomModeValue(room));
    const code = room?.join_code || "----";
    return room?.title || `${modeLabel} • ${code}`;
  }

  function getCreateRoomPolicy() {
    if (GAME.role === "admin") {
      return {
        visibility: "public",
        classRequired: false,
        allowClass: false,
        lockVisibility: true,
        description: "Admin tạo phòng công khai để mọi người có thể tham gia trực tiếp từ sảnh game.",
      };
    }
    if (GAME.role === "teacher") {
      return {
        visibility: "private",
        classRequired: true,
        allowClass: true,
        lockVisibility: true,
        description: "Giáo viên tạo phòng gắn với lớp học. Người chơi vào bằng mã phòng để giữ đúng nhóm lớp.",
      };
    }
    return {
      visibility: "private",
      classRequired: false,
      allowClass: false,
      lockVisibility: true,
      description: "Học sinh tạo phòng riêng tư và mời bạn bè vào bằng mã phòng.",
    };
  }

  function configureCreateRoomForm() {
    const policy = getCreateRoomPolicy();
    if (EL.roomVisibility) {
      EL.roomVisibility.value = policy.visibility;
      EL.roomVisibility.disabled = !!policy.lockVisibility;
    }
    if (EL.roomClass) {
      EL.roomClass.disabled = !policy.allowClass;
      if (!policy.allowClass) EL.roomClass.value = "";
    }
    const classField = EL.roomClass?.closest(".field");
    if (classField) classField.classList.toggle("hidden", !policy.allowClass);
    const visibilityField = EL.roomVisibility?.closest(".field");
    if (visibilityField) visibilityField.classList.toggle("hidden", !!policy.lockVisibility);
    EL.roomMode?.closest(".field")?.classList.toggle("hidden", GAME.role === "student");
    const roomTitleField = EL.roomTitle?.closest(".field");
    if (roomTitleField) roomTitleField.classList.add("hidden");
    EL.roomQuestionCount?.closest(".field")?.classList.add("hidden");
    EL.roomTimePerQuestion?.closest(".field")?.classList.add("hidden");
    if (EL.roomTitle) {
      EL.roomTitle.required = false;
      EL.roomTitle.tabIndex = -1;
    }
    if (EL.roomDescription?.closest(".field")) {
      const hintNode = EL.roomDescription.closest(".field").nextElementSibling?.querySelector?.(".hint");
      if (hintNode) hintNode.innerHTML = `${policy.description}<br>Bản đầu tiên sẽ dùng lại câu hỏi từ <b>Ngân hàng câu hỏi</b>, ưu tiên các câu trắc nghiệm, đúng/sai và trả lời ngắn.`;
    }
  }

  function getRoomRoleMeta(room) {
    if (room?.class_id) return { label: "Phòng lớp học", accent: "Lớp riêng" };
    if ((room?.visibility || "public") === "public") return { label: "Phòng công khai", accent: "Mở toàn sảnh" };
    return { label: "Phòng riêng", accent: "Vào bằng mã" };
  }

  function getQuestionDuration(question, room) {
    const difficulty = Number(GAME.questionDifficultyMap?.[question?.question_id] || 2);
    return Math.max(10, difficulty * 10 || Number(room?.time_per_question || 20));
  }

  function getQuestionTimeline(room, questions) {
    let elapsed = Math.max(0, Math.floor((Date.now() - new Date(room.started_at).getTime()) / 1000));
    for (let index = 0; index < questions.length; index += 1) {
      const duration = getQuestionDuration(questions[index], room);
      if (elapsed < duration) {
        return {
          index,
          question: questions[index],
          secondsLeft: Math.max(0, duration - elapsed),
          duration,
        };
      }
      elapsed -= duration;
    }
    return {
      index: questions.length,
      question: null,
      secondsLeft: 0,
      duration: 0,
    };
  }

  function getAutoMatchModeCards() {
    return [
      { mode: "quick", title: "Đấu nhanh", art: "⚡", desc: "Vào ngay, ghép ngay, học thật nhanh." },
      { mode: "ranked", title: "Leo hạng", art: "🏆", desc: "Trận đấu Elo căng hơn, cạnh tranh rõ hơn." },
      { mode: "survival", title: "Sinh tồn", art: "🛡️", desc: "Sai là mất mạng, càng về cuối càng căng." },
      { mode: "speed", title: "Đua tốc độ", art: "🚀", desc: "Đúng nhanh ăn nhiều điểm hơn." },
    ];
  }

  function injectAutoModeLobby() {
    if (document.getElementById("gameModeDeck")) return;
    const hero = document.querySelector("#gameListPage .hero");
    if (!hero?.parentElement) return;
    const deck = document.createElement("div");
    deck.id = "gameModeDeck";
    deck.style.cssText = "display:grid;gap:14px;margin:18px 0 10px";
    deck.innerHTML = `
      <div style="display:grid;gap:10px">
        <div style="font-weight:800;font-size:1.05rem;color:#fef3c7">Chọn chế độ để hệ thống tự ghép phòng</div>
        <div style="color:rgba(235,245,255,.78)">Chọn chế độ, khối và môn. Hệ thống sẽ tự vào phòng đang chờ, nếu phòng hiện tại đầy mới tạo phòng mới.</div>
      </div>
      <div id="gameModeCardGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px"></div>
      <div style="display:grid;gap:10px;margin-top:8px">
        <div style="font-weight:800;font-size:1rem;color:#fef3c7">Chọn khối</div>
        <div id="gameGradeCardGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px"></div>
      </div>
      <div style="display:grid;gap:10px;margin-top:8px">
        <div style="font-weight:800;font-size:1rem;color:#fef3c7">Chọn môn</div>
        <div id="gameSubjectCardGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px"></div>
      </div>
    `;
    hero.parentElement.insertBefore(deck, hero.nextSibling);
    const grid = deck.querySelector("#gameModeCardGrid");
    grid.innerHTML = getAutoMatchModeCards().map((item) => `
      <button type="button" class="game-mode-card" data-auto-mode="${item.mode}" style="display:grid;gap:10px;text-align:left;padding:18px;border-radius:22px;border:1px solid rgba(125,211,252,.18);background:linear-gradient(135deg,rgba(10,20,40,.96) 0%,rgba(16,32,61,.96) 100%);color:#eff6ff;cursor:pointer;box-shadow:0 16px 36px rgba(2,8,23,.24)">
        <div style="font-size:2rem;line-height:1">${item.art}</div>
        <div style="font-size:1.05rem;font-weight:800;color:#fef3c7">${item.title}</div>
        <div style="font-size:.85rem;color:rgba(235,245,255,.74)">${item.desc}</div>
      </button>
    `).join("");
  }

  function getGradeCardStyle(selected) {
    return `position:relative;display:grid;gap:8px;min-height:108px;padding:16px 18px;border-radius:22px;border:${selected ? "2px solid rgba(250,204,21,.95)" : "1px solid rgba(125,211,252,.18)"};background:${selected ? "radial-gradient(circle at top left,rgba(250,204,21,.28),transparent 42%),linear-gradient(135deg,rgba(59,130,246,.34) 0%,rgba(15,23,42,.98) 58%,rgba(10,20,40,.98) 100%)" : "radial-gradient(circle at top left,rgba(125,211,252,.14),transparent 38%),linear-gradient(135deg,rgba(8,15,30,.98) 0%,rgba(13,27,52,.98) 55%,rgba(10,20,40,.98) 100%)"};box-shadow:${selected ? "0 18px 36px rgba(250,204,21,.18), inset 0 1px 0 rgba(255,255,255,.08)" : "0 14px 30px rgba(2,8,23,.24), inset 0 1px 0 rgba(255,255,255,.04)"};color:#eff6ff;text-align:left;cursor:pointer;overflow:hidden;transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease`;
  }

  function getSubjectCardStyle(selected) {
    return `position:relative;display:grid;gap:8px;min-height:116px;padding:16px 18px;border-radius:22px;border:${selected ? "2px solid rgba(103,232,249,.95)" : "1px solid rgba(125,211,252,.18)"};background:${selected ? "radial-gradient(circle at top left,rgba(34,211,238,.24),transparent 42%),linear-gradient(135deg,rgba(8,145,178,.28) 0%,rgba(30,64,175,.2) 45%,rgba(10,20,40,.98) 100%)" : "radial-gradient(circle at top left,rgba(56,189,248,.12),transparent 38%),linear-gradient(135deg,rgba(8,15,30,.98) 0%,rgba(13,27,52,.98) 55%,rgba(10,20,40,.98) 100%)"};box-shadow:${selected ? "0 18px 36px rgba(34,211,238,.16), inset 0 1px 0 rgba(255,255,255,.08)" : "0 14px 30px rgba(2,8,23,.24), inset 0 1px 0 rgba(255,255,255,.04)"};color:#eff6ff;text-align:left;cursor:pointer;overflow:hidden;transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease`;
  }

  function renderGradeCards() {
    const grid = document.getElementById("gameGradeCardGrid");
    if (!grid) return;
    grid.innerHTML = (GAME.grades || []).map((grade) => {
      const selected = EL.gradeFilter?.value === grade.id;
      return `<button type="button" data-grade-card="${grade.id}" style="${getGradeCardStyle(selected)}"><span style="display:inline-flex;align-items:center;width:max-content;padding:4px 10px;border-radius:999px;background:${selected ? "rgba(250,204,21,.18)" : "rgba(148,163,184,.12)"};color:${selected ? "#fde68a" : "rgba(226,232,240,.78)"};font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase">${selected ? "Đang chọn" : "Khối"}</span><span style="font-size:1.1rem;font-weight:900;letter-spacing:.01em">${esc(grade.name)}</span></button>`;
    }).join("");
    document.querySelectorAll("[data-grade-card]").forEach((button) => {
      button.addEventListener("click", () => {
        if (EL.gradeFilter) EL.gradeFilter.value = button.dataset.gradeCard || "";
        if (EL.subjectFilter) EL.subjectFilter.value = "";
        fillSubjects(EL.subjectFilter, EL.gradeFilter?.value || "", "Tất cả môn");
        renderGradeCards();
        renderSubjectCards();
        tryAutoJoinReadySelection();
      });
    });
  }

  function renderSubjectCards() {
    const grid = document.getElementById("gameSubjectCardGrid");
    if (!grid) return;
    const gradeId = EL.gradeFilter?.value || "";
    const subjects = gradeId ? GAME.subjects.filter((item) => item.grade_id === gradeId) : [];
    grid.innerHTML = subjects.length
      ? subjects.map((subject) => {
          const selected = EL.subjectFilter?.value === subject.id;
          return `<button type="button" data-subject-card="${subject.id}" style="${getSubjectCardStyle(selected)}"><span style="display:inline-flex;align-items:center;width:max-content;padding:4px 10px;border-radius:999px;background:${selected ? "rgba(34,211,238,.18)" : "rgba(148,163,184,.12)"};color:${selected ? "#a5f3fc" : "rgba(226,232,240,.78)"};font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase">${selected ? "Đang chọn" : "Môn"}</span><span style="font-size:1.02rem;font-weight:900;letter-spacing:.01em">${esc(subject.name)}</span></button>`;
        }).join("")
      : `<div class="hint">Chọn khối trước để hiện môn tương ứng.</div>`;
    document.querySelectorAll("[data-subject-card]").forEach((button) => {
      button.addEventListener("click", () => {
        if (EL.subjectFilter) EL.subjectFilter.value = button.dataset.subjectCard || "";
        renderSubjectCards();
        tryAutoJoinReadySelection();
      });
    });
  }

  function refreshLobbyActions() {
    if (EL.openRoomBtn) {
      EL.openRoomBtn.textContent = "Phòng bạn bè";
      EL.openRoomBtn.classList.toggle("hidden", GAME.role !== "student");
    }
    if (EL.quickMatchBtn) EL.quickMatchBtn.classList.add("hidden");
    if (EL.reloadRoomsBtn) EL.reloadRoomsBtn.classList.add("hidden");
    if (EL.keyword) EL.keyword.classList.add("hidden");
    [EL.visibilityFilter, EL.sortFilter, EL.statusFilter, EL.modeFilter].forEach((el) => el?.classList.add("hidden"));
    if (EL.roomGrid) EL.roomGrid.classList.add("hidden");
    if (EL.roomEmpty) EL.roomEmpty.classList.add("hidden");
    document.querySelector(".toolbar")?.classList.add("hidden");
  }

  function tryAutoJoinReadySelection() {
    if (!GAME.selectedAutoMode) return;
    if (!EL.gradeFilter?.value) return;
    if (!EL.subjectFilter?.value) return;
    autoMatchSelectedMode();
  }

  function clearAutoStartTimer() {
    clearTimeout(GAME.autoStartTimer);
    GAME.autoStartTimer = null;
  }

  function clearWaitingCountdown() {
    clearInterval(GAME.waitingTick);
    GAME.waitingTick = null;
    GAME.localCountdownStartedAt = null;
    if (EL.roomCountdownOverlay) EL.roomCountdownOverlay.classList.add("hidden");
  }

  function getWaitingCountdownSeconds(room) {
    if (!room?.started_at) return null;
    const elapsedMs = Date.now() - new Date(room.started_at).getTime();
    if (!Number.isFinite(elapsedMs)) return null;
    return Math.max(0, 10 - Math.floor(elapsedMs / 1000));
  }

  function renderWaitingCountdown(room) {
    if (!EL.roomCountdownOverlay || !EL.roomCountdownValue || !EL.roomCountdownLabel || !room?.started_at) {
      clearWaitingCountdown();
      return;
    }
    const tick = () => {
      const secondsLeft = getWaitingCountdownSeconds(room);
      if (secondsLeft === null) {
        clearWaitingCountdown();
        return;
      }
      EL.roomCountdownOverlay.classList.remove("hidden");
      EL.roomCountdownValue.textContent = String(secondsLeft).padStart(2, "0");
      EL.roomCountdownLabel.textContent = secondsLeft > 0
        ? "Trận đấu sắp bắt đầu"
        : "Đang vào trận";
    };
    clearInterval(GAME.waitingTick);
    tick();
    GAME.waitingTick = setInterval(tick, 250);
  }

  function isPublicAutoMatchRoom(room) {
    const mode = roomModeValue(room);
    return ["quick", "ranked", "survival", "speed"].includes(mode) && (room.visibility || "public") === "public";
  }

  function queueAutoStart(room, delayMs = 1200) {
    clearAutoStartTimer();
    GAME.autoStartTimer = setTimeout(() => {
      if (GAME.activeRoom?.id === room.id && GAME.activeRoom?.status === "waiting") {
        startGameMatch();
      }
    }, Math.max(0, Number(delayMs || 0)));
  }

  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function normalizeAnswer(raw) {
    return String(raw || "").trim().toUpperCase();
  }

  function shortAnswerAccepted(raw) {
    return String(raw || "")
      .split(/[;|]/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  function defaultQuestionPoints(type) {
    return { multi_choice: 100, true_false: 150, short_answer: 120 }[type] ?? 100;
  }

  function setScreenState(state) {
    EL.waitingView.classList.toggle("hidden", state !== "waiting");
    EL.liveView.classList.toggle("hidden", state !== "live");
    EL.finishedView.classList.toggle("hidden", state !== "finished");
  }

  async function init() {
    const params = new URLSearchParams(location.search);
    GAME.initialClassId = params.get("classId") || "";
    GAME.initialAction = params.get("action") || "";
    GAME.initialRoomId = params.get("roomId") || "";
    const { data: { user } } = await sb.auth.getUser();
    const { data: { session } } = await sb.auth.getSession();
    if (!user) {
      location.href = "index.html";
      return;
    }
    GAME.user = user;
    GAME.accessToken = session?.access_token || "";

    const [{ data: profile }, { data: grades }, { data: subjects }] = await Promise.all([
      sb.from("users").select("role").eq("id", user.id).single(),
      sb.from("grades").select("id,name").order("name"),
      sb.from("subjects").select("id,name,grade_id").order("name"),
    ]);

    GAME.role = profile?.role || "student";
    GAME.grades = grades || [];
    GAME.subjects = subjects || [];
    configureCreateRoomForm();
    injectAutoModeLobby();
    refreshLobbyActions();

    fillGrades(EL.gradeFilter, "Tất cả khối");
    fillGrades(EL.roomGrade, "Chọn khối");
    fillSubjects(EL.subjectFilter, "", "Tất cả môn");
    fillSubjects(EL.roomSubject, "", "Chọn môn");
    fillClasses(EL.roomClass, "Không gắn lớp");
    renderGradeCards();
    renderSubjectCards();

    bindEvents();
    setupListRealtime();
    await Promise.all([loadRooms(), loadFriends(), loadAccessibleClasses()]);
    if (GAME.initialAction === "create_room") {
      openGameRoomModal();
    } else if (GAME.initialRoomId) {
      if (GAME.initialAction === "join_room") await joinRoom(GAME.initialRoomId);
      else await openRoomScreen(GAME.initialRoomId);
    }
  }

  function bindEvents() {
    window.addEventListener("pagehide", leaveRoomOnUnload);
    window.addEventListener("beforeunload", leaveRoomOnUnload);
    EL.openRoomBtn?.addEventListener("click", () => openGameRoomModal());
    EL.quickMatchBtn?.addEventListener("click", quickMatch);
    EL.reloadRoomsBtn?.addEventListener("click", () => loadRooms());
    EL.joinByCodeBtn?.addEventListener("click", joinRoomByCode);
    EL.joinCode?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        joinRoomByCode();
      }
    });
    EL.roomForm?.addEventListener("submit", submitCreateRoom);
    EL.roomClass?.addEventListener("change", () => {
      if (EL.roomClass.value) syncRoomFiltersFromClass(EL.roomClass.value);
    });
    EL.roomMode?.addEventListener("change", () => applyModeDefaults(EL.roomMode.value, true));
    EL.roomGrade?.addEventListener("change", () => fillSubjects(EL.roomSubject, EL.roomGrade.value, "Chọn môn"));
    EL.gradeFilter?.addEventListener("change", () => {
      fillSubjects(EL.subjectFilter, EL.gradeFilter.value, "Tất cả môn");
      renderRooms();
      if (!EL.gradeFilter.value) GAME.selectedAutoMode = "";
      tryAutoJoinReadySelection();
    });
    EL.subjectFilter?.addEventListener("change", () => {
      tryAutoJoinReadySelection();
    });
    [EL.keyword, EL.subjectFilter, EL.modeFilter, EL.visibilityFilter, EL.sortFilter, EL.statusFilter].forEach((el) => {
      el?.addEventListener("input", renderRooms);
      el?.addEventListener("change", renderRooms);
    });
    EL.startGameBtn?.addEventListener("click", startGameMatch);
    EL.toggleReadyBtn?.addEventListener("click", toggleReadyState);
    EL.leaveGameBtn?.addEventListener("click", leaveRoom);
    EL.copyGameCodeBtn?.addEventListener("click", copyRoomCode);
    EL.shareGameCodeBtn?.addEventListener("click", copyRoomInvite);
    document.querySelectorAll("[data-rank-period]").forEach((button) => {
      button.addEventListener("click", () => {
        GAME.leaderboardPeriod = button.dataset.rankPeriod || "day";
        document.querySelectorAll("[data-rank-period]").forEach((item) => item.classList.toggle("active", item === button));
        renderArenaInsights();
      });
    });
    document.querySelectorAll("[data-auto-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        GAME.selectedAutoMode = button.dataset.autoMode || "";
        document.querySelectorAll("[data-auto-mode]").forEach((item) => {
          item.style.outline = item === button ? "2px solid #facc15" : "none";
          item.style.transform = item === button ? "translateY(-2px)" : "none";
        });
        tryAutoJoinReadySelection();
      });
    });
  }

  function setupListRealtime() {
    if (GAME.listChannel) return;
    GAME.listChannel = sb.channel(`game-list-${GAME.user.id}-${Date.now()}`);
    GAME.listChannel
      .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms" }, () => loadRooms())
      .on("postgres_changes", { event: "*", schema: "public", table: "game_room_players" }, () => loadRooms())
      .subscribe();
  }

  function teardownRoomRealtime() {
    if (GAME.roomChannel) {
      sb.removeChannel(GAME.roomChannel);
      GAME.roomChannel = null;
    }
  }

  function setupRoomRealtime(roomId) {
    teardownRoomRealtime();
    const syncRoom = () => {
      refreshActiveRoom(roomId, true);
      loadRooms();
    };
    GAME.roomChannel = sb.channel(`game-room-${roomId}-${Date.now()}`);
    GAME.roomChannel
      .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` }, syncRoom)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_room_players", filter: `room_id=eq.${roomId}` }, syncRoom)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_room_questions", filter: `room_id=eq.${roomId}` }, syncRoom)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_room_answers", filter: `room_id=eq.${roomId}` }, syncRoom)
      .subscribe();
  }

  function fillGrades(el, placeholder) {
    if (!el) return;
    el.innerHTML = `<option value="">${placeholder}</option>` + GAME.grades.map((grade) => `<option value="${grade.id}">${esc(grade.name)}</option>`).join("");
    if (el === EL.gradeFilter) renderGradeCards();
  }

  function fillSubjects(el, gradeId, placeholder) {
    if (!el) return;
    const list = gradeId ? GAME.subjects.filter((subject) => subject.grade_id === gradeId) : GAME.subjects;
    el.innerHTML = `<option value="">${placeholder}</option>` + list.map((subject) => `<option value="${subject.id}">${esc(subject.name)}</option>`).join("");
    if (el === EL.subjectFilter) renderSubjectCards();
  }

  function fillClasses(el, placeholder) {
    if (!el) return;
    el.innerHTML = `<option value="">${placeholder}</option>` + (GAME.classes || []).map((item) => `<option value="${item.id}">${esc(item.class_name)}</option>`).join("");
  }

  function getSelectedClassMeta(classId) {
    if (!classId) return null;
    return (GAME.classes || []).find((item) => item.id === classId) || null;
  }

  function syncRoomFiltersFromClass(classId) {
    const classMeta = getSelectedClassMeta(classId);
    if (!classMeta) return;
    if (EL.roomGrade) EL.roomGrade.value = classMeta.grade_id || "";
    fillSubjects(EL.roomSubject, classMeta.grade_id || "", "Chá»n mÃ´n");
    if (EL.roomSubject) EL.roomSubject.value = classMeta.subject_id || "";
  }

  function roomVisibilityLabel(value) {
    return value === "private" ? "Riêng tư" : "Công khai";
  }

  function roomModeValue(room) {
    if (room?.mode) return room.mode;
    return (room?.visibility || "public") === "private" ? "friends" : "quick";
  }

  function roomModeLabel(mode) {
    if (mode === "ranked") return "Leo hạng";
    if (mode === "survival") return "Sinh tồn";
    if (mode === "speed") return "Đua tốc độ";
    if (mode === "friends") return "Phòng bạn bè";
    return "Đấu nhanh";
  }

  function getModeDefaults(mode) {
    if (mode === "friends") {
      return { visibility: "private", maxPlayers: 6, questionCount: 5, timePerQuestion: 20 };
    }
    if (mode === "survival") {
      return { visibility: "private", maxPlayers: 8, questionCount: 5, timePerQuestion: 20 };
    }
    if (mode === "speed") {
      return { visibility: "private", maxPlayers: 10, questionCount: 5, timePerQuestion: 20 };
    }
    if (mode === "ranked") {
      return { visibility: GAME.role === "admin" ? "public" : "private", maxPlayers: 4, questionCount: 5, timePerQuestion: 20 };
    }
    return { visibility: GAME.role === "admin" ? "public" : "private", maxPlayers: 8, questionCount: 5, timePerQuestion: 20 };
  }

  function applyModeDefaults(mode, force) {
    const defaults = getModeDefaults(mode);
    if (EL.roomVisibility && (force || !EL.roomVisibility.value)) EL.roomVisibility.value = defaults.visibility;
    if (EL.roomMaxPlayers && (force || !EL.roomMaxPlayers.value)) EL.roomMaxPlayers.value = String(defaults.maxPlayers);
    if (EL.roomQuestionCount && (force || !EL.roomQuestionCount.value)) EL.roomQuestionCount.value = String(defaults.questionCount);
    if (EL.roomTimePerQuestion && (force || !EL.roomTimePerQuestion.value)) EL.roomTimePerQuestion.value = String(defaults.timePerQuestion);
    configureCreateRoomForm();
  }

  function roomPlayerCount(roomId) {
    return (GAME.players || []).filter((player) => player.room_id === roomId).length;
  }

  function roomHasCapacity(room) {
    return roomPlayerCount(room.id) < Number(room.max_players || 8);
  }

  function canAccessClassRoom(room) {
    if (!room?.class_id) return true;
    if (GAME.role === "admin") return true;
    return (GAME.classIds || []).includes(room.class_id);
  }

  function getClassName(classId) {
    return GAME.classes.find((item) => item.id === classId)?.class_name || "Lớp liên kết";
  }

  function getRoomSortValue(room, mode) {
    const playerCount = roomPlayerCount(room.id);
    const maxPlayers = Number(room.max_players || 8);
    const waiting = room.status === "waiting" ? 500 : room.status === "live" ? 250 : 0;
    const joined = (GAME.players || []).some((player) => player.room_id === room.id && player.user_id === GAME.user?.id) ? 1000 : 0;
    if (mode === "players") return [joined + waiting, playerCount, -new Date(room.created_at).getTime()];
    if (mode === "hot") return [playerCount, -new Date(room.created_at).getTime()];
    if (mode === "new") return [new Date(room.created_at).getTime(), playerCount];
    if (mode === "spots") return [maxPlayers - playerCount, -playerCount];
    const publicBonus = (room.visibility || "public") === "public" ? 50 : 0;
    return [joined + waiting + publicBonus, playerCount, -new Date(room.created_at).getTime()];
  }

  function compareTupleDesc(a, b) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
      const av = Number(a[i] || 0);
      const bv = Number(b[i] || 0);
      if (av !== bv) return bv - av;
    }
    return 0;
  }

  function getMyComboStats() {
    const ordered = [...(GAME.myAnswers || [])].sort((a, b) => new Date(a.answered_at || 0) - new Date(b.answered_at || 0));
    let combo = 0;
    let best = 0;
    ordered.forEach((answer) => {
      if (answer.is_correct) {
        combo += 1;
        best = Math.max(best, combo);
      } else {
        combo = 0;
      }
    });
    return { combo, best };
  }

  function getCurrentComboValue() {
    const ordered = [...(GAME.myAnswers || [])].sort((a, b) => new Date(a.answered_at || 0) - new Date(b.answered_at || 0));
    let combo = 0;
    ordered.forEach((answer) => {
      if (answer.is_correct) combo += 1;
      else combo = 0;
    });
    return combo;
  }

  function getArenaTier(totalScore) {
    if (totalScore >= 6000) return { name: "Kim cương", icon: "◆" };
    if (totalScore >= 3500) return { name: "Bạch kim", icon: "⬡" };
    if (totalScore >= 2000) return { name: "Vàng", icon: "★" };
    if (totalScore >= 800) return { name: "Bạc", icon: "✦" };
    return { name: "Đồng", icon: "•" };
  }

  function filterVisibleRooms(rooms) {
    const playerMap = buildRoomPlayerMap();
    return (rooms || []).filter((room) => {
      if (!canAccessClassRoom(room)) return false;
      if ((room.visibility || "public") !== "private") return true;
      if (room.host_id === GAME.user?.id) return true;
      return (playerMap[room.id] || []).some((player) => player.user_id === GAME.user?.id);
    });
  }

  async function loadFriends() {
    const { data: links, error } = await sb
      .from("friendships")
      .select("user_id,friend_id")
      .or(`user_id.eq.${GAME.user.id},friend_id.eq.${GAME.user.id}`);
    if (error) {
      GAME.friends = [];
      return;
    }
    const friendIds = [...new Set((links || []).map((row) => row.user_id === GAME.user.id ? row.friend_id : row.user_id).filter(Boolean))];
    if (!friendIds.length) {
      GAME.friends = [];
      return;
    }
    const { data: users } = await sb.from("users").select("id,full_name,avatar_url").in("id", friendIds);
    GAME.friends = (users || []).sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || ""), "vi"));
    window.__gameUserCache = window.__gameUserCache || {};
    GAME.friends.forEach((user) => {
      window.__gameUserCache[user.id] = user;
    });
  }

  async function loadAccessibleClasses() {
    const tasks = [
      sb.from("classes").select("id,class_name,grade_id,subject_id,created_by,hidden").eq("created_by", GAME.user.id),
      sb.from("class_teachers").select("class_id").eq("teacher_id", GAME.user.id),
      sb.from("class_students").select("class_id").eq("student_id", GAME.user.id).is("left_at", null),
    ];
    const [createdRes, teacherRes, studentRes] = await Promise.all(tasks);
    const ids = new Set();
    (createdRes.data || []).forEach((row) => ids.add(row.id));
    (teacherRes.data || []).forEach((row) => row.class_id && ids.add(row.class_id));
    (studentRes.data || []).forEach((row) => row.class_id && ids.add(row.class_id));
    if (!ids.size) {
      GAME.classes = [];
      GAME.classIds = [];
      fillClasses(EL.roomClass, "Không gắn lớp");
      return;
    }
    const { data: classes } = await sb.from("classes").select("id,class_name,grade_id,subject_id,hidden").in("id", [...ids]).eq("hidden", false).order("class_name");
    GAME.classes = classes || [];
    GAME.classIds = (GAME.classes || []).map((item) => item.id);
    fillClasses(EL.roomClass, "Không gắn lớp");
    if (GAME.initialClassId && GAME.classIds.includes(GAME.initialClassId) && EL.roomClass) {
      EL.roomClass.value = GAME.initialClassId;
      syncRoomFiltersFromClass(GAME.initialClassId);
    }
    if (EL.roomMode && !EL.roomMode.value) EL.roomMode.value = "quick";
    applyModeDefaults(EL.roomMode?.value || "quick", false);
    configureCreateRoomForm();
  }

  async function copyText(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      alert(successMessage);
    } catch (_) {
      window.prompt("Sao chép nội dung sau:", text);
    }
  }

  async function loadRooms() {
    const [{ data: rooms, error: roomErr }, { data: players, error: playerErr }] = await Promise.all([
      sb.from("game_rooms").select("*").order("created_at", { ascending: false }),
      sb.from("game_room_players").select("id,room_id,user_id,score,ready,joined_at"),
    ]);

    if (roomErr || playerErr) {
      EL.roomGrid.innerHTML = `<div class="empty"><strong>Không tải được phòng thi đấu</strong><div>${esc(roomErr?.message || playerErr?.message || "Đã có lỗi xảy ra.")}</div></div>`;
      EL.roomEmpty.classList.add("hidden");
      return;
    }

    GAME.roomsRaw = (rooms || []).map((room) => ({
      ...room,
      title: room.title || getRoomDisplayTitle(room),
    }));
    GAME.players = players || [];
    GAME.rooms = filterVisibleRooms(GAME.roomsRaw);
    renderRooms();
    await ensureArenaUserCache();
    renderArenaInsights();
  }

  function renderRooms() {
    const keyword = String(EL.keyword?.value || "").trim().toLowerCase();
    const gradeId = EL.gradeFilter?.value || "";
    const subjectId = EL.subjectFilter?.value || "";
    const modeFilter = EL.modeFilter?.value || "";
    const visibility = EL.visibilityFilter?.value || "";
    const sortMode = EL.sortFilter?.value || "players";
    const status = EL.statusFilter?.value || "";
    const playerMap = buildRoomPlayerMap();

    let list = [...GAME.rooms];
    if (keyword) {
      list = list.filter((room) => String(room.title || "").toLowerCase().includes(keyword) || String(room.join_code || "").toLowerCase().includes(keyword));
    }
    if (gradeId) list = list.filter((room) => room.grade_id === gradeId);
    if (subjectId) list = list.filter((room) => room.subject_id === subjectId);
    if (modeFilter) list = list.filter((room) => roomModeValue(room) === modeFilter);
    if (visibility) list = list.filter((room) => (room.visibility || "public") === visibility);
    if (status) list = list.filter((room) => room.status === status);
    list.sort((a, b) => compareTupleDesc(getRoomSortValue(a, sortMode), getRoomSortValue(b, sortMode)));

    EL.roomGrid.innerHTML = list.map((room) => renderRoomCard(room, playerMap[room.id] || [])).join("");
    EL.roomEmpty.classList.toggle("hidden", list.length > 0);

    document.querySelectorAll("[data-join-room]").forEach((button) => {
      button.onclick = () => joinRoom(button.dataset.joinRoom);
    });
    document.querySelectorAll("[data-enter-room]").forEach((button) => {
      if ((button.textContent || "").toLowerCase().includes("xem")) {
        button.textContent = "Đã kết thúc";
        button.disabled = true;
        return;
      }
      button.onclick = () => openRoomScreen(button.dataset.enterRoom);
    });
  }

  function buildRoomPlayerMap() {
    const out = {};
    (GAME.players || []).forEach((player) => {
      if (!out[player.room_id]) out[player.room_id] = [];
      out[player.room_id].push(player);
    });
    return out;
  }

  function renderRoomCard(room, players) {
    const joined = players.some((player) => player.user_id === GAME.user.id);
    const grade = GAME.grades.find((item) => item.id === room.grade_id)?.name || "—";
    const subject = GAME.subjects.find((item) => item.id === room.subject_id)?.name || "—";
    const className = room.class_id ? getClassName(room.class_id) : "";
    const visibility = roomVisibilityLabel(room.visibility || "public");
    const roleMeta = getRoomRoleMeta(room);
    const mode = roomModeValue(room);
    const modeLabel = roomModeLabel(mode);
    const statusLabel = room.status === "waiting" ? "Đang chờ" : room.status === "live" ? "Đang đấu" : "Đã kết thúc";
    const statusClass = room.status === "waiting" ? "waiting" : room.status === "live" ? "live" : "done";
    const hasCapacity = roomHasCapacity(room);
    const fillPercent = Math.max(0, Math.min(100, Math.round((players.length / Number(room.max_players || 8)) * 100)));
    const canEnter = joined || (room.status === "waiting" && hasCapacity);
    return `<div class="room-card">
      <div class="room-top">
        <div>
          <div class="room-title">${esc(room.title || "Phòng thi đấu")}</div>
          <div class="hint">Mã phòng: <b>${esc(room.join_code || "—")}</b></div>
          ${className ? `<div class="hint">Lớp: <b>${esc(className)}</b></div>` : ""}
          <div class="hint">Chế độ: <b>${esc(modeLabel)}</b></div>
        </div>
        <span class="pill ${statusClass}">${statusLabel}</span>
      </div>
      <div class="room-meta">
        <div><span>Khối</span><strong>${esc(grade)}</strong></div>
        <div><span>Môn</span><strong>${esc(subject)}</strong></div>
        <div><span>Phòng</span><strong>${esc(visibility)}</strong></div>
        <div><span>Số câu</span><strong>${room.question_count || 0} câu</strong></div>
        <div><span>Người chơi</span><strong>${players.length}/${room.max_players || 8}</strong></div>
      </div>
      <div class="room-fill"><div class="room-fill-bar" style="width:${fillPercent}%"></div></div>
      <div class="hint">${esc(room.description || "Phòng thi đấu không có mô tả.")}</div>
      <div class="room-actions">
        ${joined
          ? `<button class="btn btn-primary" type="button" data-enter-room="${room.id}">${room.status === "finished" ? "Xem kết quả" : "Vào phòng"}</button>`
          : canEnter
            ? `<button class="btn btn-primary" type="button" data-join-room="${room.id}">Tham gia</button>`
            : `<button class="btn btn-outline" type="button" disabled>${room.status !== "waiting" ? "Đã khóa" : "Đã đầy"}</button>`}
      </div>
    </div>`;
  }

  function getPeriodStart(period) {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (period === "week") {
      const day = start.getDay() || 7;
      start.setDate(start.getDate() - day + 1);
      return start;
    }
    if (period === "month") {
      start.setDate(1);
      return start;
    }
    return start;
  }

  function getOrderedPlayersForRoom(roomId, players) {
    return [...(players || [])]
      .filter((player) => player.room_id === roomId)
      .sort((a, b) => (b.score || 0) - (a.score || 0) || new Date(a.joined_at) - new Date(b.joined_at));
  }

  function getPlayerLives(playerId, room, answers) {
    if (roomModeValue(room) !== "survival") return null;
    const wrongCount = (answers || []).filter((item) => item.player_id === playerId && item.is_correct === false).length;
    return Math.max(0, 3 - wrongCount);
  }

  function isPlayerEliminated(playerId, room, answers) {
    const lives = getPlayerLives(playerId, room, answers);
    return lives !== null && lives <= 0;
  }

  function getAlivePlayers(room, players, answers) {
    if (roomModeValue(room) !== "survival") return players || [];
    return (players || []).filter((player) => !isPlayerEliminated(player.id, room, answers));
  }

  function getRankedDeltaMap(orderedPlayers) {
    const total = orderedPlayers.length;
    if (!total) return {};
    const map = {};
    const rewards = total >= 4
      ? [20, 10, 0, -10]
      : total === 3
        ? [20, 10, 0]
        : [20, -10];
    orderedPlayers.forEach((player, index) => {
      map[player.user_id] = Number(rewards[index] ?? 0);
    });
    return map;
  }

  function getRankedProfile(finishedRooms, finishedPlayers, userId) {
    const rankedRooms = (finishedRooms || []).filter((room) => roomModeValue(room) === "ranked");
    let points = 1000;
    let matches = 0;
    let wins = 0;
    rankedRooms.forEach((room) => {
      const ordered = getOrderedPlayersForRoom(room.id, finishedPlayers);
      if (!ordered.some((player) => player.user_id === userId)) return;
      const deltas = getRankedDeltaMap(ordered);
      points += Number(deltas[userId] || 0);
      matches += 1;
      if (ordered[0]?.user_id === userId) wins += 1;
    });
    return { points, matches, wins };
  }

  function getArenaTier(elo) {
    if (elo >= 1800) return { name: "Kim cÆ°Æ¡ng", icon: "â—†" };
    if (elo >= 1550) return { name: "Báº¡ch kim", icon: "â¬¡" };
    if (elo >= 1300) return { name: "VÃ ng", icon: "â˜…" };
    if (elo >= 1100) return { name: "Báº¡c", icon: "âœ¦" };
    return { name: "Äá»“ng", icon: "â€¢" };
  }

  function getLeaderboardByElo(scopedRooms, finishedPlayers) {
    const rankedRooms = [...(scopedRooms || [])]
      .filter((room) => roomModeValue(room) === "ranked")
      .sort((a, b) => new Date(a.ended_at || a.created_at) - new Date(b.ended_at || b.created_at));
    const totals = {};
    rankedRooms.forEach((room) => {
      const ordered = getOrderedPlayersForRoom(room.id, finishedPlayers);
      const deltas = getRankedDeltaMap(ordered);
      Object.keys(deltas).forEach((userId) => {
        if (!totals[userId]) totals[userId] = { elo: 1000, matches: 0, wins: 0 };
        totals[userId].elo += Number(deltas[userId] || 0);
        totals[userId].matches += 1;
        if (ordered[0]?.user_id === userId) totals[userId].wins += 1;
      });
    });
    return Object.entries(totals)
      .map(([userId, info]) => ({ userId, ...info }))
      .sort((a, b) => b.elo - a.elo || b.wins - a.wins || b.matches - a.matches)
      .slice(0, 10);
  }

  function renderArenaInsightsLegacy() {
    const finishedRooms = GAME.rooms.filter((room) => room.status === "finished");
    const finishedIds = new Set(finishedRooms.map((room) => room.id));
    const finishedPlayers = GAME.players.filter((player) => finishedIds.has(player.room_id));
    const myFinished = finishedPlayers.filter((player) => player.user_id === GAME.user.id);
    const rankedProfile = getRankedProfile(finishedRooms, finishedPlayers, GAME.user.id);
    const myBest = myFinished.reduce((max, item) => Math.max(max, Number(item.score || 0)), 0);
    const totalMatches = myFinished.length;
    const totalScore = myFinished.reduce((sum, item) => sum + Number(item.score || 0), 0);
    const wins = myFinished.filter((player) => {
      const sameRoom = finishedPlayers.filter((row) => row.room_id === player.room_id);
      const best = sameRoom.reduce((max, row) => Math.max(max, Number(row.score || 0)), 0);
      return Number(player.score || 0) === best;
    }).length;
    const avgScore = totalMatches ? Math.round(myFinished.reduce((sum, item) => sum + Number(item.score || 0), 0) / totalMatches) : 0;
    const winRate = totalMatches ? Math.round((wins / totalMatches) * 100) : 0;
    const sortedMyFinished = [...myFinished].sort((a, b) => new Date(getRoomById(b.room_id)?.ended_at || 0) - new Date(getRoomById(a.room_id)?.ended_at || 0));
    let streak = 0;
    for (const player of sortedMyFinished) {
      const sameRoom = finishedPlayers.filter((row) => row.room_id === player.room_id);
      const best = sameRoom.reduce((max, row) => Math.max(max, Number(row.score || 0)), 0);
      if (Number(player.score || 0) === best) streak += 1;
      else break;
    }
    const tier = getArenaTier(rankedProfile.points);

    if (EL.heroBadges) {
      EL.heroBadges.innerHTML = `
        <div class="hero-badge">RP ${rankedProfile.points} • ${rankedProfile.wins}/${rankedProfile.matches} trận rank thắng</div>
        <div class="hero-badge">${tier.icon} Hạng ${tier.name}</div>
        <div class="hero-badge">Tỉ lệ thắng ${winRate}%</div>
        <div class="hero-badge">Chuỗi thắng ${streak}</div>
        <div class="hero-badge">Mode: Quick / Friends / Rank / Survival / Speed</div>
      `;
    }

    if (EL.statsGrid) {
      EL.statsGrid.innerHTML = `
        <div class="stat-card"><span>Điểm rank</span><strong>${rankedProfile.points}</strong><small>Thắng rank ${rankedProfile.wins}/${rankedProfile.matches}</small></div>
        <div class="stat-card"><span>Trận đã chơi</span><strong>${totalMatches}</strong></div>
        <div class="stat-card"><span>Trận thắng</span><strong>${wins}</strong><small>Tỉ lệ thắng ${winRate}%</small></div>
        <div class="stat-card"><span>Điểm cao nhất</span><strong>${myBest}</strong><small>Tổng điểm ${totalScore}</small></div>
        <div class="stat-card"><span>Điểm trung bình</span><strong>${avgScore}</strong><small>Chuỗi thắng ${streak}</small></div>
      `;
    }

    const history = [...myFinished]
      .sort((a, b) => new Date(getRoomById(b.room_id)?.ended_at || 0) - new Date(getRoomById(a.room_id)?.ended_at || 0))
      .slice(0, 8);
    if (EL.historyList) {
      EL.historyList.innerHTML = history.length
        ? history.map((player) => {
          const room = getRoomById(player.room_id);
          const sameRoom = finishedPlayers.filter((row) => row.room_id === player.room_id).sort((a, b) => (b.score || 0) - (a.score || 0));
          const rank = sameRoom.findIndex((row) => row.user_id === GAME.user.id) + 1;
          return `<div class="history-item">
            <div class="history-main">
              <strong>${esc(room?.title || "Phòng thi đấu")}</strong>
              <div class="hint">${fmtDateTime(room?.ended_at || room?.created_at)}</div>
            </div>
            <div class="history-actions">
              <div style="text-align:right"><strong>${player.score || 0} điểm</strong><div class="hint">Hạng #${Math.max(rank, 1)}</div></div>
              <button class="btn btn-outline btn-sm" type="button" onclick="openGameHistoryDetail('${player.room_id}')">Xem chi tiết</button>
            </div>
          </div>`;
        }).join("")
        : `<div class="empty">Bạn chưa có trận nào hoàn thành.</div>`;
    }

    const periodStart = getPeriodStart(GAME.leaderboardPeriod);
    const scopedRooms = finishedRooms.filter((room) => new Date(room.ended_at || room.created_at) >= periodStart);
    const scopedIds = new Set(scopedRooms.map((room) => room.id));
    const totals = {};
    finishedPlayers.filter((player) => scopedIds.has(player.room_id)).forEach((player) => {
      if (!totals[player.user_id]) totals[player.user_id] = { score: 0, matches: 0 };
      totals[player.user_id].score += Number(player.score || 0);
      totals[player.user_id].matches += 1;
    });
    const leaderboard = Object.entries(totals)
      .map(([userId, info]) => ({ userId, ...info }))
      .sort((a, b) => b.score - a.score || b.matches - a.matches)
      .slice(0, 10);

    if (EL.globalLeaderboard) {
      EL.globalLeaderboard.innerHTML = leaderboard.length
        ? leaderboard.map((item, idx) => `<div class="player-row"><div class="player-main"><img class="avatar" src="${escAttr(getPlayerAvatar(item.userId))}" alt="avatar"><div><div style="font-weight:700;color:var(--navy)">${idx + 1}. ${esc(getPlayerName(item.userId))}</div><div class="hint">${item.matches} trận</div></div></div><strong style="color:var(--navy)">${item.score}</strong></div>`).join("")
        : `<div class="empty">Chưa có dữ liệu bảng xếp hạng cho mốc thời gian này.</div>`;
    }
  }

  function renderArenaInsights() {
    const finishedRooms = GAME.rooms.filter((room) => room.status === "finished");
    const finishedIds = new Set(finishedRooms.map((room) => room.id));
    const finishedPlayers = GAME.players.filter((player) => finishedIds.has(player.room_id));
    const myFinished = finishedPlayers.filter((player) => player.user_id === GAME.user.id);
    const rankedProfile = getRankedProfile(finishedRooms, finishedPlayers, GAME.user.id);
    const myBest = myFinished.reduce((max, item) => Math.max(max, Number(item.score || 0)), 0);
    const totalMatches = myFinished.length;
    const totalScore = myFinished.reduce((sum, item) => sum + Number(item.score || 0), 0);
    const wins = myFinished.filter((player) => {
      const sameRoom = finishedPlayers.filter((row) => row.room_id === player.room_id);
      const best = sameRoom.reduce((max, row) => Math.max(max, Number(row.score || 0)), 0);
      return Number(player.score || 0) === best;
    }).length;
    const avgScore = totalMatches ? Math.round(totalScore / totalMatches) : 0;
    const winRate = totalMatches ? Math.round((wins / totalMatches) * 100) : 0;
    const sortedMyFinished = [...myFinished].sort((a, b) => new Date(getRoomById(b.room_id)?.ended_at || 0) - new Date(getRoomById(a.room_id)?.ended_at || 0));
    let streak = 0;
    for (const player of sortedMyFinished) {
      const sameRoom = finishedPlayers.filter((row) => row.room_id === player.room_id);
      const best = sameRoom.reduce((max, row) => Math.max(max, Number(row.score || 0)), 0);
      if (Number(player.score || 0) === best) streak += 1;
      else break;
    }
    const tier = getArenaTier(rankedProfile.points);

    if (EL.heroBadges) {
      EL.heroBadges.innerHTML = `
        <div class="hero-badge">Elo ${rankedProfile.points} • ${rankedProfile.wins}/${rankedProfile.matches} trận rank thắng</div>
        <div class="hero-badge">${tier.icon} Hạng ${tier.name}</div>
        <div class="hero-badge">Tỉ lệ thắng ${winRate}%</div>
        <div class="hero-badge">Chuỗi thắng ${streak}</div>
        <div class="hero-badge">Mode: Quick / Friends / Ranked / Survival / Speed</div>
      `;
    }

    if (EL.statsGrid) {
      EL.statsGrid.innerHTML = `
        <div class="stat-card"><span>Elo hiện tại</span><strong>${rankedProfile.points}</strong><small>Thắng rank ${rankedProfile.wins}/${rankedProfile.matches}</small></div>
        <div class="stat-card"><span>Trận đã chơi</span><strong>${totalMatches}</strong></div>
        <div class="stat-card"><span>Trận thắng</span><strong>${wins}</strong><small>Tỉ lệ thắng ${winRate}%</small></div>
        <div class="stat-card"><span>Điểm cao nhất</span><strong>${myBest}</strong><small>Tổng điểm ${totalScore}</small></div>
        <div class="stat-card"><span>Điểm trung bình</span><strong>${avgScore}</strong><small>Chuỗi thắng ${streak}</small></div>
      `;
    }

    const history = [...myFinished]
      .sort((a, b) => new Date(getRoomById(b.room_id)?.ended_at || 0) - new Date(getRoomById(a.room_id)?.ended_at || 0))
      .slice(0, 8);
    if (EL.historyList) {
      EL.historyList.innerHTML = history.length
        ? history.map((player) => {
          const room = getRoomById(player.room_id);
          const sameRoom = finishedPlayers.filter((row) => row.room_id === player.room_id).sort((a, b) => (b.score || 0) - (a.score || 0));
          const rank = sameRoom.findIndex((row) => row.user_id === GAME.user.id) + 1;
          return `<div class="history-item">
            <div class="history-main">
              <strong>${esc(getRoomDisplayTitle(room || {}))}</strong>
              <div class="hint">${fmtDateTime(room?.ended_at || room?.created_at)}</div>
            </div>
            <div class="history-actions">
              <div style="text-align:right"><strong>${player.score || 0} điểm</strong><div class="hint">Hạng #${Math.max(rank, 1)}</div></div>
              <button class="btn btn-outline btn-sm" type="button" onclick="openGameHistoryDetail('${player.room_id}')">Xem chi tiết</button>
            </div>
          </div>`;
        }).join("")
        : `<div class="empty">Bạn chưa có trận nào hoàn thành.</div>`;
    }

    const periodStart = getPeriodStart(GAME.leaderboardPeriod);
    const scopedRooms = finishedRooms.filter((room) => new Date(room.ended_at || room.created_at) >= periodStart);
    const leaderboard = getLeaderboardByElo(scopedRooms, finishedPlayers);

    if (EL.globalLeaderboard) {
      EL.globalLeaderboard.innerHTML = leaderboard.length
        ? leaderboard.map((item, idx) => `<div class="player-row"><div class="player-main"><img class="avatar" src="${escAttr(getPlayerAvatar(item.userId))}" alt="avatar"><div><div style="font-weight:700;color:var(--navy)">${idx + 1}. ${esc(getPlayerName(item.userId))}</div><div class="hint">${item.matches} trận rank • ${item.wins} thắng</div></div></div><strong style="color:var(--navy)">${item.elo}</strong></div>`).join("")
        : `<div class="empty">Chưa có dữ liệu Elo cho mốc thời gian này.</div>`;
    }
  }

  function getRoomById(roomId) {
    return GAME.roomsRaw.find((room) => room.id === roomId) || null;
  }

  async function openHistoryDetail(roomId) {
    const room = getRoomById(roomId);
    if (!room || !EL.historyModalBody) return;
    EL.historyModal.classList.add("show");
    EL.historyModalBody.innerHTML = `<div class="empty" style="grid-column:1/-1">Đang tải chi tiết trận đấu...</div>`;
    const [{ data: players }, { data: answers }, { data: questions }] = await Promise.all([
      sb.from("game_room_players").select("id,room_id,user_id,score,joined_at").eq("room_id", roomId).order("score", { ascending: false }),
      sb.from("game_room_answers").select("player_id,is_correct,score_earned,answered_at").eq("room_id", roomId),
      sb.from("game_room_questions").select("id,order_no,question_type,points").eq("room_id", roomId).order("order_no"),
    ]);
    const ordered = [...(players || [])].sort((a, b) => (b.score || 0) - (a.score || 0) || new Date(a.joined_at) - new Date(b.joined_at));
    const myPlayer = ordered.find((item) => item.user_id === GAME.user.id);
    const myAnswers = (answers || []).filter((item) => item.player_id === myPlayer?.id);
    const correctCount = myAnswers.filter((item) => item.is_correct).length;
    const accuracy = myAnswers.length ? Math.round((correctCount / myAnswers.length) * 100) : 0;
    const answerMap = Object.fromEntries(myAnswers.map((item) => [item.game_question_id, item]));
    EL.historyModalBody.innerHTML = `
      <div class="panel">
        <h3>${esc(getRoomDisplayTitle(room))}</h3>
        <div class="hint" style="margin-bottom:12px">${fmtDateTime(room.ended_at || room.created_at)}</div>
        <div class="history-stat-grid">
          <div class="history-stat"><span>Điểm của bạn</span><strong>${myPlayer?.score || 0}</strong></div>
          <div class="history-stat"><span>Xếp hạng</span><strong>#${Math.max(1, ordered.findIndex((item) => item.user_id === GAME.user.id) + 1)}</strong></div>
          <div class="history-stat"><span>Câu đúng</span><strong>${correctCount}/${room.question_count || 0}</strong></div>
          <div class="history-stat"><span>Độ chính xác</span><strong>${accuracy}%</strong></div>
        </div>
      </div>
      <div class="panel">
        <h3>Bảng xếp hạng trận</h3>
        <div class="player-list leaderboard">
          ${ordered.map((player, idx) => `<div class="player-row">
            <div class="player-main">
              <img class="avatar" src="${escAttr(getPlayerAvatar(player.user_id))}" alt="avatar">
              <div>
                <div style="font-weight:700;color:var(--navy)">${idx + 1}. ${esc(getPlayerName(player.user_id))}</div>
                <div class="hint">${player.user_id === GAME.user.id ? "Bạn" : "Người chơi"}</div>
              </div>
            </div>
            <strong style="color:var(--navy)">${player.score || 0}</strong>
          </div>`).join("")}
        </div>
        <div style="height:16px"></div>
        <h3>Chi tiết từng câu</h3>
        <div class="question-breakdown">
          ${(questions || []).map((question) => {
            const answer = answerMap[question.id];
            const stateClass = !answer ? "pending" : answer.is_correct ? "good" : "bad";
            const stateLabel = !answer ? "Chưa trả lời" : answer.is_correct ? "Đúng" : "Sai";
            return `<div class="question-breakdown-item ${stateClass}">
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
                <strong style="color:var(--navy)">Câu ${question.order_no}</strong>
                <span class="hint">${question.points || 0} điểm</span>
              </div>
              <div class="hint" style="margin-top:6px">Loại: ${question.question_type === "multi_choice" ? "Trắc nghiệm" : question.question_type === "true_false" ? "Đúng / Sai" : "Trả lời ngắn"}</div>
              <div style="margin-top:8px;font-weight:700;color:var(--navy)">${stateLabel}</div>
              <div class="hint" style="margin-top:4px">Điểm nhận được: ${answer?.score_earned || 0}</div>
            </div>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  function closeGameHistoryModal() {
    EL.historyModal?.classList.remove("show");
  }

  function openGameRoomModal() {
    EL.roomForm?.reset();
    EL.roomCode.value = randomCode();
    if (EL.roomTitle) EL.roomTitle.value = `Game ${EL.roomCode.value}`;
    if (EL.roomMode) EL.roomMode.value = GAME.role === "student" ? "friends" : (GAME.initialAction === "create_room_ranked" ? "ranked" : "quick");
    configureCreateRoomForm();
    if (EL.roomMaxPlayers) EL.roomMaxPlayers.value = "8";
    if (EL.roomClass) EL.roomClass.value = GAME.initialClassId && GAME.classIds.includes(GAME.initialClassId) ? GAME.initialClassId : "";
    applyModeDefaults(EL.roomMode?.value || "quick", true);
    if (EL.roomClass?.value) syncRoomFiltersFromClass(EL.roomClass.value);
    if (!EL.roomClass?.value) fillSubjects(EL.roomSubject, EL.roomGrade.value, "Chọn môn");
    EL.roomModal.classList.add("show");
  }

  function closeGameRoomModal() {
    EL.roomModal.classList.remove("show");
  }

  async function submitCreateRoom(event) {
    event.preventDefault();
    const mode = EL.roomMode?.value || "quick";
    const policy = getCreateRoomPolicy();
    const joinCode = String(EL.roomCode.value || "").trim().toUpperCase() || randomCode();
    const classId = policy.allowClass ? (EL.roomClass?.value || null) : null;
    const maxPlayers = mode === "ranked" ? 4 : Number(EL.roomMaxPlayers?.value || 8);
    if (policy.classRequired && !classId) {
      alert("Giáo viên cần chọn lớp học trước khi tạo phòng.");
      return;
    }
    const payload = {
      title: `${roomModeLabel(mode)} • ${joinCode}`,
      join_code: joinCode,
      mode,
      grade_id: EL.roomGrade.value,
      subject_id: EL.roomSubject.value,
      question_count: 5,
      time_per_question: 20,
      max_players: maxPlayers,
      class_id: classId,
      description: String(EL.roomDescription.value || "").trim(),
      visibility: policy.visibility,
      status: "waiting",
      host_id: GAME.user.id,
      created_by: GAME.user.id,
    };
    const { data: room, error } = await sb.from("game_rooms").insert(payload).select("*").single();
    if (error) {
      alert(`Lỗi tạo phòng: ${error.message}`);
      return;
    }
    await sb.from("game_room_players").insert({ room_id: room.id, user_id: GAME.user.id, score: 0, ready: true });
    closeGameRoomModal();
    await loadRooms();
    openRoomScreen(room.id);
  }

  async function joinRoom(roomId) {
    let room = (GAME.roomsRaw || []).find((item) => item.id === roomId);
    if (!room) {
      const { data, error } = await sb.from("game_rooms").select("*").eq("id", roomId).single();
      if (error) {
        alert("Không tìm thấy phòng này.");
        return;
      }
      room = data;
    }
    if (!room) {
      alert("Không tìm thấy phòng này.");
      return;
    }
    if (!canAccessClassRoom(room) && !GAME.players.some((player) => player.room_id === roomId && player.user_id === GAME.user.id)) {
      alert("Phòng này chỉ dành cho học sinh hoặc giáo viên của lớp được liên kết.");
      return;
    }
    if (!roomHasCapacity(room) && !GAME.players.some((player) => player.room_id === roomId && player.user_id === GAME.user.id)) {
      alert("Phòng này đã đầy.");
      return;
    }
    const exists = GAME.players.find((player) => player.room_id === roomId && player.user_id === GAME.user.id);
    if (!exists) {
      const autoReady = isPublicAutoMatchRoom(room);
      const { error } = await sb.from("game_room_players").insert({ room_id: roomId, user_id: GAME.user.id, score: 0, ready: autoReady });
      if (error && !String(error.message || "").includes("duplicate")) {
        alert(`Không thể tham gia phòng: ${error.message}`);
        return;
      }
    }
    await loadRooms();
    openRoomScreen(roomId);
  }

  async function quickMatch() {
    if (GAME.selectedAutoMode) {
      await autoMatchSelectedMode();
      return;
    }
    const gradeId = EL.gradeFilter?.value || "";
    const subjectId = EL.subjectFilter?.value || "";
    const keyword = String(EL.keyword?.value || "").trim().toLowerCase();
    const bestRoom = [...(GAME.rooms || [])]
      .filter((room) => room.status === "waiting" && (room.visibility || "public") === "public")
      .filter((room) => roomModeValue(room) === "quick")
      .filter((room) => !gradeId || room.grade_id === gradeId)
      .filter((room) => !subjectId || room.subject_id === subjectId)
      .filter((room) => !keyword || String(room.title || "").toLowerCase().includes(keyword) || String(room.join_code || "").toLowerCase().includes(keyword))
      .filter((room) => roomHasCapacity(room) || GAME.players.some((player) => player.room_id === room.id && player.user_id === GAME.user.id))
      .sort((a, b) => roomPlayerCount(b.id) - roomPlayerCount(a.id) || new Date(b.created_at) - new Date(a.created_at))[0];
    if (!bestRoom) {
      if (EL.roomMode) EL.roomMode.value = "quick";
      applyModeDefaults("quick", true);
      openGameRoomModal();
      alert("Chưa có phòng đấu nhanh phù hợp. Mình đã mở sẵn form tạo phòng đấu nhanh cho bạn.");
      return;
    }
    await joinRoom(bestRoom.id);
  }

  async function createAutoRoomForMode(mode, gradeId, subjectId) {
    const joinCode = randomCode();
    const defaults = getModeDefaults(mode);
    const payload = {
      title: `${roomModeLabel(mode)} • ${joinCode}`,
      join_code: joinCode,
      mode,
      grade_id: gradeId,
      subject_id: subjectId,
      question_count: 5,
      time_per_question: 20,
      max_players: Number(defaults.maxPlayers || 8),
      class_id: null,
      description: `Phòng tự ghép cho chế độ ${roomModeLabel(mode)}.`,
      visibility: "public",
      status: "waiting",
      host_id: GAME.user.id,
      created_by: GAME.user.id,
    };
    const { data: room, error } = await sb.from("game_rooms").insert(payload).select("*").single();
    if (error) {
      alert(`Không thể tạo phòng tự động: ${error.message}`);
      return null;
    }
    await sb.from("game_room_players").insert({ room_id: room.id, user_id: GAME.user.id, score: 0, ready: true });
    return room;
  }

  async function autoMatchSelectedMode() {
    const mode = GAME.selectedAutoMode || EL.modeFilter?.value || "";
    if (!mode) return;
    if (!EL.gradeFilter?.value || !EL.subjectFilter?.value) {
      alert("Hãy chọn Khối và Môn trước khi vào trận.");
      return;
    }
    if (mode === "friends") {
      if (GAME.role !== "student") {
        alert("Phòng bạn bè chỉ dành cho học sinh tạo và vào bằng mã phòng.");
        return;
      }
      if (EL.roomMode) EL.roomMode.value = "friends";
      openGameRoomModal();
      return;
    }
    await loadRooms();
    const targetRoom = [...(GAME.roomsRaw || [])]
      .filter((room) => room.status === "waiting")
      .filter((room) => room.mode === mode)
      .filter((room) => room.grade_id === EL.gradeFilter.value)
      .filter((room) => room.subject_id === EL.subjectFilter.value)
      .filter((room) => (room.visibility || "public") === "public")
      .sort((a, b) => roomPlayerCount(b.id) - roomPlayerCount(a.id) || new Date(a.created_at) - new Date(b.created_at))
      .find((room) => roomHasCapacity(room) || GAME.players.some((player) => player.room_id === room.id && player.user_id === GAME.user.id));

    const room = targetRoom || await createAutoRoomForMode(mode, EL.gradeFilter.value, EL.subjectFilter.value);
    if (!room) return;
    if (targetRoom) {
      await joinRoom(room.id);
      return;
    }
    await loadRooms();
    await joinRoom(room.id);
  }

  async function cleanupRoomCompletely(roomId) {
    if (!roomId) return;
    await sb.from("game_room_answers").delete().eq("room_id", roomId);
    await sb.from("game_room_questions").delete().eq("room_id", roomId);
    await sb.from("game_room_players").delete().eq("room_id", roomId);
    await sb.from("game_rooms").delete().eq("id", roomId);
    if (GAME.activeRoom?.id === roomId) hideGameScreen();
    await loadRooms();
  }

  async function cleanupRoomIfFinished(roomId) {
    if (!roomId) return;
    const { data: room } = await sb.from("game_rooms").select("id,status").eq("id", roomId).maybeSingle();
    if (!room || room.status === "finished") {
      await cleanupRoomCompletely(roomId);
    }
  }

  async function joinRoomByCode() {
    const code = String(EL.joinCode?.value || "").trim().toUpperCase();
    if (!code) {
      alert("Hãy nhập mã phòng trước.");
      return;
    }
    const room = (GAME.roomsRaw || []).find((item) => String(item.join_code || "").toUpperCase() === code);
    if (!room) {
      alert("Không tìm thấy phòng với mã này.");
      return;
    }
    await joinRoom(room.id);
  }

  async function toggleReadyState() {
    const player = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    if (!player) return;
    const { error } = await sb.from("game_room_players").update({ ready: !player.ready }).eq("id", player.id);
    if (error) {
      alert(`Không thể cập nhật trạng thái: ${error.message}`);
      return;
    }
    await refreshActiveRoom(GAME.activeRoom.id, true);
  }

  async function leaveRoom() {
    const room = GAME.activeRoom;
    const player = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    if (!room || !player) {
      hideGameScreen();
      return;
    }
    if (!confirm("Bạn muốn rời phòng này?")) return;
    GAME.leavingRoom = true;
    clearIntervals();
    await sb.from("game_room_answers").delete().eq("player_id", player.id);
    const { error } = await sb.from("game_room_players").delete().eq("id", player.id);
    if (error) GAME.leavingRoom = false;
    if (error) {
      alert(`Không thể rời phòng: ${error.message}`);
      return;
    }
    const { data: remain = [] } = await sb.from("game_room_players").select("id,user_id").eq("room_id", room.id).order("joined_at", { ascending: true });
    if (!remain.length) {
      GAME.leavingRoom = false;
      await cleanupRoomCompletely(room.id);
      hideGameScreen();
      return;
    }
    if (room.host_id === GAME.user.id) {
      await sb.from("game_rooms").update({ host_id: remain[0].user_id, started_at: remain.length >= 2 ? room.started_at : null }).eq("id", room.id);
    } else if (remain.length < 2) {
      await sb.from("game_rooms").update({ started_at: null }).eq("id", room.id);
    }
    GAME.leavingRoom = false;
    await loadRooms();
    hideGameScreen();
  }

  function buildInviteText(room, friendName) {
    const prefix = friendName ? `${friendName} ơi, ` : "";
    return `${prefix}mời bạn vào phòng thi đấu "${room.title || "Game"}". Mã phòng: ${room.join_code || "—"}.`;
  }

  async function copyRoomCode() {
    if (!GAME.activeRoom?.join_code) return;
    await copyText(GAME.activeRoom.join_code, "Đã sao chép mã phòng.");
  }

  async function copyRoomInvite() {
    if (!GAME.activeRoom) return;
    await copyText(buildInviteText(GAME.activeRoom), "Đã sao chép lời mời.");
  }

  async function inviteFriend(friendId) {
    const friend = GAME.friends.find((item) => item.id === friendId);
    if (!GAME.activeRoom || !friend) return;
    await copyText(buildInviteText(GAME.activeRoom, friend.full_name), `Đã sao chép lời mời cho ${friend.full_name || "bạn bè"}.`);
  }

  async function kickPlayer(playerId) {
    const room = GAME.activeRoom;
    if (!room || room.host_id !== GAME.user.id) return;
    const player = GAME.roomPlayers.find((item) => item.id === playerId);
    if (!player || player.user_id === GAME.user.id) return;
    if (!confirm(`Mời ${getPlayerName(player.user_id)} ra khỏi phòng này?`)) return;
    await sb.from("game_room_answers").delete().eq("player_id", player.id);
    const { error } = await sb.from("game_room_players").delete().eq("id", player.id);
    if (error) {
      alert(`Không thể mời người chơi ra khỏi phòng: ${error.message}`);
      return;
    }
    await refreshActiveRoom(room.id, true);
    await loadRooms();
  }

  async function openRoomScreen(roomId) {
    clearIntervals();
    EL.roomScreen.classList.add("show");
    setupRoomRealtime(roomId);
    await refreshActiveRoom(roomId);
    GAME.roomPoll = setInterval(() => refreshActiveRoom(roomId, true), 1200);
  }

  function hideGameScreen() {
    GAME.unloadingLeaveSent = false;
    clearIntervals();
    clearAutoStartTimer();
    clearWaitingCountdown();
    showRoomNotice("");
    teardownRoomRealtime();
    GAME.activeRoom = null;
    EL.roomScreen.classList.remove("show");
  }

  async function closeGameScreen() {
    const player = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    if (GAME.activeRoom && player && GAME.activeRoom.status !== "finished" && !GAME.leavingRoom) {
      await leaveRoom();
      return;
    }
    hideGameScreen();
    loadRooms();
  }

  function clearIntervals() {
    clearInterval(GAME.roomPoll);
    clearInterval(GAME.questionTick);
    clearInterval(GAME.waitingTick);
    GAME.roomPoll = null;
    GAME.questionTick = null;
    GAME.waitingTick = null;
    clearAutoStartTimer();
  }

  async function refreshActiveRoom(roomId, silent) {
    const [{ data: room, error: roomErr }, { data: players, error: playerErr }, { data: questions, error: questionErr }, { data: answers, error: answerErr }] = await Promise.all([
      sb.from("game_rooms").select("*").eq("id", roomId).single(),
      sb.from("game_room_players").select("id,room_id,user_id,score,ready,joined_at").eq("room_id", roomId).order("score", { ascending: false }),
      sb.from("game_room_questions").select("*").eq("room_id", roomId).order("order_no"),
      sb.from("game_room_answers").select("id,player_id,game_question_id,answer,is_correct,score_earned,answered_at").eq("room_id", roomId),
    ]);

    if (roomErr || playerErr || questionErr || answerErr) {
      if (GAME.leavingRoom || String(roomErr?.message || "").toLowerCase().includes("no rows")) {
        hideGameScreen();
        await loadRooms();
        return;
      }
      if (!silent) alert(`Không tải được phòng: ${roomErr?.message || playerErr?.message || questionErr?.message || answerErr?.message}`);
      return;
    }

    const prevPlayers = GAME.roomPlayers || [];
    GAME.activeRoom = room;
    GAME.roomPlayers = players || [];
    GAME.roomQuestions = questions || [];
    GAME.roomAnswers = answers || [];
    const questionIds = [...new Set((questions || []).map((item) => item.question_id).filter(Boolean))];
    if (questionIds.length) {
      const { data: difficultyRows } = await sb.from("question_bank").select("id,difficulty").in("id", questionIds);
      GAME.questionDifficultyMap = Object.fromEntries((difficultyRows || []).map((item) => [item.id, Number(item.difficulty || 2)]));
    } else {
      GAME.questionDifficultyMap = {};
    }
    const me = GAME.roomPlayers.find((player) => player.user_id === GAME.user.id);
    if (!me && room.status !== "finished") {
      hideGameScreen();
      await loadRooms();
      if (!silent) alert("Báº¡n khÃ´ng cÃ²n á»Ÿ trong phÃ²ng nÃ y.");
      return;
    }
    GAME.myAnswers = (answers || []).filter((item) => {
      return me ? item.player_id === me.id : false;
    });
    if (prevPlayers.length) announceRoomPresenceChanges(prevPlayers, GAME.roomPlayers);

    renderActiveRoom();
  }

  function renderActiveRoom() {
    const room = GAME.activeRoom;
    if (!room) return;
    const grade = GAME.grades.find((item) => item.id === room.grade_id)?.name || "—";
    const subject = GAME.subjects.find((item) => item.id === room.subject_id)?.name || "—";
    const className = room.class_id ? getClassName(room.class_id) : "";
    const visibility = roomVisibilityLabel(room.visibility || "public");
    const mode = roomModeValue(room);
    const modeLabel = roomModeLabel(mode);
    const autoManagedRoom = isPublicAutoMatchRoom(room);
    const isHost = room.host_id === GAME.user.id;
    const me = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    const canStart = room.status === "waiting" && isHost && GAME.roomPlayers.length >= 2;
    const countdownActive = room.status === "waiting" && GAME.roomPlayers.length >= 2;
    if (countdownActive && !room.started_at && !GAME.localCountdownStartedAt) {
      GAME.localCountdownStartedAt = new Date().toISOString();
    }
    if (countdownActive && room.started_at) {
      GAME.localCountdownStartedAt = room.started_at;
      renderWaitingCountdown(room);
      if (isHost) {
        const delayMs = Math.max(0, new Date(room.started_at).getTime() + 10000 - Date.now());
        queueAutoStart(room, delayMs);
      }
    } else if (countdownActive && GAME.localCountdownStartedAt) {
      renderWaitingCountdown({ started_at: GAME.localCountdownStartedAt });
    } else {
      clearAutoStartTimer();
      clearWaitingCountdown();
      if (isHost && room.status === "waiting" && room.started_at) {
        sb.from("game_rooms").update({ started_at: null }).eq("id", room.id).then(() => refreshActiveRoom(room.id, true)).catch(() => {});
      }
    }
    if (isHost && room.status === "waiting" && countdownActive && !room.started_at) {
      clearAutoStartTimer();
      sb.from("game_rooms").update({ started_at: new Date().toISOString() }).eq("id", room.id).then(() => refreshActiveRoom(room.id, true)).catch(() => {});
    }

    EL.roomScreenTitle.textContent = getRoomDisplayTitle(room);
    EL.startGameBtn.classList.toggle("hidden", !(room.status === "waiting" && isHost) || autoManagedRoom || countdownActive);
    EL.startGameBtn.disabled = !canStart;
    EL.toggleReadyBtn?.classList.add("hidden");
    if (EL.toggleReadyBtn && me && !isHost) EL.toggleReadyBtn.textContent = me.ready ? "Hủy sẵn sàng" : "Sẵn sàng";
    ensurePlayerCache().then(() => {
      if (room.status === "waiting") {
        setScreenState("waiting");
        EL.roomSummary.innerHTML = `
          <div><span>Mã phòng</span><strong>${esc(room.join_code || "—")}</strong></div>
          <div><span>Hiển thị</span><strong>${esc(visibility)}</strong></div>
          <div><span>Chế độ</span><strong>${esc(modeLabel)}</strong></div>
          <div><span>Lớp</span><strong>${esc(className || "Không gắn lớp")}</strong></div>
          <div><span>Khối</span><strong>${esc(grade)}</strong></div>
          <div><span>Môn</span><strong>${esc(subject)}</strong></div>
          <div><span>Số câu</span><strong>${room.question_count} câu</strong></div>
          <div><span>Số người</span><strong>${GAME.roomPlayers.length}/${room.max_players || 8}</strong></div>
          <div><span>Giây mỗi câu</span><strong>${room.time_per_question}s</strong></div>
          <div><span>Tạo lúc</span><strong>${fmtDateTime(room.created_at)}</strong></div>
        `;
        if (EL.inviteCode) EL.inviteCode.textContent = room.join_code || "—";
        if (EL.inviteVisibility) EL.inviteVisibility.textContent = visibility;
        EL.roomDescriptionView.textContent = room.description || "Mời bạn bè cùng vào phòng, khi đủ người thì chủ phòng bắt đầu trận.";
        if (autoManagedRoom) {
          EL.roomDescriptionView.textContent = "Hệ thống đang ghép người chơi. Khi đủ người, trận đấu sẽ tự động bắt đầu.";
        }
        if (EL.roomStartHint) {
          if (autoManagedRoom) {
            EL.roomStartHint.textContent = countdownActive
              ? "Phòng đã đủ người. Hệ thống đang đếm ngược để vào trận."
              : "Chọn xong là vào phòng ngay. Hãy chờ thêm người chơi để hệ thống tự bắt đầu trận.";
          } else
          if (isHost) {
            EL.roomStartHint.textContent = countdownActive
              ? "Phòng đã đủ điều kiện để bắt đầu trận."
              : "Cần ít nhất 2 người chơi để bắt đầu trận.";
          } else {
            EL.roomStartHint.textContent = "Hãy chờ thêm người chơi vào phòng để bắt đầu.";
          }
        }
        if (EL.roomStartHint && countdownActive && !autoManagedRoom) {
          EL.roomStartHint.textContent = isHost
            ? "Phòng đã có từ 2 người trở lên. Hệ thống đang đếm ngược 10 giây."
            : "Phòng đang đếm ngược. Hãy sẵn sàng vào trận.";
        }
        EL.playerList.innerHTML = GAME.roomPlayers.length
          ? GAME.roomPlayers.map((player, idx) => renderPlayerRow(player, idx + 1, false)).join("")
          : `<div class="empty">Chưa có người chơi nào trong phòng.</div>`;
        renderFriendInviteList(room);
        return;
      }

      if (room.status === "live") {
        setScreenState("live");
        renderLiveRoom();
        return;
      }

      setScreenState("finished");
      renderFinishedRoom();
    });
  }

  function renderPlayerRow(player, index, showScore) {
    const canKick = GAME.activeRoom?.status === "waiting" && GAME.activeRoom?.host_id === GAME.user?.id && player.user_id !== GAME.user?.id;
    const rankClass = showScore ? (index === 1 ? "top-1" : index === 2 ? "top-2" : index === 3 ? "top-3" : "") : "";
    const meClass = player.user_id === GAME.user?.id ? "me" : "";
    const lives = getPlayerLives(player.id, GAME.activeRoom, GAME.roomAnswers || []);
    const readyTag = GAME.activeRoom?.status === "waiting"
      ? `<span class="status-tag ${player.ready ? "ready" : "waiting"}">${player.ready ? "Sẵn sàng" : "Chưa sẵn sàng"}</span>`
      : "";
    return `<div class="player-row ${rankClass} ${meClass}">
      <div class="player-main">
        <img class="avatar" src="${escAttr(getPlayerAvatar(player.user_id))}" alt="avatar">
        <div>
          <div style="font-weight:700;color:var(--navy)">${index}. ${esc(getPlayerName(player.user_id))}</div>
          <div class="hint">${player.user_id === GAME.activeRoom?.host_id ? "Chủ phòng" : "Người chơi"}${lives !== null ? ` • ${lives} mạng` : ""}</div>
        </div>
      </div>
      ${showScore ? `<strong style="color:var(--navy)">${player.score || 0}</strong>` : `<div style="display:grid;justify-items:end;gap:4px">${readyTag}${canKick ? `<button class="btn btn-outline btn-sm" type="button" onclick="kickGamePlayer('${player.id}')">Mời ra</button>` : ""}<span class="hint">${fmtDateTime(player.joined_at)}</span></div>`}
    </div>`;
  }

  function renderFriendInviteList(room) {
    if (!EL.friendInviteList) return;
    const joinedIds = new Set((GAME.roomPlayers || []).map((player) => player.user_id));
    const availableFriends = (GAME.friends || []).filter((friend) => !joinedIds.has(friend.id));
    EL.friendInviteList.innerHTML = availableFriends.length
      ? availableFriends.map((friend) => `<div class="friend-invite-row">
          <div class="player-main">
            <img class="avatar" src="${escAttr(friend.avatar_url || "default-avatar.png")}" alt="avatar">
            <div>
              <div style="font-weight:700;color:var(--navy)">${esc(friend.full_name || "Bạn bè")}</div>
              <div class="hint">${room.visibility === "private" ? "Phòng riêng tư" : "Có thể vào bằng mã"}</div>
            </div>
          </div>
          <button class="btn btn-outline btn-sm" type="button" onclick="inviteGameFriend('${friend.id}')">Mời</button>
        </div>`).join("")
      : `<div class="empty">Không còn bạn bè nào để mời vào phòng này.</div>`;
  }

  function getPlayerName(userId) {
    const row = window.__gameUserCache?.[userId];
    return row?.full_name || "Người chơi";
  }

  function getPlayerAvatar(userId) {
    const row = window.__gameUserCache?.[userId];
    return row?.avatar_url || "default-avatar.png";
  }

  async function ensurePlayerCache() {
    const ids = [...new Set((GAME.roomPlayers || []).map((item) => item.user_id))];
    if (!ids.length) return;
    window.__gameUserCache = window.__gameUserCache || {};
    const missing = ids.filter((id) => !window.__gameUserCache[id]);
    if (!missing.length) return;
    const { data } = await sb.from("users").select("id,full_name,avatar_url").in("id", missing);
    (data || []).forEach((user) => {
      window.__gameUserCache[user.id] = user;
    });
  }

  async function ensureArenaUserCache() {
    const ids = [...new Set((GAME.players || []).map((item) => item.user_id))];
    if (!ids.length) return;
    window.__gameUserCache = window.__gameUserCache || {};
    const missing = ids.filter((id) => !window.__gameUserCache[id]);
    if (!missing.length) return;
    const { data } = await sb.from("users").select("id,full_name,avatar_url").in("id", missing);
    (data || []).forEach((user) => {
      window.__gameUserCache[user.id] = user;
    });
  }

  async function startGameMatch() {
    const room = GAME.activeRoom;
    if (!room || room.host_id !== GAME.user.id) return;
    if (GAME.roomPlayers.length < 2) {
      alert("Cần ít nhất 2 người chơi để bắt đầu trận.");
      return;
    }
    const questions = await buildGameQuestions(room);
    GAME.questionDifficultyMap = Object.fromEntries(questions.map((item) => [item.question_id, Number(item.difficulty || 2)]));
    const dbQuestions = questions.map(({ difficulty, ...rest }) => rest);
    if (questions.length < room.question_count) {
      alert("Chưa đủ câu hỏi phù hợp trong Ngân hàng câu hỏi để bắt đầu trận.");
      return;
    }

    await sb.from("game_room_questions").delete().eq("room_id", room.id);
    const { error: insertErr } = await sb.from("game_room_questions").insert(dbQuestions);
    if (insertErr) {
      alert(`Không thể chuẩn bị câu hỏi: ${insertErr.message}`);
      return;
    }

    const { error: updateErr } = await sb.from("game_rooms").update({
      status: "live",
      started_at: new Date().toISOString(),
      ended_at: null,
    }).eq("id", room.id);

    if (updateErr) {
      alert(`Không thể bắt đầu trận: ${updateErr.message}`);
      return;
    }

    await refreshActiveRoom(room.id);
  }

  async function buildGameQuestions(room) {
    const { data: chapters } = await sb.from("chapters").select("id").eq("subject_id", room.subject_id);
    const chapterIds = (chapters || []).map((item) => item.id);
    let bank = [];
    if (chapterIds.length) {
      const { data } = await sb.from("question_bank")
        .select("id,question_type,question_text,question_img,answer,answer_count,hidden,difficulty")
        .in("chapter_id", chapterIds);
      bank = data || [];
    }
    if (bank.length < room.question_count) {
      const { data: fallbackBank } = await sb.from("question_bank")
        .select("id,chapter_id,question_type,question_text,question_img,answer,answer_count,hidden,difficulty");
      const merged = [...bank];
      (fallbackBank || []).forEach((question) => {
        if (!merged.some((item) => item.id === question.id)) merged.push(question);
      });
      bank = merged;
    }
    const usable = (bank || []).filter((item) => !item.hidden && ["multi_choice", "short_answer"].includes(item.question_type) && item.answer);
    const picked = shuffle(usable).slice(0, 5);
    return picked.map((question, index) => ({
      room_id: room.id,
      order_no: index + 1,
      question_id: question.id,
      question_type: question.question_type,
      question_text: question.question_text,
      question_img: question.question_img,
      answer: question.answer,
      answer_count: question.answer_count || (question.question_type === "short_answer" ? 1 : 4),
      points: defaultQuestionPoints(question.question_type),
      difficulty: question.difficulty || 2,
    }));
  }

  function renderLiveRoom() {
      const room = GAME.activeRoom;
      const questions = GAME.roomQuestions;
      const mode = roomModeValue(room);
      const me = GAME.roomPlayers.find((player) => player.user_id === GAME.user.id);
      const myLives = me ? getPlayerLives(me.id, room, GAME.roomAnswers || []) : null;
      if (!room || !questions.length) {
        renderMathText(EL.questionBody, "Đang chuẩn bị câu hỏi...");
        EL.answerArea.innerHTML = "";
        return;
      }

      const timeline = getQuestionTimeline(room, questions);
      const currentIndex = timeline.index;
      if (!timeline.question || currentIndex >= questions.length) {
        finishRoomIfNeeded();
        return;
      }

      const question = timeline.question;
      const secondsLeft = timeline.secondsLeft;
      EL.questionTitle.textContent = `Câu ${currentIndex + 1} / ${questions.length}`;
      EL.questionClock.textContent = String(secondsLeft).padStart(2, "0");
      if (EL.progressText) {
        EL.progressText.textContent = mode === "survival"
          ? `Sinh tồn • ${currentIndex + 1}/${questions.length}${myLives !== null ? ` • ${myLives} mạng` : ""}`
          : mode === "speed"
            ? `Đua tốc độ • ${currentIndex + 1}/${questions.length}`
            : `Tiến độ ${currentIndex + 1}/${questions.length}`;
      }
      if (EL.progressFill) EL.progressFill.style.width = `${((currentIndex + 1) / questions.length) * 100}%`;
      renderMathText(EL.questionBody, question.question_text || "Xem nội dung câu hỏi.");
      EL.questionImg.classList.toggle("hidden", !question.question_img);
      if (question.question_img) EL.questionImg.src = question.question_img;

      const answered = GAME.myAnswers.find((item) => item.game_question_id === question.id);
      const renderKey = `${question.id}:${answered?.id || "pending"}:${myLives ?? "na"}`;
      if (GAME.liveRenderKey !== renderKey) {
        GAME.liveRenderKey = renderKey;
        renderAnswerArea(question);
      }
      renderLeaderboard();

      clearInterval(GAME.questionTick);
      GAME.questionTick = setInterval(() => {
        const nextTimeline = getQuestionTimeline(room, questions);
        EL.questionClock.textContent = String(nextTimeline.secondsLeft).padStart(2, "0");
        if (nextTimeline.index !== currentIndex) {
          clearInterval(GAME.questionTick);
          GAME.liveRenderKey = "";
          refreshActiveRoom(room.id, true);
        }
      }, 1000);
  }

  function renderAnswerArea(question) {
    const room = GAME.activeRoom;
    const me = GAME.roomPlayers.find((player) => player.user_id === GAME.user.id);
    const answered = GAME.myAnswers.find((item) => item.game_question_id === question.id);
    const isEliminated = me ? isPlayerEliminated(me.id, GAME.activeRoom, GAME.roomAnswers || []) : false;
    const disabled = !!answered || isEliminated;
    if (EL.answerFeedback) {
      if (isEliminated) {
        EL.answerFeedback.innerHTML = `<div class="feedback-box bad">Bạn đã hết mạng trong trận sinh tồn này.</div>`;
      } else if (answered) {
        EL.answerFeedback.innerHTML = `<div class="feedback-box ${answered.is_correct ? "good" : "bad"}">${answered.is_correct ? "Bạn ghi điểm ở câu này." : "Bạn đã gửi đáp án."} +${answered.score_earned || 0} điểm</div>`;
      } else {
        EL.answerFeedback.innerHTML = `<div class="feedback-box pending">Mỗi câu chỉ được trả lời một lần. Hãy chọn thật chắc trước khi xác nhận.</div>`;
      }
    }

      if (roomModeValue(room) === "survival") {
        const alivePlayers = getAlivePlayers(room, GAME.roomPlayers, GAME.roomAnswers || []);
        if (alivePlayers.length <= 1) {
          finishRoomIfNeeded();
          return;
        }
      }

      if (question.question_type === "multi_choice") {
      const player = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
      window.__gameMcDraft = window.__gameMcDraft || {};
      window.__gameMcDraft[player?.id || "guest"] = window.__gameMcDraft[player?.id || "guest"] || {};
      const currentDraft = answered ? normalizeAnswer(answered.answer).split("") : (window.__gameMcDraft[player?.id || "guest"][question.id] || []);
      EL.answerArea.innerHTML = `<div class="options">${Array.from({ length: Math.max(2, Number(question.answer_count || 4)) }, (_, idx) => {
        const option = String.fromCharCode(65 + idx);
        const isActive = currentDraft.includes(option);
        return `<button class="option-btn ${isActive ? "active" : ""}" type="button" ${disabled ? "disabled" : ""} onclick="toggleGameChoice('${question.id}','${option}')">${option}</button>`;
      }).join("")}</div>${disabled ? renderAnsweredHint(answered) : `<button class="btn btn-primary" style="margin-top:12px" type="button" onclick="submitGameChoice('${question.id}')">Xác nhận đáp án</button>`}`;
      return;
    }

    if (question.question_type === "true_false") {
      const draft = window.__gameTfDraft?.[me?.id || "guest"]?.[question.id] || {};
      EL.answerArea.innerHTML = `<div class="tf-grid">${Array.from({ length: Math.max(2, Number(question.answer_count || 4)) }, (_, idx) => {
        const key = String.fromCharCode(97 + idx);
        const current = answered ? (parseTrueFalseAnswer(answered?.answer || "")[key] || "") : (draft[key] || "");
        return `<div class="tf-row"><strong>${key})</strong><div class="tf-actions"><button class="btn ${current === "Đ" ? "btn-primary" : "btn-outline"}" type="button" ${disabled ? "disabled" : ""} onclick="submitGameTrueFalse('${question.id}','${key}','Đ')">Đ</button><button class="btn ${current === "S" ? "btn-primary" : "btn-outline"}" type="button" ${disabled ? "disabled" : ""} onclick="submitGameTrueFalse('${question.id}','${key}','S')">S</button></div></div>`;
      }).join("")}</div>${disabled ? renderAnsweredHint(answered) : `<div class="hint" style="margin-top:10px">Mỗi câu chỉ nộp một lần. Hãy chọn đủ các ý rồi mới xác nhận.</div><button class="btn btn-primary" style="margin-top:10px" type="button" onclick="submitGameTrueFalseFinal('${question.id}')">Xác nhận đáp án</button>`}`;
      return;
    }

    window.__gameShortDraft = window.__gameShortDraft || {};
    if (me) window.__gameShortDraft[me.id] = window.__gameShortDraft[me.id] || {};
    const shortDraft = answered?.answer || window.__gameShortDraft?.[me?.id || "guest"]?.[question.id] || "";
    EL.answerArea.innerHTML = `
      <input id="gameShortAnswerInput" class="input short-input" placeholder="Nhập đáp án ngắn" ${disabled ? "disabled" : ""} value="${escAttr(shortDraft)}">
      ${disabled
        ? renderAnsweredHint(answered)
        : `<button class="btn btn-primary" style="margin-top:12px" type="button" onclick="submitGameShortAnswer('${question.id}')">Gửi đáp án</button>`}
    `;
    if (!disabled) {
      document.getElementById("gameShortAnswerInput")?.addEventListener("input", (event) => {
        if (!me) return;
        window.__gameShortDraft = window.__gameShortDraft || {};
        window.__gameShortDraft[me.id] = window.__gameShortDraft[me.id] || {};
        window.__gameShortDraft[me.id][question.id] = event.target.value || "";
      });
    }

    window.__gameTfDraft = window.__gameTfDraft || {};
    if (me) {
      window.__gameTfDraft[me.id] = window.__gameTfDraft[me.id] || {};
      window.__gameTfDraft[me.id][question.id] = window.__gameTfDraft[me.id][question.id] || {};
    }
  }

  function renderAnsweredHint(answered) {
    return `<div class="hint" style="margin-top:10px;color:${answered?.is_correct ? "#15803d" : "#c2410c"}">${answered?.is_correct ? "Bạn đã trả lời đúng." : "Bạn đã gửi đáp án cho câu này."}${answered?.combo_bonus ? ` Combo +${answered.combo_bonus}` : ""}</div>`;
  }

  function parseTrueFalseAnswer(raw) {
    const map = {};
    const text = String(raw || "");
    for (let idx = 0; idx < text.length; idx += 2) {
      const key = text[idx];
      const value = text[idx + 1];
      if (key && value) map[key] = value;
    }
    return map;
  }

  function renderLeaderboard() {
    const ordered = [...GAME.roomPlayers].sort((a, b) => {
      const livesA = getPlayerLives(a.id, GAME.activeRoom, GAME.roomAnswers || []);
      const livesB = getPlayerLives(b.id, GAME.activeRoom, GAME.roomAnswers || []);
      if (livesA !== null || livesB !== null) {
        if ((livesB ?? -1) !== (livesA ?? -1)) return (livesB ?? -1) - (livesA ?? -1);
      }
      return (b.score || 0) - (a.score || 0) || new Date(a.joined_at) - new Date(b.joined_at);
    });
    const comboStats = getMyComboStats();
    EL.leaderboard.innerHTML = ordered.map((player, idx) => renderPlayerRow(player, idx + 1, true)).join("");
    const myIndex = ordered.findIndex((item) => item.user_id === GAME.user.id);
    const myRow = ordered[myIndex];
    EL.myScore.textContent = myRow?.score || 0;
    EL.myRank.textContent = myIndex >= 0 ? `#${myIndex + 1}` : "#-";
    if (EL.myCombo) EL.myCombo.textContent = comboStats.combo;
    if (EL.myBestCombo) EL.myBestCombo.textContent = comboStats.best;
  }

  async function finishRoomIfNeeded() {
    clearInterval(GAME.questionTick);
    const room = GAME.activeRoom;
    if (!room) return;
    if (roomModeValue(room) === "survival") {
      const alivePlayers = getAlivePlayers(room, GAME.roomPlayers, GAME.roomAnswers || []);
      const currentIndex = getQuestionTimeline(room, GAME.roomQuestions).index;
      if (alivePlayers.length > 1 && currentIndex < GAME.roomQuestions.length) {
        return;
      }
    }
    if (room.status !== "finished" && room.host_id === GAME.user.id) {
      await sb.from("game_rooms").update({ status: "finished", ended_at: new Date().toISOString() }).eq("id", room.id);
    }
    await refreshActiveRoom(room.id, true);
    if (room.host_id === GAME.user.id) {
      setTimeout(() => {
        cleanupRoomIfFinished(room.id);
      }, 6000);
    }
  }

  function renderFinishedRoom() {
    const ordered = [...GAME.roomPlayers].sort((a, b) => {
      const livesA = getPlayerLives(a.id, GAME.activeRoom, GAME.roomAnswers || []);
      const livesB = getPlayerLives(b.id, GAME.activeRoom, GAME.roomAnswers || []);
      if (livesA !== null || livesB !== null) {
        if ((livesB ?? -1) !== (livesA ?? -1)) return (livesB ?? -1) - (livesA ?? -1);
      }
      return (b.score || 0) - (a.score || 0) || new Date(a.joined_at) - new Date(b.joined_at);
    });
    const winner = ordered[0];
    const rankedDeltaMap = roomModeValue(GAME.activeRoom) === "ranked" ? getRankedDeltaMap(ordered) : {};
    EL.finishedMeta.textContent = roomModeValue(GAME.activeRoom) === "survival"
      ? `Phòng ${GAME.activeRoom?.title || ""} đã kết thúc. Ở chế độ sinh tồn, người còn nhiều mạng hơn sẽ xếp trên, nếu bằng mạng thì so điểm.`
      : roomModeValue(GAME.activeRoom) === "speed"
        ? `Phòng ${GAME.activeRoom?.title || ""} đã kết thúc. Ở chế độ đua tốc độ, đúng nhanh sẽ nhận nhiều điểm hơn.`
        : `Phòng ${GAME.activeRoom?.title || ""} đã kết thúc. Người có điểm cao hơn sẽ xếp trên, nếu bằng điểm thì ai vào phòng sớm hơn sẽ xếp trên.`;
    if (EL.myStats) {
      const myPlayer = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
      const myRows = GAME.myAnswers || [];
      const correctCount = myRows.filter((item) => item.is_correct).length;
      const totalCount = myRows.length;
      const accuracy = totalCount ? Math.round((correctCount / totalCount) * 100) : 0;
      EL.myStats.innerHTML = `
        <div><span>Điểm của bạn</span><strong>${myPlayer?.score || 0}</strong></div>
        <div><span>Câu đúng</span><strong>${correctCount}/${GAME.roomQuestions.length || 0}</strong></div>
        <div><span>Độ chính xác</span><strong>${accuracy}%</strong></div>
        ${getPlayerLives(myPlayer?.id, GAME.activeRoom, GAME.roomAnswers || []) !== null ? `<div><span>Mạng còn lại</span><strong>${getPlayerLives(myPlayer?.id, GAME.activeRoom, GAME.roomAnswers || [])}</strong></div>` : ""}
        <div><span>Xếp hạng</span><strong>#${Math.max(1, ordered.findIndex((item) => item.user_id === GAME.user.id) + 1)}</strong></div>
      `;
    }
    EL.resultsList.innerHTML = ordered.map((player, idx) => {
      const medalClass = idx === 0 ? "first" : idx === 1 ? "second" : idx === 2 ? "third" : "normal";
      return `<div class="result-card ${winner && player.id === winner.id ? "winner" : ""}">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="medal ${medalClass}">${idx + 1}</div>
          <div>
            <div style="font-weight:800;color:var(--navy)">${esc(getPlayerName(player.user_id))}</div>
            ${roomModeValue(GAME.activeRoom) === "ranked" ? `<div class="hint">${Number(rankedDeltaMap[player.user_id] || 0) >= 0 ? "+" : ""}${Number(rankedDeltaMap[player.user_id] || 0)} Elo</div>` : ""}
            <div class="hint">${player.user_id === GAME.user.id ? "Bạn" : "Người chơi"}</div>
          </div>
        </div>
        <div style="font-size:1.1rem;font-weight:800;color:var(--navy)">${player.score || 0} điểm</div>
      </div>`;
    }).join("");
  }

  async function submitAnswer(questionId, answerValue) {
    const room = GAME.activeRoom;
    const player = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    const question = GAME.roomQuestions.find((item) => item.id === questionId);
    if (!room || !player || !question) return;

    const existing = GAME.myAnswers.find((item) => item.game_question_id === questionId);
    if (existing) return;

    const timeline = getQuestionTimeline(room, GAME.roomQuestions);
    const questionIndex = timeline.index;
    if (GAME.roomQuestions[questionIndex]?.id !== questionId) return;

    const remaining = Math.max(0, timeline.secondsLeft);
    const totalTime = Math.max(10, timeline.duration || getQuestionDuration(question, room));
    const currentCombo = getCurrentComboValue();
    const scored = evaluateAnswer(question, answerValue, remaining, totalTime, currentCombo);

    const { error: insertErr } = await sb.from("game_room_answers").insert({
      room_id: room.id,
      player_id: player.id,
      game_question_id: questionId,
      answer: answerValue,
      is_correct: scored.isCorrect,
      score_earned: scored.score,
      response_ms: (totalTime - remaining) * 1000,
    });

    if (insertErr) {
      if (!String(insertErr.message || "").includes("duplicate")) {
        alert(`Không thể gửi đáp án: ${insertErr.message}`);
      }
      return;
    }

    const nextScore = await recalcPlayerScore(player.id);
    await sb.from("game_room_players").update({ score: nextScore }).eq("id", player.id);
    await refreshActiveRoom(room.id, true);
  }

  function evaluateAnswer(question, answerValue, remaining, totalTime, currentCombo) {
    const mode = roomModeValue(GAME.activeRoom);
    const speedBonus = Math.round((remaining / totalTime) * (mode === "speed" ? 70 : 35));
    const base = Number(question.points || 0);
    const comboBonus = mode === "speed"
      ? (currentCombo >= 1 ? Math.min(90, (currentCombo + 1) * 12) : 0)
      : currentCombo >= 2
        ? Math.min(60, currentCombo * 10)
        : 0;
    if (question.question_type === "multi_choice") {
      const correct = normalizeAnswer(question.answer);
      const mine = normalizeAnswer(answerValue);
      const ok = correct === mine;
      return { isCorrect: ok, score: ok ? base + speedBonus + comboBonus : 0, comboBonus: ok ? comboBonus : 0 };
    }
    if (question.question_type === "true_false") {
      const correct = normalizeAnswer(question.answer);
      const mine = normalizeAnswer(answerValue);
      const ok = correct === mine;
      return { isCorrect: ok, score: ok ? base + speedBonus + comboBonus : 0, comboBonus: ok ? comboBonus : 0 };
    }
    const accepted = shortAnswerAccepted(question.answer);
    const ok = accepted.includes(String(answerValue || "").trim().toLowerCase());
    return { isCorrect: ok, score: ok ? base + speedBonus + comboBonus : 0, comboBonus: ok ? comboBonus : 0 };
  }

  async function recalcPlayerScore(playerId) {
    const { data } = await sb.from("game_room_answers").select("score_earned").eq("player_id", playerId);
    return (data || []).reduce((sum, item) => sum + Number(item.score_earned || 0), 0);
  }

  window.toggleGameChoice = function (questionId, option) {
    const player = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    if (!player) return;
    window.__gameMcDraft = window.__gameMcDraft || {};
    window.__gameMcDraft[player.id] = window.__gameMcDraft[player.id] || {};
    const current = new Set(window.__gameMcDraft[player.id][questionId] || []);
    if (current.has(option)) current.delete(option);
    else current.add(option);
    window.__gameMcDraft[player.id][questionId] = [...current].sort();
    renderAnswerArea(GAME.roomQuestions.find((item) => item.id === questionId));
  };

  window.submitGameChoice = function (questionId) {
    const player = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    if (!player) return;
    const picks = window.__gameMcDraft?.[player.id]?.[questionId] || [];
    if (!picks.length) {
      alert("Hãy chọn ít nhất một đáp án.");
      return;
    }
    submitAnswer(questionId, picks.join(""));
  };

  window.submitGameTrueFalse = function (questionId, key, value) {
    const player = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    if (!player) return;
    window.__gameTfDraft = window.__gameTfDraft || {};
    window.__gameTfDraft[player.id] = window.__gameTfDraft[player.id] || {};
    window.__gameTfDraft[player.id][questionId] = window.__gameTfDraft[player.id][questionId] || {};
    window.__gameTfDraft[player.id][questionId][key] = value;
    renderAnswerArea(GAME.roomQuestions.find((item) => item.id === questionId));
  };

  window.submitGameTrueFalseFinal = function (questionId) {
    const player = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    if (!player) return;
    const draft = window.__gameTfDraft?.[player.id]?.[questionId] || {};
    const packed = Object.keys(draft).sort().map((key) => `${key}${draft[key]}`).join("");
    if (!packed) {
      alert("Hãy chọn ít nhất một đáp án.");
      return;
    }
    submitAnswer(questionId, packed);
  };

  window.submitGameShortAnswer = function (questionId) {
    const value = document.getElementById("gameShortAnswerInput")?.value || "";
    if (!String(value).trim()) {
      alert("Hãy nhập đáp án trước khi gửi.");
      return;
    }
    const player = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    if (player) {
      window.__gameShortDraft = window.__gameShortDraft || {};
      window.__gameShortDraft[player.id] = window.__gameShortDraft[player.id] || {};
      window.__gameShortDraft[player.id][questionId] = value.trim();
    }
    submitAnswer(questionId, value.trim());
  };

  window.inviteGameFriend = inviteFriend;
  window.kickGamePlayer = kickPlayer;
  window.openGameHistoryDetail = openHistoryDetail;
  window.closeGameHistoryModal = closeGameHistoryModal;
  window.closeGameRoomModal = closeGameRoomModal;
  window.closeGameScreen = closeGameScreen;
})();
