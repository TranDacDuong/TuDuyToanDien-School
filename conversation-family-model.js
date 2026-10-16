(function (root) {
  function summarize(student, month, calculator) {
    const source = student.finance;
    if (!source) return null;
    const current = (source.payments || []).find(p => String(p.month).slice(0,7) === month);
    const rows = calculator.buildRowsForMonth({ ...source, ym: month, payments: current ? {[student.id]:current} : {} }, {
      currentRole:'admin', discountRules:source.discountRules || []
    }).filter(row=>row.studentId===student.id);
    const due = rows.length ? rows.reduce((n,r)=>n+Number(r.amount || 0),0) : Number(current?.amount_due || 0);
    const paid = Number(current?.amount_paid || 0);
    const debts = (source.payments || []).filter(p=>String(p.month).slice(0,7)<month && Number(p.amount_due)>Number(p.amount_paid))
      .map(p=>({month:String(p.month).slice(0,7),remaining:Number(p.amount_due)-Number(p.amount_paid)}));
    const oldDebt = debts.reduce((n,p)=>n+p.remaining,0);
    const credit = (source.payments || []).filter(p=>String(p.month).slice(0,7)<month)
      .reduce((n,p)=>n+Math.max(0,Number(p.amount_paid)-Number(p.amount_due)),0)+Math.max(0,paid-due);
    return {rows,due,paid,discount:rows.length?rows.reduce((n,r)=>n+Number(r.discountAmount || 0),0):Number(current?.discount_amount || 0),
      remaining:Math.max(0,due-paid),oldDebt,total:oldDebt+Math.max(0,due-paid),credit,debts,
      payments:source.payments || [],calculated:rows.length>0};
  }
  const api={summarize};
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.ConversationFamilyModel=api;
})(typeof window==='object'?window:globalThis);
