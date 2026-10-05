const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-zalo-gateway-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function tokenMatches(actual: string, expected: string) {
  if (!expected || !actual || actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function rpc(name: string, body: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Gateway is not configured");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Database operation failed: ${response.status}`);
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("ZALO_GATEWAY_TOKEN") || "";
  if (!tokenMatches(request.headers.get("x-zalo-gateway-token") || "", expected)) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = await request.json();
    if (payload.action === "automaticTuitionConfig") {
      return json({ data: await rpc("automatic_tuition_config", {}) });
    }
    if (payload.action === "automaticTuitionCandidates") {
      return json({ data: await rpc("automatic_tuition_candidates", {}) });
    }
    const automaticActions: Record<string, { rpc: string; fields: string[] }> = {
      enqueueAutomaticTuition: { rpc: "enqueue_automatic_tuition_reminder", fields:
        ["p_parent", "p_month", "p_slot", "p_due", "p_today", "p_phone", "p_payload"] },
      beginAutomaticTuitionPart: { rpc: "begin_automatic_tuition_part", fields:
        ["p_id", "p_token", "p_index", "p_today", "p_allowed", "p_slot"] },
      finishAutomaticTuitionPart: { rpc: "finish_automatic_tuition_part", fields:
        ["p_id", "p_token", "p_index", "p_external_id"] },
      uncertainAutomaticTuition: { rpc: "uncertain_automatic_tuition_reminder", fields:
        ["p_id", "p_token", "p_error"] },
    };
    const automaticAction = Object.hasOwn(automaticActions, payload.action) ? automaticActions[payload.action] : null;
    if (automaticAction) {
      const args = payload.args;
      if (!args || typeof args !== "object" || Array.isArray(args) ||
        automaticAction.fields.some(field => args[field] === undefined || args[field] === null) ||
        ["p_parent", "p_id", "p_token"].some(field => field in args &&
          (typeof args[field] !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args[field]))) ||
        ["p_month", "p_due", "p_today"].some(field => field in args &&
          (typeof args[field] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(args[field]) || !Number.isFinite(Date.parse(args[field])))) ||
        ("p_index" in args && (!Number.isInteger(args.p_index) || args.p_index < 0 || args.p_index > 300)) ||
        ("p_slot" in args && ![0, 5, 10, 15].includes(args.p_slot)) ||
        ("p_allowed" in args && typeof args.p_allowed !== "boolean") ||
        ("p_phone" in args && (typeof args.p_phone !== "string" || !/^(0\d{9}|84\d{9})$/.test(args.p_phone))) ||
        ("p_payload" in args && (!args.p_payload || typeof args.p_payload !== "object" || JSON.stringify(args.p_payload).length > 100000)) ||
        ("p_external_id" in args && (typeof args.p_external_id !== "string" || !args.p_external_id.trim() || args.p_external_id.length > 220)) ||
        ("p_error" in args && (typeof args.p_error !== "string" || args.p_error.length > 500))) {
        return json({ error: "Invalid automatic tuition request" }, 400);
      }
      const body = Object.fromEntries(automaticAction.fields.map(field => [field, args[field]]));
      return json({ data: await rpc(automaticAction.rpc, body) });
    }
    if (payload.action === "syncState") {
      return json({ state: await rpc("get_mindup_zalo_sync_state", {}) });
    }
    if (payload.action === "claimDispatch") {
      const pacing = payload.pacing;
      if (!pacing || !Number.isInteger(pacing.spacingSeconds) ||
        !Number.isInteger(pacing.batchSize) || !Number.isInteger(pacing.batchPauseSeconds)) {
        return json({ error: "Invalid dispatch pacing" }, 400);
      }
      const schedule = payload.automaticSchedule;
      if (schedule && (typeof schedule.today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(schedule.today) ||
        typeof schedule.allowed !== "boolean" || (schedule.due && ![5, 10, 15].includes(schedule.due.slot)))) {
        return json({ error: "Invalid automatic tuition schedule" }, 400);
      }
      const job = await rpc("claim_next_mindup_zalo_dispatch_with_automatic", {
        p_spacing_seconds: pacing.spacingSeconds,
        p_batch_size: pacing.batchSize,
        p_batch_pause_seconds: pacing.batchPauseSeconds,
        p_today: schedule?.today || null,
        p_slot: schedule?.due?.slot || 0,
        p_allowed: schedule?.allowed === true,
      });
      return json({ job });
    }
    if (payload.action === "reserveAutomaticTuitionSlot") {
      const pacing = payload.pacing;
      if (typeof payload.jobId !== "string" || typeof payload.token !== "string" ||
        !pacing || !Number.isInteger(pacing.spacingSeconds) || !Number.isInteger(pacing.batchSize) ||
        !Number.isInteger(pacing.batchPauseSeconds)) return json({ error: "Invalid automatic dispatch slot" }, 400);
      return json({ sendAt: await rpc("reserve_automatic_tuition_dispatch_slot", {
        p_id: payload.jobId, p_token: payload.token, p_spacing_seconds: pacing.spacingSeconds,
        p_batch_size: pacing.batchSize, p_batch_pause_seconds: pacing.batchPauseSeconds,
      }) });
    }
    if (payload.action === "reserveDispatchSlot") {
      const pacing = payload.pacing;
      if (!pacing || !Number.isInteger(pacing.spacingSeconds) ||
        !Number.isInteger(pacing.batchSize) || !Number.isInteger(pacing.batchPauseSeconds)) {
        return json({ error: "Invalid dispatch pacing" }, 400);
      }
      return json({ sendAt: await rpc("reserve_mindup_zalo_dispatch_slot", {
        p_spacing_seconds: pacing.spacingSeconds,
        p_batch_size: pacing.batchSize,
        p_batch_pause_seconds: pacing.batchPauseSeconds,
      }) });
    }
    if (["claim", "claimTuition", "claimTuitionReceipt"].includes(payload.action)) {
      return json({ error: "Restart the updated bot to use unified dispatch" }, 409);
    }
    if (payload.action === "claimManualParentAction") {
      return json({ dispatch: await rpc("claim_manual_parent_zalo_action", { p_allow_alias: payload.allowAlias !== false }) });
    }
    if (payload.action === "claimParent") {
      const rows = await rpc("claim_zalo_parent_check", {});
      return json({ job: rows?.[0] || null });
    }
    if (payload.action === "pauseAutomation") {
      await rpc("pause_zalo_parent_automation", {
        p_reason: typeof payload.reason === "string" ? payload.reason.slice(0, 500) : null,
      });
      return json({ ok: true });
    }
    if (payload.action === "queueParentGreeting") {
      if (typeof payload.parentId !== "string" || typeof payload.phone !== "string" ||
        typeof payload.uid !== "string" || typeof payload.content !== "string") {
        return json({ error: "Invalid greeting" }, 400);
      }
      return json({ jobId: await rpc("enqueue_mindup_parent_greeting", {
        p_parent_id: payload.parentId, p_phone: payload.phone,
        p_uid: payload.uid, p_content: payload.content,
      }) });
    }
    if (payload.action === "markParentAttempt") {
      if (typeof payload.parentId !== "string" || typeof payload.phone !== "string" ||
        !["invite", "greeting"].includes(payload.kind)) {
        return json({ error: "Invalid contact action" }, 400);
      }
      await rpc("mark_zalo_parent_attempt", {
        p_parent_id: payload.parentId, p_phone: payload.phone, p_action: payload.kind,
      });
      return json({ ok: true });
    }
    if (payload.action === "finishParent") {
      if (typeof payload.parentId !== "string" || typeof payload.phone !== "string" ||
        !["friend", "invited", "not_friend", "not_found", "rate_limited", "error"].includes(payload.status)) {
        return json({ error: "Invalid contact result" }, 400);
      }
      await rpc("finish_zalo_parent_check", {
        p_parent_id: payload.parentId,
        p_phone: payload.phone,
        p_uid: typeof payload.uid === "string" ? payload.uid : null,
        p_status: payload.status,
        p_invited: payload.invited === true,
        p_greeted: payload.greeted === true,
        p_error: typeof payload.error === "string" ? payload.error.slice(0, 500) : null,
        p_invite_attempted: payload.inviteAttempted === true,
        p_greeting_attempted: payload.greetingAttempted === true,
      });
      return json({ ok: true });
    }
    if (payload.action === "finishTuition") {
      if (typeof payload.jobId !== "string" || !["sent", "failed", "uncertain"].includes(payload.status)) {
        return json({ error: "Invalid tuition result" }, 400);
      }
      await rpc("finish_mindup_tuition_dispatch", {
        p_kind: "tuition",
        p_external_id: typeof payload.externalId === "string" ? payload.externalId : null,
        p_job_id: payload.jobId,
        p_status: payload.status,
        p_qr_sent: payload.qrSent === true,
        p_error: typeof payload.error === "string" ? payload.error.slice(0, 500) : null,
      });
      return json({ ok: true });
    }
    if (payload.action === "finishTuitionReceipt") {
      if (typeof payload.jobId !== "string" || !["sent", "failed", "uncertain"].includes(payload.status)) {
        return json({ error: "Invalid tuition receipt result" }, 400);
      }
      await rpc("finish_mindup_tuition_dispatch", {
        p_kind: "receipt",
        p_external_id: typeof payload.externalId === "string" ? payload.externalId : null,
        p_job_id: payload.jobId,
        p_status: payload.status,
        p_error: typeof payload.error === "string" ? payload.error.slice(0, 500) : null,
      });
      return json({ ok: true });
    }
    if (payload.action === "finish") {
      if (typeof payload.jobId !== "string" || !["sent", "failed", "uncertain"].includes(payload.status)) {
        return json({ error: "Invalid completion" }, 400);
      }
      if (payload.status === "sent" && (typeof payload.externalId !== "string" ||
        !payload.externalId.trim() || payload.externalId.length > 220)) {
        return json({ error: "Zalo message id is required" }, 400);
      }
      await rpc("finish_mindup_zalo_message_v2", {
        p_job_id: payload.jobId,
        p_status: payload.status,
        p_error: typeof payload.error === "string" ? payload.error.slice(0, 500) : null,
        p_external_id: payload.status === "sent" ? payload.externalId : null,
      });
      return json({ ok: true });
    }
    if (payload.action === "incoming") {
      const { externalId, zaloUid, content, displayName } = payload;
      if (typeof externalId !== "string" || typeof zaloUid !== "string" || typeof content !== "string") {
        return json({ error: "Invalid message" }, 400);
      }
      const result = await rpc("ingest_mindup_zalo_message", {
        p_external_id: externalId,
        p_zalo_uid: zaloUid,
        p_content: content,
        p_display_name: typeof displayName === "string" ? displayName : null,
      });
      return json({ result });
    }
    if (payload.action === "syncMessage") {
      const { externalId, zaloUid, content, displayName, isSelf, sentAt, isHistory } = payload;
      if (typeof externalId !== "string" || typeof zaloUid !== "string" ||
        typeof content !== "string" || typeof isSelf !== "boolean" ||
        !externalId.trim() || externalId.length > 220 || !zaloUid.trim() || zaloUid.length > 100 ||
        !content.trim() || content.length > 10000 ||
        typeof isHistory !== "boolean" ||
        (sentAt !== null && sentAt !== undefined &&
          (typeof sentAt !== "string" || !Number.isFinite(Date.parse(sentAt))))) {
        return json({ error: "Invalid synchronized message" }, 400);
      }
      const result = await rpc("sync_mindup_zalo_message", {
        p_external_id: externalId,
        p_zalo_uid: zaloUid,
        p_content: content,
        p_display_name: typeof displayName === "string" ? displayName : null,
        p_is_self: isSelf,
        p_sent_at: typeof sentAt === "string" ? sentAt : null,
        p_is_history: isHistory,
      });
      return json({ result });
    }
    if (payload.action === "linkParent") {
      const { externalId, phone, zaloUid, isFriend } = payload;
      if (typeof externalId !== "string" || externalId.length > 220 ||
        typeof phone !== "string" || !/^(0\d{9}|84\d{9})$/.test(phone) ||
        typeof zaloUid !== "string" || !zaloUid || zaloUid.length > 100 ||
        typeof isFriend !== "boolean") {
        return json({ error: "Invalid parent link command" }, 400);
      }
      const result = await rpc("link_zalo_parent_from_command", {
        p_external_id: externalId,
        p_phone: phone,
        p_zalo_uid: zaloUid,
        p_is_friend: isFriend,
      });
      return json({ result });
    }
    if (payload.action === "recordParentAlias") {
      const { externalId, alias, error } = payload;
      if (typeof externalId !== "string" || externalId.length > 220 ||
        (alias !== null && typeof alias !== "string") ||
        (error !== null && typeof error !== "string")) {
        return json({ error: "Invalid parent alias result" }, 400);
      }
      await rpc("record_zalo_parent_alias", {
        p_external_id: externalId,
        p_alias: typeof alias === "string" ? alias.slice(0, 100) : null,
        p_error: typeof error === "string" ? error.slice(0, 500) : null,
      });
      return json({ ok: true });
    }
    if (payload.action === "claimParentAlias") {
      const rows = await rpc("claim_zalo_parent_alias_job", {});
      return json({ job: rows?.[0] || null });
    }
    if (payload.action === "finishParentAlias") {
      const { jobId, status, alias, error, relationshipStatus } = payload;
      if (typeof jobId !== "string" || !["success", "skipped", "failed"].includes(status) ||
        (alias !== null && typeof alias !== "string") ||
        (error !== null && typeof error !== "string") ||
        (relationshipStatus !== null && !["friend", "invited", "not_friend"].includes(relationshipStatus))) {
        return json({ error: "Invalid parent alias completion" }, 400);
      }
      await rpc("finish_zalo_parent_alias_job", {
        p_job_id: jobId,
        p_status: status,
        p_alias: typeof alias === "string" ? alias.slice(0, 100) : null,
        p_error: typeof error === "string" ? error.slice(0, 500) : null,
        p_relationship_status: typeof relationshipStatus === "string" ? relationshipStatus : null,
      });
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("Zalo gateway operation failed", error);
    return json({ error: "Gateway operation failed" }, 500);
  }
});
