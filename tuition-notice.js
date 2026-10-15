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
    if (item.debts?.length > 1 || (item.debts?.length && item.debts[0].month.slice(0,7) !== ym)) {
      const lines = item.debts.map(debt => {
        const [y,m] = debt.month.slice(0,7).split('-');
        return `• Tháng ${m}/${y}: còn thiếu ${fmt(debt.remaining)}đ`;
      }).join('\n');
      return `Trung tâm MindUp kính gửi Quý phụ huynh ${item.parentName || ""} thông báo học phí còn thiếu của em ${item.studentName}:\n\n${lines}\n\nTổng cần thanh toán: ${fmt(item.remaining)}đ.\nNgân hàng: ${bank.bankName}\nSố tài khoản: ${bank.account}\nNội dung chuyển khoản: ${item.transferMemo}\n\nQuý phụ huynh vui lòng quét ảnh QR đính kèm và giữ nguyên nội dung chuyển khoản. Tiền được thanh toán cho tháng cũ nhất trước. Trung tâm xin cảm ơn!`;
    }
    const values = {TenHS:item.studentName || '',TenPH:item.parentName || 'Quý phụ huynh',
      Thang:month,Nam:year,TenLop:item.className || '',SoBuoi:String(item.sessionsCount || 0),
      SoTien:fmt(item.remaining),HanDong:`15/${month}/${year}`,TenNganHang:bank.bankName,
      SoTaiKhoan:bank.account,NoiDungCK:item.transferMemo || ''};
    return template.replace(/\{(TenHS|TenPH|Thang|Nam|TenLop|SoBuoi|SoTien|HanDong|TenNganHang|SoTaiKhoan|NoiDungCK)\}/g, (_,key)=>values[key]);
  }
  return {DEFAULT_TEMPLATE,render};
});
