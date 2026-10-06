(function () {
  // Preserve the settings API; all screens now share the Navy identity.
  const themes = ['spring', 'summer', 'autumn', 'winter', 'mindup'];
  function applyTheme(theme = 'mindup') {
    document.documentElement.dataset.mindupTheme = themes.includes(theme) ? theme : 'mindup';
    localStorage.setItem('mindup_system_theme', document.documentElement.dataset.mindupTheme);
  }
  function setExamMode(active) {
    document.documentElement.classList.toggle('mindup-exam-mode', !!active);
  }
  window.MindupEffects = {
    THEMES: themes.map(id => ({ id, name: id })),
    applyTheme,
    setExamMode,
    renderLayer() {}
  };
  applyTheme(localStorage.getItem('mindup_system_theme') || 'mindup');
  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === 'mindup:exam-mode') setExamMode(event.data.active);
    if (event.data?.type === 'mindup:theme-changed') applyTheme(event.data.theme);
  });
  window.addEventListener('storage', event => {
    if (event.key === 'mindup_system_theme') applyTheme(event.newValue);
  });
})();
