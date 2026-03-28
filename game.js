(function () {
  const GAME = {
    user: null,
    role: "student",
    grades: [],
    subjects: [],
    friends: [],
    roomsRaw: [],
    rooms: [],
    players: [],
    activeRoom: null,
    roomPlayers: [],
    roomQuestions: [],
    myAnswers: [],
    roomPoll: null,
    questionTick: null,
    roomChannel: null,
    listChannel: null,
    leaderboardPeriod: "day",
  };

  const EL = {
    keyword: document.getElementById("gameKeyword"),
    gradeFilter: document.getElementById("gameGradeFilter"),
    subjectFilter: document.getElementById("gameSubjectFilter"),
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
    roomVisibility: document.getElementById("gameRoomVisibility"),
    roomMaxPlayers: document.getElementById("gameRoomMaxPlayers"),
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
    finishedView: document.getElementById("gameFinishedView"),
    finishedMeta: document.getElementById("gameFinishedMeta"),
    myStats: document.getElementById("gameMyStats"),
    resultsList: document.getElementById("gameResultsList"),
  };

  init();

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

  function fmtDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("vi-VN");
  }

  function randomCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
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
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      location.href = "index.html";
      return;
    }
    GAME.user = user;

    const [{ data: profile }, { data: grades }, { data: subjects }] = await Promise.all([
      sb.from("users").select("role").eq("id", user.id).single(),
      sb.from("grades").select("id,name").order("name"),
      sb.from("subjects").select("id,name,grade_id").order("name"),
    ]);

    GAME.role = profile?.role || "student";
    GAME.grades = grades || [];
    GAME.subjects = subjects || [];

    fillGrades(EL.gradeFilter, "Tất cả khối");
    fillGrades(EL.roomGrade, "Chọn khối");
    fillSubjects(EL.subjectFilter, "", "Tất cả môn");
    fillSubjects(EL.roomSubject, "", "Chọn môn");

    bindEvents();
    setupListRealtime();
    await Promise.all([loadRooms(), loadFriends()]);
  }

  function bindEvents() {
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
    EL.roomGrade?.addEventListener("change", () => fillSubjects(EL.roomSubject, EL.roomGrade.value, "Chọn môn"));
    EL.gradeFilter?.addEventListener("change", () => {
      fillSubjects(EL.subjectFilter, EL.gradeFilter.value, "Tất cả môn");
      renderRooms();
    });
    [EL.keyword, EL.subjectFilter, EL.statusFilter].forEach((el) => {
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
    GAME.roomChannel = sb.channel(`game-room-${roomId}-${Date.now()}`);
    GAME.roomChannel
      .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` }, () => refreshActiveRoom(roomId, true))
      .on("postgres_changes", { event: "*", schema: "public", table: "game_room_players", filter: `room_id=eq.${roomId}` }, () => refreshActiveRoom(roomId, true))
      .on("postgres_changes", { event: "*", schema: "public", table: "game_room_questions", filter: `room_id=eq.${roomId}` }, () => refreshActiveRoom(roomId, true))
      .on("postgres_changes", { event: "*", schema: "public", table: "game_room_answers", filter: `room_id=eq.${roomId}` }, () => refreshActiveRoom(roomId, true))
      .subscribe();
  }

  function fillGrades(el, placeholder) {
    if (!el) return;
    el.innerHTML = `<option value="">${placeholder}</option>` + GAME.grades.map((grade) => `<option value="${grade.id}">${esc(grade.name)}</option>`).join("");
  }

  function fillSubjects(el, gradeId, placeholder) {
    if (!el) return;
    const list = gradeId ? GAME.subjects.filter((subject) => subject.grade_id === gradeId) : GAME.subjects;
    el.innerHTML = `<option value="">${placeholder}</option>` + list.map((subject) => `<option value="${subject.id}">${esc(subject.name)}</option>`).join("");
  }

  function roomVisibilityLabel(value) {
    return value === "private" ? "Riêng tư" : "Công khai";
  }

  function roomPlayerCount(roomId) {
    return (GAME.players || []).filter((player) => player.room_id === roomId).length;
  }

  function roomHasCapacity(room) {
    return roomPlayerCount(room.id) < Number(room.max_players || 8);
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

    GAME.roomsRaw = rooms || [];
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
    const status = EL.statusFilter?.value || "";
    const playerMap = buildRoomPlayerMap();

    let list = [...GAME.rooms];
    if (keyword) {
      list = list.filter((room) => String(room.title || "").toLowerCase().includes(keyword) || String(room.join_code || "").toLowerCase().includes(keyword));
    }
    if (gradeId) list = list.filter((room) => room.grade_id === gradeId);
    if (subjectId) list = list.filter((room) => room.subject_id === subjectId);
    if (status) list = list.filter((room) => room.status === status);

    EL.roomGrid.innerHTML = list.map((room) => renderRoomCard(room, playerMap[room.id] || [])).join("");
    EL.roomEmpty.classList.toggle("hidden", list.length > 0);

    document.querySelectorAll("[data-join-room]").forEach((button) => {
      button.onclick = () => joinRoom(button.dataset.joinRoom);
    });
    document.querySelectorAll("[data-enter-room]").forEach((button) => {
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
    const visibility = roomVisibilityLabel(room.visibility || "public");
    const statusLabel = room.status === "waiting" ? "Đang chờ" : room.status === "live" ? "Đang đấu" : "Đã kết thúc";
    const statusClass = room.status === "waiting" ? "waiting" : room.status === "live" ? "live" : "done";
    const hasCapacity = roomHasCapacity(room);
    const canEnter = joined || (room.status === "waiting" && hasCapacity);
    return `<div class="room-card">
      <div class="room-top">
        <div>
          <div class="room-title">${esc(room.title || "Phòng thi đấu")}</div>
          <div class="hint">Mã phòng: <b>${esc(room.join_code || "—")}</b></div>
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

  function renderArenaInsights() {
    const finishedRooms = GAME.rooms.filter((room) => room.status === "finished");
    const finishedIds = new Set(finishedRooms.map((room) => room.id));
    const finishedPlayers = GAME.players.filter((player) => finishedIds.has(player.room_id));
    const myFinished = finishedPlayers.filter((player) => player.user_id === GAME.user.id);
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
    const tier = getArenaTier(totalScore);

    if (EL.heroBadges) {
      EL.heroBadges.innerHTML = `
        <div class="hero-badge">${tier.icon} Hạng ${tier.name}</div>
        <div class="hero-badge">Tỉ lệ thắng ${winRate}%</div>
        <div class="hero-badge">Chuỗi thắng ${streak}</div>
      `;
    }

    if (EL.statsGrid) {
      EL.statsGrid.innerHTML = `
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
        <h3>${esc(room.title || "Phòng thi đấu")}</h3>
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
    if (EL.roomVisibility) EL.roomVisibility.value = "public";
    if (EL.roomMaxPlayers) EL.roomMaxPlayers.value = "8";
    fillSubjects(EL.roomSubject, EL.roomGrade.value, "Chọn môn");
    EL.roomModal.classList.add("show");
  }

  function closeGameRoomModal() {
    EL.roomModal.classList.remove("show");
  }

  async function submitCreateRoom(event) {
    event.preventDefault();
    const payload = {
      title: String(EL.roomTitle.value || "").trim(),
      join_code: String(EL.roomCode.value || "").trim().toUpperCase() || randomCode(),
      grade_id: EL.roomGrade.value,
      subject_id: EL.roomSubject.value,
      question_count: Number(EL.roomQuestionCount.value || 10),
      time_per_question: Number(EL.roomTimePerQuestion.value || 20),
      max_players: Number(EL.roomMaxPlayers?.value || 8),
      description: String(EL.roomDescription.value || "").trim(),
      visibility: EL.roomVisibility?.value || "public",
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
    const room = (GAME.roomsRaw || []).find((item) => item.id === roomId);
    if (!room) {
      alert("Không tìm thấy phòng này.");
      return;
    }
    if (!roomHasCapacity(room) && !GAME.players.some((player) => player.room_id === roomId && player.user_id === GAME.user.id)) {
      alert("Phòng này đã đầy.");
      return;
    }
    const exists = GAME.players.find((player) => player.room_id === roomId && player.user_id === GAME.user.id);
    if (!exists) {
      const { error } = await sb.from("game_room_players").insert({ room_id: roomId, user_id: GAME.user.id, score: 0, ready: false });
      if (error && !String(error.message || "").includes("duplicate")) {
        alert(`Không thể tham gia phòng: ${error.message}`);
        return;
      }
    }
    await loadRooms();
    openRoomScreen(roomId);
  }

  async function quickMatch() {
    const gradeId = EL.gradeFilter?.value || "";
    const subjectId = EL.subjectFilter?.value || "";
    const keyword = String(EL.keyword?.value || "").trim().toLowerCase();
    const bestRoom = [...(GAME.rooms || [])]
      .filter((room) => room.status === "waiting" && (room.visibility || "public") === "public")
      .filter((room) => !gradeId || room.grade_id === gradeId)
      .filter((room) => !subjectId || room.subject_id === subjectId)
      .filter((room) => !keyword || String(room.title || "").toLowerCase().includes(keyword) || String(room.join_code || "").toLowerCase().includes(keyword))
      .filter((room) => roomHasCapacity(room) || GAME.players.some((player) => player.room_id === room.id && player.user_id === GAME.user.id))
      .sort((a, b) => roomPlayerCount(b.id) - roomPlayerCount(a.id) || new Date(b.created_at) - new Date(a.created_at))[0];
    if (!bestRoom) {
      alert("Chưa có phòng công khai phù hợp để ghép nhanh. Hãy đổi bộ lọc hoặc tự tạo phòng mới.");
      return;
    }
    await joinRoom(bestRoom.id);
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
      closeGameScreen();
      return;
    }
    if (!confirm("Bạn muốn rời phòng này?")) return;
    clearIntervals();
    await sb.from("game_room_answers").delete().eq("player_id", player.id);
    const { error } = await sb.from("game_room_players").delete().eq("id", player.id);
    if (error) {
      alert(`Không thể rời phòng: ${error.message}`);
      return;
    }
    if (room.host_id === GAME.user.id) {
      const remain = GAME.roomPlayers.filter((item) => item.id !== player.id);
      if (remain.length) {
        await sb.from("game_rooms").update({ host_id: remain[0].user_id }).eq("id", room.id);
      } else {
        await sb.from("game_room_questions").delete().eq("room_id", room.id);
        await sb.from("game_rooms").delete().eq("id", room.id);
      }
    }
    closeGameScreen();
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
    GAME.roomPoll = setInterval(() => refreshActiveRoom(roomId, true), 2500);
  }

  function closeGameScreen() {
    clearIntervals();
    teardownRoomRealtime();
    GAME.activeRoom = null;
    EL.roomScreen.classList.remove("show");
    loadRooms();
  }

  function clearIntervals() {
    clearInterval(GAME.roomPoll);
    clearInterval(GAME.questionTick);
    GAME.roomPoll = null;
    GAME.questionTick = null;
  }

  async function refreshActiveRoom(roomId, silent) {
    const [{ data: room, error: roomErr }, { data: players, error: playerErr }, { data: questions, error: questionErr }, { data: answers, error: answerErr }] = await Promise.all([
      sb.from("game_rooms").select("*").eq("id", roomId).single(),
      sb.from("game_room_players").select("id,room_id,user_id,score,ready,joined_at").eq("room_id", roomId).order("score", { ascending: false }),
      sb.from("game_room_questions").select("*").eq("room_id", roomId).order("order_no"),
      sb.from("game_room_answers").select("id,player_id,game_question_id,answer,is_correct,score_earned,answered_at").eq("room_id", roomId),
    ]);

    if (roomErr || playerErr || questionErr || answerErr) {
      if (!silent) alert(`Không tải được phòng: ${roomErr?.message || playerErr?.message || questionErr?.message || answerErr?.message}`);
      return;
    }

    GAME.activeRoom = room;
    GAME.roomPlayers = players || [];
    GAME.roomQuestions = questions || [];
    GAME.myAnswers = (answers || []).filter((item) => {
      const me = GAME.roomPlayers.find((player) => player.user_id === GAME.user.id);
      return me ? item.player_id === me.id : false;
    });

    renderActiveRoom();
  }

  function renderActiveRoom() {
    const room = GAME.activeRoom;
    if (!room) return;
    const grade = GAME.grades.find((item) => item.id === room.grade_id)?.name || "—";
    const subject = GAME.subjects.find((item) => item.id === room.subject_id)?.name || "—";
    const visibility = roomVisibilityLabel(room.visibility || "public");
    const isHost = room.host_id === GAME.user.id;
    const me = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    const others = GAME.roomPlayers.filter((item) => item.user_id !== room.host_id);
    const canStart = room.status === "waiting" && isHost && GAME.roomPlayers.length >= 2 && others.every((item) => item.ready);

    EL.roomScreenTitle.textContent = room.title || "Phòng thi đấu";
    EL.startGameBtn.classList.toggle("hidden", !(room.status === "waiting" && isHost));
    EL.startGameBtn.disabled = !canStart;
    EL.toggleReadyBtn?.classList.toggle("hidden", room.status !== "waiting" || isHost);
    if (EL.toggleReadyBtn && me && !isHost) EL.toggleReadyBtn.textContent = me.ready ? "Hủy sẵn sàng" : "Sẵn sàng";
    ensurePlayerCache().then(() => {
      if (room.status === "waiting") {
        setScreenState("waiting");
        EL.roomSummary.innerHTML = `
          <div><span>Mã phòng</span><strong>${esc(room.join_code || "—")}</strong></div>
          <div><span>Hiển thị</span><strong>${esc(visibility)}</strong></div>
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
        if (EL.roomStartHint) {
          if (isHost) {
            EL.roomStartHint.textContent = canStart
              ? "Phòng đã đủ điều kiện để bắt đầu trận."
              : "Cần ít nhất 2 người chơi và tất cả người chơi còn lại phải sẵn sàng.";
          } else {
            EL.roomStartHint.textContent = me?.ready
              ? "Bạn đã sẵn sàng. Hãy chờ chủ phòng bắt đầu trận."
              : "Nhấn Sẵn sàng để báo chủ phòng rằng bạn đã chuẩn bị xong.";
          }
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
    const readyTag = GAME.activeRoom?.status === "waiting"
      ? `<span class="status-tag ${player.ready ? "ready" : "waiting"}">${player.ready ? "Sẵn sàng" : "Chưa sẵn sàng"}</span>`
      : "";
    return `<div class="player-row ${rankClass} ${meClass}">
      <div class="player-main">
        <img class="avatar" src="${escAttr(getPlayerAvatar(player.user_id))}" alt="avatar">
        <div>
          <div style="font-weight:700;color:var(--navy)">${index}. ${esc(getPlayerName(player.user_id))}</div>
          <div class="hint">${player.user_id === GAME.activeRoom?.host_id ? "Chủ phòng" : "Người chơi"}</div>
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
    const others = GAME.roomPlayers.filter((item) => item.user_id !== room.host_id);
    if (GAME.roomPlayers.length < 2 || others.some((item) => !item.ready)) {
      alert("Cần ít nhất 2 người chơi và tất cả người chơi còn lại phải sẵn sàng.");
      return;
    }
    const questions = await buildGameQuestions(room);
    if (questions.length < room.question_count) {
      alert("Chưa đủ câu hỏi phù hợp trong Ngân hàng câu hỏi để bắt đầu trận.");
      return;
    }

    await sb.from("game_room_questions").delete().eq("room_id", room.id);
    const { error: insertErr } = await sb.from("game_room_questions").insert(questions);
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
    if (!chapterIds.length) return [];
    const { data: bank } = await sb.from("question_bank")
      .select("id,question_type,question_text,question_img,answer,answer_count,hidden")
      .in("chapter_id", chapterIds);
    const usable = (bank || []).filter((item) => !item.hidden && item.question_type !== "essay");
    const picked = shuffle(usable).slice(0, room.question_count);
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
    }));
  }

  function renderLiveRoom() {
      const room = GAME.activeRoom;
      const questions = GAME.roomQuestions;
      if (!room || !questions.length) {
        EL.questionBody.textContent = "Đang chuẩn bị câu hỏi...";
        EL.answerArea.innerHTML = "";
        return;
      }

      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(room.started_at).getTime()) / 1000));
      const currentIndex = Math.floor(elapsed / room.time_per_question);
      if (currentIndex >= questions.length) {
        finishRoomIfNeeded();
        return;
      }

      const question = questions[currentIndex];
      const secondsLeft = Math.max(0, room.time_per_question - (elapsed % room.time_per_question));
      EL.questionTitle.textContent = `Câu ${currentIndex + 1} / ${questions.length}`;
      EL.questionClock.textContent = String(secondsLeft).padStart(2, "0");
      if (EL.progressText) EL.progressText.textContent = `Tiến độ ${currentIndex + 1}/${questions.length}`;
      if (EL.progressFill) EL.progressFill.style.width = `${((currentIndex + 1) / questions.length) * 100}%`;
      EL.questionBody.textContent = question.question_text || "Xem nội dung câu hỏi.";
      EL.questionImg.classList.toggle("hidden", !question.question_img);
      if (question.question_img) EL.questionImg.src = question.question_img;

      renderAnswerArea(question);
      renderLeaderboard();

      clearInterval(GAME.questionTick);
      GAME.questionTick = setInterval(() => {
        const innerElapsed = Math.max(0, Math.floor((Date.now() - new Date(room.started_at).getTime()) / 1000));
        const innerIndex = Math.floor(innerElapsed / room.time_per_question);
        const remain = Math.max(0, room.time_per_question - (innerElapsed % room.time_per_question));
        EL.questionClock.textContent = String(remain).padStart(2, "0");
        if (innerIndex !== currentIndex) {
          clearInterval(GAME.questionTick);
          refreshActiveRoom(room.id, true);
        }
      }, 1000);
  }

  function renderAnswerArea(question) {
    const me = GAME.roomPlayers.find((player) => player.user_id === GAME.user.id);
    const answered = GAME.myAnswers.find((item) => item.game_question_id === question.id);
    const disabled = !!answered;
    if (EL.answerFeedback) {
      if (answered) {
        EL.answerFeedback.innerHTML = `<div class="feedback-box ${answered.is_correct ? "good" : "bad"}">${answered.is_correct ? "Bạn ghi điểm ở câu này." : "Bạn đã gửi đáp án."} +${answered.score_earned || 0} điểm</div>`;
      } else {
        EL.answerFeedback.innerHTML = `<div class="feedback-box pending">Mỗi câu chỉ được trả lời một lần. Hãy chọn thật chắc trước khi xác nhận.</div>`;
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
      EL.answerArea.innerHTML = `<div class="tf-grid">${Array.from({ length: Math.max(2, Number(question.answer_count || 4)) }, (_, idx) => {
        const key = String.fromCharCode(97 + idx);
        const current = parseTrueFalseAnswer(answered?.answer || "")[key] || "";
        return `<div class="tf-row"><strong>${key})</strong><div class="tf-actions"><button class="btn ${current === "Đ" ? "btn-primary" : "btn-outline"}" type="button" ${disabled ? "disabled" : ""} onclick="submitGameTrueFalse('${question.id}','${key}','Đ')">Đ</button><button class="btn ${current === "S" ? "btn-primary" : "btn-outline"}" type="button" ${disabled ? "disabled" : ""} onclick="submitGameTrueFalse('${question.id}','${key}','S')">S</button></div></div>`;
      }).join("")}</div>${disabled ? renderAnsweredHint(answered) : `<div class="hint" style="margin-top:10px">Mỗi câu chỉ nộp một lần. Hãy chọn đủ các ý rồi mới xác nhận.</div><button class="btn btn-primary" style="margin-top:10px" type="button" onclick="submitGameTrueFalseFinal('${question.id}')">Xác nhận đáp án</button>`}`;
      return;
    }

    EL.answerArea.innerHTML = `
      <input id="gameShortAnswerInput" class="input short-input" placeholder="Nhập đáp án ngắn" ${disabled ? "disabled" : ""} value="${escAttr(answered?.answer || "")}">
      ${disabled
        ? renderAnsweredHint(answered)
        : `<button class="btn btn-primary" style="margin-top:12px" type="button" onclick="submitGameShortAnswer('${question.id}')">Gửi đáp án</button>`}
    `;

    window.__gameTfDraft = window.__gameTfDraft || {};
    if (me) {
      window.__gameTfDraft[me.id] = window.__gameTfDraft[me.id] || {};
    }
  }

  function renderAnsweredHint(answered) {
    return `<div class="hint" style="margin-top:10px;color:${answered?.is_correct ? "#15803d" : "#c2410c"}">${answered?.is_correct ? "Bạn đã trả lời đúng." : "Bạn đã gửi đáp án cho câu này."}</div>`;
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
    const ordered = [...GAME.roomPlayers].sort((a, b) => (b.score || 0) - (a.score || 0) || new Date(a.joined_at) - new Date(b.joined_at));
    EL.leaderboard.innerHTML = ordered.map((player, idx) => renderPlayerRow(player, idx + 1, true)).join("");
    const myIndex = ordered.findIndex((item) => item.user_id === GAME.user.id);
    const myRow = ordered[myIndex];
    EL.myScore.textContent = myRow?.score || 0;
    EL.myRank.textContent = myIndex >= 0 ? `#${myIndex + 1}` : "#-";
  }

  async function finishRoomIfNeeded() {
    clearInterval(GAME.questionTick);
    const room = GAME.activeRoom;
    if (!room) return;
    if (room.status !== "finished" && room.host_id === GAME.user.id) {
      await sb.from("game_rooms").update({ status: "finished", ended_at: new Date().toISOString() }).eq("id", room.id);
    }
    await refreshActiveRoom(room.id, true);
  }

  function renderFinishedRoom() {
    const ordered = [...GAME.roomPlayers].sort((a, b) => (b.score || 0) - (a.score || 0) || new Date(a.joined_at) - new Date(b.joined_at));
    const winner = ordered[0];
    EL.finishedMeta.textContent = `Phòng ${GAME.activeRoom?.title || ""} đã kết thúc. Người có điểm cao hơn sẽ xếp trên, nếu bằng điểm thì ai vào phòng sớm hơn sẽ xếp trên.`;
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

    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(room.started_at).getTime()) / 1000));
    const questionIndex = Math.floor(elapsed / room.time_per_question);
    if (GAME.roomQuestions[questionIndex]?.id !== questionId) return;

    const remaining = Math.max(0, room.time_per_question - (elapsed % room.time_per_question));
    const scored = evaluateAnswer(question, answerValue, remaining, room.time_per_question);

    const { error: insertErr } = await sb.from("game_room_answers").insert({
      room_id: room.id,
      player_id: player.id,
      game_question_id: questionId,
      answer: answerValue,
      is_correct: scored.isCorrect,
      score_earned: scored.score,
      response_ms: (room.time_per_question - remaining) * 1000,
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

  function evaluateAnswer(question, answerValue, remaining, totalTime) {
    const speedBonus = Math.round((remaining / totalTime) * 35);
    const base = Number(question.points || 0);
    if (question.question_type === "multi_choice") {
      const correct = normalizeAnswer(question.answer);
      const mine = normalizeAnswer(answerValue);
      const ok = correct === mine;
      return { isCorrect: ok, score: ok ? base + speedBonus : 0 };
    }
    if (question.question_type === "true_false") {
      const correct = normalizeAnswer(question.answer);
      const mine = normalizeAnswer(answerValue);
      const ok = correct === mine;
      return { isCorrect: ok, score: ok ? base + speedBonus : 0 };
    }
    const accepted = shortAnswerAccepted(question.answer);
    const ok = accepted.includes(String(answerValue || "").trim().toLowerCase());
    return { isCorrect: ok, score: ok ? base + speedBonus : 0 };
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
    window.__gameTfDraft[player.id][key] = value;
    renderAnswerArea(GAME.roomQuestions.find((item) => item.id === questionId));
  };

  window.submitGameTrueFalseFinal = function (questionId) {
    const player = GAME.roomPlayers.find((item) => item.user_id === GAME.user.id);
    if (!player) return;
    const draft = window.__gameTfDraft?.[player.id] || {};
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
    submitAnswer(questionId, value.trim());
  };

  window.inviteGameFriend = inviteFriend;
  window.kickGamePlayer = kickPlayer;
  window.openGameHistoryDetail = openHistoryDetail;
  window.closeGameHistoryModal = closeGameHistoryModal;
  window.closeGameRoomModal = closeGameRoomModal;
  window.closeGameScreen = closeGameScreen;
})();
