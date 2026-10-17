(function () {
  const staffRoles = new Set(['admin', 'teacher', 'assistant', 'marketing', 'accountant', 'staff']);
  let root, frame, launcher, panel, ownerId;
  function icon(name) { return `<img src="assets/icons/${name}.svg" alt="" width="20" height="20">`; }
  function close() {
    if (!panel) return;
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
  }
  function open() {
    if (!panel) return;
    if (window.matchMedia('(max-width: 768px)').matches) window.closeSidebar?.();
    if (!frame.getAttribute('src')) frame.src = 'messages.html?popup=1&dock=1&v=20261016-staff-dock';
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    panel.querySelector('[data-close]').focus();
  }
  function configure(profile) {
    if (!profile?.id || !staffRoles.has(profile.role)) {
      root?.remove(); root = frame = launcher = panel = ownerId = null;
      return;
    }
    if (root && ownerId === profile.id) return;
    root?.remove(); ownerId = profile.id;
    root = document.createElement('div'); root.id = 'staffMessageDock';
    root.innerHTML = `<section id="staffMessagePanel" role="dialog" aria-label="Tin nhắn trung tâm" hidden>
      <header><strong>Tin nhắn</strong><div>
        <button type="button" data-expand aria-label="Phóng to hoặc thu gọn tin nhắn" title="Phóng to / Thu gọn" aria-pressed="false">${icon('maximize-2')}</button>
        <button type="button" data-minimize aria-label="Thu nhỏ tin nhắn" title="Thu nhỏ">${icon('minus')}</button>
        <button type="button" data-close aria-label="Đóng tin nhắn" title="Đóng">${icon('x')}</button>
      </div></header>
      <iframe title="Danh sách và nội dung tin nhắn" referrerpolicy="same-origin"></iframe>
    </section><button id="staffMessageLauncher" type="button" aria-label="Mở tin nhắn" title="Tin nhắn" aria-expanded="false" aria-controls="staffMessagePanel">${icon('message-circle')}<span class="staff-message-badge" hidden></span></button>`;
    document.body.appendChild(root);
    frame = root.querySelector('iframe'); panel = root.querySelector('section');
    launcher = root.querySelector('#staffMessageLauncher');
    launcher.onclick = () => panel.hidden ? open() : close();
    root.querySelector('[data-close]').onclick = close;
    root.querySelector('[data-minimize]').onclick = close;
    root.querySelector('[data-expand]').onclick = event => {
      const expanded = panel.classList.toggle('expanded');
      event.currentTarget.setAttribute('aria-pressed', String(expanded));
    };
  }
  function updateBadge(count) {
    const badge = root?.querySelector('.staff-message-badge');
    if (!badge) return;
    badge.hidden = !count; badge.textContent = count > 99 ? '99+' : String(count || '');
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
    if (event.data?.type === 'staff-messages:close') close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel && !panel.hidden) close();
  });
  window.StaffMessageDock = { configure, updateBadge, open, close };
})();
