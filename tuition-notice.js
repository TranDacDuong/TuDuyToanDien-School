(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TuitionNotice = factory();
})(typeof window === 'undefined' ? globalThis : window, function () {
  const DEFAULT_TEMPLATE = `Trung tâm MindUp kính gửi Quý phụ huynh thông báo học phí của em {TenHS} tháng {Thang} năm {Nam}:
Tổng số tiền: {SoTien}đ bao gồm học phí của {CacThang}.
Ngân hàng: {TenNganHang}
Số tài khoản: {SoTaiKhoan}
Nội dung chuyển khoản: {NoiDungCK}
Gửi kèm: {AnhDinhKem} (mỗi ảnh kèm theo số tiền trong từng tháng) và ảnh QR chuyển khoản chung.`;
  const fmt = value => new Intl.NumberFormat('vi-VN').format(Math.round(value));
  function render(item, ym, bank, template = DEFAULT_TEMPLATE) {
    const [year, month] = ym.split('-');
    const months=[...new Set((item.debts?.length?item.debts:[{month:ym}]).map(d=>d.month.slice(0,7)))].sort();
    const sameYear=months.every(m=>m.slice(0,4)===year);
    const labels=months.map(m=>sameYear?String(Number(m.slice(5))):`${Number(m.slice(5))}/${m.slice(0,4)}`);
    const values = {TenHS:item.studentName || '',TenPH:item.parentName || 'Quý phụ huynh',
      Thang:String(Number(month)),Nam:year,TenLop:item.className || '',SoBuoi:String(item.sessionsCount || 0),
      CacThang:`${labels.length>1?'các tháng':'tháng'} ${labels.join(', ')}`,AnhDinhKem:labels.map(m=>`Ảnh điểm danh tháng ${m}`).join(', '),
      SoTien:fmt(item.remaining),HanDong:`15/${month}/${year}`,TenNganHang:bank.bankName,
      SoTaiKhoan:bank.account,NoiDungCK:item.transferMemo || ''};
    let content = (template || DEFAULT_TEMPLATE).replace(/\{(TenHS|TenPH|Thang|Nam|TenLop|SoBuoi|SoTien|HanDong|TenNganHang|SoTaiKhoan|NoiDungCK|CacThang|AnhDinhKem)\}/g, (_,key)=>values[key]);
    return content;
  }
  function build({month,parentName,children,bank,rows=[],template}) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !children?.length) throw Error('Invalid tuition notice');
    const students=children.map(child=>{
      const details=rows.filter(r=>r.studentId===child.student_id);
      if (!Number.isSafeInteger(Number(child.remaining)) || Number(child.remaining)<=0) throw Error('Invalid tuition balance');
      const memo=child.transfer_memo;
      if (!memo) throw Error('Missing registered transfer memo');
      return {id:child.student_id,name:child.student_name,remaining:Number(child.remaining),debts:child.debts||[],memo,rows:details,
        qrUrl:`https://img.vietqr.io/image/${bank.code}-${bank.account}-compact2.png?amount=${child.remaining}&addInfo=${encodeURIComponent(memo)}`,
        text:render({studentName:child.student_name,parentName,remaining:Number(child.remaining),debts:child.debts,transferMemo:memo,
          className:[...new Set(details.map(r=>r.className))].join(', ')||'Theo lớp đang theo học',
          sessionsCount:details.reduce((n,r)=>n+Number(r.billableSessions||0),0)},month,bank,template||DEFAULT_TEMPLATE)};
    });
    return {text:students.map(s=>s.text).join('\n\n──────────\n\n'),students};
  }
  function parseCommand(value,now=new Date()) {
    if (typeof value!=='string' || !/^#hocphi(?:\s|$)/i.test(value.trim())) return null;
    const match=value.trim().match(/^#hocphi(?:\s+(0?[1-9]|1[0-2])\/(20\d{2}))?$/i);
    if (!match) throw Error('Dùng #hocphi hoặc #hocphi 11/2026');
    const current=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).formatToParts(now);
    const ym=match[1]?`${match[2]}-${match[1].padStart(2,'0')}`:`${current.find(p=>p.type==='year').value}-${current.find(p=>p.type==='month').value}`;
    return {month:ym};
  }
  function deliveryState(row) {
    if(row.status!=='uncertain')return null;
    if(Number(row.completed_parts||0)>0 || row.sent_at)return 'Chưa gửi đủ nội dung/ảnh';
    const error=String(row.error_message||'');
    const unknown=row.possibly_delivered || (/no message id|missing.*message.*id|timeout|timed out|network|fetch failed|interrupted|uncertain delivery/i.test(error) && !/chuẩn bị|chưa phát tin|tải ảnh/i.test(error));
    return unknown?'Chưa xác nhận gửi':'Không gửi được';
  }
  return {DEFAULT_TEMPLATE,render,build,parseCommand,deliveryState};
});
