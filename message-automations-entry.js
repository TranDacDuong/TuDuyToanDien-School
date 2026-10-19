(function () {
  let dialog;
  window.MessageAutomations = {
    async configure(profile) {
      const entry = document.getElementById('messageAutomationsEntry');
      if (!entry || !['admin','teacher','assistant','marketing','accountant','staff'].includes(profile?.role)) return;
      try {
        const {data,error} = await window.sb.rpc('can_manage_message_campaigns');
        if (error || !data) return;
        entry.hidden = false;
        entry.onclick = () => {
          if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.className = 'message-automations-dialog';
            const close = document.createElement('button');
            close.type = 'button'; close.textContent = 'Đóng'; close.onclick = () => dialog.close();
            const frame = document.createElement('iframe');
            frame.title = 'Tin nhắn tự động'; frame.src = 'message-automations.html?v=20261019-2';
            const visibility = () => frame.contentWindow?.postMessage({type:'message-automations-visibility',visible:dialog.open},location.origin);
            frame.onload = visibility;
            dialog.addEventListener('close',visibility);
            dialog.append(close,frame); document.body.append(dialog);
          }
          if (!dialog.open) dialog.showModal();
          dialog.querySelector('iframe').contentWindow?.postMessage({type:'message-automations-visibility',visible:true},location.origin);
        };
      } catch (_) { /* Messaging remains usable if the optional manager is unavailable. */ }
    }
  };
})();
