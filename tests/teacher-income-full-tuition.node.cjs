const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('income.html','utf8');
test('teacher income uses full tuition even when no tuition has been collected', () => {
  const start = html.indexOf('      const basicSalaryDetails = calculateSalaryBreakdown(');
  const end = html.indexOf('      // Render KPIs', start);
  const ctx = {
    basicPerSessionActualRevenue: 0, basicPerSessionProjectedRevenue: 50000000,
    teacherSalaryConfig: { base_salary: 3000000, base_tier_percent: 10 },
    totalClassRevenueAllocated: 0, totalCourseRevenue: 0,
    classSummaries: { a: { projectedTeacherRevenue: 50000000 } },
    totalSpecialBonus: 0, totalSpecialProjectedBonus: 2000000, totalCustomBonus: 500000,
    calculateSalaryBreakdown: revenue => ({totalBonus: revenue * 0.1}),
  };
  vm.createContext(ctx);
  vm.runInContext(html.slice(start,end) + '\nthis.result={totalBonus,totalIncome};',ctx);
  assert.equal(ctx.result.totalBonus,7500000);
  assert.equal(ctx.result.totalIncome,10500000);
  assert.equal(ctx.lastTeacherRevenueForProjection,50000000);
});
test('removed KPI nodes have no remaining DOM references and details share the same basis', () => {
  assert.doesNotMatch(html,/kpiRevenue|kpiProjectedIncome|kpiProjectedSub/);
  assert.match(html,/renderMilestones\(basicPerSessionProjectedRevenue, basicSalaryDetails.breakdown\)/);
  assert.match(html,/revenue: classProjRev/);
  assert.match(html,/bonus: classProjBonus/);
  assert.match(html,/totalIncome: effectiveBaseSalary \+ basicProjSal.totalBonus \+ specProjBonus \+ personCustomBonus/);
});
test('inline scripts remain syntactically valid', () => {
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    if (match[1].trim()) new vm.Script(match[1]);
  }
});
