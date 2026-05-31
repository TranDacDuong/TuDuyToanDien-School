(function () {
  const STORAGE_ENABLED = "mindup_effects_enabled";
  const STORAGE_THEME = "mindup_system_theme";
  const DEFAULT_THEME = "spring";
  const SEASON_THEMES = new Set(["spring", "summer", "autumn", "winter"]);
  const storedTheme = localStorage.getItem(STORAGE_THEME);
  document.documentElement.dataset.mindupTheme = SEASON_THEMES.has(storedTheme) ? storedTheme : DEFAULT_THEME;
  if (window.top !== window) {
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_THEME && event.newValue) {
        document.documentElement.dataset.mindupTheme = SEASON_THEMES.has(event.newValue) ? event.newValue : DEFAULT_THEME;
      }
    });
    return;
  }

  const EXAM_PAGES = new Set(["course_practice.html"]);
  const THEMES = [
    { id: "spring", name: "Mua xuan", copy: "Canh hoa hong bay nhe", petals: 34, leaves: 5, ribbons: 2 },
    { id: "summer", name: "Mua ha", copy: "La xanh va diem nang", petals: 8, leaves: 24, ribbons: 4 },
    { id: "autumn", name: "Mua thu", copy: "La vang nau xoay cham", petals: 6, leaves: 34, ribbons: 1 },
    { id: "winter", name: "Mua dong", copy: "Tuyet trang xanh roi mem", petals: 44, leaves: 0, ribbons: 1 },
  ];

  let activeTheme = localStorage.getItem(STORAGE_THEME) || DEFAULT_THEME;
  let examMode = EXAM_PAGES.has(location.pathname.split("/").pop());
  let layer = null;
  let settings = null;

  function isEnabled() {
    return localStorage.getItem(STORAGE_ENABLED) !== "0";
  }

  function isReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function getTheme(themeId) {
    return THEMES.find((theme) => theme.id === themeId) || THEMES[0];
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function addPetal(target) {
    const item = document.createElement("span");
    item.className = "mindup-petal";
    item.style.setProperty("--petal-left", `${random(0, 100)}%`);
    item.style.setProperty("--petal-size", `${random(8, 17)}px`);
    item.style.setProperty("--petal-delay", `${-random(0, 16)}s`);
    item.style.setProperty("--petal-duration", `${random(11, 21)}s`);
    item.style.setProperty("--petal-drift", `${random(-55, 55)}px`);
    item.style.setProperty("--petal-turn", `${random(210, 600)}deg`);
    item.style.setProperty("--petal-opacity", `${random(.28, .62)}`);
    target.appendChild(item);
  }

  function addLeaf(target) {
    const item = document.createElement("span");
    item.className = "mindup-leaf";
    item.style.setProperty("--leaf-left", `${random(0, 100)}%`);
    item.style.setProperty("--leaf-size", `${random(9, 18)}px`);
    item.style.setProperty("--leaf-delay", `${-random(0, 20)}s`);
    item.style.setProperty("--leaf-duration", `${random(15, 25)}s`);
    item.style.setProperty("--leaf-drift", `${random(-90, 90)}px`);
    item.style.setProperty("--leaf-turn", `${random(320, 860)}deg`);
    target.appendChild(item);
  }

  function addRibbon(target) {
    const item = document.createElement("span");
    item.className = "mindup-ribbon";
    item.style.setProperty("--ribbon-top", `${random(12, 78)}%`);
    item.style.setProperty("--ribbon-delay", `${-random(0, 24)}s`);
    item.style.setProperty("--ribbon-duration", `${random(18, 28)}s`);
    item.style.setProperty("--ribbon-scale", `${random(.72, 1.27)}`);
    target.appendChild(item);
  }

  function renderLayer() {
    layer?.remove();
    layer = null;
    if (!document.body || !isEnabled() || examMode || isReducedMotion()) return;

    const theme = getTheme(activeTheme);
    const scale = window.matchMedia("(max-width: 640px)").matches ? .55 : 1;
    layer = document.createElement("div");
    layer.className = "mindup-petal-layer";
    layer.dataset.theme = theme.id;
    layer.setAttribute("aria-hidden", "true");
    for (let index = 0; index < Math.ceil(theme.petals * scale); index += 1) addPetal(layer);
    for (let index = 0; index < Math.ceil(theme.leaves * scale); index += 1) addLeaf(layer);
    for (let index = 0; index < Math.ceil(theme.ribbons * scale); index += 1) addRibbon(layer);
    document.body.appendChild(layer);
  }

  function syncSettingsPanel() {
    if (!settings) return;
    settings.querySelector("[data-effect-toggle]").checked = isEnabled();
    settings.querySelector("[data-effect-theme]").textContent = getTheme(activeTheme).name;
  }

  function ensureSettings() {
    if (!document.body || settings) return;
    settings = document.createElement("div");
    settings.className = "mindup-effect-settings";
    settings.innerHTML = `
      <button class="mindup-effect-trigger" type="button" title="Cai dat hieu ung" aria-label="Cai dat hieu ung">&#10024;</button>
      <div class="mindup-effect-panel">
        <div class="mindup-effect-panel-title">Hieu ung giao dien</div>
        <div class="mindup-effect-panel-copy">Giao dien he thong: <strong data-effect-theme></strong></div>
        <label class="mindup-effect-toggle">
          <input type="checkbox" data-effect-toggle>
          <span></span>
          <b>Bat hieu ung tren thiet bi nay</b>
        </label>
      </div>
    `;
    settings.querySelector(".mindup-effect-trigger").addEventListener("click", () => {
      settings.classList.toggle("open");
    });
    settings.querySelector("[data-effect-toggle]").addEventListener("change", (event) => {
      localStorage.setItem(STORAGE_ENABLED, event.target.checked ? "1" : "0");
      renderLayer();
    });
    document.body.appendChild(settings);
    syncSettingsPanel();
  }

  function applyTheme(themeId) {
    activeTheme = getTheme(themeId).id;
    localStorage.setItem(STORAGE_THEME, activeTheme);
    document.documentElement.dataset.mindupTheme = activeTheme;
    syncSettingsPanel();
    renderLayer();
  }

  function setExamMode(active) {
    examMode = !!active;
    document.documentElement.classList.toggle("mindup-exam-mode", examMode);
    settings?.classList.toggle("hidden", examMode);
    renderLayer();
  }

  async function loadSystemTheme() {
    for (let attempt = 0; attempt < 30 && !window.sb; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (!window.sb) return;
    const { data } = await window.sb
      .from("site_settings")
      .select("setting_value")
      .eq("setting_key", "ambient_theme")
      .maybeSingle();
    if (data?.setting_value) applyTheme(data.setting_value);
    window.sb
      .channel("mindup-ambient-theme")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_settings", filter: "setting_key=eq.ambient_theme" }, (payload) => {
        const themeId = payload.new?.setting_value;
        if (themeId) applyTheme(themeId);
      })
      .subscribe();
  }

  function init() {
    ensureSettings();
    applyTheme(activeTheme);
    setExamMode(examMode);
    loadSystemTheme().catch(() => {});
  }

  window.addEventListener("message", (event) => {
    if (event.data?.type === "mindup:exam-mode") setExamMode(!!event.data.active);
    if (event.data?.type === "mindup:theme-changed") applyTheme(event.data.theme);
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_ENABLED) renderLayer();
    if (event.key === STORAGE_THEME && event.newValue) applyTheme(event.newValue);
  });

  window.MindupEffects = { THEMES, applyTheme, setExamMode, renderLayer };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
