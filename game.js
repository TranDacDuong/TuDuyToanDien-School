(function () {
  const GAME = {
    user: null,
    role: "student",
    grades: [],
    subjects: [],
    rooms: [],
    players: [],
    activeRoom: null,
    roomPlayers: [],
    roomQuestions: [],
    myAnswers: [],
    roomPoll: null,
    questionTick: null,
  };

  const EL = {
    keyword: document.getElementById("gameKeyword"),
    gradeFilter: document.getElementById("gameGradeFilter"),
    subjectFilter: document.getElementById("gameSubjectFilter"),
    statusFilter: document.getElementById("gameStatusFilter"),
    roomGrid: document.getElementById("gameRoomGrid"),
    roomEmpty: document.getElementById("gameRoomEmpty"),
    openRoomBtn: document.getElementById("openGameRoomBtn"),
    reloadRoomsBtn: document.getElementById("reloadGameRoomsBtn"),
    roomModal: document.getElementById("gameRoomModal"),
    roomForm: document.getElementById("gameRoomForm"),
    roomTitle: document.getElementById("gameRoomTitle"),
    roomCode: document.getElementById("gameRoomCode"),
    roomGrade: document.getElementById("gameRoomGrade"),
    roomSubject: document.getElementById("gameRoomSubject"),
    roomQuestionCount: document.getElementById("gameRoomQuestionCount"),
    roomTimePerQuestion: document.getElementById("gameRoomTimePerQuestion"),
    roomDescription: document.getElementById("gameRoomDescription"),
    roomScreen: document.getElementById("gameRoomScreen"),
    roomScreenTitle: document.getElementById("gameRoomScreenTitle"),
    startGameBtn: document.getElementById("startGameBtn"),
    waitingView: document.getElementById("gameWaitingView"),
    roomSummary: document.getElementById("gameRoomSummary"),
    roomDescriptionView: document.getElementById("gameRoomDescriptionView"),
    playerList: document.getElementById("gamePlayerList"),
    liveView: document.getElementById("gameLiveView"),
    questionTitle: document.getElementById("gameQuestionTitle"),
    questionClock: document.getElementById("gameQuestionClock"),
    questionBody: document.getElementById("gameQuestionBody"),
    questionImg: document.getElementById("gameQuestionImg"),
    answerArea: document.getElementById("gameAnswerArea"),
    leaderboard: document.getElementById("gameLeaderboard"),
    myScore: document.getElementById("myGameScore"),
    myRank: document.getElementById("myGameRank"),
    finishedView: document.getElementById("gameFinishedView"),
    finishedMeta: document.getElementById("gameFinishedMeta"),
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
    await loadRooms();
  }

  function bindEvents() {
    EL.openRoomBtn?.addEventListener("click", () => openGameRoomModal());
    EL.reloadRoomsBtn?.addEventListener("click", () => loadRooms());
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

  async function loadRooms() {
    const [{ data: rooms, error: roomErr }, { data: players, error: playerErr }] = await Promise.all([
      sb.from("game_rooms").select("*").order("created_at", { ascending: false }),
      sb.from("game_room_players").select("id,room_id,user_id,score,joined_at"),
    ]);

    if (roomErr || playerErr) {
      EL.roomGrid.innerHTML = `<div class="empty"><strong>Không tải được phòng thi đấu</strong><div>${esc(roomErr?.message || playerErr?.message || "Đã có lỗi xảy ra.")}</div></div>`;
      EL.roomEmpty.classList.add("hidden");
      return;
    }

    GAME.rooms = rooms || [];
    GAME.players = players || [];
    renderRooms();
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
    const statusLabel = room.status === "waiting" ? "Đang chờ" : room.status === "live" ? "Đang đấu" : "Đã kết thúc";
    const statusClass = room.status === "waiting" ? "waiting" : room.status === "live" ? "live" : "done";
    const canEnter = joined || room.status === "waiting";
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
        <div><span>Số câu</span><strong>${room.question_count || 0} câu</strong></div>
        <div><span>Người chơi</span><strong>${players.length} người</strong></div>
      </div>
      <div class="hint">${esc(room.description || "Phòng thi đấu không có mô tả.")}</div>
      <div class="room-actions">
        ${joined
          ? `<button class="btn btn-primary" type="button" data-enter-room="${room.id}">${room.status === "finished" ? "Xem kết quả" : "Vào phòng"}</button>`
          : canEnter
            ? `<button class="btn btn-primary" type="button" data-join-room="${room.id}">Tham gia</button>`
            : `<button class="btn btn-outline" type="button" disabled>Đã khóa</button>`}
      </div>
    </div>`;
  }

  function openGameRoomModal() {
    EL.roomForm?.reset();
    EL.roomCode.value = randomCode();
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
      description: String(EL.roomDescription.value || "").trim(),
      status: "waiting",
      host_id: GAME.user.id,
      created_by: GAME.user.id,
    };
    const { data: room, error } = await sb.from("game_rooms").insert(payload).select("*").single();
    if (error) {
      alert(`Lỗi tạo phòng: ${error.message}`);
      return;
    }
    await sb.from("game_room_players").insert({ room_id: room.id, user_id: GAME.user.id, score: 0 });
    closeGameRoomModal();
    await loadRooms();
    openRoomScreen(room.id);
  }

  async function joinRoom(roomId) {
    const exists = GAME.players.find((player) => player.room_id === roomId && player.user_id === GAME.user.id);
    if (!exists) {
      const { error } = await sb.from("game_room_players").insert({ room_id: roomId, user_id: GAME.user.id, score: 0 });
      if (error && !String(error.message || "").includes("duplicate")) {
        alert(`Không thể tham gia phòng: ${error.message}`);
        return;
      }
    }
    await loadRooms();
    openRoomScreen(roomId);
  }

  async function openRoomScreen(roomId) {
    clearIntervals();
    EL.roomScreen.classList.add("show");
    await refreshActiveRoom(roomId);
    GAME.roomPoll = setInterval(() => refreshActiveRoom(roomId, true), 2500);
  }

  function closeGameScreen() {
    clearIntervals();
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
      sb.from("game_room_players").select("id,room_id,user_id,score,joined_at").eq("room_id", roomId).order("score", { ascending: false }),
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
    const isHost = room.host_id === GAME.user.id;

    EL.roomScreenTitle.textContent = room.title || "Phòng thi đấu";
    EL.startGameBtn.classList.toggle("hidden", !(room.status === "waiting" && isHost));
    ensurePlayerCache().then(() => {
      if (room.status === "waiting") {
        setScreenState("waiting");
        EL.roomSummary.innerHTML = `
          <div><span>Mã phòng</span><strong>${esc(room.join_code || "—")}</strong></div>
          <div><span>Khối</span><strong>${esc(grade)}</strong></div>
          <div><span>Môn</span><strong>${esc(subject)}</strong></div>
          <div><span>Số câu</span><strong>${room.question_count} câu</strong></div>
          <div><span>Giây mỗi câu</span><strong>${room.time_per_question}s</strong></div>
          <div><span>Tạo lúc</span><strong>${fmtDateTime(room.created_at)}</strong></div>
        `;
        EL.roomDescriptionView.textContent = room.description || "Mời bạn bè cùng vào phòng, khi đủ người thì chủ phòng bắt đầu trận.";
        EL.playerList.innerHTML = GAME.roomPlayers.length
          ? GAME.roomPlayers.map((player, idx) => renderPlayerRow(player, idx + 1, false)).join("")
          : `<div class="empty">Chưa có người chơi nào trong phòng.</div>`;
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
    return `<div class="player-row">
      <div class="player-main">
        <img class="avatar" src="${escAttr(getPlayerAvatar(player.user_id))}" alt="avatar">
        <div>
          <div style="font-weight:700;color:var(--navy)">${index}. ${esc(getPlayerName(player.user_id))}</div>
          <div class="hint">${player.user_id === GAME.activeRoom?.host_id ? "Chủ phòng" : "Người chơi"}</div>
        </div>
      </div>
      ${showScore ? `<strong style="color:var(--navy)">${player.score || 0}</strong>` : `<span class="hint">${fmtDateTime(player.joined_at)}</span>`}
    </div>`;
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

  async function startGameMatch() {
    const room = GAME.activeRoom;
    if (!room || room.host_id !== GAME.user.id) return;
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
    EL.finishedMeta.textContent = `Phòng ${GAME.activeRoom?.title || ""} đã kết thúc. Người có điểm cao hơn sẽ xếp trên, nếu bằng điểm thì ai vào phòng sớm hơn sẽ xếp trên.`;
    EL.resultsList.innerHTML = ordered.map((player, idx) => {
      const medalClass = idx === 0 ? "first" : idx === 1 ? "second" : idx === 2 ? "third" : "normal";
      return `<div class="result-card">
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

  window.closeGameRoomModal = closeGameRoomModal;
  window.closeGameScreen = closeGameScreen;
})();
