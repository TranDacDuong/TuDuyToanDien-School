(function () {
  window.inboxUnreadOnly = false;
  window.inboxWaitingOnly = true;
  window.setInboxFilter = function (unread) {
    window.inboxWaitingOnly = unread === 'reply';
    window.inboxUnreadOnly = unread === true;
    document.querySelectorAll('.inbox-tabs button').forEach((button, index) => button.setAttribute('aria-pressed', String(index === (unread === 'reply' ? 0 : 1))));
    filterFriends();
  };
  window.toggleConversationInfo = function (force) {
    const panel = document.getElementById('conversationInfo');
    const open = typeof force === 'boolean' ? force : panel.hidden;
    panel.hidden = !open;
    document.querySelector('.shell').classList.toggle('info-open', open);
    document.getElementById('conversationInfoToggle').setAttribute('aria-expanded', String(open));
    if (open) window.refreshMessageWorkspace();
  };
  function textElement(tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function image(url, className, alt = '') {
    const element = document.createElement('img');
    element.src = mediaUrl(url || 'default-avatar.png');
    element.alt = alt;
    element.className = className;
    element.onerror = () => { element.onerror = null; element.src = 'default-avatar.png'; };
    return element;
  }
  function mediaUrl(value) {
    try {
      const url = new URL(value, document.baseURI);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }
  window.refreshMessageWorkspace = function () {
    const avatar = document.getElementById('chatAvatar');
    if (!avatar) return;
    avatar.src = mediaUrl(activeFriend?.avatar || 'favicon.png');
    const body = document.getElementById('conversationInfoBody');
    body.replaceChildren();
    if (!activeFriend) {
      body.append(textElement('p', 'Chưa chọn cuộc trò chuyện.'));
      return;
    }
    const identity = document.createElement('section');
    identity.append(image(activeFriend.avatar, 'info-avatar'), textElement('div', activeFriend.name || document.getElementById('chatTitle').textContent, 'info-name'));
    const info = friendMap.get(activeFriend.id) || parentInboxById.get(activeFriend.id);
    if (info?.users?.full_name && info.users.full_name !== activeFriend.name) identity.append(textElement('p', info.users.full_name));
    if (info?.users?.phone) identity.append(textElement('p', info.users.phone));
    const transport = document.getElementById('zaloSendModeLabel');
    if (activeFriend.role === 'parent' && transport) identity.append(textElement('p', transport.textContent));
    body.append(identity);
    const children = activeFriend.children || info?.children || [];
    if (children.length) {
      const section = document.createElement('section');
      section.append(textElement('h3', 'Học sinh liên quan'));
      children.forEach(child => section.append(textElement('div', child.name || child.full_name || 'Học sinh', 'info-child')));
      body.append(section);
    }
    const media = document.createElement('section');
    media.append(textElement('h3', 'Ảnh trong hội thoại'));
    const urls = [...new Set(loadedMessages.map(item => parseMessageContent(item.content)).filter(payload => payload.type === 'image').map(payload => payload.url).filter(Boolean))];
    if (urls.length) {
      const grid = document.createElement('div'); grid.className = 'info-media';
      urls.forEach(url => {
        const link = document.createElement('a'); link.href = mediaUrl(url); link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.append(image(url, '', 'Ảnh hội thoại')); grid.append(link);
      });
      media.append(grid);
    } else media.append(textElement('p', 'Chưa có ảnh trong các tin nhắn đã tải.'));
    body.append(media);
  };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') window.toggleConversationInfo(false); });
  window.refreshMessageWorkspace();
})();
