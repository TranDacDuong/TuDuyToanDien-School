(function () {
  const GAME = {
    user: null,
    profile: null,
    role: "student",
    initialClassId: "",
    initialAction: "",
    initialRoomId: "",
    grades: [],
    subjects: [],
    chapters: [],
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
    roomPresenceIds: [],
    accessToken: "",
    unloadingLeaveSent: false,
    leavingRoom: false,
    selectedAutoMode: "",
    questionDifficultyMap: {},
    configs: [],
    configQuestions: [],
    rounds: [],
    roundChallenges: [],
    roundChallengeQuestions: [],
    roundFinishChoices: {},
    roundObstacleSelection: {},
    roundObstacleStartedAt: {},
    roundObstacleKeywordDraft: {},
    selectedRoundId: "",
    roundAttemptCache: {},
    finishHopeStars: {},
    roundReturnTimer: null,
    questionPicker: {
      target: null,
      format: "plain",
      requiredCount: 0,
      selected: new Map(),
      rows: [],
    },
    editingConfigIds: [],
    editingRoundId: "",
    liveRenderKey: "",
    autoStartTimer: null,
  };

  const EL = {
    gradeFilter: document.getElementById("gameGradeFilter"),
    subjectFilter: document.getElementById("gameSubjectFilter"),
    roundGrid: document.getElementById("gameRoundGrid"),
    heroBadges: document.getElementById("gameHeroBadges"),
    statsGrid: document.getElementById("gameStatsGrid"),
    historyList: document.getElementById("gameHistoryList"),
    historyModal: document.getElementById("gameHistoryModal"),
    historyModalBody: document.getElementById("gameHistoryModalBody"),
    globalLeaderboard: document.getElementById("gameGlobalLeaderboard"),
    mountainLeaderboard: document.getElementById("gameMountainLeaderboard"),
    mountainLeaderboardTitle: document.getElementById("gameMountainLeaderboardTitle"),
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
    adminPage: document.getElementById("gameAdminPage"),
    configForm: document.getElementById("gameConfigForm"),
    roundForm: document.getElementById("gameRoundForm"),
    adminConfigMode: document.getElementById("adminGameConfigMode"),
    adminConfigTitle: document.getElementById("adminGameConfigTitle"),
    adminConfigGrade: document.getElementById("adminGameConfigGrade"),
    adminConfigSubject: document.getElementById("adminGameConfigSubject"),
    adminConfigQuestionCount: document.getElementById("adminGameConfigQuestionCount"),
    adminConfigTime: document.getElementById("adminGameConfigTime"),
    adminConfigQuestionIds: document.getElementById("adminGameConfigQuestionIds"),
    adminRoundTitle: document.getElementById("adminGameRoundTitle"),
    adminRoundNo: document.getElementById("adminGameRoundNo"),
    adminRoundGrade: document.getElementById("adminGameRoundGrade"),
    adminRoundSubject: document.getElementById("adminGameRoundSubject"),
    adminRoundDescription: document.getElementById("adminGameRoundDescription"),
    adminWarmupQuestionIds: document.getElementById("adminWarmupQuestionIds"),
    adminObstacleKeyword: document.getElementById("adminObstacleKeyword"),
    adminObstacleQuestionIds: document.getElementById("adminObstacleQuestionIds"),
    adminAccelerationQuestionIds: document.getElementById("adminAccelerationQuestionIds"),
    adminFinishEasyQuestionIds: document.getElementById("adminFinishEasyQuestionIds"),
    adminFinishMediumQuestionIds: document.getElementById("adminFinishMediumQuestionIds"),
    adminFinishHardQuestionIds: document.getElementById("adminFinishHardQuestionIds"),
    adminConfigList: document.getElementById("adminGameConfigList"),
    adminRoundList: document.getElementById("adminGameRoundList"),
    pickerModal: document.getElementById("gameQuestionPickerModal"),
    pickerTitle: document.getElementById("gameQuestionPickerTitle"),
    pickerGrade: document.getElementById("gameQuestionPickerGrade"),
    pickerSubject: document.getElementById("gameQuestionPickerSubject"),
    pickerChapter: document.getElementById("gameQuestionPickerChapter"),
    pickerSearch: document.getElementById("gameQuestionPickerSearch"),
    pickerList: document.getElementById("gameQuestionPickerList"),
    pickerSelected: document.getElementById("gameQuestionPickerSelected"),
    pickerApplyBtn: document.getElementById("applyGameQuestionPickerBtn"),
  };

  const GAME_ALLOWED_QUESTION_TYPES = ["multi_choice", "short_answer"];
  const GAME_QUESTION_TYPE_LABELS = {
    multi_choice: "Trắc nghiệm",
    short_answer: "Trả lời ngắn",
  };

  function supportsModeElo(mode) {
    return ["solo", "quick", "round"].includes(mode);
  }

  function roundToNearestTen(value) {
    return Math.round(Number(value || 0) / 10) * 10;
  }

  function getModeEloRule(mode) {
    if (mode === "solo") return "Chơi đơn: điểm trận bao nhiêu thì cộng bấy nhiêu Elo.";
    if (mode === "quick") return "Đấu nhanh: nửa trên được cộng Elo bằng hiệu điểm với người đối xứng ở nửa dưới; nửa dưới bị trừ đều tổng Elo đã cộng.";
    if (mode === "round") return "Vòng MindUp: đạt từ 100 điểm mới qua vòng và được cộng Elo; mỗi lần thi lại trừ 20 điểm.";
    if (mode === "solo") {
      return "Chơi đơn: điểm trận càng cao, Elo cộng càng nhiều.";
    }
    if (mode === "ranked") {
      return "Top 1 +100 Elo, top 2 +50 Elo, các vị trí còn lại bị trừ đều tổng 150 Elo.";
    }
    if (mode === "quick" || mode === "friends" || mode === "survival" || mode === "speed") {
      return "Top 25% +20 Elo, 25% tiếp theo +10 Elo, còn lại không đổi Elo.";
    }
    return "Chế độ này không tính Elo.";
  }

  function getModeEloDeltaMap(mode, orderedPlayers, room = null) {
    const total = orderedPlayers.length;
    if (!total || !supportsModeElo(mode)) return {};

    if (mode === "solo") {
      return Object.fromEntries((orderedPlayers || []).map((player) => [player.user_id, Math.max(0, Number(player.score || 0))]));
    }

    if (mode === "quick") {
      return getMirroredRankEloDeltaMap(orderedPlayers);
    }

    if (mode === "round") {
      return Object.fromEntries((orderedPlayers || []).map((player) => {
        const score = Number(player.score || 0);
        return [player.user_id, score >= 100 ? Math.max(0, score) : 0];
      }));
    }

    const map = {};
    if (mode === "ranked") {
      orderedPlayers.forEach((player, index) => {
        if (index === 0) {
          map[player.user_id] = 100;
          return;
        }
        if (index === 1) {
          map[player.user_id] = 50;
          return;
        }
        const losers = Math.max(1, total - 2);
        map[player.user_id] = -roundToNearestTen(150 / losers);
      });
      return map;
    }

    const topCount = Math.max(1, Math.ceil(total * 0.25));
    const secondCount = Math.max(1, Math.ceil(total * 0.25));
    orderedPlayers.forEach((player, index) => {
      if (index < topCount) map[player.user_id] = 20;
      else if (index < topCount + secondCount) map[player.user_id] = 10;
      else map[player.user_id] = 0;
    });
    return map;
  }

  function getMirroredRankEloDeltaMap(orderedPlayers) {
    const players = orderedPlayers || [];
    const total = players.length;
    const topCount = Math.floor(total / 2);
    const bottomCount = topCount;
    const map = Object.fromEntries(players.map((player) => [player.user_id, 0]));
    if (!topCount || !bottomCount) return map;

    let totalPositive = 0;
    for (let index = 0; index < topCount; index += 1) {
      const topPlayer = players[index];
      const mirroredPlayer = players[total - 1 - index];
      const delta = Math.max(0, Math.round(Number(topPlayer?.score || 0) - Number(mirroredPlayer?.score || 0)));
      map[topPlayer.user_id] = delta;
      totalPositive += delta;
    }

    const bottomPenalty = Math.round(totalPositive / bottomCount);
    for (let index = total - bottomCount; index < total; index += 1) {
      map[players[index].user_id] = -bottomPenalty;
    }
    return map;
  }

  function getSoloEloDeltaFromScore(score) {
    const value = Number(score || 0);
    if (value < 10) return -10;
    if (value < 25) return 0;
    if (value < 40) return 8;
    if (value < 55) return 15;
    if (value < 70) return 22;
    return 30;
  }

  function getSoloProfile(finishedRooms, finishedPlayers, userId) {
    const soloRooms = (finishedRooms || []).filter((room) => roomModeValue(room) === "solo");
    let points = 1000;
    let matches = 0;
    let totalScore = 0;
    let bestScore = 0;
    soloRooms.forEach((room) => {
      const player = (finishedPlayers || []).find((item) => item.room_id === room.id && item.user_id === userId);
      if (!player) return;
      const score = Number(player.score || 0);
      points += score;
      matches += 1;
      totalScore += score;
      bestScore = Math.max(bestScore, score);
    });
    return {
      points,
      matches,
      totalScore,
      bestScore,
      avgScore: matches ? Math.round(totalScore / matches) : 0,
    };
  }

  function getUnifiedEloProfile(finishedRooms, finishedPlayers, userId) {
    const eloRooms = [...(finishedRooms || [])]
      .filter((room) => supportsModeElo(roomModeValue(room)))
      .sort((a, b) => new Date(a.ended_at || a.created_at) - new Date(b.ended_at || b.created_at));
    let points = 1000;
    let matches = 0;
    let wins = 0;
    eloRooms.forEach((room) => {
      const ordered = getOrderedPlayersForRoom(room.id, finishedPlayers);
      if (!ordered.some((player) => player.user_id === userId)) return;
      const deltas = getModeEloDeltaMap(roomModeValue(room), ordered, room);
      points += Number(deltas[userId] || 0);
      matches += 1;
      if (ordered[0]?.user_id === userId && roomModeValue(room) !== "solo") wins += 1;
    });
    return { points, matches, wins };
  }

  function getArenaTierProgress(elo) {
    const tiers = [
      { name: "Đồng", icon: "•", min: 1000, max: 1099 },
      { name: "Bạc", icon: "✦", min: 1100, max: 1299 },
      { name: "Vàng", icon: "★", min: 1300, max: 1549 },
      { name: "Bạch kim", icon: "⬡", min: 1550, max: 1799 },
      { name: "Kim cương", icon: "◆", min: 1800, max: Infinity },
    ];
    const value = Math.max(1000, Number(elo || 1000));
    const current = tiers.find((tier) => value >= tier.min && value <= tier.max) || tiers[0];
    const next = tiers[tiers.indexOf(current) + 1] || null;
    if (!next) {
      return { current, next, percent: 100, text: "Bạn đã ở bậc cao nhất." };
    }
    const span = Math.max(1, next.min - current.min);
    const percent = Math.max(0, Math.min(100, Math.round(((value - current.min) / span) * 100)));
    const remain = Math.max(0, next.min - value);
    return {
      current,
      next,
      percent,
      text: `Còn ${remain} Elo để lên ${next.name}.`,
    };
  }

  init();
  normalizeStaticGameText();
  applyCleanModeOptions();

  if (EL.roomMode?.closest(".field")) {
    const modeLabels = EL.roomMode.closest(".field").querySelectorAll("label");
    if (modeLabels[0]) modeLabels[0].textContent = "Chế độ";
    if (modeLabels[1]) modeLabels[1].remove();
  }
  if (EL.roomVisibility?.closest(".field")) {
    const visibilityLabel = EL.roomVisibility.closest(".field").querySelector("label");
    if (visibilityLabel) visibilityLabel.textContent = "Hiển thị phòng";
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

  function applyCleanModeOptions() {
    if (EL.roomMode) {
      EL.roomMode.innerHTML = `<option value="quick">Đấu nhanh</option><option value="friends">Phòng bạn bè</option>`;
    }
  }

  applyCleanModeOptions();

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
    if (getRoomCoordinatorUserId(room, GAME.roomPlayers) === GAME.user?.id || getRoomStartControllerUserId(room) === GAME.user?.id) {
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
    document.querySelectorAll("[style*='color:var(--navy)']").forEach((node) => {
      node.style.color = "var(--navy)";
    });
    const heroTitle = document.querySelector(".hero-copy h1");
    const heroDesc = document.querySelector(".hero-copy p");
    if (heroDesc) {
      heroDesc.classList.add("hidden");
      heroDesc.style.display = "none";
    }
    EL.leaveGameBtn?.remove();
    EL.leaveGameBtn = null;
    if (EL.gradeFilter?.options[0]) EL.gradeFilter.options[0].text = "Tất cả khối";
    if (EL.subjectFilter?.options[0]) EL.subjectFilter.options[0].text = "Tất cả môn";

    const studentSectionTitles = document.querySelectorAll("#gameStudentInsightPage .section-card h3");
    EL.historyList?.closest(".section-card")?.classList.add("hidden");
    if (studentSectionTitles[0]) studentSectionTitles[0].textContent = "Lịch sử thi đấu gần đây";
    if (studentSectionTitles[1]) studentSectionTitles[1].textContent = "Bảng xếp hạng Elo";
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
    if (EL.questionClock?.parentElement?.firstChild) EL.questionClock.parentElement.firstChild.textContent = "⏱";
    document.querySelectorAll("#gameLiveView .panel h3")[0] && (document.querySelectorAll("#gameLiveView .panel h3")[0].textContent = "Đáp án của bạn");
    document.querySelectorAll("#gameLiveView .panel h3")[1] && (document.querySelectorAll("#gameLiveView .panel h3")[1].textContent = "Bảng xếp hạng");
    if (EL.finishedView?.querySelector("h3")) EL.finishedView.querySelector("h3").textContent = "Kết quả trận đấu";
    if (backBtn) backBtn.textContent = "← Quay lại";
    if (EL.leaveGameBtn) EL.leaveGameBtn.textContent = "Rời phòng";
    if (EL.myScore?.previousElementSibling) EL.myScore.previousElementSibling.textContent = "Điểm của bạn";
    if (EL.myRank?.previousElementSibling) EL.myRank.previousElementSibling.textContent = "Vị trí hiện tại";
    const historyModalTitle = document.querySelector("#gameHistoryModal .mh h2");
    if (historyModalTitle) historyModalTitle.textContent = "Chi tiết trận đấu";
    const historyClose = document.querySelector("#gameHistoryModal .mh .btn");
    if (historyClose) historyClose.textContent = "Đóng";
    if (heroTitle) heroTitle.textContent = "Đấu trường tri thức";
    if (heroDesc) heroDesc.textContent = "Chọn chế độ, vào phòng và trả lời thật nhanh. Luật cộng/trừ Elo của từng chế độ được hiển thị rõ để người chơi dễ theo dõi.";
    if (EL.roomScreenTitle) EL.roomScreenTitle.textContent = "Phòng thi đấu";
    if (EL.toggleReadyBtn) EL.toggleReadyBtn.textContent = "Sẵn sàng";
    if (EL.leaveGameBtn) EL.leaveGameBtn.textContent = "Rời phòng";
    if (EL.startGameBtn) EL.startGameBtn.textContent = "Bắt đầu trận";
    if (EL.questionTitle) EL.questionTitle.textContent = "Câu hỏi";
    if (EL.questionClock?.parentElement?.firstChild) EL.questionClock.parentElement.firstChild.textContent = "⏱";
    EL.progressText?.remove();
    if (EL.myScore?.previousElementSibling) EL.myScore.previousElementSibling.textContent = "Điểm của bạn";
    if (EL.myRank?.previousElementSibling) EL.myRank.previousElementSibling.textContent = "Vị trí hiện tại";
    document.querySelectorAll("#gameLiveView .panel h3")[0] && (document.querySelectorAll("#gameLiveView .panel h3")[0].textContent = "Đáp án của bạn");
    document.querySelectorAll("#gameLiveView .panel h3")[1] && (document.querySelectorAll("#gameLiveView .panel h3")[1].textContent = "Bảng xếp hạng");
    if (EL.finishedView?.querySelector("h3")) EL.finishedView.querySelector("h3").textContent = "Kết quả trận đấu";
  }

  if (EL.myScore?.previousElementSibling) EL.myScore.previousElementSibling.textContent = "Điểm của bạn";
  if (EL.myRank?.previousElementSibling) EL.myRank.previousElementSibling.textContent = "Vị trí hiện tại";

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


  function sortPlayersByJoin(players) {
    return [...(players || [])].sort((a, b) => new Date(a.joined_at || 0) - new Date(b.joined_at || 0) || String(a.user_id || "").localeCompare(String(b.user_id || "")));
  }

  function getRoomCoordinatorUserId(room, players) {
    const ordered = sortPlayersByJoin(players);
    return ordered[0]?.user_id || room?.host_id || room?.created_by || "";
  }

  function getRoomStartControllerUserId(room) {
    return room?.host_id || room?.created_by || "";
  }

  function getQuestionDuration(question, room) {
    if (["solo", "quick"].includes(roomModeValue(room))) {
      return Math.max(10, Number(room?.time_per_question || 60));
    }
    if (roomModeValue(room) === "round") {
      if (question?.challenge_type === "warmup") return 6;
      if (question?.challenge_type === "finish") {
        if (question.finish_level === "easy") return 20;
        if (question.finish_level === "hard") return 60;
        return 40;
      }
      if (question?.challenge_type === "acceleration") return Math.max(10, Number(question?.difficulty || 2) * 10);
      if (question?.challenge_type === "obstacle") return 60;
      return Math.max(10, Number(room?.time_per_question || 20));
    }
    const difficulty = Number(GAME.questionDifficultyMap?.[question?.question_id] || 2);
    return Math.max(10, difficulty * 10 || Number(room?.time_per_question || 20));
  }

  function getQuestionTimeline(room, questions) {
    if (roomModeValue(room) === "round") return getRoundQuestionTimeline(room, questions);
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
      { mode: "solo", title: "Chơi đơn", art: "🎯", desc: "Luyện nhanh như phần Tăng tốc, mỗi câu 5/10/15/20 điểm theo tốc độ.", elo: getModeEloRule("solo") },
      { mode: "quick", title: "Đấu nhanh", art: "⚡", desc: "Từ 2 người trở lên, đúng càng nhanh điểm từng câu càng cao.", elo: getModeEloRule("quick") },
      { mode: "round", title: "Vòng MindUp", art: "🏔️", desc: "4 thử thách kiểu Olympia: Khởi động, Chướng ngại, Tăng tốc, Về đích.", elo: "Từ 100 điểm mới qua vòng và được cộng Elo; thi lại trừ 20 điểm." },
    ];
    return [
      { mode: "solo", title: "Chơi đơn", art: "🎯", desc: "Vào trận ngay, luyện 5 câu để cày Elo.", elo: getModeEloRule("solo") },
      { mode: "quick", title: "Đấu nhanh", art: "⚡", desc: "Vào nhanh, ghép nhanh.", elo: getModeEloRule("quick") },
      { mode: "ranked", title: "Leo hạng", art: "🏆", desc: "Chế độ cạnh tranh Elo rõ ràng.", elo: getModeEloRule("ranked") },
      { mode: "survival", title: "Sinh tồn", art: "🛡️", desc: "Sai là mất mạng, càng về cuối càng căng.", elo: getModeEloRule("survival") },
      { mode: "speed", title: "Đua tốc độ", art: "🚀", desc: "Đúng nhanh để bứt lên.", elo: getModeEloRule("speed") },
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
      <div id="gameModeCardGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px"></div>
      <div style="display:grid;gap:10px;margin-top:8px">
        <div id="gameGradeCardGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px"></div>
      </div>
      <div style="display:none;gap:10px;margin-top:8px">
        <div id="gameSubjectCardGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px"></div>
      </div>
    `;
    hero.parentElement.insertBefore(deck, hero.nextSibling);
    const grid = deck.querySelector("#gameModeCardGrid");
    grid.innerHTML = getAutoMatchModeCards().map((item) => `
      <button type="button" class="game-mode-card" data-auto-mode="${item.mode}" style="display:grid;gap:10px;text-align:left;padding:18px;border-radius:18px;border:1px solid rgba(15,31,61,.08);background:#fff;color:var(--ink);cursor:pointer;box-shadow:var(--shadow-sm)">
        <div style="font-size:2rem;line-height:1">${item.art}</div>
        <div style="font-size:1.05rem;font-weight:800;color:var(--navy)">${item.title}</div>
        <div style="font-size:.85rem;color:var(--ink-mid)">${item.desc}</div>
        <div style="font-size:.78rem;color:var(--amber);line-height:1.5">${item.elo}</div>
      </button>
    `).join("");
  }

  function getGradeCardStyle(selected) {
    return `position:relative;display:grid;gap:8px;min-height:108px;padding:16px 18px;border-radius:18px;border:${selected ? "2px solid var(--gold)" : "1px solid rgba(15,31,61,.08)"};background:${selected ? "linear-gradient(135deg,var(--gold-pale) 0%,#fff 100%)" : "#fff"};box-shadow:${selected ? "0 10px 28px rgba(200,150,42,.16)" : "var(--shadow-sm)"};color:var(--ink);text-align:left;cursor:pointer;overflow:hidden;transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease`;
  }

  function getRoundBaseQuestions(questions) {
    return (questions || []).filter((question) => question.challenge_type !== "finish");
  }

  function getRoundFinishQuestions(questions, level) {
    return (questions || []).filter((question) => question.challenge_type === "finish" && question.finish_level === level);
  }

  function getRoundFinishChoice(roomId) {
    return GAME.roundFinishChoices?.[roomId] || null;
  }

  function setRoundFinishChoice(roomId, level) {
    if (!roomId) return;
    GAME.roundFinishChoices[roomId] = {
      level: ["easy", "medium", "hard"].includes(level) ? level : "medium",
      selectedAt: Date.now(),
    };
  }

  function walkQuestionTimeline(room, questions, elapsed) {
    let remainingElapsed = Math.max(0, elapsed);
    for (let index = 0; index < questions.length; index += 1) {
      const duration = getQuestionDuration(questions[index], room);
      if (remainingElapsed < duration) {
        return {
          index,
          question: questions[index],
          secondsLeft: Math.max(0, duration - remainingElapsed),
          duration,
          questions,
        };
      }
      remainingElapsed -= duration;
    }
    return { index: questions.length, question: null, secondsLeft: 0, duration: 0, questions };
  }

  function getRoundChallengeMetaPrefix() {
    return "[MindUpRound]";
  }

  function makeRoundRoomDescription(round, challengeType, finishLevel = "") {
    const meta = JSON.stringify({ challengeType, finishLevel });
    return `${getRoundChallengeMetaPrefix()}${meta}\n${round?.description || ""}`;
  }

  function parseRoundRoomMeta(room) {
    const text = String(room?.description || "");
    const prefix = getRoundChallengeMetaPrefix();
    if (!text.startsWith(prefix)) return {};
    const firstLine = text.split(/\n/)[0] || "";
    try {
      return JSON.parse(firstLine.slice(prefix.length)) || {};
    } catch (_) {
      return {};
    }
  }

  function getRoomRoundChallengeType(room) {
    return parseRoundRoomMeta(room).challengeType || "";
  }

  function getRoomRoundFinishLevel(room) {
    return parseRoundRoomMeta(room).finishLevel || "";
  }

  function getRoundChallengeDisplayName(type, finishLevel = "") {
    if (type === "warmup") return "Khởi động";
    if (type === "obstacle") return "Vượt chướng ngại vật";
    if (type === "acceleration") return "Tăng tốc";
    if (type === "finish") {
      if (finishLevel === "easy") return "Về đích - Dễ";
      if (finishLevel === "hard") return "Về đích - Khó";
      return "Về đích - Trung bình";
    }
    return "Vòng MindUp";
  }

  function getRoundChallengeQuestionCount(type) {
    if (type === "warmup") return 20;
    if (type === "obstacle") return 4;
    if (type === "acceleration") return 4;
    if (type === "finish") return 3;
    return 31;
  }

  function getRoundChallengeOrder() {
    return ["warmup", "obstacle", "acceleration", "finish"];
  }

  function getRoundFinishLevels() {
    return ["easy", "medium", "hard"];
  }

  function getRoundAttemptKey(challengeType, finishLevel = "") {
    return challengeType === "finish" ? `finish:${finishLevel || "medium"}` : challengeType;
  }

  async function loadRoundAttemptMap(roundId) {
    if (!roundId || !GAME.user?.id) return {};
    const { data } = await sb.from("game_rooms")
      .select("id,description,game_room_players!inner(user_id)")
      .eq("mode", "round")
      .eq("round_id", roundId)
      .eq("status", "finished")
      .eq("game_room_players.user_id", GAME.user.id)
      .limit(80);
    const map = {};
    (data || []).forEach((room) => {
      const meta = parseRoundRoomMeta(room);
      if (!meta.challengeType) return;
      map[getRoundAttemptKey(meta.challengeType, meta.finishLevel)] = true;
    });
    GAME.roundAttemptCache[roundId] = map;
    return map;
  }

  function isRoundChallengeCompleted(attemptMap, challengeType) {
    if (challengeType === "finish") return getRoundFinishLevels().some((level) => attemptMap[getRoundAttemptKey("finish", level)]);
    return !!attemptMap[getRoundAttemptKey(challengeType)];
  }

  function getNextRoundChallengeType(attemptMap) {
    return getRoundChallengeOrder().find((type) => !isRoundChallengeCompleted(attemptMap, type)) || "";
  }

  function getWarmupQuestionTimeline(room, questions) {
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(room.started_at).getTime()) / 1000));
    const secondsLeft = Math.max(0, 120 - elapsed);
    const answeredIds = new Set((GAME.myAnswers || []).map((answer) => answer.game_question_id));
    const question = (questions || []).find((item) => !answeredIds.has(item.id)) || null;
    if (!secondsLeft || !question) {
      return { index: questions.length, question: null, secondsLeft, duration: 120, questions };
    }
    return {
      index: (GAME.myAnswers || []).length,
      question,
      secondsLeft,
      duration: 120,
      questions,
    };
  }

  function getRoundQuestionTimeline(room, questions) {
    const challengeType = getRoomRoundChallengeType(room);
    if (challengeType === "warmup") return getWarmupQuestionTimeline(room, questions);
    if (challengeType === "obstacle") {
      return {
        obstacleBoard: true,
        index: 0,
        question: null,
        secondsLeft: 0,
        duration: 0,
        questions,
      };
    }
    if (challengeType === "acceleration" || challengeType === "finish") {
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(room.started_at).getTime()) / 1000));
      return walkQuestionTimeline(room, questions, elapsed);
    }
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(room.started_at).getTime()) / 1000));
    const baseQuestions = getRoundBaseQuestions(questions);
    const baseTotal = baseQuestions.reduce((sum, question) => sum + getQuestionDuration(question, room), 0);
    if (elapsed < baseTotal) return walkQuestionTimeline(room, baseQuestions, elapsed);

    let choice = getRoundFinishChoice(room.id);
    if (!choice && elapsed < baseTotal + 30) {
      return {
        selectFinishLevel: true,
        index: baseQuestions.length,
        question: null,
        secondsLeft: Math.max(0, baseTotal + 30 - elapsed),
        duration: 30,
        questions: baseQuestions,
      };
    }
    if (!choice) {
      setRoundFinishChoice(room.id, "medium");
      choice = getRoundFinishChoice(room.id);
    }
    const finishQuestions = getRoundFinishQuestions(questions, choice.level || "medium");
    const finishElapsed = choice?.selectedAt ? Math.max(0, Math.floor((Date.now() - choice.selectedAt) / 1000)) : Math.max(0, elapsed - baseTotal - 30);
    const finishTimeline = walkQuestionTimeline(room, finishQuestions, finishElapsed);
    return {
      ...finishTimeline,
      index: baseQuestions.length + finishTimeline.index,
      questions: [...baseQuestions, ...finishQuestions],
      finishLevel: choice.level || "medium",
    };
  }

  function getSubjectCardStyle(selected) {
    return `position:relative;display:grid;gap:8px;min-height:116px;padding:16px 18px;border-radius:18px;border:${selected ? "2px solid var(--gold)" : "1px solid rgba(15,31,61,.08)"};background:${selected ? "linear-gradient(135deg,var(--gold-pale) 0%,#fff 100%)" : "#fff"};box-shadow:${selected ? "0 10px 28px rgba(200,150,42,.16)" : "var(--shadow-sm)"};color:var(--ink);text-align:left;cursor:pointer;overflow:hidden;transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease`;
  }

  function ensureSubjectSelectModal() {
    let modal = document.getElementById("gameSubjectSelectModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "gameSubjectSelectModal";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-card" style="width:min(720px,100%)">
        <div class="mh">
          <h2>Chọn môn</h2>
          <button class="btn btn-outline" type="button" onclick="closeGameSubjectSelectModal()">Đóng</button>
        </div>
        <div class="mb" style="display:grid;gap:14px">
          <div id="gameSubjectSelectModalList" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function openSubjectSelectModal() {
    if (!GAME.selectedAutoMode || !EL.gradeFilter?.value) return;
    const modal = ensureSubjectSelectModal();
    renderSubjectCards();
    modal.classList.add("show");
  }

  function closeSubjectSelectModal() {
    document.getElementById("gameSubjectSelectModal")?.classList.remove("show");
  }

  function getDisabledSelectionCardStyle() {
    return "position:relative;display:grid;gap:8px;min-height:108px;padding:16px 18px;border-radius:18px;border:1px dashed var(--border);background:#f8fafc;box-shadow:none;color:var(--ink-light);text-align:left;cursor:not-allowed;overflow:hidden;opacity:.82";
  }

  function renderGradeCards() {
    const grid = document.getElementById("gameGradeCardGrid");
    if (!grid) return;
    const modeReady = !!GAME.selectedAutoMode;
    if (GAME.role === "student" && GAME.profile?.grade_id) {
      if (EL.gradeFilter) EL.gradeFilter.value = GAME.profile.grade_id;
      grid.innerHTML = "";
      return;
    }
    grid.innerHTML = (GAME.grades || []).map((grade) => {
      if (!modeReady) {
        return `<button type="button" disabled style="${getDisabledSelectionCardStyle()}"><span style="display:inline-flex;align-items:center;width:max-content;padding:4px 10px;border-radius:999px;background:#eef2f7;color:var(--ink-light);font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase">Khối</span><span style="font-size:1.05rem;font-weight:900;letter-spacing:.01em">${esc(grade.name)}</span><span class="hint">Chọn chế độ trước</span></button>`;
      }
      const selected = EL.gradeFilter?.value === grade.id;
      return `<button type="button" data-grade-card="${grade.id}" style="${getGradeCardStyle(selected)}"><span style="display:inline-flex;align-items:center;width:max-content;padding:4px 10px;border-radius:999px;background:${selected ? "var(--gold-pale)" : "#eef2f7"};color:${selected ? "var(--amber)" : "var(--ink-mid)"};font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase">${selected ? "Đang chọn" : "Khối"}</span><span style="font-size:1.1rem;font-weight:900;letter-spacing:.01em;color:var(--navy)">${esc(grade.name)}</span></button>`;
    }).join("");
    if (!modeReady) return;
    document.querySelectorAll("[data-grade-card]").forEach((button) => {
      button.addEventListener("click", () => {
        if (EL.gradeFilter) EL.gradeFilter.value = button.dataset.gradeCard || "";
        if (EL.subjectFilter) EL.subjectFilter.value = "";
        fillSubjects(EL.subjectFilter, EL.gradeFilter?.value || "", "Tất cả môn");
        renderGradeCards();
        renderSubjectCards();
        openSubjectSelectModal();
        tryAutoJoinReadySelection();
      });
    });
  }

  function renderSubjectCards() {
    const inlineGrid = document.getElementById("gameSubjectCardGrid");
    if (inlineGrid) inlineGrid.innerHTML = "";
    const grid = document.getElementById("gameSubjectSelectModalList") || inlineGrid;
    if (!grid) return;
    if (!GAME.selectedAutoMode) {
      grid.innerHTML = "";
      return;
    }
    const gradeId = EL.gradeFilter?.value || "";
    if (!gradeId) {
      grid.innerHTML = "";
      return;
    }
    let subjects = gradeId ? GAME.subjects.filter((item) => item.grade_id === gradeId) : [];
    if (GAME.role === "student") {
      subjects = subjects.filter((subject) => {
        if (GAME.selectedAutoMode === "round") return hasRoundForSubject(gradeId, subject.id);
        return !!getActiveGameConfig(GAME.selectedAutoMode, gradeId, subject.id);
      });
    }
    grid.innerHTML = subjects.length
      ? subjects.map((subject) => {
          const selected = EL.subjectFilter?.value === subject.id;
          return `<button type="button" data-subject-card="${subject.id}" style="${getSubjectCardStyle(selected)}"><span style="display:inline-flex;align-items:center;width:max-content;padding:4px 10px;border-radius:999px;background:${selected ? "var(--gold-pale)" : "#eef2f7"};color:${selected ? "var(--amber)" : "var(--ink-mid)"};font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase">${selected ? "Đang chọn" : "Môn"}</span><span style="font-size:1.02rem;font-weight:900;letter-spacing:.01em;color:var(--navy)">${esc(subject.name)}</span></button>`;
        }).join("")
      : `<div class="hint">Chưa có phần chơi phù hợp với Khối/Môn này.</div>`;
    document.querySelectorAll("[data-subject-card]").forEach((button) => {
      button.addEventListener("click", () => {
        if (EL.subjectFilter) EL.subjectFilter.value = button.dataset.subjectCard || "";
        closeSubjectSelectModal();
        renderSubjectCards();
        renderArenaInsightsUnified();
        tryAutoJoinReadySelection();
      });
    });
  }

  function refreshLobbyActions() {
    EL.roundGrid?.classList.add("hidden");
  }

  function tryAutoJoinReadySelection() {
    if (!GAME.selectedAutoMode) return;
    if (!EL.gradeFilter?.value) return;
    if (!EL.subjectFilter?.value) return;
    if (GAME.selectedAutoMode === "round") {
      renderRoundSelection(EL.gradeFilter.value, EL.subjectFilter.value);
      return;
    }
    autoMatchSelectedMode();
  }

  function renderRoundSelection(gradeId, subjectId) {
    const rounds = (GAME.rounds || [])
      .filter((round) => round.grade_id === gradeId && round.subject_id === subjectId && (round.status || "active") === "active")
      .sort((a, b) => Number(a.round_no || 0) - Number(b.round_no || 0));
    if (!EL.roundGrid) return;
    EL.roundGrid.classList.remove("hidden");

    GAME.selectedRoundId = "";
    EL.roundGrid.innerHTML = rounds.length
      ? rounds.map((round) => `<div class="room-card"><div class="room-top"><div><div class="room-title">Vòng ${round.round_no || 1}: ${esc(round.title)}</div><div class="hint">${esc(round.description || "Chọn Khối, Môn, Vòng rồi vào giao diện 4 thử thách MindUp.")}</div></div><span class="pill live">MindUp</span></div><div class="room-meta"><div><span>Khởi động</span><strong>120 giây, đúng +10</strong></div><div><span>Vượt chướng ngại vật</span><strong>4 ô, từ khóa bonus</strong></div><div><span>Tăng tốc</span><strong>40/30/20/10 theo tốc độ</strong></div><div><span>Về đích</span><strong>Dễ / TB / Khó</strong></div></div><div class="room-actions" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" type="button" data-open-round="${escAttr(round.id)}">Vào vòng</button></div></div>`).join("")
      : '<div class="empty"><strong>Chưa có vòng MindUp</strong><div>Admin chưa tạo vòng thi cho Khối/Môn này.</div></div>';
    document.querySelectorAll("[data-open-round]").forEach((button) => {
      button.addEventListener("click", () => renderRoundChallengeLobby(button.dataset.openRound || ""));
    });
  }

  async function renderRoundChallengeLobby(roundId) {
    const round = (GAME.rounds || []).find((item) => item.id === roundId);
    const view = ensureRoundLobbyView();
    if (!round || !view || !EL.roomScreen) return;
    GAME.selectedRoundId = roundId;
    clearIntervals();
    showRoomNotice("");
    teardownRoomRealtime();
    GAME.activeRoom = null;
    GAME.roomPlayers = [];
    GAME.roomQuestions = [];
    GAME.roomAnswers = [];
    GAME.myAnswers = [];
    EL.roomScreen.classList.add("show");
    EL.roomScreenTitle.textContent = `Vòng ${round.round_no || 1}: ${round.title}`;
    EL.toggleReadyBtn?.classList.add("hidden");
    EL.startGameBtn?.classList.add("hidden");
    updateRoundTopbarScore("", 0);
    EL.leaveGameBtn?.classList.add("hidden");
    setScreenState("roundLobby");
    const attemptMap = await loadRoundAttemptMap(roundId);
    const nextType = getNextRoundChallengeType(attemptMap);
    const challengeCards = getRoundChallengeOrder().map((type, index) => {
      const done = isRoundChallengeCompleted(attemptMap, type);
      const enabled = !done && type === nextType;
      const locked = !done && !enabled;
      const label = getRoundChallengeDisplayName(type);
      const detail = type === "warmup"
        ? "120 giây, mỗi câu đúng +10 điểm."
        : type === "obstacle"
          ? "4 ô chướng ngại vật, mỗi ô chỉ chọn một lần; đoán từ khóa để nhận điểm thưởng."
          : type === "acceleration"
            ? "Đúng trong 25%/50%/75%/100% thời gian nhận 40/30/20/10 điểm."
            : "Chọn bộ Dễ, Trung bình hoặc Khó; có thể dùng Ngôi sao hy vọng trước từng câu.";
      const status = done ? "Đã xong" : enabled ? "Đang mở" : "Chưa mở";
      const action = type === "finish"
        ? `<div class="room-actions" style="display:flex;gap:8px;flex-wrap:wrap">
            ${getRoundFinishLevels().map((level) => `<button class="btn ${enabled ? "btn-primary" : "btn-outline"} btn-sm" type="button" ${enabled ? "" : "disabled"} data-start-round="${escAttr(round.id)}" data-round-challenge="finish" data-finish-level="${level}">${level === "easy" ? "Bộ dễ" : level === "hard" ? "Bộ khó" : "Bộ trung bình"}</button>`).join("")}
          </div>`
        : `<button class="btn ${enabled ? "btn-primary" : "btn-outline"} btn-sm" type="button" ${enabled ? "" : "disabled"} data-start-round="${escAttr(round.id)}" data-round-challenge="${type}">${enabled ? "Bắt đầu" : status}</button>`;
      return `<div class="room-card" style="${locked ? "opacity:.62" : ""}"><div class="room-top"><div><div class="room-title">${index + 1}. ${esc(label)}</div><div class="hint">${esc(detail)}</div></div><span class="pill ${done ? "done" : enabled ? "live" : "waiting"}">${status}</span></div>${action}</div>`;
    }).join("");
    view.innerHTML = `
      <div class="panel">
        <div class="room-top"><div><div class="room-title">Vòng ${round.round_no || 1}: ${esc(round.title)}</div><div class="hint">${esc(round.description || "Thí sinh chọn lần lượt 4 thử thách trong vòng thi cá nhân.")}</div></div><button class="btn btn-outline btn-sm" type="button" data-back-round-list>Chọn vòng khác</button></div>
      </div>
      <div class="room-grid">${challengeCards}</div>
    `;
    view.querySelector("[data-back-round-list]")?.addEventListener("click", () => {
      hideGameScreen();
      renderRoundSelection(round.grade_id, round.subject_id);
    });
    view.querySelectorAll("[data-start-round]").forEach((button) => {
      button.addEventListener("click", () => startMindUpRound(button.dataset.startRound || "", button.dataset.roundChallenge || "", button.dataset.finishLevel || ""));
    });
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
    return Math.max(0, 15 - Math.floor(elapsedMs / 1000));
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
      if (secondsLeft <= 0) maybeStartQuickMatchAfterCountdown(room);
    };
    clearInterval(GAME.waitingTick);
    tick();
    GAME.waitingTick = setInterval(tick, 250);
  }

  function isPublicAutoMatchRoom(room) {
    const mode = roomModeValue(room);
    return ["quick"].includes(mode) && (room.visibility || "public") === "public";
  }

  function areRoomPlayersReadyForStart(room, players = GAME.roomPlayers) {
    const mode = roomModeValue(room);
    const list = players || [];
    if (mode === "solo") return list.length >= 1 && list.every((player) => player.ready);
    if (mode === "round") return list.length >= 1;
    if (mode === "quick") {
      const coordinatorId = getRoomCoordinatorUserId(room, list);
      return list.length >= 2 && list.every((player) => player.user_id === coordinatorId || player.ready);
    }
    return list.length >= 2;
  }

  function queueAutoStart(room, delayMs = 1200) {
    clearAutoStartTimer();
    GAME.autoStartTimer = setTimeout(() => {
      maybeStartQuickMatchAfterCountdown(room);
    }, Math.max(0, Number(delayMs || 0)));
  }

  function maybeStartQuickMatchAfterCountdown(room) {
    if (!room?.id || GAME.activeRoom?.id !== room.id) return;
    if (GAME.activeRoom?.status !== "waiting") return;
    if (getRoomStartControllerUserId(GAME.activeRoom) !== GAME.user.id) return;
    if (!areRoomPlayersReadyForStart(GAME.activeRoom, GAME.roomPlayers)) return;
    if (GAME.autoStartingRoomId === room.id) return;
    GAME.autoStartingRoomId = room.id;
    Promise.resolve(startGameMatch()).finally(() => {
      if (GAME.activeRoom?.status !== "live") GAME.autoStartingRoomId = null;
    });
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
    const roundLobbyView = document.getElementById("gameRoundLobbyView");
    EL.waitingView.classList.toggle("hidden", state !== "waiting");
    EL.liveView.classList.toggle("hidden", state !== "live");
    EL.finishedView.classList.toggle("hidden", state !== "finished");
    roundLobbyView?.classList.toggle("hidden", state !== "roundLobby");
  }

  function ensureRoundLobbyView() {
    let view = document.getElementById("gameRoundLobbyView");
    if (view) return view;
    view = document.createElement("div");
    view.id = "gameRoundLobbyView";
    view.className = "hidden";
    view.style.cssText = "display:grid;gap:18px;max-width:1180px;margin:0 auto";
    EL.roomScreen?.querySelector(".screen-body")?.appendChild(view);
    return view;
  }

  function ensureRoundTopbarScore() {
    let badge = document.getElementById("roundTopbarScore");
    if (badge) return badge;
    badge = document.createElement("div");
    badge.id = "roundTopbarScore";
    badge.className = "hidden";
    badge.style.cssText = "display:inline-flex;align-items:center;min-height:36px;padding:8px 14px;border-radius:14px;background:var(--gold-pale);border:1px solid var(--gold-border);color:var(--navy);font-weight:900;white-space:nowrap";
    document.querySelector("#gameRoomScreen .topbar-actions")?.appendChild(badge);
    return badge;
  }

  function updateRoundTopbarScore(mode, score = 0) {
    const badge = ensureRoundTopbarScore();
    const isRound = mode === "round";
    const isSoloLive = mode === "solo" && GAME.activeRoom?.status === "live";
    const isPinnedScore = isRound || isSoloLive;
    if (badge) {
      badge.textContent = isSoloLive ? `Điểm: ${Number(score || 0)}` : `Điểm của bạn: ${Number(score || 0)}`;
      badge.classList.toggle("hidden", !isPinnedScore);
    }
    EL.leaveGameBtn?.classList.add("hidden");
  }

  async function loadGameCatalog() {
    const [configsRes, configQuestionsRes, roundsRes, challengesRes, challengeQuestionsRes] = await Promise.all([
      sb.from("game_configs").select("*").order("created_at", { ascending: false }),
      sb.from("game_config_questions").select("*").order("order_no", { ascending: true }),
      sb.from("game_rounds").select("*").order("round_no", { ascending: true }).order("created_at", { ascending: false }),
      sb.from("game_round_challenges").select("*").order("order_no", { ascending: true }),
      sb.from("game_round_challenge_questions").select("*").order("order_no", { ascending: true }),
    ]);
    GAME.configs = configsRes.data || [];
    GAME.configQuestions = configQuestionsRes.data || [];
    GAME.rounds = roundsRes.data || [];
    GAME.roundChallenges = challengesRes.data || [];
    GAME.roundChallengeQuestions = challengeQuestionsRes.data || [];
    if (configsRes.error || configQuestionsRes.error || roundsRes.error || challengesRes.error || challengeQuestionsRes.error) {
      console.warn("Game catalog warning", configsRes.error || configQuestionsRes.error || roundsRes.error || challengesRes.error || challengeQuestionsRes.error);
    }
  }

  function parseQuestionIds(raw) {
    return String(raw || "")
      .split(/[\n,;\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function parseFinishQuestionRows(raw) {
    return String(raw || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|").map((part) => part.trim()).filter(Boolean);
        if (parts.length >= 2 && ["easy", "medium", "hard"].includes(parts[0])) {
          return { level: parts[0], questionId: parts[1] };
        }
        return { level: null, questionId: line };
      })
      .filter((item) => item.questionId);
  }

  function fillAdminSubjects(gradeEl, subjectEl) {
    fillSubjects(subjectEl, gradeEl?.value || "", "Chọn môn");
  }

  function renderAdminGamePage() {
    document.getElementById("gameListPage")?.classList.add("hidden");
    document.querySelectorAll(".page").forEach((page) => {
      if (page.id !== "gameAdminPage") page.classList.add("hidden");
    });
    EL.adminPage?.classList.remove("hidden");
    fillGrades(EL.adminConfigGrade, "Chọn khối");
    fillGrades(EL.adminRoundGrade, "Chọn khối");
    fillAdminSubjects(EL.adminConfigGrade, EL.adminConfigSubject);
    fillAdminSubjects(EL.adminRoundGrade, EL.adminRoundSubject);
    renderAdminGameLists();
  }

  function getConfigGroupKey(cfg) {
    return [cfg.title || "Game", cfg.grade_id || "", cfg.subject_id || ""].join("|");
  }

  function getGameConfigGroups() {
    const groups = new Map();
    (GAME.configs || [])
      .filter((cfg) => ["solo", "quick"].includes(cfg.mode))
      .forEach((cfg) => {
        const key = getConfigGroupKey(cfg);
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            title: cfg.title || "Bộ luyện tập Game",
            grade_id: cfg.grade_id,
            subject_id: cfg.subject_id,
            configs: [],
          });
        }
        groups.get(key).configs.push(cfg);
      });
    return [...groups.values()].sort((a, b) => {
      const aActive = a.configs.some((cfg) => (cfg.status || "active") === "active") ? 1 : 0;
      const bActive = b.configs.some((cfg) => (cfg.status || "active") === "active") ? 1 : 0;
      return bActive - aActive || String(a.title || "").localeCompare(String(b.title || ""));
    });
  }

  function encodeConfigGroupIds(group) {
    return encodeURIComponent(JSON.stringify((group?.configs || []).map((cfg) => cfg.id)));
  }

  function getConfigQuestionIds(configId) {
    return (GAME.configQuestions || [])
      .filter((item) => item.config_id === configId)
      .sort((a, b) => Number(a.order_no || 0) - Number(b.order_no || 0))
      .map((item) => item.question_id)
      .filter(Boolean);
  }

  function renderAdminGameLists() {
    if (EL.adminConfigList) {
      const groups = getGameConfigGroups();
      EL.adminConfigList.innerHTML = groups.length
        ? groups.map((group) => {
          const grade = GAME.grades.find((item) => item.id === group.grade_id)?.name || "Khối";
          const subject = GAME.subjects.find((item) => item.id === group.subject_id)?.name || "Môn";
          const ids = new Set(group.configs.flatMap((cfg) => getConfigQuestionIds(cfg.id)));
          const active = group.configs.some((cfg) => (cfg.status || "active") === "active");
          const hasSolo = group.configs.some((cfg) => cfg.mode === "solo");
          const hasQuick = group.configs.some((cfg) => cfg.mode === "quick");
          const encodedIds = encodeConfigGroupIds(group);
          return `<div class="history-item"><div class="history-main"><strong>${esc(group.title)}</strong><div class="hint">${esc(grade)} • ${esc(subject)} • ${ids.size} câu hỏi • 5 câu/trận • 60s/câu • ${active ? "Đang áp dụng" : "Chưa áp dụng"} • ${hasSolo ? "Chơi đơn" : "Thiếu Chơi đơn"} / ${hasQuick ? "Đấu nhanh" : "Thiếu Đấu nhanh"}</div></div><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn btn-primary btn-sm" type="button" onclick="applyGameConfigGroup('${encodedIds}')">Áp dụng</button><button class="btn btn-outline btn-sm" type="button" onclick="editGameConfigGroup('${encodedIds}')">Sửa</button><button class="btn btn-outline btn-sm" type="button" onclick="deleteGameConfigGroup('${encodedIds}')">Xóa</button></div></div>`;
        }).join("")
        : '<div class="empty">Chưa có cấu hình Chơi đơn hoặc Đấu nhanh.</div>';
    }
    if (EL.adminRoundList) {
      EL.adminRoundList.innerHTML = GAME.rounds.length
        ? GAME.rounds.map((round) => {
          const grade = GAME.grades.find((item) => item.id === round.grade_id)?.name || "Khối";
          const subject = GAME.subjects.find((item) => item.id === round.subject_id)?.name || "Môn";
          const challengeCount = GAME.roundChallenges.filter((item) => item.round_id === round.id).length;
          return `<div class="history-item"><div class="history-main"><strong>Vòng ${round.round_no || 1}: ${esc(round.title)}</strong><div class="hint">${esc(grade)} • ${esc(subject)} • ${challengeCount}/4 thử thách • qua vòng từ 100 điểm • thi lại trừ 20 điểm</div></div><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn btn-outline btn-sm" type="button" onclick="editGameRound('${round.id}')">Sửa</button><button class="btn btn-outline btn-sm" type="button" onclick="deleteGameRound('${round.id}')">Xóa</button></div></div>`;
        }).join("")
        : '<div class="empty">Chưa có Vòng MindUp nào.</div>';
    }
  }

  function getQuestionPickerTypeLabel(type) {
    return GAME_QUESTION_TYPE_LABELS[type] || type || "Câu hỏi";
  }

  function getFinishLevelForQuestion(question) {
    const difficulty = Number(question?.difficulty || 5);
    if (difficulty <= 3) return "easy";
    if (difficulty >= 8) return "hard";
    return "medium";
  }

  function getRoundChallengeByType(roundId, type) {
    return (GAME.roundChallenges || []).find((challenge) => challenge.round_id === roundId && challenge.challenge_type === type) || null;
  }

  function getRoundChallengeQuestionIds(challengeId, finishLevel = null) {
    return (GAME.roundChallengeQuestions || [])
      .filter((item) => item.challenge_id === challengeId)
      .filter((item) => !finishLevel || item.finish_level === finishLevel)
      .sort((a, b) => Number(a.order_no || 0) - Number(b.order_no || 0))
      .map((item) => item.question_id)
      .filter(Boolean);
  }

  function parsePickerSelectionFromTextarea(target, format) {
    const raw = String(target?.value || "").trim();
    if (!raw) return new Map();
    const rows = format === "finish"
      ? parseFinishQuestionRows(raw).map((item) => ({ id: item.questionId, level: item.level || null }))
      : parseQuestionIds(raw).map((id) => ({ id }));
    return new Map(rows.filter((item) => item.id).map((item) => [item.id, item]));
  }

  function syncPickerChapters() {
    fillChapters(EL.pickerChapter, EL.pickerSubject?.value || "", "Tất cả chương");
  }

  function updateQuestionPickerApplyState() {
    if (!EL.pickerApplyBtn) return;
    const required = Number(GAME.questionPicker.requiredCount || 0);
    const selectedCount = GAME.questionPicker.selected?.size || 0;
    const valid = !required || selectedCount === required;
    EL.pickerApplyBtn.disabled = !valid;
    EL.pickerApplyBtn.textContent = required
      ? (valid ? `Áp dụng danh sách (${selectedCount}/${required})` : `Cần chọn đúng ${required} câu (${selectedCount}/${required})`)
      : "Áp dụng danh sách";
    EL.pickerApplyBtn.title = required && !valid ? `Phải chọn đúng ${required} câu hỏi mới áp dụng được.` : "";
  }

  function renderQuestionPickerSelected() {
    if (!EL.pickerSelected) return;
    const selected = [...GAME.questionPicker.selected.values()];
    EL.pickerSelected.innerHTML = selected.length
      ? selected.map((item, index) => `<div class="game-question-picker-item">
          <strong>${index + 1}. ${esc(getPlayerQuestionTitle(item))}</strong>
          <div class="game-question-picker-meta"><span>${esc(getQuestionPickerTypeLabel(item.question_type))}</span><span>Độ khó ${Number(item.difficulty || 5)}</span>${item.level ? `<span>Về đích: ${esc(item.level)}</span>` : ""}</div>
          <div class="game-question-picker-actions"><button class="btn btn-outline btn-sm" type="button" data-picker-remove="${escAttr(item.id)}">Bỏ chọn</button></div>
        </div>`).join("")
      : '<div class="empty">Chưa chọn câu hỏi nào.</div>';
    EL.pickerSelected.querySelectorAll("[data-picker-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        GAME.questionPicker.selected.delete(button.dataset.pickerRemove || "");
        renderQuestionPickerSelected();
        renderQuestionPickerList();
      });
    });
    updateQuestionPickerApplyState();
  }

  function getPlayerQuestionTitle(question) {
    const text = String(question?.question_text || question?.id || "").replace(/\s+/g, " ").trim();
    return text.length > 88 ? `${text.slice(0, 88)}...` : text;
  }

  function renderQuestionPickerList() {
    if (!EL.pickerList) return;
    const selectedIds = GAME.questionPicker.selected;
    const rows = GAME.questionPicker.rows || [];
    EL.pickerList.innerHTML = rows.length
      ? rows.map((question) => {
        const selected = selectedIds.has(question.id);
        const chapterName = question.chapters?.name || GAME.chapters.find((item) => item.id === question.chapter_id)?.name || "Chưa có chương";
        return `<div class="game-question-picker-item">
          <div class="game-question-picker-meta"><span>${esc(getQuestionPickerTypeLabel(question.question_type))}</span><span>${esc(chapterName)}</span><span>Độ khó ${Number(question.difficulty || 5)}</span><span>${esc(question.id)}</span></div>
          <div class="game-question-picker-text">${esc(getPlayerQuestionTitle(question))}</div>
          <div class="game-question-picker-actions">
            <button class="btn ${selected ? "btn-outline" : "btn-primary"} btn-sm" type="button" data-picker-toggle="${escAttr(question.id)}">${selected ? "Bỏ chọn" : "Chọn câu hỏi"}</button>
          </div>
        </div>`;
      }).join("")
      : '<div class="empty">Không có câu trắc nghiệm/trả lời ngắn phù hợp với bộ lọc này.</div>';
    EL.pickerList.querySelectorAll("[data-picker-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.pickerToggle || "";
        if (GAME.questionPicker.selected.has(id)) {
          GAME.questionPicker.selected.delete(id);
        } else {
          const question = (GAME.questionPicker.rows || []).find((item) => item.id === id);
          if (question) {
            GAME.questionPicker.selected.set(id, {
              id,
              question_type: question.question_type,
              question_text: question.question_text,
              difficulty: question.difficulty || 5,
              level: GAME.questionPicker.format === "finish" ? getFinishLevelForQuestion(question) : null,
            });
          }
        }
        renderQuestionPickerSelected();
        renderQuestionPickerList();
      });
    });
    updateQuestionPickerApplyState();
  }

  async function loadQuestionPickerRows() {
    if (!EL.pickerList) return;
    EL.pickerList.innerHTML = '<div class="empty">Đang tải danh sách câu hỏi...</div>';
    const gradeId = EL.pickerGrade?.value || "";
    const subjectId = EL.pickerSubject?.value || "";
    const chapterId = EL.pickerChapter?.value || "";
    const search = String(EL.pickerSearch?.value || "").trim();

    let chapterIds = [];
    if (chapterId) {
      chapterIds = [chapterId];
    } else if (subjectId) {
      chapterIds = GAME.chapters.filter((chapter) => chapter.subject_id === subjectId).map((chapter) => chapter.id);
    } else if (gradeId) {
      const subjectIds = GAME.subjects.filter((subject) => subject.grade_id === gradeId).map((subject) => subject.id);
      chapterIds = GAME.chapters.filter((chapter) => subjectIds.includes(chapter.subject_id)).map((chapter) => chapter.id);
    }

    let query = sb.from("question_bank")
      .select("id,question_text,question_type,difficulty,answer,hidden,chapter_id,chapters(id,name,subject_id)")
      .eq("hidden", false)
      .in("question_type", GAME_ALLOWED_QUESTION_TYPES)
      .order("created_at", { ascending: false })
      .limit(200);

    if (chapterIds.length) query = query.in("chapter_id", chapterIds);
    else if (gradeId || subjectId || chapterId) query = query.eq("chapter_id", "00000000-0000-0000-0000-000000000000");
    if (search) query = query.ilike("question_text", `%${search}%`);

    const { data, error } = await query;
    if (error) {
      EL.pickerList.innerHTML = `<div class="empty">Không tải được câu hỏi: ${esc(error.message)}</div>`;
      return;
    }
    GAME.questionPicker.rows = (data || []).filter((question) =>
      GAME_ALLOWED_QUESTION_TYPES.includes(question.question_type) &&
      !question.hidden &&
      String(question.answer || "").trim()
    );
    renderQuestionPickerList();
  }

  async function openGameQuestionPicker(button) {
    const targetId = button?.dataset?.gameQuestionPickerTarget || "";
    const target = document.getElementById(targetId);
    if (!target) return;
    const gradeSource = document.getElementById(button.dataset.gameQuestionPickerGrade || "");
    const subjectSource = document.getElementById(button.dataset.gameQuestionPickerSubject || "");
    const format = button.dataset.gameQuestionPickerFormat || "plain";
    GAME.questionPicker = {
      target,
      format,
      requiredCount: Number(button.dataset.gameQuestionPickerRequiredCount || 0),
      selected: parsePickerSelectionFromTextarea(target, format),
      rows: [],
    };
    if (EL.pickerTitle) EL.pickerTitle.textContent = button.dataset.gameQuestionPickerTitle || "Chọn danh sách câu hỏi";
    fillGrades(EL.pickerGrade, "Tất cả khối");
    if (EL.pickerGrade) EL.pickerGrade.value = gradeSource?.value || "";
    fillSubjects(EL.pickerSubject, EL.pickerGrade?.value || "", "Tất cả môn");
    if (EL.pickerSubject) EL.pickerSubject.value = subjectSource?.value || "";
    syncPickerChapters();
    if (EL.pickerSearch) EL.pickerSearch.value = "";
    EL.pickerModal?.classList.add("show");
    renderQuestionPickerSelected();
    await loadQuestionPickerRows();
  }

  function applyQuestionPickerSelection() {
    const target = GAME.questionPicker.target;
    if (!target) return;
    const selected = [...GAME.questionPicker.selected.values()];
    const required = Number(GAME.questionPicker.requiredCount || 0);
    if (required && selected.length !== required) {
      alert(`Phải chọn đúng ${required} câu hỏi. Hiện tại đang chọn ${selected.length} câu.`);
      updateQuestionPickerApplyState();
      return;
    }
    target.value = selected.map((item) => {
      if (GAME.questionPicker.format === "finish") return `${item.level || "medium"}|${item.id}`;
      return item.id;
    }).join("\n");
    closeGameQuestionPicker();
  }

  window.closeGameQuestionPicker = function() {
    EL.pickerModal?.classList.remove("show");
  };

  async function replaceConfigQuestions(configId, questionIds) {
    await sb.from("game_config_questions").delete().eq("config_id", configId);
    const rows = questionIds.map((questionId, index) => ({
      config_id: configId,
      question_id: questionId,
      order_no: index + 1,
    }));
    if (rows.length) {
      const { error } = await sb.from("game_config_questions").insert(rows);
      if (error) throw error;
    }
  }

  async function filterAllowedGameQuestionIds(questionIds) {
    const ids = [...new Set((questionIds || []).filter(Boolean))];
    if (!ids.length) return [];
    const { data, error } = await sb.from("question_bank")
      .select("id,question_type,answer,hidden")
      .in("id", ids);
    if (error) throw error;
    const allowed = new Set((data || [])
      .filter((question) =>
        GAME_ALLOWED_QUESTION_TYPES.includes(question.question_type) &&
        !question.hidden &&
        String(question.answer || "").trim()
      )
      .map((question) => question.id));
    return (questionIds || []).filter((id) => allowed.has(id));
  }

  async function filterAllowedFinishQuestionRows(rows) {
    const ids = rows.map((item) => item.questionId).filter(Boolean);
    const allowedIds = new Set(await filterAllowedGameQuestionIds(ids));
    return rows.filter((item) => allowedIds.has(item.questionId));
  }

  async function submitGameConfig(event) {
    event.preventDefault();
    if (GAME.role !== "admin") return;
    const gradeId = EL.adminConfigGrade?.value || "";
    const subjectId = EL.adminConfigSubject?.value || "";
    const title = String(EL.adminConfigTitle?.value || "").trim() || "Bộ luyện tập Game";
    const rawQuestionIds = parseQuestionIds(EL.adminConfigQuestionIds?.value || "");
    if (!gradeId || !subjectId) {
      alert("Hãy chọn Khối và Môn cho cấu hình Game.");
      return;
    }
    let questionIds = [];
    try {
      questionIds = await filterAllowedGameQuestionIds(rawQuestionIds);
    } catch (filterError) {
      alert("Không kiểm tra được danh sách câu hỏi: " + filterError.message);
      return;
    }
    if (rawQuestionIds.length && questionIds.length !== rawQuestionIds.length) {
      alert("Một số câu đã bị loại vì không phải trắc nghiệm/trả lời ngắn, bị ẩn hoặc chưa có đáp án. Hãy kiểm tra lại danh sách câu hỏi.");
      if (EL.adminConfigQuestionIds) EL.adminConfigQuestionIds.value = questionIds.join("\n");
      return;
    }
    if (questionIds.length < 5) {
      alert("Cần chọn ít nhất 5 câu hỏi để tạo phần Chơi đơn / Đấu nhanh.");
      return;
    }

    const editingIds = GAME.editingConfigIds || [];
    const wasActive = editingIds.some((id) => (GAME.configs || []).some((cfg) => cfg.id === id && (cfg.status || "active") === "active"));
    if (editingIds.length) {
      const { error: deleteError } = await sb.from("game_configs").delete().in("id", editingIds);
      if (deleteError) {
        alert("Không cập nhật được cấu hình Game: " + deleteError.message);
        return;
      }
    }

    const configRows = ["solo", "quick"].map((mode) => ({
      mode,
      title,
      grade_id: gradeId,
      subject_id: subjectId,
      question_count: 5,
      time_per_question: 60,
      status: wasActive ? "active" : "inactive",
      created_by: GAME.user.id,
    }));
    const { data: configs, error } = await sb.from("game_configs").insert(configRows).select("*");
    if (error) {
      alert("Không lưu được cấu hình Game: " + error.message);
      return;
    }
    try {
      for (const config of configs || []) {
        await replaceConfigQuestions(config.id, questionIds);
      }
    } catch (questionError) {
      alert("Đã tạo cấu hình nhưng lỗi khi thêm câu hỏi: " + questionError.message);
    }
    GAME.editingConfigIds = [];
    EL.configForm?.reset();
    await loadGameCatalog();
    renderAdminGamePage();
  }

  async function insertChallengeQuestions(challengeId, items) {
    if (!challengeId) return;
    const rows = items.map((item, index) => ({
      challenge_id: challengeId,
      question_id: item.questionId || item,
      order_no: index + 1,
      finish_level: item.level || null,
      obstacle_key: item.obstacleKey || null,
    }));
    if (rows.length) {
      const { error } = await sb.from("game_round_challenge_questions").insert(rows);
      if (error) throw error;
    }
  }

  async function submitGameRound(event) {
    event.preventDefault();
    if (GAME.role !== "admin") return;
    const gradeId = EL.adminRoundGrade?.value || "";
    const subjectId = EL.adminRoundSubject?.value || "";
    const title = String(EL.adminRoundTitle?.value || "").trim();
    if (!title || !gradeId || !subjectId) {
      alert("Hãy nhập tên vòng, chọn Khối và Môn.");
      return;
    }
    const rawWarmupIds = parseQuestionIds(EL.adminWarmupQuestionIds?.value);
    const rawObstacleIds = parseQuestionIds(EL.adminObstacleQuestionIds?.value);
    const rawAccelerationIds = parseQuestionIds(EL.adminAccelerationQuestionIds?.value);
    const rawFinishEasyIds = parseQuestionIds(EL.adminFinishEasyQuestionIds?.value);
    const rawFinishMediumIds = parseQuestionIds(EL.adminFinishMediumQuestionIds?.value);
    const rawFinishHardIds = parseQuestionIds(EL.adminFinishHardQuestionIds?.value);
    let warmupIds = [];
    let obstacleIds = [];
    let accelerationIds = [];
    let finishEasyIds = [];
    let finishMediumIds = [];
    let finishHardIds = [];
    try {
      warmupIds = await filterAllowedGameQuestionIds(rawWarmupIds);
      obstacleIds = await filterAllowedGameQuestionIds(rawObstacleIds);
      accelerationIds = await filterAllowedGameQuestionIds(rawAccelerationIds);
      finishEasyIds = await filterAllowedGameQuestionIds(rawFinishEasyIds);
      finishMediumIds = await filterAllowedGameQuestionIds(rawFinishMediumIds);
      finishHardIds = await filterAllowedGameQuestionIds(rawFinishHardIds);
    } catch (filterError) {
      alert("Không kiểm tra được danh sách câu hỏi của vòng: " + filterError.message);
      return;
    }
    if (
      warmupIds.length !== rawWarmupIds.length ||
      obstacleIds.length !== rawObstacleIds.length ||
      accelerationIds.length !== rawAccelerationIds.length ||
      finishEasyIds.length !== rawFinishEasyIds.length ||
      finishMediumIds.length !== rawFinishMediumIds.length ||
      finishHardIds.length !== rawFinishHardIds.length
    ) {
      alert("Một số câu trong vòng MindUp đã bị loại vì không phải trắc nghiệm/trả lời ngắn, bị ẩn hoặc chưa có đáp án. Hãy kiểm tra lại danh sách câu hỏi.");
      if (EL.adminWarmupQuestionIds) EL.adminWarmupQuestionIds.value = warmupIds.join("\n");
      if (EL.adminObstacleQuestionIds) EL.adminObstacleQuestionIds.value = obstacleIds.join("\n");
      if (EL.adminAccelerationQuestionIds) EL.adminAccelerationQuestionIds.value = accelerationIds.join("\n");
      if (EL.adminFinishEasyQuestionIds) EL.adminFinishEasyQuestionIds.value = finishEasyIds.join("\n");
      if (EL.adminFinishMediumQuestionIds) EL.adminFinishMediumQuestionIds.value = finishMediumIds.join("\n");
      if (EL.adminFinishHardQuestionIds) EL.adminFinishHardQuestionIds.value = finishHardIds.join("\n");
      return;
    }
    const countChecks = [
      ["Khởi động", warmupIds.length, 20],
      ["Vượt chướng ngại vật", obstacleIds.length, 4],
      ["Tăng tốc", accelerationIds.length, 4],
      ["Về đích - Dễ", finishEasyIds.length, 3],
      ["Về đích - Trung bình", finishMediumIds.length, 3],
      ["Về đích - Khó", finishHardIds.length, 3],
    ];
    const invalidCount = countChecks.find(([, actual, expected]) => actual !== expected);
    if (invalidCount) {
      alert(`${invalidCount[0]} phải chọn đúng ${invalidCount[2]} câu hỏi. Hiện tại đang có ${invalidCount[1]} câu.`);
      return;
    }
    const roundPayload = {
      title,
      description: String(EL.adminRoundDescription?.value || "").trim(),
      grade_id: gradeId,
      subject_id: subjectId,
      round_no: Number(EL.adminRoundNo?.value || 1),
      pass_score: 300,
      retry_penalty: 30,
      status: "active",
    };
    const editingRoundId = GAME.editingRoundId || "";
    let round = null;
    let error = null;
    if (editingRoundId) {
      const result = await sb.from("game_rounds").update(roundPayload).eq("id", editingRoundId).select("*").single();
      round = result.data;
      error = result.error;
      if (!error) {
        const oldChallenges = (GAME.roundChallenges || []).filter((challenge) => challenge.round_id === editingRoundId);
        const oldChallengeIds = oldChallenges.map((challenge) => challenge.id);
        if (oldChallengeIds.length) {
          await sb.from("game_round_challenge_questions").delete().in("challenge_id", oldChallengeIds);
          await sb.from("game_round_challenges").delete().in("id", oldChallengeIds);
        }
      }
    } else {
      const result = await sb.from("game_rounds").insert({
        ...roundPayload,
        created_by: GAME.user.id,
      }).select("*").single();
      round = result.data;
      error = result.error;
    }
    if (error) {
      alert("Không lưu được vòng MindUp: " + error.message);
      return;
    }

    const challengeRows = [
      { round_id: round.id, challenge_type: "warmup", title: "Khởi động", order_no: 1, time_limit_seconds: 120, question_limit: 20 },
      { round_id: round.id, challenge_type: "obstacle", title: "Vượt chướng ngại vật", order_no: 2, question_limit: 4, keyword_answer: String(EL.adminObstacleKeyword?.value || "").trim() },
      { round_id: round.id, challenge_type: "acceleration", title: "Tăng tốc", order_no: 3, question_limit: 4 },
      { round_id: round.id, challenge_type: "finish", title: "Về đích", order_no: 4 },
    ];
    const { data: challenges, error: challengeError } = await sb.from("game_round_challenges").insert(challengeRows).select("*");
    if (challengeError) {
      alert("Đã tạo vòng nhưng lỗi khi tạo thử thách: " + challengeError.message);
      return;
    }
    const challengeByType = Object.fromEntries((challenges || []).map((item) => [item.challenge_type, item]));
    try {
      await insertChallengeQuestions(challengeByType.warmup?.id, warmupIds.map((questionId) => ({ questionId })));
      await insertChallengeQuestions(challengeByType.obstacle?.id, obstacleIds.map((questionId, idx) => ({ questionId, obstacleKey: String.fromCharCode(65 + idx) })));
      await insertChallengeQuestions(challengeByType.acceleration?.id, accelerationIds.map((questionId) => ({ questionId })));
      await insertChallengeQuestions(challengeByType.finish?.id, [
        ...finishEasyIds.map((questionId) => ({ questionId, level: "easy" })),
        ...finishMediumIds.map((questionId) => ({ questionId, level: "medium" })),
        ...finishHardIds.map((questionId) => ({ questionId, level: "hard" })),
      ]);
    } catch (questionError) {
      alert("Đã tạo vòng nhưng lỗi khi thêm câu hỏi: " + questionError.message);
    }
    GAME.editingRoundId = "";
    EL.roundForm?.reset();
    await loadGameCatalog();
    renderAdminGamePage();
  }

  function decodeConfigGroupIds(encodedIds) {
    try {
      const ids = JSON.parse(decodeURIComponent(encodedIds || "[]"));
      return Array.isArray(ids) ? ids.filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  window.applyGameConfigGroup = async function(encodedIds) {
    if (GAME.role !== "admin") return;
    const ids = decodeConfigGroupIds(encodedIds);
    const groupConfigs = (GAME.configs || []).filter((cfg) => ids.includes(cfg.id));
    const base = groupConfigs[0];
    if (!base) return alert("Không tìm thấy cấu hình cần áp dụng.");
    const { error: offError } = await sb.from("game_configs")
      .update({ status: "inactive" })
      .eq("grade_id", base.grade_id)
      .eq("subject_id", base.subject_id)
      .in("mode", ["solo", "quick"]);
    if (offError) return alert("Không tắt được cấu hình cũ: " + offError.message);
    const { error } = await sb.from("game_configs").update({ status: "active" }).in("id", ids);
    if (error) return alert("Không áp dụng được cấu hình: " + error.message);
    await loadGameCatalog();
    renderAdminGamePage();
  };

  window.editGameConfigGroup = function(encodedIds) {
    if (GAME.role !== "admin") return;
    const ids = decodeConfigGroupIds(encodedIds);
    const groupConfigs = (GAME.configs || []).filter((cfg) => ids.includes(cfg.id));
    const base = groupConfigs[0];
    if (!base) return alert("Không tìm thấy cấu hình cần sửa.");
    GAME.editingConfigIds = ids;
    if (EL.adminConfigTitle) EL.adminConfigTitle.value = base.title || "";
    if (EL.adminConfigGrade) {
      EL.adminConfigGrade.value = base.grade_id || "";
      fillAdminSubjects(EL.adminConfigGrade, EL.adminConfigSubject);
    }
    if (EL.adminConfigSubject) EL.adminConfigSubject.value = base.subject_id || "";
    const sourceConfig = groupConfigs.find((cfg) => cfg.mode === "solo") || base;
    if (EL.adminConfigQuestionIds) EL.adminConfigQuestionIds.value = getConfigQuestionIds(sourceConfig.id).join("\n");
    EL.adminConfigTitle?.focus();
  };

  window.deleteGameConfigGroup = async function(encodedIds) {
    if (GAME.role !== "admin") return;
    const ids = decodeConfigGroupIds(encodedIds);
    if (!ids.length || !confirm("Xóa cấu hình Chơi đơn / Đấu nhanh này?")) return;
    const { error } = await sb.from("game_configs").delete().in("id", ids);
    if (error) return alert("Không xóa được cấu hình: " + error.message);
    GAME.editingConfigIds = (GAME.editingConfigIds || []).filter((id) => !ids.includes(id));
    await loadGameCatalog();
    renderAdminGamePage();
  };

  window.deleteGameConfig = async function(configId) {
    if (GAME.role !== "admin" || !confirm("Xóa cấu hình Game này?")) return;
    const { error } = await sb.from("game_configs").delete().eq("id", configId);
    if (error) return alert("Không xóa được cấu hình: " + error.message);
    await loadGameCatalog();
    renderAdminGamePage();
  };

  window.editGameRound = function(roundId) {
    if (GAME.role !== "admin") return;
    const round = (GAME.rounds || []).find((item) => item.id === roundId);
    if (!round) return alert("Không tìm thấy vòng MindUp cần sửa.");
    GAME.editingRoundId = roundId;
    if (EL.adminRoundTitle) EL.adminRoundTitle.value = round.title || "";
    if (EL.adminRoundNo) EL.adminRoundNo.value = round.round_no || 1;
    if (EL.adminRoundGrade) {
      EL.adminRoundGrade.value = round.grade_id || "";
      fillAdminSubjects(EL.adminRoundGrade, EL.adminRoundSubject);
    }
    if (EL.adminRoundSubject) EL.adminRoundSubject.value = round.subject_id || "";
    if (EL.adminRoundDescription) EL.adminRoundDescription.value = round.description || "";

    const warmup = getRoundChallengeByType(roundId, "warmup");
    const obstacle = getRoundChallengeByType(roundId, "obstacle");
    const acceleration = getRoundChallengeByType(roundId, "acceleration");
    const finish = getRoundChallengeByType(roundId, "finish");
    if (EL.adminWarmupQuestionIds) EL.adminWarmupQuestionIds.value = getRoundChallengeQuestionIds(warmup?.id).join("\n");
    if (EL.adminObstacleKeyword) EL.adminObstacleKeyword.value = obstacle?.keyword_answer || "";
    if (EL.adminObstacleQuestionIds) EL.adminObstacleQuestionIds.value = getRoundChallengeQuestionIds(obstacle?.id).join("\n");
    if (EL.adminAccelerationQuestionIds) EL.adminAccelerationQuestionIds.value = getRoundChallengeQuestionIds(acceleration?.id).join("\n");
    if (EL.adminFinishEasyQuestionIds) EL.adminFinishEasyQuestionIds.value = getRoundChallengeQuestionIds(finish?.id, "easy").join("\n");
    if (EL.adminFinishMediumQuestionIds) EL.adminFinishMediumQuestionIds.value = getRoundChallengeQuestionIds(finish?.id, "medium").join("\n");
    if (EL.adminFinishHardQuestionIds) EL.adminFinishHardQuestionIds.value = getRoundChallengeQuestionIds(finish?.id, "hard").join("\n");
    EL.adminRoundTitle?.focus();
  };

  window.deleteGameRound = async function(roundId) {
    if (GAME.role !== "admin" || !confirm("Xóa vòng MindUp này?")) return;
    const { error } = await sb.from("game_rounds").delete().eq("id", roundId);
    if (error) return alert("Không xóa được vòng: " + error.message);
    await loadGameCatalog();
    renderAdminGamePage();
  };

  function applyStudentGradeLock() {
    const gradeId = GAME.profile?.grade_id || "";
    if (!gradeId) {
      if (EL.roundGrid) {
        EL.roundGrid.classList.remove("hidden");
        EL.roundGrid.innerHTML = '<div class="empty"><strong>Chưa chọn Khối</strong><div>Học sinh cần vào Trang cá nhân / Tài khoản để chọn Khối trước khi chơi Game.</div><div style="margin-top:12px"><a class="btn btn-primary" href="account.html">Cập nhật hồ sơ</a></div></div>';
      }

      document.getElementById("gameModeDeck")?.classList.add("hidden");
      return;
    }
    if (EL.gradeFilter) {
      EL.gradeFilter.value = gradeId;
      EL.gradeFilter.disabled = true;
      EL.gradeFilter.title = "Khối được lấy từ hồ sơ cá nhân.";
      fillSubjects(EL.subjectFilter, gradeId, "Tất cả môn");
    }
    renderStudentGradeBadge();
    renderGradeCards();
    renderSubjectCards();
  }

  function renderStudentGradeBadge() {
    const joinBox = document.querySelector(".join-code-box");
    if (!joinBox || document.getElementById("gameStudentGradeBadge")) return;
    const grade = GAME.grades.find((item) => item.id === GAME.profile?.grade_id);
    const badge = document.createElement("div");
    badge.id = "gameStudentGradeBadge";
    badge.style.cssText = "width:100%;margin-top:8px;color:var(--navy);font-weight:800";
    badge.textContent = grade ? `Khối ${grade.name.replace(/^Khối\s*/i, "")}` : "Chưa chọn Khối";
    joinBox.appendChild(badge);
  }

  function getActiveGameConfig(mode, gradeId, subjectId) {
    return (GAME.configs || []).find((cfg) =>
      cfg.mode === mode &&
      cfg.grade_id === gradeId &&
      cfg.subject_id === subjectId &&
      (cfg.status || "active") === "active" &&
      (GAME.configQuestions || []).some((row) => row.config_id === cfg.id)
    ) || null;
  }

  function hasRoundForSubject(gradeId, subjectId) {
    return (GAME.rounds || []).some((round) =>
      round.grade_id === gradeId &&
      round.subject_id === subjectId &&
      (round.status || "active") === "active"
    );
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

    const [{ data: profile }, { data: grades }, { data: subjects }, { data: chapters }] = await Promise.all([
      sb.from("users").select("id,role,grade_id").eq("id", user.id).single(),
      sb.from("grades").select("id,name").order("name"),
      sb.from("subjects").select("id,name,grade_id").order("name"),
      sb.from("chapters").select("id,name,subject_id").order("name"),
    ]);

    GAME.profile = profile || null;
    GAME.role = profile?.role || "student";
    GAME.grades = grades || [];
    GAME.subjects = subjects || [];
    GAME.chapters = chapters || [];
    await loadGameCatalog();
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
    if (GAME.role === "admin") {
      renderAdminGamePage();
      return;
    }
    applyStudentGradeLock();
    if (GAME.role === "student" && !GAME.profile?.grade_id) return;
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
    EL.joinByCodeBtn?.addEventListener("click", joinRoomByCode);
    EL.joinCode?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        joinRoomByCode();
      }
    });
    EL.roomForm?.addEventListener("submit", submitCreateRoom);
    EL.configForm?.addEventListener("submit", submitGameConfig);
    EL.roundForm?.addEventListener("submit", submitGameRound);
    EL.adminConfigGrade?.addEventListener("change", () => fillAdminSubjects(EL.adminConfigGrade, EL.adminConfigSubject));
    EL.adminRoundGrade?.addEventListener("change", () => fillAdminSubjects(EL.adminRoundGrade, EL.adminRoundSubject));
    document.querySelectorAll("[data-game-question-picker-target]").forEach((button) => {
      button.addEventListener("click", () => openGameQuestionPicker(button));
    });
    EL.pickerGrade?.addEventListener("change", () => {
      fillSubjects(EL.pickerSubject, EL.pickerGrade.value, "Tất cả môn");
      syncPickerChapters();
      loadQuestionPickerRows();
    });
    EL.pickerSubject?.addEventListener("change", () => {
      syncPickerChapters();
      loadQuestionPickerRows();
    });
    EL.pickerChapter?.addEventListener("change", loadQuestionPickerRows);
    EL.pickerSearch?.addEventListener("input", loadQuestionPickerRows);
    EL.pickerApplyBtn?.addEventListener("click", applyQuestionPickerSelection);
    EL.roomClass?.addEventListener("change", () => {
      if (EL.roomClass.value) syncRoomFiltersFromClass(EL.roomClass.value);
    });
    EL.roomMode?.addEventListener("change", () => applyModeDefaults(EL.roomMode.value, true));
    EL.roomGrade?.addEventListener("change", () => fillSubjects(EL.roomSubject, EL.roomGrade.value, "Chọn môn"));
    EL.gradeFilter?.addEventListener("change", () => {
      fillSubjects(EL.subjectFilter, EL.gradeFilter.value, "Tất cả môn");
      renderArenaInsightsUnified();
      if (!EL.gradeFilter.value) GAME.selectedAutoMode = "";
      tryAutoJoinReadySelection();
    });
    EL.subjectFilter?.addEventListener("change", () => {
      renderArenaInsightsUnified();
      tryAutoJoinReadySelection();
    });
    EL.startGameBtn?.addEventListener("click", startGameMatch);
    EL.toggleReadyBtn?.addEventListener("click", toggleReadyState);
    EL.leaveGameBtn?.addEventListener("click", leaveRoom);
    EL.copyGameCodeBtn?.addEventListener("click", copyRoomCode);
    EL.shareGameCodeBtn?.addEventListener("click", copyRoomInvite);
    document.querySelectorAll("[data-auto-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        GAME.selectedAutoMode = button.dataset.autoMode || "";
        if (EL.gradeFilter) EL.gradeFilter.value = "";
        if (EL.subjectFilter) EL.subjectFilter.value = "";
        fillSubjects(EL.subjectFilter, "", "Chọn khối trước");
        renderGradeCards();
        renderSubjectCards();
        if (EL.gradeFilter?.value) openSubjectSelectModal();
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
    GAME.roomPresenceIds = [];
  }

  function setupRoomRealtime(roomId) {
    teardownRoomRealtime();
    const syncRoom = () => {
      refreshActiveRoom(roomId, true);
      loadRooms();
    };
    GAME.roomChannel = sb.channel(`game-room-${roomId}-${Date.now()}`, {
      config: {
        presence: { key: GAME.user.id },
      },
    });
    GAME.roomChannel
      .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` }, syncRoom)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_room_players", filter: `room_id=eq.${roomId}` }, syncRoom)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_room_questions", filter: `room_id=eq.${roomId}` }, syncRoom)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_room_answers", filter: `room_id=eq.${roomId}` }, syncRoom)
      .on("presence", { event: "sync" }, () => {
        handleRoomPresenceSync(roomId);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          try {
            await GAME.roomChannel.track({
              user_id: GAME.user.id,
              room_id: roomId,
              online_at: new Date().toISOString(),
            });
          } catch (_) {}
          handleRoomPresenceSync(roomId);
        }
      });
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

  function fillChapters(el, subjectId, placeholder) {
    if (!el) return;
    const list = subjectId ? GAME.chapters.filter((chapter) => chapter.subject_id === subjectId) : [];
    el.innerHTML = `<option value="">${placeholder}</option>` + list.map((chapter) => `<option value="${chapter.id}">${esc(chapter.name)}</option>`).join("");
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
    fillSubjects(EL.roomSubject, classMeta.grade_id || "", "Chọn môn");
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
    if (mode === "round") return "Vòng MindUp";
    if (mode === "solo") return "Chơi đơn";
    if (mode === "ranked") return "Leo hạng";
    if (mode === "survival") return "Sinh tồn";
    if (mode === "speed") return "Đua tốc độ";
    if (mode === "friends") return "Phòng bạn bè";
    return "Đấu nhanh";
  }

  function getModeDefaults(mode) {
    if (mode === "solo") {
      return { visibility: "private", maxPlayers: 1, questionCount: 5, timePerQuestion: 60 };
    }
    if (mode === "friends") {
      return { visibility: "private", maxPlayers: 6, questionCount: 5, timePerQuestion: 60 };
    }
    if (mode === "survival") {
      return { visibility: "private", maxPlayers: 8, questionCount: 5, timePerQuestion: 60 };
    }
    if (mode === "speed") {
      return { visibility: "private", maxPlayers: 10, questionCount: 5, timePerQuestion: 60 };
    }
    if (mode === "ranked") {
      return { visibility: GAME.role === "admin" ? "public" : "private", maxPlayers: 4, questionCount: 5, timePerQuestion: 60 };
    }
    return { visibility: GAME.role === "admin" ? "public" : "private", maxPlayers: 8, questionCount: 5, timePerQuestion: 60 };
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

  function getLobbyRoomPlayers(roomId) {
    return sortPlayersByJoin((GAME.players || []).filter((player) => player.room_id === roomId));
  }

  function hasActiveStartController(room, players = getLobbyRoomPlayers(room?.id)) {
    const controllerId = getRoomStartControllerUserId(room);
    return !!controllerId && (players || []).some((player) => player.user_id === controllerId);
  }

  function isJoinableQuickRoom(room, players = getLobbyRoomPlayers(room?.id)) {
    if (roomModeValue(room) !== "quick" || room?.status !== "waiting") return true;
    if (!(players || []).length) return false;
    return hasActiveStartController(room, players);
  }

  function roomHasCapacity(room) {
    return roomPlayerCount(room.id) < Number(room.max_players || 8);
  }

  function canAccessClassRoom(room) {
    if (!room?.class_id) return true;
    if (GAME.role === "admin") return true;
    return (GAME.classIds || []).includes(room.class_id);
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


  function filterVisibleRooms(rooms) {
    const playerMap = buildRoomPlayerMap();
    return (rooms || []).filter((room) => {
      if (!isJoinableQuickRoom(room, playerMap[room.id] || [])) return false;
      if (!canAccessClassRoom(room)) return false;
      if ((room.visibility || "public") !== "private") return true;
      if (room.created_by === GAME.user?.id) return true;
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
      EL.roundGrid.innerHTML = `<div class="empty"><strong>Không tải được phòng thi đấu</strong><div>${esc(roomErr?.message || playerErr?.message || "Đã có lỗi xảy ra.")}</div></div>`;
      return;
    }

    GAME.roomsRaw = (rooms || []).map((room) => ({
      ...room,
      title: room.title || getRoomDisplayTitle(room),
    }));
    GAME.players = players || [];
    GAME.rooms = filterVisibleRooms(GAME.roomsRaw);
    await ensureArenaUserCache();
    renderArenaInsightsUnified();
  }

  function buildRoomPlayerMap() {
    const out = {};
    (GAME.players || []).forEach((player) => {
      if (!out[player.room_id]) out[player.room_id] = [];
      out[player.room_id].push(player);
    });
    return out;
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

  function getArenaTier(elo) {
    if (elo >= 1800) return { name: "Kim cương", icon: "◆" };
    if (elo >= 1550) return { name: "Bạch kim", icon: "⬡" };
    if (elo >= 1300) return { name: "Vàng", icon: "★" };
    if (elo >= 1100) return { name: "Bạc", icon: "✦" };
    return { name: "Đồng", icon: "●" };
  }

  function getLeaderboardByElo(scopedRooms, finishedPlayers) {
    const rankedRooms = [...(scopedRooms || [])]
      .filter((room) => supportsModeElo(roomModeValue(room)))
      .sort((a, b) => new Date(a.ended_at || a.created_at) - new Date(b.ended_at || b.created_at));
    const totals = {};
    rankedRooms.forEach((room) => {
      const ordered = getOrderedPlayersForRoom(room.id, finishedPlayers);
      const deltas = getModeEloDeltaMap(roomModeValue(room), ordered, room);
      Object.keys(deltas).forEach((userId) => {
        if (!totals[userId]) totals[userId] = { elo: 1000, matches: 0, wins: 0, quickMatches: 0, quickWins: 0 };
        totals[userId].elo += Number(deltas[userId] || 0);
        totals[userId].matches += 1;
        if (ordered[0]?.user_id === userId && roomModeValue(room) !== "solo") totals[userId].wins += 1;
        if (roomModeValue(room) === "quick") {
          totals[userId].quickMatches += 1;
          if (ordered[0]?.user_id === userId) totals[userId].quickWins += 1;
        }
      });
    });
    return Object.entries(totals)
      .map(([userId, info]) => ({ userId, ...info }))
      .sort((a, b) => b.elo - a.elo || b.wins - a.wins || b.matches - a.matches)
      .slice(0, 10);
  }


  function getRoomById(roomId) {
    return GAME.roomsRaw.find((room) => room.id === roomId) || null;
  }

  function getRoundHistoryTitle(roundId, fallbackRoom = null) {
    const round = (GAME.rounds || []).find((item) => item.id === roundId);
    if (round) return `Vòng ${round.round_no || 1}: ${round.title || "MindUp"}`;
    return getRoomDisplayTitle(fallbackRoom || {});
  }

  function getHistoryEntryTitle(entry) {
    if (entry?.kind === "round") return entry.title || getRoundHistoryTitle(entry.roundId, entry.room);
    return getRoomDisplayTitle(entry?.room || {});
  }

  function getHistoryEntryDetailId(entry) {
    return entry?.kind === "round" ? `round:${entry.roundId}` : entry?.player?.room_id;
  }

  function getRoundChallengeSortIndex(room) {
    const index = getRoundChallengeOrder().indexOf(getRoomRoundChallengeType(room));
    return index === -1 ? 99 : index;
  }

  function getRoundChallengeHistoryKey(room) {
    const type = getRoomRoundChallengeType(room) || "unknown";
    return type === "finish" ? "finish" : type;
  }

  function getBestRoundChallengeAttempts(rooms, players) {
    const bestByChallenge = new Map();
    (rooms || []).forEach((room) => {
      const player = (players || []).find((item) => item.room_id === room.id);
      if (!player) return;
      const key = getRoundChallengeHistoryKey(room);
      const score = Number(player.score || 0);
      const time = new Date(room.ended_at || room.created_at || 0).getTime() || 0;
      const current = bestByChallenge.get(key);
      if (!current || score > current.score || (score === current.score && time > current.time)) {
        bestByChallenge.set(key, { room, player, score, time });
      }
    });
    return [...bestByChallenge.values()].sort((a, b) =>
      getRoundChallengeSortIndex(a.room) - getRoundChallengeSortIndex(b.room)
      || a.time - b.time
    );
  }

  function getMyFinishedHistory(limit = 20) {
    const finishedRooms = GAME.rooms.filter((room) => room.status === "finished");
    const finishedIds = new Set(finishedRooms.map((room) => room.id));
    const finishedPlayers = GAME.players.filter((player) => finishedIds.has(player.room_id));
    const entries = [];
    const roundGroups = new Map();
    finishedPlayers
      .filter((player) => player.user_id === GAME.user.id)
      .forEach((player) => {
        const room = getRoomById(player.room_id);
        if (roomModeValue(room) === "round" && room?.round_id) {
          const current = roundGroups.get(room.round_id) || [];
          current.push({ player, room });
          roundGroups.set(room.round_id, current);
          return;
        }
        const sameRoom = finishedPlayers
          .filter((row) => row.room_id === player.room_id)
          .sort((a, b) => (b.score || 0) - (a.score || 0));
        const rank = sameRoom.findIndex((row) => row.user_id === GAME.user.id) + 1;
        entries.push({
          kind: "room",
          player,
          room,
          rank: Math.max(rank, 1),
          players: sameRoom,
          sortAt: new Date(room?.ended_at || room?.created_at || 0).getTime(),
        });
      });

    roundGroups.forEach((items, roundId) => {
      const sorted = [...items].sort((a, b) => new Date(b.room?.ended_at || b.room?.created_at || 0) - new Date(a.room?.ended_at || a.room?.created_at || 0));
      const latest = sorted[0];
      const totalScore = sorted.reduce((max, item) => Math.max(max, Number(item.player?.score || 0)), 0);
      entries.push({
        kind: "round",
        roundId,
        title: getRoundHistoryTitle(roundId, latest?.room),
        player: { ...(latest?.player || {}), room_id: `round:${roundId}`, score: totalScore },
        room: latest?.room,
        rank: 1,
        rooms: sorted.map((item) => item.room),
        sortAt: new Date(latest?.room?.ended_at || latest?.room?.created_at || 0).getTime(),
      });
    });

    return entries
      .sort((a, b) => (b.sortAt || 0) - (a.sortAt || 0))
      .slice(0, limit);
  }

  function renderArenaInsightsUnified() {
    const finishedRooms = GAME.rooms.filter((room) => room.status === "finished");
    const finishedIds = new Set(finishedRooms.map((room) => room.id));
    const finishedPlayers = GAME.players.filter((player) => finishedIds.has(player.room_id));
    const myFinished = finishedPlayers.filter((player) => player.user_id === GAME.user.id);
    const myCompetitiveFinished = myFinished.filter((player) => roomModeValue(getRoomById(player.room_id)) !== "solo");
    const myHistoryEntries = getMyFinishedHistory(9999);
    const eloProfile = getUnifiedEloProfile(finishedRooms, finishedPlayers, GAME.user.id);
    const totalMatches = myHistoryEntries.length;
    const totalScore = myHistoryEntries.reduce((sum, item) => sum + Number(item.player?.score || 0), 0);
    const wins = myCompetitiveFinished.filter((player) => {
      const sameRoom = finishedPlayers.filter((row) => row.room_id === player.room_id);
      const best = sameRoom.reduce((max, row) => Math.max(max, Number(row.score || 0)), 0);
      return Number(player.score || 0) === best;
    }).length;
    const avgScore = totalMatches ? Math.round(totalScore / totalMatches) : 0;
    const competitiveMatches = myCompetitiveFinished.length;
    const winRate = competitiveMatches ? Math.round((wins / competitiveMatches) * 100) : 0;
    const sortedMyFinished = [...myCompetitiveFinished].sort((a, b) => new Date(getRoomById(b.room_id)?.ended_at || 0) - new Date(getRoomById(a.room_id)?.ended_at || 0));
    let streak = 0;
    for (const player of sortedMyFinished) {
      const sameRoom = finishedPlayers.filter((row) => row.room_id === player.room_id);
      const best = sameRoom.reduce((max, row) => Math.max(max, Number(row.score || 0)), 0);
      if (Number(player.score || 0) === best) streak += 1;
      else break;
    }
    if (EL.heroBadges) {
      EL.heroBadges.innerHTML = [
        `<div class="hero-badge">Elo ${eloProfile.points} • ${eloProfile.matches} trận tính Elo</div>`,
        `<div class="hero-badge">Thành tích ${totalMatches} trận</div>`,
        `<div class="hero-badge">Tỉ lệ thắng ${winRate}%</div>`,
        `<div class="hero-badge">Chuỗi thắng ${streak}</div>`,
      ].join("");
    }

    if (EL.heroBadges) {
      EL.heroBadges.innerHTML = "";
      EL.heroBadges.classList.add("hidden");
    }

    if (EL.statsGrid) {
      EL.statsGrid.innerHTML = `
        <div class="stat-card"><span>Elo hiện tại</span><strong>${eloProfile.points}</strong><small>${eloProfile.matches} trận Elo • ${eloProfile.wins} trận PvP đứng đầu</small></div>
        <div class="stat-card"><span>Trận đã chơi</span><strong>${totalMatches}</strong></div>
        <div class="stat-card"><span>Thắng PvP</span><strong>${wins}</strong><small>Tỉ lệ thắng ${winRate}%</small></div>
        <div class="stat-card"><span>Điểm trung bình</span><strong>${avgScore}</strong><small>Chuỗi thắng ${streak}</small></div>
      `;
    }

    if (EL.statsGrid) {
      EL.statsGrid.innerHTML = `
        <div class="stat-card"><span>Elo hiện tại</span><strong>${eloProfile.points}</strong></div>
        <div class="stat-card"><span>Điểm trung bình</span><strong>${avgScore}</strong></div>
        <button class="stat-card history-stat-button" type="button" onclick="openGameHistoryListModal()" aria-label="Xem lịch sử đấu">
          <span>Lịch sử đấu</span><strong>${totalMatches}</strong><small>Xem chi tiết các trận đã chơi</small>
        </button>
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

    if (EL.historyList) {
      EL.historyList.innerHTML = "";
      EL.historyList.closest(".section-card")?.classList.add("hidden");
    }

    const leaderboard = getLeaderboardByElo(finishedRooms, finishedPlayers);

    if (EL.globalLeaderboard) {
      EL.globalLeaderboard.innerHTML = leaderboard.length
        ? leaderboard.map((item, idx) => {
          const quickRate = item.quickMatches ? Math.round((Number(item.quickWins || 0) / Number(item.quickMatches || 1)) * 100) : 0;
          return `<div class="player-row"><div class="player-main"><img class="avatar" src="${escAttr(getPlayerAvatar(item.userId))}" alt="avatar"><div><div style="font-weight:700;color:var(--navy)">${idx + 1}. ${esc(getPlayerName(item.userId))}</div><div class="hint">${item.matches} trận Elo • Thắng Đấu nhanh ${quickRate}%</div></div></div><strong style="color:var(--navy)">${item.elo}</strong></div>`;
        }).join("")
        : `<div class="empty">Chưa có dữ liệu Elo.</div>`;
    }

    const gradeId = GAME.profile?.grade_id || EL.gradeFilter?.value || "";
    const subjectId = EL.subjectFilter?.value || "";
    const grade = GAME.grades.find((item) => item.id === gradeId);
    const subject = GAME.subjects.find((item) => item.id === subjectId);
    const gradeLabel = grade ? grade.name : "";
    const subjectLabel = subject ? subject.name : "";
    const mountainScopeLabel = [gradeLabel, subjectLabel].filter(Boolean).join(" • ") || "Khối của bạn";
    if (EL.mountainLeaderboardTitle) {
      EL.mountainLeaderboardTitle.textContent = "Bảng xếp hạng Leo núi";
    }
    if (EL.mountainLeaderboard) {
      const mountainRooms = finishedRooms.filter((room) =>
        roomModeValue(room) === "round" &&
        (!gradeId || room.grade_id === gradeId) &&
        (!subjectId || room.subject_id === subjectId)
      );
      const mountainRoomMap = new Map(mountainRooms.map((room) => [room.id, room]));
      const mountainIds = new Set(mountainRoomMap.keys());
      const userRoundScores = new Map();
      finishedPlayers.filter((player) => mountainIds.has(player.room_id)).forEach((player) => {
        const room = mountainRoomMap.get(player.room_id);
        const key = `${player.user_id}:${room?.round_id || room?.id || player.room_id}`;
        const current = userRoundScores.get(key) || { userId: player.user_id, score: 0 };
        current.score = Math.max(current.score, Number(player.score || 0));
        userRoundScores.set(key, current);
      });
      const mountainTotals = new Map();
      userRoundScores.forEach((roundScore) => {
        const current = mountainTotals.get(roundScore.userId) || { userId: roundScore.userId, score: 0, best: 0, attempts: 0 };
        const score = Number(roundScore.score || 0);
        current.score += score;
        current.best = Math.max(current.best, score);
        current.attempts += 1;
        mountainTotals.set(roundScore.userId, current);
      });
      const mountainLeaderboard = [...mountainTotals.values()]
        .sort((a, b) => b.score - a.score || b.best - a.best || a.attempts - b.attempts)
        .slice(0, 10);
      EL.mountainLeaderboard.innerHTML = mountainLeaderboard.length
        ? mountainLeaderboard.map((item, idx) => `<div class="player-row"><div class="player-main"><img class="avatar" src="${escAttr(getPlayerAvatar(item.userId))}" alt="avatar"><div><div style="font-weight:700;color:var(--navy)">${idx + 1}. ${esc(getPlayerName(item.userId))}</div><div class="hint">${item.attempts} lượt Leo núi • cao nhất ${item.best}</div></div></div><strong style="color:var(--navy)">${item.score}</strong></div>`).join("")
        : `<div class="empty">Chưa có dữ liệu Leo núi cho ${esc(mountainScopeLabel)}.</div>`;
    }
  }

  function openHistoryListModal() {
    if (!EL.historyModal || !EL.historyModalBody) return;
    const title = document.querySelector("#gameHistoryModal .mh h2");
    if (title) title.textContent = "Lịch sử đấu";
    const history = getMyFinishedHistory(20);
    EL.historyModal.classList.add("show");
    EL.historyModalBody.innerHTML = history.length
      ? `<div class="panel" style="grid-column:1/-1">
          <div class="history-list">
            ${history.map((entry) => `<div class="history-item">
              <div class="history-main">
                <strong>${esc(getHistoryEntryTitle(entry))}</strong>
                <div class="hint">${fmtDateTime(entry.room?.ended_at || entry.room?.created_at)}</div>
              </div>
              <div class="history-actions">
                <div style="text-align:right"><strong>${entry.player?.score || 0} điểm</strong>${entry.kind === "round" ? `<div class="hint">Tổng Vòng MindUp</div>` : `<div class="hint">Hạng #${entry.rank}</div>`}</div>
                <button class="btn btn-outline btn-sm" type="button" onclick="openGameHistoryDetail('${escAttr(getHistoryEntryDetailId(entry) || "")}')">Xem chi tiết</button>
              </div>
            </div>`).join("")}
          </div>
        </div>`
      : `<div class="empty" style="grid-column:1/-1">Bạn chưa có trận nào hoàn thành.</div>`;
  }

  async function openHistoryDetail(roomId) {
    if (String(roomId || "").startsWith("round:")) {
      await openRoundHistoryDetail(String(roomId || "").slice("round:".length));
      return;
    }
    const room = getRoomById(roomId);
    if (!room || !EL.historyModalBody) return;
    const title = document.querySelector("#gameHistoryModal .mh h2");
    if (title) title.textContent = "Chi tiết trận đấu";
    EL.historyModal.classList.add("show");
    EL.historyModalBody.innerHTML = `<div class="empty" style="grid-column:1/-1">Đang tải chi tiết trận đấu...</div>`;
    const [{ data: players }, { data: answers }] = await Promise.all([
      sb.from("game_room_players").select("id,room_id,user_id,score,joined_at").eq("room_id", roomId).order("score", { ascending: false }),
      sb.from("game_room_answers").select("player_id,is_correct,score_earned,answered_at").eq("room_id", roomId),
    ]);
    const ordered = [...(players || [])].sort((a, b) => (b.score || 0) - (a.score || 0) || new Date(a.joined_at) - new Date(b.joined_at));
    const myPlayer = ordered.find((item) => item.user_id === GAME.user.id);
    const myAnswers = (answers || []).filter((item) => item.player_id === myPlayer?.id);
    const correctCount = myAnswers.filter((item) => item.is_correct).length;
    const accuracy = myAnswers.length ? Math.round((correctCount / myAnswers.length) * 100) : 0;
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
      </div>
    `;
    return;
  }

  async function openRoundHistoryDetail(roundId) {
    if (!roundId || !EL.historyModalBody) return;
    const title = document.querySelector("#gameHistoryModal .mh h2");
    if (title) title.textContent = "Chi tiết Vòng MindUp";
    EL.historyModal.classList.add("show");
    EL.historyModalBody.innerHTML = `<div class="empty" style="grid-column:1/-1">Đang tải chi tiết Vòng MindUp...</div>`;
    const roundRooms = (GAME.roomsRaw || [])
      .filter((room) => room.status === "finished" && roomModeValue(room) === "round" && room.round_id === roundId)
      .sort((a, b) => {
        const orderA = getRoundChallengeOrder().indexOf(getRoomRoundChallengeType(a));
        const orderB = getRoundChallengeOrder().indexOf(getRoomRoundChallengeType(b));
        return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB)
          || new Date(a.ended_at || a.created_at || 0) - new Date(b.ended_at || b.created_at || 0);
      });
    const roomIds = roundRooms.map((room) => room.id);
    if (!roomIds.length) {
      EL.historyModalBody.innerHTML = `<div class="empty" style="grid-column:1/-1">Không tìm thấy dữ liệu Vòng MindUp.</div>`;
      return;
    }
    const [{ data: players }, { data: answers }] = await Promise.all([
      sb.from("game_room_players").select("id,room_id,user_id,score,joined_at").in("room_id", roomIds),
      sb.from("game_room_answers").select("player_id,room_id,is_correct,score_earned,answered_at").in("room_id", roomIds),
    ]);
    const myPlayers = (players || []).filter((player) => player.user_id === GAME.user.id);
    const myRoomIds = new Set(myPlayers.map((player) => player.room_id));
    const myRoundRooms = roundRooms.filter((room) => myRoomIds.has(room.id));
    if (!myRoundRooms.length) {
      EL.historyModalBody.innerHTML = `<div class="empty" style="grid-column:1/-1">Không tìm thấy dữ liệu Vòng MindUp của bạn.</div>`;
      return;
    }
    const selectedAttempts = getBestRoundChallengeAttempts(myRoundRooms, myPlayers);
    let carriedScore = 0;
    const challengeRows = selectedAttempts.map(({ room, player: myPlayer }) => {
      const finalScore = Number(myPlayer?.score || 0);
      const challengeScore = Math.max(0, finalScore - carriedScore);
      carriedScore = Math.max(carriedScore, finalScore);
      const myAnswers = (answers || []).filter((answer) => answer.player_id === myPlayer?.id);
      const correctCount = myAnswers.filter((answer) => answer.is_correct).length;
      return {
        room,
        label: getRoundChallengeDisplayName(getRoomRoundChallengeType(room), getRoomRoundFinishLevel(room)),
        finalScore,
        challengeScore,
        correctCount,
        answerCount: myAnswers.length,
      };
    });
    const totalScore = challengeRows.reduce((max, row) => Math.max(max, row.finalScore), 0);
    const totalCorrect = challengeRows.reduce((sum, row) => sum + row.correctCount, 0);
    const totalAnswered = challengeRows.reduce((sum, row) => sum + row.answerCount, 0);
    EL.historyModalBody.innerHTML = `
      <div class="panel">
        <h3>${esc(getRoundHistoryTitle(roundId, myRoundRooms[0]))}</h3>
        <div class="hint" style="margin-bottom:12px">${fmtDateTime(myRoundRooms[myRoundRooms.length - 1]?.ended_at || myRoundRooms[0]?.created_at)}</div>
        <div class="history-stat-grid">
          <div class="history-stat"><span>Tổng điểm</span><strong>${totalScore}</strong></div>
          <div class="history-stat"><span>Trạng thái</span><strong>${totalScore >= 100 ? "Đã qua" : "Chưa qua"}</strong></div>
          <div class="history-stat"><span>Thử thách</span><strong>${challengeRows.length}/4</strong></div>
          <div class="history-stat"><span>Câu đúng</span><strong>${totalCorrect}/${totalAnswered}</strong></div>
        </div>
      </div>
      <div class="panel">
        <h3>Điểm từng thử thách</h3>
        <div class="question-breakdown">
          ${challengeRows.map((row) => `<div class="question-breakdown-item">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
              <div>
                <strong style="color:var(--navy)">${esc(row.label)}</strong>
                <div class="hint">${row.correctCount}/${row.answerCount} câu đúng</div>
              </div>
              <div style="text-align:right">
                <strong style="color:var(--navy);font-size:1.1rem">${row.challengeScore}</strong>
                <div class="hint">Tổng đến đây ${row.finalScore}</div>
              </div>
            </div>
          </div>`).join("")}
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
      time_per_question: 60,
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
    await sb.from("game_room_players").insert({ room_id: room.id, user_id: GAME.user.id, score: 0, ready: mode === "quick" });
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
    const lobbyPlayers = getLobbyRoomPlayers(roomId);
    if (!isJoinableQuickRoom(room, lobbyPlayers)) {
      alert("Phòng đấu nhanh này đã mất chủ phòng. Hãy bấm Đấu nhanh để tạo hoặc ghép vào phòng mới.");
      await loadRooms();
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
      const autoReady = false;
      const { error } = await sb.from("game_room_players").insert({ room_id: roomId, user_id: GAME.user.id, score: 0, ready: autoReady });
      if (error && !String(error.message || "").includes("duplicate")) {
        alert(`Không thể tham gia phòng: ${error.message}`);
        return;
      }
    }
    await loadRooms();
    await openRoomScreen(roomId);
  }

  async function createAutoRoomForMode(mode, gradeId, subjectId) {
    const joinCode = randomCode();
    const defaults = getModeDefaults(mode);
    const config = getActiveGameConfig(mode, gradeId, subjectId);
    if (!config) {
      alert("Admin chưa thêm danh sách câu hỏi cho phần chơi này.");
      return null;
    }
    const payload = {
      title: `${roomModeLabel(mode)} • ${joinCode}`,
      join_code: joinCode,
      mode,
      grade_id: gradeId,
      subject_id: subjectId,
      question_count: 5,
      time_per_question: 60,
      max_players: Number(defaults.maxPlayers || 8),
      game_config_id: config.id,
      class_id: null,
      description: `Phòng tự ghép cho chế độ ${roomModeLabel(mode)}.`,
      visibility: mode === "solo" ? "private" : "public",
      status: "waiting",
      host_id: GAME.user.id,
      created_by: GAME.user.id,
    };
    const { data: room, error } = await sb.from("game_rooms").insert(payload).select("*").single();
    if (error) {
      alert(`Không thể tạo phòng tự động: ${error.message}`);
      return null;
    }
    await sb.from("game_room_players").insert({ room_id: room.id, user_id: GAME.user.id, score: 0, ready: mode === "quick" });
    return room;
  }

  async function hasFinishedRoundAttempt(roundId, challengeType = "", finishLevel = "") {
    if (!roundId || !GAME.user?.id) return false;
    const { data } = await sb.from("game_rooms")
      .select("id,description,game_room_players!inner(user_id)")
      .eq("mode", "round")
      .eq("round_id", roundId)
      .eq("status", "finished")
      .eq("game_room_players.user_id", GAME.user.id)
      .limit(50);
    return (data || []).some((room) => {
      const meta = parseRoundRoomMeta(room);
      return meta.challengeType === challengeType && (challengeType !== "finish" || (meta.finishLevel || "medium") === (finishLevel || "medium"));
    });
  }

  async function getRoundCarriedScore(roundId, excludeRoomId = "") {
    if (!roundId || !GAME.user?.id) return 0;
    const { data } = await sb.from("game_rooms")
      .select("id,description,created_at,ended_at,game_room_players!inner(user_id,score)")
      .eq("mode", "round")
      .eq("round_id", roundId)
      .eq("status", "finished")
      .eq("game_room_players.user_id", GAME.user.id)
      .limit(80);
    const orderIndex = Object.fromEntries(getRoundChallengeOrder().map((type, index) => [type, index]));
    const rows = (data || [])
      .filter((room) => room.id !== excludeRoomId)
      .map((room) => {
        const meta = parseRoundRoomMeta(room);
        const player = Array.isArray(room.game_room_players) ? room.game_room_players[0] : room.game_room_players;
        return {
          score: Number(player?.score || 0),
          order: Number(orderIndex[meta.challengeType] ?? -1),
          time: new Date(room.ended_at || room.created_at || 0).getTime() || 0,
        };
      })
      .filter((row) => row.order >= 0)
      .sort((a, b) => b.order - a.order || b.time - a.time);
    return rows[0]?.score || 0;
  }

  async function createRoundRoom(round, challengeType = "", finishLevel = "") {
    const joinCode = randomCode();
    const isRetry = await hasFinishedRoundAttempt(round.id, challengeType, finishLevel);
    const retryPenalty = isRetry ? 20 : 0;
    const carriedScore = Math.max(0, await getRoundCarriedScore(round.id) - retryPenalty);
    const challengeName = getRoundChallengeDisplayName(challengeType, finishLevel);
    const payload = {
      title: `Vòng ${round.round_no || 1}: ${round.title} • ${challengeName}`,
      join_code: joinCode,
      mode: "round",
      round_id: round.id,
      round_retry: isRetry,
      grade_id: round.grade_id,
      subject_id: round.subject_id,
      question_count: getRoundChallengeQuestionCount(challengeType),
      time_per_question: 20,
      max_players: 1,
      visibility: "private",
      status: "waiting",
      host_id: GAME.user.id,
      created_by: GAME.user.id,
      description: makeRoundRoomDescription(round, challengeType, finishLevel),
    };
    const { data: room, error } = await sb.from("game_rooms").insert(payload).select("*").single();
    if (error) {
      alert(`Không tạo được phòng Vòng MindUp: ${error.message}. Nếu lỗi liên quan đến round_id, round_retry, mode, challenge_type hoặc finish_level, hãy chạy file SQL fix MindUp round room columns.sql.`);
      return null;
    }
    const { error: playerError } = await sb.from("game_room_players").insert({ room_id: room.id, user_id: GAME.user.id, score: carriedScore, ready: true });
    if (playerError && !String(playerError.message || "").includes("duplicate")) {
      alert("Không vào được Vòng MindUp: " + playerError.message);
      return null;
    }
    return room;
  }

  async function startMindUpRound(roundId, challengeType = "", finishLevel = "") {
    const round = (GAME.rounds || []).find((item) => item.id === roundId);
    if (!round) return alert("Không tìm thấy vòng MindUp này.");
    if (!challengeType) return alert("Hãy chọn thử thách của Vòng MindUp trước.");
    if (challengeType === "finish" && !["easy", "medium", "hard"].includes(finishLevel)) {
      return alert("Hãy chọn bộ câu hỏi Về đích: Dễ, Trung bình hoặc Khó.");
    }
    const attemptMap = await loadRoundAttemptMap(roundId);
    const nextType = getNextRoundChallengeType(attemptMap);
    if (nextType && challengeType !== nextType) {
      return alert(`Hãy làm lần lượt. Thử thách tiếp theo là ${getRoundChallengeDisplayName(nextType)}.`);
    }
    const room = await createRoundRoom(round, challengeType, finishLevel);
    if (!room) return;
    await loadRooms();
    await joinRoom(room.id);
    await startGameMatch();
  }

  async function autoMatchSelectedMode() {
    const mode = GAME.selectedAutoMode || "";
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
    const config = getActiveGameConfig(mode, EL.gradeFilter.value, EL.subjectFilter.value);
    if (!config) {
      alert("Admin chưa thêm danh sách câu hỏi cho phần chơi này.");
      return;
    }
    if (mode === "solo") {
      const room = await createAutoRoomForMode(mode, EL.gradeFilter.value, EL.subjectFilter.value);
      if (!room) return;
      await loadRooms();
      await joinRoom(room.id);
      return;
    }
    await loadRooms();
    const targetRoom = [...(GAME.roomsRaw || [])]
      .filter((room) => room.status === "waiting")
      .filter((room) => room.mode === mode)
      .filter((room) => room.grade_id === EL.gradeFilter.value)
      .filter((room) => room.subject_id === EL.subjectFilter.value)
      .filter((room) => (room.visibility || "public") === "public")
      .filter((room) => mode !== "quick" || isJoinableQuickRoom(room))
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

  async function removePlayerFromRoom(room, player) {
    if (!room || !player) return;
    await sb.from("game_room_answers").delete().eq("player_id", player.id);
    const { error } = await sb.from("game_room_players").delete().eq("id", player.id);
    if (error) throw error;
    const { data: remain = [] } = await sb.from("game_room_players").select("id,user_id").eq("room_id", room.id).order("joined_at", { ascending: true });
    if (!remain.length) {
      await cleanupRoomCompletely(room.id);
      return;
    }
    if (getRoomCoordinatorUserId(room, GAME.roomPlayers) === player.user_id || getRoomStartControllerUserId(room) === player.user_id) {
      await sb.from("game_rooms").update({ host_id: remain[0].user_id, started_at: remain.length >= 2 ? room.started_at : null }).eq("id", room.id);
    } else if (remain.length < 2) {
      await sb.from("game_rooms").update({ started_at: null }).eq("id", room.id);
    }
  }

  function getPresenceUserIds() {
    if (!GAME.roomChannel?.presenceState) return [];
    const state = GAME.roomChannel.presenceState();
    const ids = new Set();
    Object.values(state || {}).forEach((entries) => {
      (entries || []).forEach((entry) => {
        if (entry?.user_id) ids.add(entry.user_id);
      });
    });
    return [...ids];
  }

  async function handleRoomPresenceSync(roomId) {
    const presentIds = getPresenceUserIds();
    GAME.roomPresenceIds = presentIds;
    if (!presentIds.length) return;
    if (GAME.activeRoom?.id !== roomId) return;
    if (GAME.activeRoom?.status === "finished") return;
    if (getRoomCoordinatorUserId(GAME.activeRoom, GAME.roomPlayers) !== GAME.user?.id) return;
    const stalePlayers = (GAME.roomPlayers || []).filter((player) => !presentIds.includes(player.user_id));
    for (const stalePlayer of stalePlayers) {
      try {
        await removePlayerFromRoom(GAME.activeRoom, stalePlayer);
      } catch (_) {}
    }
    if (stalePlayers.length) {
      showRoomNotice(`${formatPlayerNames(stalePlayers.map((item) => item.user_id))} đã mất kết nối và bị đưa ra khỏi phòng.`);
      await refreshActiveRoom(roomId, true);
      await loadRooms();
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
    const room = GAME.activeRoom;
    const player = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    if (!room || !player) return;
    const mode = roomModeValue(room);
    const nextReady = mode === "solo" ? true : !player.ready;
    const { error } = await sb.from("game_room_players").update({ ready: nextReady }).eq("id", player.id);
    if (error) {
      alert(`Không thể cập nhật trạng thái: ${error.message}`);
      return;
    }
    await refreshActiveRoom(room.id, true);
    if (mode === "solo" && getRoomStartControllerUserId(room) === GAME.user.id) {
      await startGameMatch();
    }
  }

  window.kickGamePlayer = async function(playerId) {
    const room = GAME.activeRoom;
    const player = (GAME.roomPlayers || []).find((item) => item.id === playerId);
    if (!room || !player) return;
    if (roomModeValue(room) !== "quick" || getRoomCoordinatorUserId(room, GAME.roomPlayers) !== GAME.user?.id) return;
    if (player.ready) return alert("Chỉ có thể kick người chơi chưa sẵn sàng.");
    try {
      await removePlayerFromRoom(room, player);
      await refreshActiveRoom(room.id, true);
      await loadRooms();
    } catch (error) {
      alert("Không kick được người chơi: " + error.message);
    }
  };

  async function leaveRoom() {
    const room = GAME.activeRoom;
    const player = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    if (!room || !player) {
      hideGameScreen();
      return;
    }
    if (!confirm("Bạn muốn rời phòng này?")) return;
    if (room.status === "finished") {
      hideGameScreen();
      await loadRooms();
      return;
    }
    GAME.leavingRoom = true;
    clearIntervals();
    try {
      await removePlayerFromRoom(room, player);
    } catch (error) {
      alert(`Không thể rời phòng: ${error.message}`);
      GAME.leavingRoom = false;
      return;
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

  async function openRoomScreen(roomId) {
    clearIntervals();
    EL.roomScreen.classList.add("show");
    setupRoomRealtime(roomId);
    await refreshActiveRoom(roomId);
    GAME.roomPoll = setInterval(() => refreshActiveRoom(roomId, true), 1200);
  }

  function hideGameScreen() {
    GAME.unloadingLeaveSent = false;
    clearTimeout(GAME.roundReturnTimer);
    GAME.roundReturnTimer = null;
    clearIntervals();
    clearAutoStartTimer();
    clearWaitingCountdown();
    showRoomNotice("");
    teardownRoomRealtime();
    GAME.activeRoom = null;
    document.getElementById("gameRoundLobbyView")?.classList.add("hidden");
    updateRoundTopbarScore("", 0);
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
      if (!silent) alert("Bạn không còn ở trong phòng này.");
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
    const mode = roomModeValue(room);
    const modeLabel = roomModeLabel(mode);
    const isCoordinator = getRoomCoordinatorUserId(room, GAME.roomPlayers) === GAME.user.id;
    const isStartController = getRoomStartControllerUserId(room) === GAME.user.id;
    const me = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    const readyForStart = areRoomPlayersReadyForStart(room, GAME.roomPlayers);
    const hasStartController = mode !== "quick" || room.status !== "waiting" || hasActiveStartController(room, GAME.roomPlayers);
    const countdownActive = mode === "quick" && room.status === "waiting" && readyForStart && hasStartController;

    if (mode === "quick" && isCoordinator && me && !me.ready && room.status === "waiting") {
      sb.from("game_room_players").update({ ready: true }).eq("id", me.id).then(() => refreshActiveRoom(room.id, true)).catch(() => {});
    }

    if (countdownActive && !room.started_at && !GAME.localCountdownStartedAt) {
      GAME.localCountdownStartedAt = new Date().toISOString();
      if (isStartController) queueAutoStart({ ...room, started_at: GAME.localCountdownStartedAt }, 15000);
    }
    if (countdownActive && room.started_at) {
      GAME.localCountdownStartedAt = room.started_at;
      renderWaitingCountdown(room);
      if (isStartController) {
        const delayMs = Math.max(0, new Date(room.started_at).getTime() + 15000 - Date.now());
        queueAutoStart(room, delayMs);
      }
    } else if (countdownActive && GAME.localCountdownStartedAt) {
      renderWaitingCountdown({ started_at: GAME.localCountdownStartedAt });
    } else {
      clearAutoStartTimer();
      clearWaitingCountdown();
      GAME.localCountdownStartedAt = null;
      if (isStartController && room.status === "waiting" && room.started_at) {
        sb.from("game_rooms").update({ started_at: null }).eq("id", room.id).then(() => refreshActiveRoom(room.id, true)).catch(() => {});
      }
    }
    if (isStartController && room.status === "waiting" && countdownActive && !room.started_at) {
      clearAutoStartTimer();
      const nextStartedAt = new Date().toISOString();
      queueAutoStart({ ...room, started_at: nextStartedAt }, 15000);
      sb.from("game_rooms").update({ started_at: nextStartedAt }).eq("id", room.id).then(() => refreshActiveRoom(room.id, true)).catch(() => {});
    }

    EL.roomScreenTitle.innerHTML = `Phòng chờ: <span>${esc(room.join_code || "----")}</span>`;
    updateRoundTopbarScore(mode, me?.score || 0);
    EL.startGameBtn.classList.add("hidden");
    EL.startGameBtn.disabled = true;
    EL.toggleReadyBtn?.classList.add("hidden");
    if (EL.toggleReadyBtn && me && room.status === "waiting") {
      const canToggle = mode === "solo" || (mode === "quick" && !isCoordinator);
      if (canToggle) {
        EL.toggleReadyBtn.classList.remove("hidden");
        EL.toggleReadyBtn.textContent = me.ready ? "Hủy sẵn sàng" : "Sẵn sàng";
      }
    }
    ensurePlayerCache().then(() => {
      if (room.status === "waiting") {
        setScreenState("waiting");
        const panels = EL.waitingView?.querySelectorAll(".panel") || [];
        panels[1]?.classList.toggle("hidden", mode === "solo");
        panels[2]?.classList.toggle("hidden", mode === "solo");
        const summaryItems = mode === "solo"
          ? [
            ["Chế độ", modeLabel],
            ["Khối", grade],
            ["Môn", subject],
            ["Số câu", "5 câu"],
            ["Giây mỗi câu", "60s"],
            ["Luật Elo", getModeEloRule(mode)],
          ]
          : [
            ["Mã phòng", room.join_code || "—"],
            ["Chế độ", modeLabel],
            ["Khối", grade],
            ["Môn", subject],
            ["Số câu", "5 câu"],
            ["Số người", `${GAME.roomPlayers.length}/${room.max_players || 8}`],
            ["Giây mỗi câu", "60s"],
            ["Luật Elo", getModeEloRule(mode)],
          ];
        EL.roomSummary.innerHTML = summaryItems.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");
        if (EL.inviteCode) EL.inviteCode.textContent = room.join_code || "—";
        if (EL.inviteVisibility) EL.inviteVisibility.textContent = roomVisibilityLabel(room.visibility || "public");
        EL.roomDescriptionView.textContent = mode === "solo"
          ? "Bấm Sẵn sàng để bắt đầu 5 câu luyện tập."
          : "Chủ phòng ở vị trí số 1. Khi tất cả người chơi đã sẵn sàng, hệ thống đếm ngược 15 giây rồi vào Game.";
        if (EL.roomStartHint) {
          EL.roomStartHint.textContent = mode === "solo"
            ? (me?.ready ? "Đang vào trận..." : "Chơi một mình nên không cần mã phòng hay mời bạn.")
            : (countdownActive ? "Tất cả đã sẵn sàng. Đang đếm ngược 15 giây." : "Cần ít nhất 2 người chơi và tất cả người chơi phải sẵn sàng.");
        }
        if (EL.roomStartHint && mode === "quick" && !hasStartController) {
          EL.roomStartHint.textContent = "Phòng này đã mất chủ phòng. Hãy quay lại và bấm Đấu nhanh để vào phòng mới.";
        }
        EL.playerList.innerHTML = GAME.roomPlayers.length
          ? GAME.roomPlayers.map((player, idx) => renderPlayerRow(player, idx + 1, false)).join("")
          : `<div class="empty">Chưa có người chơi nào trong phòng.</div>`;
        if (mode === "solo") {
          if (EL.friendInviteList) EL.friendInviteList.innerHTML = "";
        } else {
          renderFriendInviteList(room);
        }
        return;
      }

      const panels = EL.waitingView?.querySelectorAll(".panel") || [];
      panels[1]?.classList.remove("hidden");
      panels[2]?.classList.remove("hidden");
      if (room.status === "live") {
        setScreenState("live");
        renderLiveRoom();
        return;
      }

      setScreenState("finished");
      renderFinishedRoomUnified();
    });
  }

  function renderPlayerRow(player, index, showScore) {
    const rankClass = showScore ? (index === 1 ? "top-1" : index === 2 ? "top-2" : index === 3 ? "top-3" : "") : "";
    const meClass = player.user_id === GAME.user?.id ? "me" : "";
    const lives = getPlayerLives(player.id, GAME.activeRoom, GAME.roomAnswers || []);
    const mode = roomModeValue(GAME.activeRoom);
    const coordinatorId = getRoomCoordinatorUserId(GAME.activeRoom, GAME.roomPlayers);
    const isHost = player.user_id === coordinatorId;
    const canKick = !showScore && mode === "quick" && GAME.activeRoom?.status === "waiting" && coordinatorId === GAME.user?.id && !isHost && !player.ready;
    const readyTag = GAME.activeRoom?.status === "waiting"
      ? `<span class="status-tag ${player.ready || isHost ? "ready" : "waiting"}">${isHost ? "Chủ phòng" : player.ready ? "Sẵn sàng" : "Chưa sẵn sàng"}</span>`
      : "";
    const waitingActions = `<div style="display:grid;justify-items:end;gap:4px">${readyTag}${canKick ? `<button class="btn btn-outline btn-sm" type="button" onclick="kickGamePlayer('${player.id}')">Kick</button>` : ""}<span class="hint">${fmtDateTime(player.joined_at)}</span></div>`;
    return `<div class="player-row ${rankClass} ${meClass}">
      <div class="player-main">
        <img class="avatar" src="${escAttr(getPlayerAvatar(player.user_id))}" alt="avatar">
        <div>
          <div style="font-weight:700;color:var(--navy)">${index}. ${esc(getPlayerName(player.user_id))}</div>
          <div class="hint">Người chơi${lives !== null ? ` • ${lives} mạng` : ""}</div>
        </div>
      </div>
      ${showScore ? `<strong style="color:#fde68a">${player.score || 0}</strong>` : waitingActions}
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
    if (!room || getRoomStartControllerUserId(room) !== GAME.user.id) return;
    clearWaitingCountdown();
    const abortStart = async (message) => {
      clearAutoStartTimer();
      GAME.autoStartingRoomId = null;
      if (room.status === "waiting") {
        await sb.from("game_rooms").update({ started_at: null }).eq("id", room.id);
      }
      if (message) alert(message);
      await refreshActiveRoom(room.id, true);
    };
    const minPlayers = ["solo", "round"].includes(roomModeValue(room)) ? 1 : 2;
    if (GAME.roomPlayers.length < minPlayers) {
      await abortStart(minPlayers === 1 ? "Cần ít nhất 1 người chơi để bắt đầu trận." : "Cần ít nhất 2 người chơi để bắt đầu trận.");
      return;
    }
    const questions = await buildGameQuestions(room);
    GAME.questionDifficultyMap = Object.fromEntries(questions.map((item) => [item.question_id, Number(item.difficulty || 2)]));
    const dbQuestions = questions.map(({ difficulty, ...rest }) => rest);
    if (questions.length < room.question_count) {
      await abortStart("Chưa đủ câu hỏi phù hợp trong Ngân hàng câu hỏi để bắt đầu trận.");
      return;
    }

    await sb.from("game_room_questions").delete().eq("room_id", room.id);
    const { error: insertErr } = await sb.from("game_room_questions").insert(dbQuestions);
    if (insertErr) {
      await abortStart(`Không thể chuẩn bị câu hỏi: ${insertErr.message}`);
      return;
    }

    const { error: updateErr } = await sb.from("game_rooms").update({
      status: "live",
      started_at: new Date().toISOString(),
      ended_at: null,
    }).eq("id", room.id);

    if (updateErr) {
      await abortStart(`Không thể bắt đầu trận: ${updateErr.message}`);
      return;
    }

    await refreshActiveRoom(room.id);
  }

  async function buildGameQuestions(room) {
    if (roomModeValue(room) === "round") {
      return buildRoundGameQuestions(room);
    }
    const configId = room.game_config_id || getActiveGameConfig(roomModeValue(room), room.grade_id, room.subject_id)?.id || "";
    if (configId) {
      const links = (GAME.configQuestions || [])
        .filter((item) => item.config_id === configId)
        .sort((a, b) => Number(a.order_no || 0) - Number(b.order_no || 0));
      const ids = shuffle(links.map((item) => item.question_id).filter(Boolean)).slice(0, 5);
      if (ids.length) {
        const { data: configuredBank, error: configuredError } = await sb.from("question_bank")
          .select("id,question_type,question_text,question_img,answer,answer_count,hidden,difficulty")
          .in("id", ids);
        if (!configuredError) {
          const byId = Object.fromEntries((configuredBank || []).map((question) => [question.id, question]));
          return ids.map((id, index) => byId[id]).filter((question) =>
            question &&
            !question.hidden &&
            question.answer &&
            GAME_ALLOWED_QUESTION_TYPES.includes(question.question_type)
          ).map((question, index) => ({
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
      }
    }
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

  function applyLiveModeLayout(mode) {
    EL.liveView?.classList.toggle("mode-solo", mode === "solo");
    EL.liveView?.classList.toggle("mode-round", mode === "round");
    EL.liveView?.classList.toggle("mode-quick", mode === "quick");
    const livePanels = EL.liveView?.querySelectorAll(".panel") || [];
    const leaderboardPanel = EL.leaderboard?.closest(".panel") || livePanels[1];
    const answerTitle = livePanels[0]?.querySelector("h3");
    const scoreBoxes = leaderboardPanel?.querySelectorAll(".score-box") || [];
    const leaderboardTitle = leaderboardPanel?.querySelector("h3");
    if (answerTitle) answerTitle.classList.toggle("hidden", mode === "round");
    if (leaderboardPanel) leaderboardPanel.classList.toggle("hidden", mode === "round" || mode === "solo");
    if (leaderboardTitle) leaderboardTitle.textContent = (mode === "solo" || mode === "round") ? "Điểm hiện tại" : "Bảng xếp hạng";
    if (scoreBoxes[0]?.children?.[1]) scoreBoxes[0].children[1].classList.toggle("hidden", mode === "solo" || mode === "round");
    if (scoreBoxes[1]) scoreBoxes[1].classList.toggle("hidden", mode === "quick" || mode === "solo" || mode === "round");
    if (EL.leaderboard) EL.leaderboard.classList.toggle("hidden", mode === "solo" || mode === "round");
  }

  function renderRoundObstacleBoard(timeline) {
    const room = GAME.activeRoom;
    const questions = timeline.questions || [];
    const answersByQuestion = new Map((GAME.myAnswers || []).map((answer) => [answer.game_question_id, answer]));
    const selectedId = GAME.roundObstacleSelection?.[room.id] || "";
    const selectedQuestion = questions.find((question) => question.id === selectedId);
    const challenge = (GAME.roundChallenges || []).find((item) => item.round_id === room.round_id && item.challenge_type === "obstacle");
    const selectedStartedAt = Number(GAME.roundObstacleStartedAt?.[room.id] || 0);
    const selectedDuration = selectedQuestion ? getQuestionDuration(selectedQuestion, room) : 0;
    const selectedElapsed = selectedStartedAt ? Math.floor((Date.now() - selectedStartedAt) / 1000) : 0;
    const selectedSecondsLeft = selectedQuestion ? Math.max(0, selectedDuration - selectedElapsed) : 0;
    const allDone = questions.length && questions.every((question) => answersByQuestion.has(question.id));
    if (allDone && !challenge?.keyword_answer) {
      finishRoomIfNeeded();
      return;
    }
    EL.questionTitle.textContent = "Vượt chướng ngại vật";
    EL.questionClock.textContent = selectedQuestion ? String(selectedSecondsLeft).padStart(2, "0") : "--";
    if (EL.progressText) EL.progressText.textContent = selectedQuestion
      ? `Đang trả lời Chướng ngại vật số ${questions.findIndex((item) => item.id === selectedQuestion.id) + 1}.`
      : "Chọn ô số để mở câu hỏi. Trả lời đúng mở ô, trả lời sai khóa ô.";
    if (EL.progressFill) {
      const opened = questions.filter((question) => answersByQuestion.get(question.id)?.is_correct).length;
      EL.progressFill.style.width = `${Math.round((opened / Math.max(1, questions.length)) * 100)}%`;
    }
    EL.questionImg.classList.add("hidden");
    const tiles = questions.map((question, index) => {
      const answer = answersByQuestion.get(question.id);
      const opened = !!answer?.is_correct;
      const locked = !!answer && !answer.is_correct;
      if (opened) {
        return `<button aria-label="Chướng ngại vật số ${index + 1} đã mở" type="button" disabled style="min-height:150px;border:0;background:transparent!important;opacity:0;pointer-events:none"></button>`;
      }
      if (locked) {
        return `<div aria-label="Chướng ngại vật số ${index + 1} đã chìm" style="min-height:150px;border-radius:0;background:#64748b;background-image:linear-gradient(135deg,#94a3b8 0%,#64748b 42%,#334155 100%);display:grid;place-items:center;border:1px solid #fff;box-shadow:inset 0 18px 36px rgba(255,255,255,.12),inset 0 -18px 36px rgba(15,23,42,.28);opacity:1"></div>`;
      }
      const bg = "linear-gradient(135deg,#facc15,#f59e0b 48%,#1d4ed8)";
      return `<button class="btn btn-outline" type="button" onclick="selectRoundObstacleQuestion('${question.id}')" style="min-height:150px;border-radius:0!important;background:${bg}!important;color:#fff!important;display:grid;place-items:center;font-size:1.08rem;font-weight:900;text-shadow:0 2px 10px rgba(2,8,23,.72);border:1px solid #fff!important;opacity:1!important"><span>Chướng ngại vật số ${index + 1}</span></button>`;
    }).join("");
    const openedCount = questions.filter((question) => answersByQuestion.get(question.id)?.is_correct).length;
    const keywordLength = String(challenge?.keyword_answer || "").trim().length;
    const keywordDraft = GAME.roundObstacleKeywordDraft?.[room.id] || "";
    const keywordBox = challenge?.keyword_answer ? `
      <div style="position:relative;display:grid;gap:10px;padding:14px;border-radius:18px;background:#fff;border:1px solid rgba(39,58,91,.08)">
        <strong style="color:var(--navy)">Từ khóa</strong>
        <div class="hint">${keywordLength ? `Gợi ý: từ khóa có ${keywordLength} ký tự.` : "Từ khóa liên quan đến cả 4 câu hỏi."} Trả lời càng sớm càng nhiều điểm.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input id="roundObstacleKeywordInput" class="input" style="flex:1;min-width:180px" placeholder="Nhập từ khóa" value="${escAttr(keywordDraft)}">
          <button class="btn btn-primary" type="button" onclick="submitRoundObstacleKeyword()">Trả lời từ khóa</button>
        </div>
        <div class="hint">Nếu đúng: ${[100, 80, 60, 40, 20][Math.min(4, openedCount)]} điểm. Nếu sai: dừng thử thách.</div>
      </div>
    ` : "";
    renderMathText(EL.questionBody, "");
    EL.questionBody.innerHTML = `
      <div style="position:relative;display:grid;gap:14px;padding:18px;border-radius:0;overflow:hidden;background:#fff;border:1px solid rgba(39,58,91,.08)">
        <div style="position:relative;display:grid;grid-template-columns:repeat(2,minmax(120px,1fr));gap:0;overflow:hidden;border-radius:0;aspect-ratio:16/9;background:linear-gradient(135deg,rgba(255,255,255,.9),rgba(226,232,240,.84)),url('mindup-zbs-logo.png');background-repeat:no-repeat;background-position:center;background-size:min(72%,520px) auto;box-shadow:inset 0 0 0 1px rgba(39,58,91,.08)">${tiles}</div>
      </div>
    `;
    if (selectedQuestion && !answersByQuestion.has(selectedQuestion.id)) {
      if (selectedSecondsLeft <= 0) {
        setTimeout(() => submitAnswer(selectedQuestion.id, ""), 0);
      }
      EL.questionImg.classList.add("hidden");
      renderAnswerArea(selectedQuestion);
      const questionHtml = `<div style="display:grid;gap:12px;margin-bottom:14px;padding:16px;border-radius:18px;background:#fff;border:1px solid rgba(39,58,91,.08)"><strong style="color:var(--navy)">Câu hỏi chướng ngại vật</strong><div id="roundObstacleQuestionText"></div>${selectedQuestion.question_img ? `<img src="${escAttr(selectedQuestion.question_img)}" alt="question" style="max-width:100%;border-radius:14px;border:1px solid rgba(39,58,91,.08)">` : ""}</div>`;
      EL.answerArea.insertAdjacentHTML("afterbegin", questionHtml);
      if (keywordBox) EL.answerArea.insertAdjacentHTML("afterbegin", keywordBox);
      renderMathText(document.getElementById("roundObstacleQuestionText"), selectedQuestion.question_text || "Xem nội dung câu hỏi.");
    } else {
      EL.questionImg.classList.add("hidden");
      EL.answerArea.innerHTML = `${keywordBox}<div class="empty">Hãy chọn một ô để mở câu hỏi.</div>`;
      EL.answerFeedback.innerHTML = "";
    }
    document.getElementById("roundObstacleKeywordInput")?.addEventListener("input", (event) => {
      GAME.roundObstacleKeywordDraft[room.id] = event.target.value || "";
    });
  }

  function isRoundObstacleTypingActive(room) {
    const active = document.activeElement;
    if (!room || !active) return false;
    if (active.id === "roundObstacleKeywordInput") {
      GAME.roundObstacleKeywordDraft[room.id] = active.value || "";
      return true;
    }
    if (active.id === "gameShortAnswerInput") {
      const player = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
      const questionId = GAME.roundObstacleSelection?.[room.id] || "";
      if (player && questionId) {
        window.__gameShortDraft = window.__gameShortDraft || {};
        window.__gameShortDraft[player.id] = window.__gameShortDraft[player.id] || {};
        window.__gameShortDraft[player.id][questionId] = active.value || "";
      }
      return true;
    }
    return false;
  }

  function renderLiveRoom() {
      const room = GAME.activeRoom;
      const questions = GAME.roomQuestions;
      const mode = roomModeValue(room);
      applyLiveModeLayout(mode);
      const me = GAME.roomPlayers.find((player) => player.user_id === GAME.user.id);
      const myLives = me ? getPlayerLives(me.id, room, GAME.roomAnswers || []) : null;
      if (!room || !questions.length) {
        renderMathText(EL.questionBody, "Đang chuẩn bị câu hỏi...");
        EL.answerArea.innerHTML = "";
        return;
      }

      const timeline = getQuestionTimeline(room, questions);
      if (timeline.obstacleBoard) {
        if (isRoundObstacleTypingActive(room)) {
          const selectedId = GAME.roundObstacleSelection?.[room.id] || "";
          const selectedQuestion = selectedId ? (GAME.roomQuestions || []).find((item) => item.id === selectedId) : null;
          if (selectedQuestion && EL.questionClock) {
            const startedAt = Number(GAME.roundObstacleStartedAt?.[room.id] || Date.now());
            const secondsLeft = Math.max(0, getQuestionDuration(selectedQuestion, room) - Math.floor((Date.now() - startedAt) / 1000));
            if (secondsLeft <= 0) {
              submitAnswer(selectedQuestion.id, "");
              return;
            }
            EL.questionClock.textContent = String(secondsLeft).padStart(2, "0");
          }
          renderLeaderboard();
          return;
        }
        renderRoundObstacleBoard(timeline);
        renderLeaderboard();
        clearInterval(GAME.questionTick);
        GAME.questionTick = setInterval(() => {
          const selectedId = GAME.roundObstacleSelection?.[room.id] || "";
          const selectedQuestion = selectedId ? (GAME.roomQuestions || []).find((item) => item.id === selectedId) : null;
          if (selectedQuestion && !GAME.myAnswers.some((item) => item.game_question_id === selectedQuestion.id)) {
            const startedAt = Number(GAME.roundObstacleStartedAt?.[room.id] || Date.now());
            const secondsLeft = Math.max(0, getQuestionDuration(selectedQuestion, room) - Math.floor((Date.now() - startedAt) / 1000));
            if (secondsLeft <= 0) {
              submitAnswer(selectedQuestion.id, "");
              return;
            }
            if (EL.questionClock) EL.questionClock.textContent = String(secondsLeft).padStart(2, "0");
            renderLeaderboard();
            return;
          }
          if (isRoundObstacleTypingActive(room)) {
            renderLeaderboard();
            return;
          }
          refreshActiveRoom(room.id, true);
        }, 1000);
        return;
      }
      if (timeline.selectFinishLevel) {
        renderRoundFinishLevelChooser(timeline);
        renderLeaderboard();
        clearInterval(GAME.questionTick);
        GAME.questionTick = setInterval(() => {
          const nextTimeline = getQuestionTimeline(room, GAME.roomQuestions);
          if (!nextTimeline.selectFinishLevel) {
            clearInterval(GAME.questionTick);
            GAME.liveRenderKey = "";
            refreshActiveRoom(room.id, true);
            return;
          }
          EL.questionClock.textContent = String(nextTimeline.secondsLeft).padStart(2, "0");
        }, 1000);
        return;
      }
      const visibleQuestions = timeline.questions || questions;
      const currentIndex = timeline.index;
      if (!timeline.question || currentIndex >= visibleQuestions.length) {
        finishRoomIfNeeded();
        return;
      }

      const question = timeline.question;
      const secondsLeft = timeline.secondsLeft;
      EL.questionTitle.innerHTML = `Câu <span>${currentIndex + 1}</span> / ${visibleQuestions.length}`;
      EL.questionClock.textContent = String(secondsLeft).padStart(2, "0");
      if (EL.progressText) {
        EL.progressText.textContent = mode === "survival"
          ? `Sinh tồn • ${currentIndex + 1}/${questions.length}${myLives !== null ? ` • ${myLives} mạng` : ""}`
          : mode === "solo"
            ? `Chơi đơn • ${currentIndex + 1}/${visibleQuestions.length}`
          : mode === "round"
            ? `Vòng MindUp • ${getRoundChallengeLabel(question)} • ${currentIndex + 1}/${visibleQuestions.length}`
          : mode === "speed"
            ? `Đua tốc độ • ${currentIndex + 1}/${visibleQuestions.length}`
            : `Tiến độ ${currentIndex + 1}/${visibleQuestions.length}`;
      }
      if (EL.progressFill) EL.progressFill.style.width = `${((currentIndex + 1) / visibleQuestions.length) * 100}%`;
      const answered = GAME.myAnswers.find((item) => item.game_question_id === question.id);
      const waitingForHopeStar = mode === "round"
        && question.challenge_type === "finish"
        && !answered
        && !hasUsedFinishHopeStar(room.id)
        && !hasFinishHopeStarDecision(room.id, question.id);
      if (waitingForHopeStar) {
        renderMathText(EL.questionBody, "");
        EL.questionImg.classList.add("hidden");
      } else {
        renderMathText(EL.questionBody, question.question_text || "Xem nội dung câu hỏi.");
        EL.questionImg.classList.toggle("hidden", !question.question_img);
        if (question.question_img) EL.questionImg.src = question.question_img;
      }
      const renderKey = `${question.id}:${answered?.id || "pending"}:${myLives ?? "na"}`;
      if (GAME.liveRenderKey !== renderKey) {
        GAME.liveRenderKey = renderKey;
        renderAnswerArea(question);
      }
      maybeAdvanceQuestion(question, currentIndex, totalTimeValue(room, question));
      renderLeaderboard();

      clearInterval(GAME.questionTick);
      GAME.questionTick = setInterval(() => {
        const nextTimeline = getQuestionTimeline(room, questions);
        EL.questionClock.textContent = String(nextTimeline.secondsLeft).padStart(2, "0");
        if (nextTimeline.index !== currentIndex || nextTimeline.selectFinishLevel) {
          clearInterval(GAME.questionTick);
          GAME.liveRenderKey = "";
          refreshActiveRoom(room.id, true);
        }
      }, 1000);
  }

  async function buildRoundGameQuestions(room) {
    const roundId = room.round_id || "";
    const activeChallengeType = getRoomRoundChallengeType(room);
    const activeFinishLevel = getRoomRoundFinishLevel(room) || "medium";
    const challenges = (GAME.roundChallenges || [])
      .filter((challenge) => challenge.round_id === roundId)
      .filter((challenge) => !activeChallengeType || challenge.challenge_type === activeChallengeType)
      .sort((a, b) => Number(a.order_no || 0) - Number(b.order_no || 0));
    const questionLinks = [];
    challenges.forEach((challenge) => {
      (GAME.roundChallengeQuestions || [])
        .filter((link) => link.challenge_id === challenge.id)
        .filter((link) => challenge.challenge_type !== "finish" || link.finish_level === activeFinishLevel)
        .sort((a, b) => Number(a.order_no || 0) - Number(b.order_no || 0))
        .forEach((link) => questionLinks.push({ ...link, challenge_type: challenge.challenge_type }));
    });
    const ids = questionLinks.map((item) => item.question_id).filter(Boolean);
    if (!ids.length) return [];
    const { data: bank, error } = await sb.from("question_bank")
      .select("id,question_type,question_text,question_img,answer,answer_count,hidden,difficulty")
      .in("id", ids);
    if (error) {
      alert("Không tải được câu hỏi của Vòng MindUp: " + error.message);
      return [];
    }
    const byId = Object.fromEntries((bank || []).map((question) => [question.id, question]));
    return questionLinks.map((link, index) => {
      const question = byId[link.question_id];
      if (!question || question.hidden || !question.answer || !GAME_ALLOWED_QUESTION_TYPES.includes(question.question_type)) return null;
      return {
        room_id: room.id,
        order_no: index + 1,
        question_id: question.id,
        question_type: question.question_type,
        question_text: question.question_text,
        question_img: question.question_img,
        answer: question.answer,
        answer_count: question.answer_count || (question.question_type === "short_answer" ? 1 : 4),
        points: getRoundQuestionPoints(link.challenge_type, link.finish_level),
        challenge_type: link.challenge_type,
        finish_level: link.finish_level || null,
        difficulty: question.difficulty || 2,
      };
    }).filter(Boolean);
  }

  function getRoundQuestionPoints(challengeType, finishLevel) {
    if (challengeType === "finish") {
      if (finishLevel === "easy") return 10;
      if (finishLevel === "hard") return 30;
      return 20;
    }
    if (challengeType === "warmup") return 10;
    if (challengeType === "obstacle") return 10;
    if (challengeType === "acceleration") return 40;
    return 20;
  }

  function totalTimeValue(room, question) {
    return Math.max(10, getQuestionDuration(question, room));
  }

  function getRoundChallengeLabel(question) {
    if (question?.challenge_type === "warmup") return "Khởi động";
    if (question?.challenge_type === "obstacle") return "Vượt chướng ngại vật";
    if (question?.challenge_type === "acceleration") return "Tăng tốc";
    if (question?.challenge_type === "finish") {
      if (question.finish_level === "easy") return "Về đích - Dễ";
      if (question.finish_level === "hard") return "Về đích - Khó";
      return "Về đích - Trung bình";
    }
    return "Vòng MindUp";
  }

  function renderRoundFinishLevelChooser(timeline) {
    EL.questionTitle.textContent = "Về đích";
    EL.questionClock.textContent = String(timeline.secondsLeft).padStart(2, "0");
    if (EL.progressText) EL.progressText.textContent = "Chọn mức câu hỏi Về đích";
    if (EL.progressFill) EL.progressFill.style.width = "90%";
    renderMathText(EL.questionBody, "Bạn có 30 giây để chọn mức câu hỏi. Nếu không chọn, hệ thống mặc định chọn mức Trung bình.");
    EL.questionImg.classList.add("hidden");
    EL.answerArea.innerHTML = `
      <div style="display:grid;gap:10px">
        <button class="btn btn-primary" type="button" onclick="chooseRoundFinishLevel('easy')">Dễ • 3 câu • 20 giây/câu</button>
        <button class="btn btn-primary" type="button" onclick="chooseRoundFinishLevel('medium')">Trung bình • 3 câu • 40 giây/câu</button>
        <button class="btn btn-primary" type="button" onclick="chooseRoundFinishLevel('hard')">Khó • 3 câu • 60 giây/câu</button>
      </div>
    `;
    EL.answerFeedback.innerHTML = "";
  }

  function getQuestionAnsweredPlayerIds(questionId) {
    return new Set((GAME.roomAnswers || []).filter((item) => item.game_question_id === questionId).map((item) => item.player_id));
  }

  function getRequiredAnswerPlayers(room) {
    if (roomModeValue(room) === "survival") {
      return getAlivePlayers(room, GAME.roomPlayers, GAME.roomAnswers || []);
    }
    return GAME.roomPlayers || [];
  }

  function maybeAdvanceQuestion(question, currentIndex, totalTime) {
    const room = GAME.activeRoom;
    if (!room || room.status !== "live" || !question) return;
    if (roomModeValue(room) === "round") return;
    if (getRoomStartControllerUserId(room) !== GAME.user.id) return;
    const requiredPlayers = getRequiredAnswerPlayers(room);
    if (!requiredPlayers.length) return;
    const answeredPlayerIds = getQuestionAnsweredPlayerIds(question.id);
    const everyoneAnswered = requiredPlayers.every((player) => answeredPlayerIds.has(player.id));
    if (!everyoneAnswered) return;
    if (currentIndex >= GAME.roomQuestions.length - 1) {
      finishRoomIfNeeded();
      return;
    }
    const advanceKey = `${room.id}:${question.id}:${requiredPlayers.length}`;
    if (GAME.advanceLockKey === advanceKey) return;
    GAME.advanceLockKey = advanceKey;
    clearInterval(GAME.questionTick);
    const nextStartedAt = new Date(Date.now() - ((currentIndex + 1) * totalTime * 1000)).toISOString();
    sb.from("game_rooms")
      .update({ started_at: nextStartedAt })
      .eq("id", room.id)
      .then(() => refreshActiveRoom(room.id, true))
      .catch(() => {})
      .finally(() => {
        setTimeout(() => {
          if (GAME.advanceLockKey === advanceKey) GAME.advanceLockKey = "";
        }, 600);
      });
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
        EL.answerFeedback.innerHTML = "";
      }
    }

    if (roomModeValue(room) === "round" && getRoomRoundChallengeType(room) === "finish" && !answered && !hasUsedFinishHopeStar(room.id) && !hasFinishHopeStarDecision(room.id, question.id)) {
      EL.answerArea.innerHTML = `
        <div class="empty" style="padding:18px">
          <strong>Bạn có muốn sử dụng Ngôi sao hy vọng cho câu này không?</strong>
          <div class="hint" style="margin:8px 0 12px">Trả lời đúng được nhân đôi điểm; trả lời sai bị trừ đúng số điểm của câu hỏi.</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
            <button class="btn btn-primary" type="button" onclick="chooseRoundHopeStar('${question.id}', true)">Dùng Ngôi sao hy vọng</button>
            <button class="btn btn-outline" type="button" onclick="chooseRoundHopeStar('${question.id}', false)">Không dùng</button>
          </div>
        </div>
      `;
      if (EL.answerFeedback) EL.answerFeedback.innerHTML = "";
      return;
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
      const shortInput = document.getElementById("gameShortAnswerInput");
      shortInput?.addEventListener("input", (event) => {
        if (!me) return;
        window.__gameShortDraft = window.__gameShortDraft || {};
        window.__gameShortDraft[me.id] = window.__gameShortDraft[me.id] || {};
        window.__gameShortDraft[me.id][question.id] = event.target.value || "";
      });
      shortInput?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.isComposing) return;
        event.preventDefault();
        submitGameShortAnswer(question.id);
      });
      requestAnimationFrame(() => {
        shortInput?.focus({ preventScroll: true });
        const end = shortInput?.value?.length || 0;
        shortInput?.setSelectionRange?.(end, end);
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
    if (roomModeValue(GAME.activeRoom) === "round") {
      const myRow = (GAME.roomPlayers || []).find((item) => item.user_id === GAME.user.id);
      updateRoundTopbarScore("round", myRow?.score || 0);
      if (EL.myScore) EL.myScore.textContent = myRow?.score || 0;
      if (EL.myRank) EL.myRank.textContent = "";
      if (EL.myCombo) EL.myCombo.textContent = "";
      if (EL.myBestCombo) EL.myBestCombo.textContent = "";
      if (EL.leaderboard) EL.leaderboard.innerHTML = "";
      return;
    }
    if (roomModeValue(GAME.activeRoom) === "solo") {
      const myRow = (GAME.roomPlayers || []).find((item) => item.user_id === GAME.user.id);
      updateRoundTopbarScore("solo", myRow?.score || 0);
      if (EL.myScore) EL.myScore.textContent = myRow?.score || 0;
      if (EL.myRank) EL.myRank.textContent = "#1";
      return;
    }
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
      const timeline = getQuestionTimeline(room, GAME.roomQuestions);
      const currentIndex = timeline.index;
      const activeCount = (timeline.questions || GAME.roomQuestions).length;
      if (alivePlayers.length > 1 && currentIndex < activeCount) {
        return;
      }
    }
    if (room.status !== "finished" && getRoomStartControllerUserId(room) === GAME.user.id) {
      await sb.from("game_rooms").update({ status: "finished", ended_at: new Date().toISOString() }).eq("id", room.id);
    }
    await refreshActiveRoom(room.id, true);
  }

  function renderFinishedRoomUnified() {
    const finishedRoom = GAME.activeRoom;
    const ordered = [...GAME.roomPlayers].sort((a, b) => {
      const livesA = getPlayerLives(a.id, GAME.activeRoom, GAME.roomAnswers || []);
      const livesB = getPlayerLives(b.id, GAME.activeRoom, GAME.roomAnswers || []);
      if (livesA !== null || livesB !== null) {
        if ((livesB ?? -1) !== (livesA ?? -1)) return (livesB ?? -1) - (livesA ?? -1);
      }
      return (b.score || 0) - (a.score || 0) || new Date(a.joined_at) - new Date(b.joined_at);
    });
    const winner = ordered[0];
    const roomMode = roomModeValue(GAME.activeRoom);
    const eloDeltaMap = getModeEloDeltaMap(roomMode, ordered, GAME.activeRoom);
    if (roomMode === "round" && !GAME.roundReturnTimer) {
      GAME.roundReturnTimer = setTimeout(async () => {
        const gradeId = finishedRoom?.grade_id || "";
        const subjectId = finishedRoom?.subject_id || "";
        hideGameScreen();
        GAME.selectedAutoMode = "round";
        if (EL.gradeFilter && gradeId) EL.gradeFilter.value = gradeId;
        if (EL.subjectFilter && subjectId) EL.subjectFilter.value = subjectId;
        await loadRooms();
        if (finishedRoom?.round_id) renderRoundChallengeLobby(finishedRoom.round_id);
        else renderRoundSelection(gradeId, subjectId);
        GAME.roundReturnTimer = null;
      }, 1800);
    }
    EL.finishedMeta.textContent = roomMode === "survival"
      ? `Phòng ${GAME.activeRoom?.title || ""} đã kết thúc. Ở chế độ sinh tồn, người còn nhiều mạng hơn sẽ xếp trên, nếu bằng mạng thì so điểm.`
      : roomMode === "solo"
        ? `Trận Chơi đơn đã kết thúc. Elo của bạn thay đổi theo tổng điểm, độ chính xác và tốc độ hoàn thành 5 câu hỏi.`
        : roomMode === "speed"
          ? `Phòng ${GAME.activeRoom?.title || ""} đã kết thúc. Ở chế độ đua tốc độ, đúng nhanh sẽ nhận nhiều điểm hơn.`
          : `Phòng ${GAME.activeRoom?.title || ""} đã kết thúc. Người có điểm cao hơn sẽ xếp trên, nếu bằng điểm thì ai vào phòng sớm hơn sẽ xếp trên.`;
    if (supportsModeElo(roomMode)) {
      EL.finishedMeta.textContent += ` ${getModeEloRule(roomMode)}`;
    }
    if (roomMode === "round") {
      const myPlayer = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
      EL.finishedMeta.textContent += Number(myPlayer?.score || 0) >= 100
        ? " Bạn đã qua vòng và điểm vòng được cộng vào Elo."
        : " Bạn chưa đạt 100 điểm nên chưa qua vòng và chưa được cộng Elo.";
    }
    if (EL.myStats) {
      const myPlayer = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
      const myRows = GAME.myAnswers || [];
      const correctCount = myRows.filter((item) => item.is_correct).length;
      const totalCount = myRows.length;
      const accuracy = totalCount ? Math.round((correctCount / totalCount) * 100) : 0;
      const displayedQuestionTotal = GAME.roomQuestions.length || 0;
      EL.myStats.innerHTML = `
        <div><span>Điểm của bạn</span><strong>${myPlayer?.score || 0}</strong></div>
        <div><span>Câu đúng</span><strong>${correctCount}/${displayedQuestionTotal}</strong></div>
        <div><span>Độ chính xác</span><strong>${accuracy}%</strong></div>
        ${supportsModeElo(roomMode) ? `<div><span>Elo</span><strong>${Number(eloDeltaMap[GAME.user.id] || 0) >= 0 ? "+" : ""}${Number(eloDeltaMap[GAME.user.id] || 0)}</strong></div>` : ""}
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
            ${supportsModeElo(roomMode) ? `<div class="hint">${Number(eloDeltaMap[player.user_id] || 0) >= 0 ? "+" : ""}${Number(eloDeltaMap[player.user_id] || 0)} Elo</div>` : ""}
            <div class="hint">${player.user_id === GAME.user.id ? "Bạn" : "Người chơi"}</div>
          </div>
        </div>
        <div style="font-size:1.1rem;font-weight:800;color:#fde68a">${player.score || 0} điểm</div>
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
    const challengeType = roomModeValue(room) === "round" ? getRoomRoundChallengeType(room) : "";
    let questionIndex = timeline.index;
    let remaining = Math.max(0, timeline.secondsLeft);
    let totalTime = Math.max(10, timeline.duration || getQuestionDuration(question, room));
    if (challengeType === "obstacle") {
      if (GAME.roundObstacleSelection?.[room.id] !== questionId) return;
      questionIndex = GAME.roomQuestions.findIndex((item) => item.id === questionId);
      const startedAt = Number(GAME.roundObstacleStartedAt?.[room.id] || Date.now());
      totalTime = Math.max(10, getQuestionDuration(question, room));
      remaining = Math.max(0, totalTime - Math.floor((Date.now() - startedAt) / 1000));
    } else if (timeline.selectFinishLevel || timeline.question?.id !== questionId) {
      return;
    }

    const currentCombo = getCurrentComboValue();
    let scored = evaluateAnswer(question, answerValue, remaining, totalTime, currentCombo);
    if (roomModeValue(room) === "quick") {
      scored = {
        ...scored,
        score: await getQuickAnswerScore(room, questionId, scored.isCorrect),
        comboBonus: 0,
      };
    }

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

    if (roomModeValue(room) === "quick") {
      const nextScore = await recalcPlayerScore(player.id);
      await sb.from("game_room_players").update({ score: nextScore }).eq("id", player.id);
    } else if (roomModeValue(room) === "round") {
      const nextScore = await recalcRoundPlayerScore(player.id, room);
      await sb.from("game_room_players").update({ score: nextScore }).eq("id", player.id);
    } else {
      const nextScore = await recalcPlayerScore(player.id);
      await sb.from("game_room_players").update({ score: nextScore }).eq("id", player.id);
    }
    if (roomModeValue(room) === "round" && getRoomRoundChallengeType(room) === "obstacle") {
      delete GAME.roundObstacleSelection[room.id];
      delete GAME.roundObstacleStartedAt[room.id];
    }
    if (roomModeValue(room) === "round") {
      await advanceRoundQuestionAfterAnswer(room, question, questionIndex, totalTime);
    }
    await refreshActiveRoom(room.id, true);
  }

  function getFinishHopeKey(roomId, questionId) {
    return `${roomId || ""}:${questionId || ""}`;
  }

  function hasFinishHopeStarDecision(roomId, questionId) {
    return Object.prototype.hasOwnProperty.call(GAME.finishHopeStars, getFinishHopeKey(roomId, questionId));
  }

  function isFinishHopeStarActive(roomId, questionId) {
    return !!GAME.finishHopeStars[getFinishHopeKey(roomId, questionId)];
  }

  function hasUsedFinishHopeStar(roomId) {
    const prefix = `${roomId || ""}:`;
    return Object.entries(GAME.finishHopeStars || {}).some(([key, value]) => key.startsWith(prefix) && value === true);
  }

  function getElapsedThroughQuestion(questions, questionIndex, room) {
    return (questions || []).slice(0, questionIndex + 1).reduce((sum, item) => sum + getQuestionDuration(item, room), 0);
  }

  async function advanceRoundQuestionAfterAnswer(room, question, questionIndex) {
    const challengeType = getRoomRoundChallengeType(room);
    if (!["acceleration", "finish"].includes(challengeType)) return;
    const visibleQuestions = GAME.roomQuestions || [];
    if (questionIndex >= visibleQuestions.length - 1) {
      await finishRoomIfNeeded();
      return;
    }
    const nextStartedAt = new Date(Date.now() - (getElapsedThroughQuestion(visibleQuestions, questionIndex, room) * 1000)).toISOString();
    await sb.from("game_rooms").update({ started_at: nextStartedAt }).eq("id", room.id);
  }

  function evaluateAnswer(question, answerValue, remaining, totalTime, currentCombo) {
    const mode = roomModeValue(GAME.activeRoom);
    const difficulty = Number(question.difficulty || GAME.questionDifficultyMap?.[question.question_id] || 2);
    if (mode === "round") {
      const challengeType = getRoomRoundChallengeType(GAME.activeRoom);
      let ok = false;
      if (question.question_type === "multi_choice") {
        ok = normalizeAnswer(question.answer) === normalizeAnswer(answerValue);
      } else if (question.question_type === "true_false") {
        ok = normalizeAnswer(question.answer) === normalizeAnswer(answerValue);
      } else {
        const accepted = shortAnswerAccepted(question.answer);
        ok = accepted.includes(String(answerValue || "").trim().toLowerCase());
      }
      if (!ok) {
        if (challengeType === "finish" && isFinishHopeStarActive(GAME.activeRoom.id, question.id)) {
          return { isCorrect: false, score: -Math.abs(Number(question.points || 0)), comboBonus: 0 };
        }
        return { isCorrect: false, score: 0, comboBonus: 0 };
      }
      if (challengeType === "acceleration") {
        const ratio = Math.max(0, remaining) / Math.max(1, totalTime);
        const score = ratio >= 0.75 ? 40 : ratio >= 0.5 ? 30 : ratio >= 0.25 ? 20 : 10;
        return { isCorrect: true, score, comboBonus: 0 };
      }
      const base = Number(question.points || 0);
      if (challengeType === "finish" && isFinishHopeStarActive(GAME.activeRoom.id, question.id)) {
        return { isCorrect: true, score: base * 2, comboBonus: 0 };
      }
      return { isCorrect: true, score: base, comboBonus: 0 };
    }
    if (mode === "solo") {
      let ok = false;
      if (question.question_type === "multi_choice") {
        ok = normalizeAnswer(question.answer) === normalizeAnswer(answerValue);
      } else if (question.question_type === "true_false") {
        ok = normalizeAnswer(question.answer) === normalizeAnswer(answerValue);
      } else {
        const accepted = shortAnswerAccepted(question.answer);
        ok = accepted.includes(String(answerValue || "").trim().toLowerCase());
      }
      if (!ok) return { isCorrect: false, score: 0, comboBonus: 0 };
      const ratio = Math.max(0, remaining) / Math.max(1, totalTime);
      const score = ratio >= 0.75 ? 20 : ratio >= 0.5 ? 15 : ratio >= 0.25 ? 10 : 5;
      return { isCorrect: true, score, comboBonus: 0 };
    }
    if (mode === "quick") {
      let ok = false;
      if (question.question_type === "multi_choice") {
        ok = normalizeAnswer(question.answer) === normalizeAnswer(answerValue);
      } else if (question.question_type === "true_false") {
        ok = normalizeAnswer(question.answer) === normalizeAnswer(answerValue);
      } else {
        const accepted = shortAnswerAccepted(question.answer);
        ok = accepted.includes(String(answerValue || "").trim().toLowerCase());
      }
      return { isCorrect: ok, score: 0, comboBonus: 0 };
    }
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

  async function recalcRoundPlayerScore(playerId, room) {
    const baseScore = await getRoundCarriedScore(room?.round_id || "", room?.id || "");
    const currentScore = await recalcPlayerScore(playerId);
    return baseScore + currentScore;
  }

  async function getQuickAnswerScore(room, questionId, isCorrect) {
    if (!isCorrect) return 0;
    const players = GAME.roomPlayers.length
      ? GAME.roomPlayers
      : ((await sb.from("game_room_players").select("id").eq("room_id", room.id)).data || []);
    const playerCount = Math.max(1, players.length);
    const { count, error } = await sb
      .from("game_room_answers")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .eq("game_question_id", questionId)
      .eq("is_correct", true);
    const correctBefore = error
      ? (GAME.roomAnswers || []).filter((item) => item.game_question_id === questionId && item.is_correct).length
      : Number(count || 0);
    const rank = correctBefore + 1;
    return Math.max(0, (playerCount - rank + 1) * 5);
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

  window.chooseRoundFinishLevel = function(level) {
    if (!GAME.activeRoom?.id) return;
    setRoundFinishChoice(GAME.activeRoom.id, level);
    GAME.liveRenderKey = "";
    renderLiveRoom();
  };

  window.chooseRoundHopeStar = function(questionId, enabled) {
    if (!GAME.activeRoom?.id) return;
    if (enabled && hasUsedFinishHopeStar(GAME.activeRoom.id)) {
      alert("Bạn chỉ được dùng 1 Ngôi sao hy vọng trong phần Về đích.");
      return;
    }
    GAME.finishHopeStars[getFinishHopeKey(GAME.activeRoom.id, questionId)] = !!enabled;
    GAME.liveRenderKey = "";
    renderLiveRoom();
  };

  window.selectRoundObstacleQuestion = function(questionId) {
    if (!GAME.activeRoom?.id) return;
    GAME.roundObstacleSelection[GAME.activeRoom.id] = questionId;
    GAME.roundObstacleStartedAt[GAME.activeRoom.id] = Date.now();
    GAME.liveRenderKey = "";
    renderLiveRoom();
  };

  window.submitRoundObstacleKeyword = async function() {
    const room = GAME.activeRoom;
    const player = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    if (!room || !player || roomModeValue(room) !== "round" || getRoomRoundChallengeType(room) !== "obstacle") return;
    const challenge = (GAME.roundChallenges || []).find((item) => item.round_id === room.round_id && item.challenge_type === "obstacle");
    const keyword = String(challenge?.keyword_answer || "").trim();
    const value = String(document.getElementById("roundObstacleKeywordInput")?.value || "").trim();
    GAME.roundObstacleKeywordDraft[room.id] = value;
    if (!keyword) return alert("Thử thách này chưa có từ khóa.");
    if (!value) return alert("Hãy nhập từ khóa trước khi trả lời.");
    const correct = shortAnswerAccepted(keyword).includes(value.toLowerCase());
    if (correct) {
      const answersByQuestion = new Map((GAME.myAnswers || []).map((answer) => [answer.game_question_id, answer]));
      const openedCount = (GAME.roomQuestions || []).filter((question) => answersByQuestion.get(question.id)?.is_correct).length;
      const award = [100, 80, 60, 40, 20][Math.min(4, openedCount)] || 20;
      await sb.from("game_room_players").update({ score: Number(player.score || 0) + award }).eq("id", player.id);
    }
    await finishRoomIfNeeded();
    await refreshActiveRoom(room.id, true);
  };

  window.inviteGameFriend = inviteFriend;
  window.openGameHistoryListModal = openHistoryListModal;
  window.openGameHistoryDetail = openHistoryDetail;
  window.closeGameHistoryModal = closeGameHistoryModal;
  window.closeGameSubjectSelectModal = closeSubjectSelectModal;
  window.closeGameRoomModal = closeGameRoomModal;
  window.closeGameScreen = closeGameScreen;
})();
