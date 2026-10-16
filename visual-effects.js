(function () {
  const STORAGE_THEME = "mindup_system_theme";
  const DEFAULT_THEME = "spring";
  const SEASON_THEMES = new Set(["spring", "summer", "autumn", "winter", "mindup"]);
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
    { id: "mindup", name: "MindUp", copy: "Diem sang va ket noi tu duy", petals: 16, leaves: 12, ribbons: 3 },
  ];

  let activeTheme = localStorage.getItem(STORAGE_THEME) || DEFAULT_THEME;
  let examMode = EXAM_PAGES.has(location.pathname.split("/").pop());

  function getTheme(themeId) {
    return THEMES.find((theme) => theme.id === themeId) || THEMES[0];
  }

  function renderLayer() {
    // Retain the shared API without creating decorative animation layers.
    document.querySelectorAll('.mindup-petal-layer').forEach(layer => layer.remove());
  }

  function applyTheme(themeId) {
    activeTheme = getTheme(themeId).id;
    localStorage.setItem(STORAGE_THEME, activeTheme);
    document.documentElement.dataset.mindupTheme = activeTheme;
    renderLayer();
  }

  function setExamMode(active) {
    examMode = !!active;
    document.documentElement.classList.toggle("mindup-exam-mode", examMode);
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
  }

  function init() {
    applyTheme(activeTheme);
    setExamMode(examMode);
    loadSystemTheme().catch(() => {});
  }

  window.addEventListener("message", (event) => {
    if (event.data?.type === "mindup:exam-mode") setExamMode(!!event.data.active);
    if (event.data?.type === "mindup:theme-changed") applyTheme(event.data.theme);
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_THEME && event.newValue) applyTheme(event.newValue);
  });

  window.MindupEffects = { THEMES, applyTheme, setExamMode, renderLayer };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
