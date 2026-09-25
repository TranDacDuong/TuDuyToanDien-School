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
    if (payload.action === "claim") {
      const rows = await rpc("claim_mindup_zalo_message", {});
      return json({ job: rows?.[0] || null });
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
    if (payload.action === "claimTuition") {
      const rows = await rpc("claim_zalo_tuition_delivery", {});
      return json({ job: rows?.[0] || null });
    }
    if (payload.action === "finishTuition") {
      if (typeof payload.jobId !== "string" || !["sent", "failed", "uncertain"].includes(payload.status)) {
        return json({ error: "Invalid tuition result" }, 400);
      }
      await rpc("finish_zalo_tuition_delivery", {
        p_job_id: payload.jobId,
        p_status: payload.status,
        p_qr_sent: payload.qrSent === true,
        p_error: typeof payload.error === "string" ? payload.error.slice(0, 500) : null,
      });
      return json({ ok: true });
    }
    if (payload.action === "claimTuitionReceipt") {
      const rows = await rpc("claim_zalo_tuition_receipt", {});
      return json({ job: rows?.[0] || null });
    }
    if (payload.action === "finishTuitionReceipt") {
      if (typeof payload.jobId !== "string" || !["sent", "failed", "uncertain"].includes(payload.status)) {
        return json({ error: "Invalid tuition receipt result" }, 400);
      }
      await rpc("finish_zalo_tuition_receipt", {
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
      await rpc("finish_mindup_zalo_message", {
        p_job_id: payload.jobId,
        p_status: payload.status,
        p_error: typeof payload.error === "string" ? payload.error.slice(0, 500) : null,
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
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("Zalo gateway operation failed", error);
    return json({ error: "Gateway operation failed" }, 500);
  }
});
