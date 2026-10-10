(function () {
  const banner = document.querySelector('.home-banner');
  if (!banner) return;
  const slides = [...banner.querySelectorAll('.home-banner-slide')];
  const tabs = [...banner.querySelectorAll('[data-slide]')];
  let index = 0, timer = null, paused = false, hovered = false, focused = false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  function show(next) {
    index = (next + slides.length) % slides.length;
    slides.forEach((slide, i) => { slide.hidden = i !== index; });
    tabs.forEach((tab, i) => tab.setAttribute('aria-current', String(i === index)));
  }
  function schedule() {
    clearInterval(timer);
    if (!paused && !hovered && !focused && !reduced.matches && !document.hidden) timer = setInterval(() => show(index + 1), 6500);
  }
  banner.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.slide !== undefined) show(Number(button.dataset.slide));
    else if (button.dataset.direction) show(index + Number(button.dataset.direction));
    else if (button.id === 'homeBannerPause') {
      paused = !paused;
      button.setAttribute('aria-pressed', String(paused));
      button.setAttribute('aria-label', paused ? 'Tiếp tục banner' : 'Tạm dừng banner');
      button.textContent = paused ? '▶' : 'Ⅱ';
    }
    schedule();
  });
  banner.addEventListener('mouseenter', () => { hovered = true; schedule(); });
  banner.addEventListener('mouseleave', () => { hovered = false; schedule(); });
  banner.addEventListener('focusin', () => { focused = true; schedule(); });
  banner.addEventListener('focusout', event => { if (!banner.contains(event.relatedTarget)) { focused = false; schedule(); } });
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', schedule);
  show(0); schedule();
})();
