(function () {
  window.inboxUnreadOnly = false;
  window.inboxWaitingOnly = true;
  window.setInboxFilter = function (unread) {
    window.inboxWaitingOnly = unread === 'reply';
    window.inboxUnreadOnly = unread === true;
    document.querySelectorAll('.inbox-tabs button').forEach((button, index) => button.setAttribute('aria-pressed', String(index === (unread === 'reply' ? 0 : 1))));
    filterFriends();
    if (unread === 'reply' && window.parentPriorityLoadFailed) window.retryParentReplyPriority?.();
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
  let renderedFriend = null, mediaSection = null, familySection = null;
  window.refreshMessageWorkspace = function () {
    const avatar = document.getElementById('chatAvatar');
    if (!avatar) return;
    avatar.src = mediaUrl(activeFriend?.avatar || 'favicon.png');
    const body = document.getElementById('conversationInfoBody');
    if (!activeFriend) {
      renderedFriend = mediaSection = familySection = null;
      body.replaceChildren();
      body.append(textElement('p', 'Chưa chọn cuộc trò chuyện.'));
      return;
    }
    if (renderedFriend !== activeFriend.id) {
    renderedFriend = activeFriend.id;
    body.replaceChildren();
    const identity = document.createElement('section');
    identity.append(image(activeFriend.avatar, 'info-avatar'), textElement('div', activeFriend.name || document.getElementById('chatTitle').textContent, 'info-name'));
    const info = friendMap.get(activeFriend.id) || parentInboxById.get(activeFriend.id);
    if (info?.users?.full_name && info.users.full_name !== activeFriend.name) identity.append(textElement('p', info.users.full_name));
    if (info?.users?.phone) identity.append(textElement('p', info.users.phone));
    const transport = document.getElementById('zaloSendModeLabel');
    if (activeFriend.role === 'parent' && transport) identity.append(textElement('p', transport.textContent));
    body.append(identity);
    const children = activeFriend.children || info?.children || [];
    if (children.length && !window.FamilyConversationInfo) {
      const section = document.createElement('section');
      section.append(textElement('h3', 'Học sinh liên quan'));
      children.forEach(child => section.append(textElement('div', child.name || child.full_name || 'Học sinh', 'info-child')));
      body.append(section);
    }
    mediaSection = document.createElement('section');
    familySection = null;
    if (window.FamilyConversationInfo && (activeFriend.role === 'parent' || activeFriend.isZaloExternal)) {
      familySection = document.createElement('section');
      familySection.className = 'conversation-family-info';
      body.append(familySection);
    }
    body.append(mediaSection);
    }
    const media = mediaSection;
    media.replaceChildren();
    media.append(textElement('h3', 'Ảnh trong hội thoại'));
    const urls = [...new Set(loadedMessages.map(item => parseMessageContent(item.content)).filter(payload => payload.type === 'image').map(payload => payload.url).filter(Boolean))];
    if (urls.length) {
      const grid = document.createElement('div'); grid.className = 'info-media';
      urls.forEach(url => {
        const link = document.createElement('a'); link.href = mediaUrl(url); link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.append(image(url, '', 'Ảnh hội thoại')); grid.append(link);
      });
      media.append(grid);
    }
    const zaloMedia=loadedMessages.filter(item=>{
      const state=window.getZaloMessageMetadata?.(item.external_message_id);
      return !state?.revoked && state?.metadata?.media;
    });
    zaloMedia.forEach(item=>{
      const details=window.getZaloMessageMetadata(item.external_message_id).metadata.media;
      const button=textElement('button',details.kind==='image'?'[Hình ảnh] · Xem ảnh':details.name || (details.kind==='video'?'[Video]':'[Tệp / âm thanh]'));
      button.type='button';button.style.cssText='display:block;margin:8px 0;max-width:100%;overflow-wrap:anywhere';
      button.onclick=()=>window.openZaloMedia(item.external_message_id);media.append(button);
    });
    if(!urls.length && !zaloMedia.length) media.append(textElement('p', 'Chưa có ảnh trong các tin nhắn đã tải.'));
    if (familySection && !document.getElementById('conversationInfo').hidden) window.FamilyConversationInfo.mount(familySection, activeFriend);
  };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') window.toggleConversationInfo(false); });
  window.refreshMessageWorkspace();
})();
