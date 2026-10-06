'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'class_manage.js'), 'utf8');
const toggle = source.slice(source.indexOf('  window.cvToggleAtt ='), source.indexOf('  window.cvStopStudent ='));

function harness({ ended = true, saveError, rpcError, rpcThrows = false, withBot = false } = {}) {
  const calls = [];
  const alerts = [];
  const button = { style: {}, setAttribute() {} };
  const attendanceMap = {};
  const sb = { from(table) {
    assert.equal(table, 'attendance');
    return { upsert: async (rows, options) => { calls.push({ type: 'save', rows, options }); return { error: saveError }; } };
  }, async rpc(name, args) {
    calls.push({ type: 'rpc', name, args });
    if (rpcThrows) throw new Error('network offline');
    return { error: rpcError };
  } };
  const window = withBot ? { MindUpBot: {
    sendAbsentMessage() { assert.fail('direct absence send must never run'); },
    sendConsecutiveAbsentMessage() { assert.fail('history-based absence send must never run'); },
    sendSessionEvaluationWidget() {}
  } } : {};
  vm.runInNewContext(toggle, { window, getSb: () => sb, _attendanceMap: attendanceMap, _cachedClass: null,
    document: { getElementById: () => button }, statusCycle: ['present', 'absent', 'makeup', 'trial'],
    statusMap: Object.fromEntries(['present', 'absent', 'makeup', 'trial'].map(status => [status, { cls: status, text: status }])),
    todayStr: () => '2026-10-06', todayInVietnam: () => '2026-10-06', hasAttendanceSessionEnded: () => ended,
    alert: value => alerts.push(value), console: { warn() {} } });
  return { window, calls, alerts, button, attendanceMap };
}

test('deliberate absence only saves attendance, before or after class', async () => {
  for (const [withBot, ended] of [[false, false], [true, false], [false, true], [true, true]]) {
    const h = harness({ withBot, ended });
    assert.equal(h.calls.length, 0);
    await h.window.cvToggleAtt('class', 'student', '2026-10-06', 'present', '268', 2);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].type, 'save');
    assert.equal(h.calls[0].rows[0].status_overridden, true);
    assert.equal(h.calls[0].rows[0].status, 'absent');
    assert.equal(h.alerts.length, 0);
  }
});

test('future dates, old dates, non-absent saves and failed writes never notify', async () => {
  for (const [options, date, current] of [
    [{}, '2026-10-07', 'present'],
    [{}, '2026-10-05', 'present'],
    [{}, '2026-10-06', 'absent'],
    [{}, '2026-10-06', 'makeup'],
    [{}, '2026-10-06', 'trial'],
    [{ saveError: { message: 'save failed' } }, '2026-10-06', 'present']
  ]) {
    const h = harness(options);
    await h.window.cvToggleAtt('class', 'student', date, current, 268, 2);
    assert.equal(h.calls.filter(call => call.type === 'rpc').length, 0);
    assert.equal(h.button.disabled, false);
    if (options.saveError) assert.equal(h.attendanceMap[`student_${date}_268`], current);
  }
});

test('absence today uses the Vietnam date across UTC midnight boundaries', () => {
  const fn = source.slice(source.indexOf('  function todayInVietnam('), source.indexOf('  function monthStart('));
  for (const [now, expected] of [['2026-10-05T16:59:59Z', '2026-10-05'], ['2026-10-05T17:00:00Z', '2026-10-06'], ['2026-10-06T23:00:00Z', '2026-10-07']]) {
    class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
    const ctx = vm.createContext({ Date: FixedDate, Intl });
    vm.runInContext(fn, ctx);
    assert.equal(ctx.todayInVietnam(), expected);
  }
});

test('absence saving has no notification RPC dependency', async () => {
  for (const options of [{ rpcError: { message: 'permission denied' } }, { rpcThrows: true }]) {
    const h = harness({ ...options, withBot: true });
    await h.window.cvToggleAtt('class', 'student', '2026-10-06', 'present', 268, 2);
    assert.equal(h.calls.length, 1);
    assert.equal(h.attendanceMap['student_2026-10-06_268'], 'absent');
    assert.equal(h.button.disabled, false);
    assert.equal(h.alerts.length, 0);
  }
});

test('attendance clicks never call the immediate notification RPC', () => {
  assert.equal((source.match(/rpc\('notify_explicit_attendance_absence'/g) || []).length, 0);
  assert.doesNotMatch(source, /\.sendAbsentMessage\(|\.sendConsecutiveAbsentMessage\(/);
});

test('actual session-ended gate respects end time, overnight sessions and missing schedules', () => {
  const fn = source.slice(source.indexOf('  function hasAttendanceSessionEnded('), source.indexOf('  function getSessionDatesFromBaseDate('));
  for (const [now, schedule, expected] of [
    ['2026-10-06T18:59:59', { start_time: '17:00', end_time: '19:00' }, false],
    ['2026-10-06T19:00:00', { start_time: '17:00', end_time: '19:00' }, true],
    ['2026-10-06T23:30:00', { start_time: '23:00', end_time: '01:00' }, false],
    ['2026-10-07T01:00:00', { start_time: '23:00', end_time: '01:00' }, true],
    ['2026-10-06T23:30:00', null, false]
  ]) {
    class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
    const ctx = vm.createContext({ Date: FixedDate, getScheduleForAttendance: () => schedule });
    vm.runInContext(fn, ctx);
    assert.equal(ctx.hasAttendanceSessionEnded('2026-10-06', 268, 2), expected);
  }
});
