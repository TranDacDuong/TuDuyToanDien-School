(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TuitionNotice = factory();
})(typeof window === 'undefined' ? globalThis : window, function () {
  const DEFAULT_TEMPLATE = `Trung tâm MindUp xin chào Quý phụ huynh em {TenHS}! 🌸

Trung tâm xin gửi thông báo chi tiết học phí tháng {Thang}/{Nam} của con như sau:
• Lớp học: {TenLop}
• Số buổi học trong tháng: {SoBuoi} buổi
• Số tiền cần thanh toán: {SoTien} VNĐ
• Hạn thanh toán: Trước ngày {HanDong}

Quý phụ huynh có thể thanh toán nhanh bằng cách quét ảnh mã QR đính kèm hoặc chuyển khoản theo thông tin:
• Ngân hàng: {TenNganHang}
• Số tài khoản: {SoTaiKhoan}
• Nội dung chuyển khoản: {NoiDungCK}

(Lưu ý: Quý phụ huynh vui lòng giữ nguyên nội dung chuyển khoản trên để hệ thống tự động gạch nợ ngay khi nhận được tiền).
Trung tâm MindUp xin chân thành cảm ơn Quý phụ huynh! ❤️`;
  const fmt = value => new Intl.NumberFormat('vi-VN').format(Math.round(value));
  function render(item, ym, bank, template = DEFAULT_TEMPLATE) {
    const [year, month] = ym.split('-');
    const values = {TenHS:item.studentName || '',TenPH:item.parentName || 'Quý phụ huynh',
      Thang:month,Nam:year,TenLop:item.className || '',SoBuoi:String(item.sessionsCount || 0),
      SoTien:fmt(item.remaining),HanDong:`15/${month}/${year}`,TenNganHang:bank.bankName,
      SoTaiKhoan:bank.account,NoiDungCK:item.transferMemo || ''};
    let content = (template || DEFAULT_TEMPLATE).replace(/\{(TenHS|TenPH|Thang|Nam|TenLop|SoBuoi|SoTien|HanDong|TenNganHang|SoTaiKhoan|NoiDungCK)\}/g, (_,key)=>values[key]);
    if (item.debts?.length > 1 || item.debts?.some(d=>d.month.slice(0,7)!==ym)) {
      content += '\n\nChi tiết công nợ đã lưu:\n'+item.debts.map(d=>`• Tháng ${d.month.slice(5,7)}/${d.month.slice(0,4)}: ${fmt(d.remaining)}đ`).join('\n')+
        `\nTổng còn phải đóng: ${fmt(item.remaining)}đ. Thanh toán cho tháng cũ nhất trước.`;
    }
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
