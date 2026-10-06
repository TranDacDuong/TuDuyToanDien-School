(function () {
  function init() {
    const page = location.pathname.split('/').pop().replace(/\.html$/, '');
    if (/^[a-z_]+$/.test(page)) document.body.classList.add(`mindup-page-${page}`);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
