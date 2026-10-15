(function () {
  const reminderTypes = new Set(['class_schedule', 'child_schedule', 'attendance']);
  function todayText(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
  function unfinished(row) {
    const task = row.task;
    if (!task || ['completed', 'cancelled'].includes(row.status) || task.status === 'cancelled') return false;
    return !(Number(task.progress?.total) > 0 && Number(task.progress?.current || 0) >= Number(task.progress.total));
  }
  function taskCounts(rows, now = new Date()) {
    const today = todayText(now);
    const result = { overdue: 0, current: 0, teaching: 0 };
    for (const row of rows) {
      if (!unfinished(row)) continue;
      const task = row.task;
      if (reminderTypes.has(task.task_type)) {
        if (task.task_type === 'class_schedule' && String(task.available_on || '').slice(0, 10) === today) result.teaching++;
        continue;
      }
      if (task.due_at && new Date(task.due_at) < now) result.overdue++;
      else result.current++;
    }
    return result;
  }
  async function load(sb, profile, has) {
    const items = [];
    const failures = [];
    const add = (key, count, label, page) => {
      if (count > 0) items.push({ key, count, label, page });
    };
    const source = async (key, fn) => {
      try { await fn(); } catch (error) { failures.push(key); console.warn('[ActionSummary]', key, error); }
    };
    const checked = async query => {
      const result = await query;
      if (result.error) throw result.error;
      return result;
    };
    await Promise.all([
      source('messages', async () => {
        if (!['admin', 'teacher'].includes(profile.role) || !has('page.messages', true)) return;
        // This RPC applies the same family/student authorization as the inbox.
        const { data } = await checked(sb.rpc('list_mindup_parent_reply_priority'));
        let waiting=(data || []).filter(row => row.waiting_reply).length;
        if(profile.role==='admin') {
          const external=await sb.rpc('list_zalo_external_inbox');
          if(!external.error) waiting+=(external.data || []).filter(row=>row.waiting_reply).length;
        }
        add('messages', waiting, 'cuộc trò chuyện chưa phản hồi', 'messages.html');
      }),
      source('facebook', async () => {
        if (!has('page.facebook', ['admin', 'teacher', 'assistant'].includes(profile.role))) return;
        const { count } = await checked(sb.from('facebook_scheduled_posts').select('id', { count: 'exact', head: true })
          .eq('approval_status', 'pending').not('status', 'in', '(published,cancelled)').or('content.neq.,image_url.neq.,link_url.neq.'));
        add('facebook', count, 'bài viết cần duyệt nội dung', 'facebook_posting.html?show=pending');
      }),
      source('bank', async () => {
        if (profile.role !== 'admin' || !has('tuition.transactions.view', true)) return;
        const { count } = await checked(sb.from('bank_transaction_logs').select('id', { count: 'exact', head: true }).eq('status', 'unmatched'));
        add('bank', count, 'giao dịch học phí chưa khớp', 'tuition.html?show=unmatched');
      }),
      source('trial', async () => {
        if (!has('page.trial_requests', ['admin', 'teacher', 'assistant'].includes(profile.role))) return;
        const { count } = await checked(sb.from('trial_lesson_requests').select('id', { count: 'exact', head: true })
          .or('status.in.(new,contacted,pending_schedule),status.is.null'));
        add('trial', count, 'đăng ký học thử chưa xử lý', 'trial_requests.html?show=pending');
      }),
      source('tasks', async () => {
        if (!has('page.tasks', ['admin', 'teacher', 'assistant'].includes(profile.role))) return;
        const rows = [];
        // Read every page so the count is not silently truncated at 1,000 assignments.
        for (let offset = 0; ; offset += 500) {
          const { data } = await checked(sb.from('task_assignments').select('id,status,task:daily_tasks(*)')
            .eq('user_id', profile.id).order('id').range(offset, offset + 499));
          rows.push(...(data || []));
          if ((data || []).length < 500) break;
        }
        const counts = taskCounts(rows);
        add('overdue', counts.overdue, 'công việc được giao đã quá hạn', 'tasks.html?show=overdue');
        add('current', counts.current, 'công việc được giao còn hạn hoặc chưa có hạn', 'tasks.html?show=current');
        if (has('page.classes', true)) {
          const today = todayText();
          const weekday = new Date(`${today}T12:00:00+07:00`).getUTCDay() || 7;
          const { data: links } = await checked(sb.from('class_teachers').select('class_id').eq('teacher_id', profile.id));
          const ids = [...new Set((links || []).map(row => row.class_id))];
          let teaching = 0;
          if (ids.length) {
            const { data: classes } = await checked(sb.from('classes').select('id,class_schedules(id,session_no,weekday,effective_from)').in('id', ids).eq('hidden', false));
            for (const cls of classes || []) {
              const eligible = (cls.class_schedules || []).filter(row => String(row.effective_from || '2000-01-01').slice(0, 10) <= `${today.slice(0, 7)}-01`);
              const latest = eligible.map(row => String(row.effective_from || '2000-01-01').slice(0, 10)).sort().at(-1);
              for (const schedule of eligible.filter(row => Number(row.weekday) === weekday && String(row.effective_from || '2000-01-01').slice(0, 10) === latest)) {
                const assigned = rows.filter(row => row.task?.task_type === 'class_schedule' && row.task.available_on === today
                  && row.task.metadata?.class_id === cls.id && (row.task.metadata?.schedule_id === schedule.id || Number(row.task.metadata?.session_no) === Number(schedule.session_no)));
                if (!assigned.length || assigned.some(unfinished)) teaching++;
              }
            }
          }
          const { count } = await checked(sb.from('supplementary_sessions').select('id', { count: 'exact', head: true })
            .eq('teacher_id', profile.id).eq('session_date', today).not('status', 'in', '(completed,cancelled)'));
          add('teaching', teaching + (count || 0), 'ca dạy hôm nay cần kiểm tra', 'class.html');
        }
      })
    ]);
    const order = ['messages', 'facebook', 'teaching', 'bank', 'trial', 'overdue', 'current'];
    items.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    return { items, failures };
  }
  window.DashboardActionSummary = { load, taskCounts, unfinished, todayText };
})();
