(function (root) {
  function memo(name, phone, debts) {
    const words = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim().split(/\s+/).filter(Boolean).slice(-2)
      .map(word => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    const digits = String(phone || '').replace(/\D/g, '');
    if (!words || !/^(0\d{9}|84\d{9})$/.test(digits)) throw Error('Thiếu tên hoặc SĐT học sinh hợp lệ');
    const months = [...new Set(debts.filter(d => Number(d.remaining) > 0).map(d => String(d.month).slice(0, 7)))].sort();
    if (!months.length || months.some(m => !/^20\d{2}-(0[1-9]|1[0-2])$/.test(m))) throw Error('Tháng công nợ không hợp lệ');
    return `SEVQR HP${months.map(m => m.slice(5) + m.slice(2, 4)).join(' ')} ${words} ${digits.slice(-4)}`;
  }
  function total(debts) {
    return debts.reduce((sum, debt) => {
      const amount = Number(debt.remaining);
      if (!Number.isSafeInteger(amount) || amount < 0) throw Error('Công nợ không hợp lệ');
      return sum + amount;
    }, 0);
  }
  const api = { memo, total };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TuitionArrears = api;
})(typeof window === 'undefined' ? this : window);
