(function(){
  'use strict';
  let busy=false,attempt=null,loading=null;
  const statuses={pending:'Chờ bot tạo/cập nhật nhóm',ready:'Đã kết nối Zalo',partial:'Đã có nhóm · còn thành viên cần kiểm tra',failed:'Tạo/cập nhật nhóm lỗi',uncertain:'Chưa xác nhận · cần kiểm tra Zalo'};
  const memberStatuses={joined:'Đã trong nhóm',missing_link:'Chưa liên kết Zalo',not_added:'Zalo chưa xác nhận thêm vào nhóm',pending:'Chờ kiểm tra'};
  function statusText(group){return statuses[group.status]||group.status;}
  async function fetchItems(){
    const allowed=['admin','teacher'].includes(currentProfile?.role);
    const tab=document.querySelector('[data-inbox="groups"]');if(tab)tab.hidden=!allowed;
    if(!allowed)return [];
    onFilter();
    const {data,error}=await sb.rpc('list_zalo_class_groups');
    if(error){console.warn('Không tải được nhóm lớp',error);return allFriends.filter(item=>item.isClassGroup);}
    return (data||[]).map(group=>({...makeConversationListItem({id:group.class_id,full_name:group.class_name,role:'class_group',avatar_url:group.avatar||'favicon.png'},
      {conversationId:group.conversation_id,preview:group.last_content||'',lastActivity:group.last_at,unreadCount:Number(group.unread_count)||0}),isClassGroup:true,group}));
  }
  async function open(item){
    resetZaloSendMode();if(messageChannel){sb.removeChannel(messageChannel);messageChannel=null;}
    activeFriend={id:item.friend_id,name:item.users.full_name,avatar:item.users.avatar_url,role:'class_group',isClassGroup:true,group:item.group,children:[]};
    currentConversationId=item.conversationId;loadedMessages=[];hasOlderMessages=true;isLoadingOlderMessages=false;messageReadGeneration++;
    document.getElementById('chatTitle').textContent=item.users.full_name;
    document.getElementById('chatSub').textContent='Nhóm phụ huynh · '+statusText(item.group);
    document.getElementById('messageList').innerHTML='<div class="empty">Đang tải tin nhắn nhóm...</div>';
    setComposerEnabled(item.group.connected);syncMobileConversationState(true);window.refreshMessageWorkspace?.();
    await load({reset:true,scrollToBottom:true});
  }
  async function load({reset=false,scrollToBottom=false,older=false}={}){
    const friend=activeFriend;if(!friend?.isClassGroup || loading===friend || (older&&!hasOlderMessages))return;
    loading=friend;const wrap=document.getElementById('messageList'),top=wrap.scrollTop,height=wrap.scrollHeight,tail=older?loadedMessages[0]:null;
    try{
      const {data,error}=await sb.rpc('list_zalo_class_group_messages',{p_class:friend.id,p_before:tail?.created_at||null,p_before_id:tail?.id||null});
      if(friend!==activeFriend)return;if(error)throw error;
      const rows=(data||[]).slice().reverse();for(const row of rows)if(row.external_message_id)zaloMessageStates[row.external_message_id]={metadata:row.metadata||{}};
      if(reset)loadedMessages=rows;else{const map=new Map(loadedMessages.map(m=>[m.id,m]));rows.forEach(m=>map.set(m.id,m));loadedMessages=[...map.values()].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id));}
      if(reset||older)hasOlderMessages=rows.length===40;
      render();wrap.scrollTop=scrollToBottom?wrap.scrollHeight:older?top+wrap.scrollHeight-height:top;
      await markMessageNotificationsRead(friend.id,currentConversationId);
    }catch(error){if(friend===activeFriend){if(!loadedMessages.length)wrap.innerHTML='<div class="empty">'+esc(error.message||'Không tải được nhóm')+'</div>';else console.warn(error);}}
    finally{if(loading===friend)loading=null;}
  }
  function render(){
    const group=activeFriend?.group;if(!activeFriend?.isClassGroup)return;
    const wrap=document.getElementById('messageList');
    wrap.innerHTML=loadedMessages.length?loadedMessages.map(m=>{
      const state={pending:'Chờ bot gửi Zalo',processing:'Đang gửi Zalo',sent:'Đã gửi Zalo',failed:'Gửi lỗi',uncertain:'Chưa xác nhận · kiểm tra Zalo trước khi gửi lại',cancelled:'Đã hủy'}[m.group_send_status]||'Zalo';
      return '<div class="message-row '+(m.group_is_self?'mine':'')+'"><div class="bubble"><div class="bot-msg-label">'+esc(m.group_sender_name||'Thành viên nhóm')+'</div>'+renderMessageBody(m.content,m.external_message_id)+'<div class="bubble-time">'+formatTime(m.created_at)+'</div><div class="message-transport">'+esc(state)+(m.group_send_error?' · '+esc(m.group_send_error):'')+'</div></div></div>';
    }).join(''):'<div class="empty">'+esc(group.error_message||statusText(group))+'</div>';
    window.refreshMessageWorkspace?.();window.refreshLocalMessageBodies?.();
  }
  async function send(){
    if(busy || !activeFriend?.isClassGroup)return;const friend=activeFriend,input=document.getElementById('messageInput'),text=input.value.trim();
    if(document.getElementById('messageImage').files?.length)return alert('Hãy gửi ảnh trực tiếp trong nhóm Zalo; ảnh sẽ được đồng bộ về web.');
    if(!text)return;if(!attempt || attempt.classId!==friend.id || attempt.text!==text)attempt={classId:friend.id,text,id:crypto.randomUUID()};
    busy=true;
    try{const {error}=await sb.rpc('send_zalo_class_group_message',{p_class:friend.id,p_request:attempt.id,p_content:text});if(error)throw error;
      attempt=null;if(activeFriend===friend){if(input.value.trim()===text)input.value='';await load({scrollToBottom:true});}await loadFriends();
    }catch(error){alert(error.message||'Không xếp hàng được tin nhóm');}finally{busy=false;}
  }
  function info(body){
    const friend=activeFriend;if(!friend?.isClassGroup)return;const group=friendMap.get(friend.id)?.group||friend.group;
    const section=document.createElement('section');body.replaceChildren(section);
    const add=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;section.append(el);return el;};
    add('h3',group.class_name);add('p',statusText(group));if(group.error_message)add('p',group.error_message);
    if(currentProfile?.role==='admin'){
      const button=add('button','Cập nhật phụ huynh');button.type='button';button.className='class-group-sync';button.onclick=async()=>{
        if(!confirm('Kiểm tra nhóm và thêm các phụ huynh hiện đang học trong lớp? Không xóa thành viên cũ.'))return;
        button.disabled=true;try{const {data,error}=await sb.rpc('queue_zalo_class_groups',{p_class:friend.id});if(error)throw error;alert(data?'Đã yêu cầu bot cập nhật thành viên.':'Nhóm đang được xử lý hoặc cần kiểm tra kết quả chưa xác nhận.');await loadFriends();}catch(e){alert(e.message);}finally{button.disabled=false;}
      };
    }
    add('h3','Phụ huynh của lớp ('+(group.members||[]).length+')');
    for(const member of group.members||[])add('p',member.name+' · '+(memberStatuses[member.status]||member.status));
  }
  function onFilter(){const actions=document.getElementById('classGroupActions');if(actions)actions.hidden=currentProfile?.role!=='admin'||!window.inboxClassGroupsOnly;}
  async function syncAll(){
    if(currentProfile?.role!=='admin'||!confirm('Tạo nhóm cho lớp chưa có nhóm và thêm các phụ huynh đang học vào nhóm tương ứng? Không xóa thành viên cũ.'))return;
    const button=document.querySelector('#classGroupActions button');if(button)button.disabled=true;
    try{const {data,error}=await sb.rpc('queue_zalo_class_groups',{p_class:null});if(error)throw error;alert('Đã yêu cầu bot kiểm tra '+data+' nhóm lớp.');await loadFriends();}catch(e){alert(e.message);}finally{if(button)button.disabled=false;}
  }
  window.ClassGroupChats={fetchItems,open,load,send,render,info,statusText,onFilter,syncAll};
})();
