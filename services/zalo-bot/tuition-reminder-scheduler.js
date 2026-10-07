'use strict';

// Integration contract: rpc(name, args) returns a Supabase { data, error } result.
// No timers, credentials, tuition writes, or network sends run on import.
// Host must install @nghiavuive/lunar_date_vi@2.0.1 and explicitly call tick().
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const SLOTS = [5, 10, 15];

function vnDate(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Invalid clock');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = name => parts.find(p => p.type === name).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function lunarDay(date) {
  const { SolarDate } = require('@nghiavuive/lunar_date_vi');
  const [year, month, day] = date.split('-').map(Number);
  return new SolarDate({ year, month, day }).toLunarDate().get().day;
}

function allowed(date, convert) {
  const day = convert(date);
  if (!Number.isInteger(day) || day < 1 || day > 30) throw new Error('Invalid lunar conversion');
  return day !== 1 && day !== 2;
}

function plan(now = new Date(), convert = lunarDay) {
  const today = vnDate(now);
  const month = today.slice(0, 7);
  const slots = SLOTS.map(slot => {
    let date = `${month}-${String(slot).padStart(2, '0')}`;
    while (!allowed(date, convert)) {
      const next = new Date(`${date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      date = next.toISOString().slice(0, 10);
      if (!date.startsWith(month)) throw new Error('Shift escaped current month');
    }
    return { slot, date };
  });
  // On restart catch up only the latest due slot, never burst all missed notices.
  const due = slots.filter(s => s.date <= today).at(-1) || null;
  return { today, month, slots, due, allowed: allowed(today, convert) };
}

function phone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^(0\d{9}|84\d{9})$/.test(digits)) throw new Error('Invalid payment phone');
  return digits;
}

function buildPayload(candidate, month, bank) {
  if (!/^[a-zA-Z0-9]+$/.test(bank.code) || !/^\d{6,30}$/.test(bank.account)) {
    throw new Error('Invalid bank configuration');
  }
  const children = candidate.children;
  if (!Array.isArray(children) || !children.length) throw new Error('Empty parent balance');
  const seen = new Set();
  const monthLabel = `${month.slice(5)}/${month.slice(0, 4)}`;
  const lines = [`Trung tâm MindUp kính gửi Quý phụ huynh thông báo học phí tháng ${monthLabel}:`];
  const qrs = [];
  for (const child of children) {
    const remaining = Number(child.remaining);
    if (!Number.isSafeInteger(remaining) || remaining <= 0 || seen.has(child.student_id)) {
      throw new Error('Invalid or duplicate child balance');
    }
    seen.add(child.student_id);
    const name = String(child.student_name || '').replace(/[\r\n]/g, ' ').trim();
    if (!name || name.length > 200) throw new Error('Invalid student name');
    const ascii = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0111/g, 'd').replace(/\u0110/g, 'D').replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim().split(/\s+/).slice(-2).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    if (!ascii) throw new Error('Invalid transfer name');
    const transfer = child.transfer_memo || `SEVQR HP${month.slice(5)}${month.slice(2, 4)} ${ascii} ${phone(child.payment_phone).slice(-4)}`;
    lines.push(`${name}: còn cần thanh toán ${remaining.toLocaleString('vi-VN')} VNĐ`);
    for (const debt of child.debts || []) {
      const date = String(debt.month).slice(0, 7);
      lines.push(`  • Tháng ${date.slice(5)}/${date.slice(0, 4)}: ${Number(debt.remaining).toLocaleString('vi-VN')} VNĐ`);
    }
    qrs.push({ kind: 'qr', student_id: child.student_id, url:
      `https://img.vietqr.io/image/${bank.code}-${bank.account}-compact2.png?amount=${remaining}&addInfo=${encodeURIComponent(transfer)}` });
  }
  lines.push('Quý phụ huynh vui lòng thanh toán bằng mã QR của từng con và giữ nguyên nội dung chuyển khoản. Trung tâm trân trọng cảm ơn!');
  const content = lines.join('\n');
  if (content.length > 5000) throw new Error('Grouped notice exceeds message limit');
  // Worker bridge format: strip marker before displaying text, then attach each
  // URL in JSON order. Do not send this envelope through a single-QR dispatcher.
  const groupedContent = `${content}\n__TUITION_QRS__${JSON.stringify(qrs.map(qr => ({
    student_id: qr.student_id, qr_url: qr.url
  })))}`;
  return { children, content, grouped_content: groupedContent,
    parts: [{ kind: 'text', content }, ...qrs] };
}

function createScheduler({ rpc, bank, clock = () => new Date(), convert = lunarDay }) {
  if (typeof rpc !== 'function') throw new TypeError('rpc required');
  async function call(name, args) {
    const result = await rpc(name, args);
    if (!result || result.error) throw new Error(result?.error?.message || `RPC failed: ${name}`);
    return result.data;
  }
  async function dispatchClaimed(job, sendPart, preparePart) {
    if (typeof sendPart !== 'function') throw new TypeError('sendPart required');
    if (!job) return null;
    for (let index = 0; index < job.payload.parts.length; index++) {
      let prepared;
      try {
        // Download and reserve pacing BEFORE the final ledger check, not after it.
        prepared = preparePart ? await preparePart(job.payload.parts[index], job, index) : null;
        const actual = plan(clock(), convert);
        const approved = await call('begin_automatic_tuition_part', {
          p_id: job.id, p_token: job.token, p_index: index,
          p_today: actual.today, p_allowed: actual.allowed, p_slot: actual.due?.slot || 0
        });
        if (!approved) return { id: job.id, status: 'cancelled' };
        const externalId = await sendPart({ uid: job.zalo_uid, part: job.payload.parts[index], jobId: job.id, index, prepared });
        if (typeof externalId !== 'string' || !externalId.trim()) throw new Error('Missing verified message ID');
        await call('finish_automatic_tuition_part', {
          p_id: job.id, p_token: job.token, p_index: index, p_external_id: externalId
        });
      } catch (error) {
        await call('uncertain_automatic_tuition_reminder', {
          p_id: job.id, p_token: job.token, p_error: String(error.message || error).slice(0, 500)
        });
        return { id: job.id, status: 'uncertain' };
      } finally {
        if (prepared?.cleanup) await prepared.cleanup();
      }
    }
    return { id: job.id, status: 'sent' };
  }
  let busy = false;
  return {
    schedule: () => plan(clock(), convert),
    dispatchClaimed,
    async tick() {
      if (busy) return { skipped: 'busy' };
      busy = true;
      try {
        const current = plan(clock(), convert);
        if (!current.allowed || !current.due) return { queued: 0 };
        const candidates = await call('automatic_tuition_candidates', {});
        const currentBank = typeof bank === 'function' ? await bank() : bank;
        let queued = 0;
        for (const candidate of candidates || []) {
          const payload = buildPayload(candidate, current.month, currentBank);
          const inserted = await call('enqueue_automatic_tuition_reminder', {
            p_parent: candidate.parent_id, p_month: `${current.month}-01`,
            p_slot: current.due.slot, p_due: current.due.date, p_today: current.today,
            p_phone: candidate.phone, p_payload: payload
          });
          if (inserted) queued++;
        }
        return { queued };
      } finally { busy = false; }
    },
    // sendPart must resolve only with a verified external message ID. Never retry
    // ambiguous sends, including an acknowledgement failure after Zalo accepted it.
    async dispatchOne(sendPart) {
      if (typeof sendPart !== 'function') throw new TypeError('sendPart required');
      const current = plan(clock(), convert);
      if (!current.allowed || !current.due) return null;
      const jobs = await call('claim_automatic_tuition_reminder', { p_today: current.today, p_slot: current.due.slot });
      const job = jobs?.[0];
      return dispatchClaimed(job, sendPart);
    }
  };
}

module.exports = { TIME_ZONE, SLOTS, vnDate, lunarDay, plan, buildPayload, createScheduler };
