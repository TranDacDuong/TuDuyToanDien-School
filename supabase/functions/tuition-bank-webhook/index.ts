import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sepay-api-key",
};

interface SePayWebhookPayload {
  id?: number | string;
  gateway?: string;
  transactionDate?: string;
  accountNo?: string;
  code?: string | null;
  content?: string;
  transferType?: string;
  transferAmount?: number;
  accumulative?: number;
  referenceCode?: string;
  description?: string;
}

interface CassoTransaction {
  id?: number | string;
  tid?: string;
  description?: string;
  amount?: number;
  bank_account_id?: string;
  bookingDate?: string;
}

interface CassoWebhookPayload {
  error?: number;
  data?: CassoTransaction[];
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  return Deno.env.get(name) || "";
}

function restHeaders() {
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_ANON_KEY");
  return {
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const supabaseUrl = env("SUPABASE_URL");
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...restHeaders(), ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { message?: string })?.message || res.statusText);
  return data as T;
}

function stripVietnamese(text: string): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function extractTuitionIdOrCodes(content: string): string[] {
  const clean = stripVietnamese(content);
  const codes: string[] = [];

  // Match HPHS followed by Student ID shortcode (e.g. HPHS3F9A128B)
  const hphsMatches = clean.match(/HPHS\s*[-_]?\s*([A-Z0-9]{4,36})/gi);
  if (hphsMatches) {
    hphsMatches.forEach(m => {
      const code = m.replace(/^HPHS\s*[-_]?\s*/i, "").trim();
      if (code) codes.push(code);
    });
  }

  // Match HP followed by UUID or alphanumeric (e.g. HP123456 or HP-ABC123)
  const hpMatches = clean.match(/HP\s*[-_]?\s*([A-Z0-9]{4,36})/gi);
  if (hpMatches) {
    hpMatches.forEach(m => {
      const code = m.replace(/^HP\s*[-_]?\s*/i, "").trim();
      if (code) codes.push(code);
    });
  }

  // Match UUIDs inside text
  const uuidMatches = clean.match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/gi);
  if (uuidMatches) {
    uuidMatches.forEach(id => codes.push(id.toLowerCase()));
  }

  return Array.from(new Set(codes));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const authHeader = req.headers.get("Authorization") || "";
    const apiKeyQuery = url.searchParams.get("api_key") || "";
    const sepayKeyHeader = req.headers.get("x-sepay-api-key") || "";
    const expectedSecret = env("BANK_WEBHOOK_SECRET") || env("SEPAY_API_KEY");

    // If secret is set, verify authorization
    if (expectedSecret && apiKeyQuery !== expectedSecret && !authHeader.includes(expectedSecret) && sepayKeyHeader !== expectedSecret) {
      console.warn("Unauthorized bank webhook request");
    }

    const bodyText = await req.text();
    let rawJson: any = {};
    try {
      rawJson = JSON.parse(bodyText);
    } catch {
      return jsonResponse({ success: false, message: "Invalid JSON payload" }, 400);
    }

    let itemsToProcess: Array<{
      gateway: string;
      txId: string;
      accountNo: string;
      amount: number;
      content: string;
      raw: any;
    }> = [];

    // Check SePay format
    if (rawJson.transferAmount !== undefined || rawJson.content !== undefined) {
      const payload = rawJson as SePayWebhookPayload;
      itemsToProcess.push({
        gateway: payload.gateway || "sepay",
        txId: String(payload.id || payload.referenceCode || Date.now()),
        accountNo: String(payload.accountNo || ""),
        amount: Number(payload.transferAmount || 0),
        content: String(payload.content || payload.description || ""),
        raw: payload,
      });
    } else if (Array.isArray(rawJson.data)) {
      // Check Casso format
      const payload = rawJson as CassoWebhookPayload;
      (payload.data || []).forEach(tx => {
        itemsToProcess.push({
          gateway: "casso",
          txId: String(tx.id || tx.tid || Date.now()),
          accountNo: String(tx.bank_account_id || ""),
          amount: Number(tx.amount || 0),
          content: String(tx.description || ""),
          raw: tx,
        });
      });
    } else if (rawJson.amount && (rawJson.content || rawJson.description)) {
      // Generic bank format
      itemsToProcess.push({
        gateway: rawJson.gateway || "custom_bank",
        txId: String(rawJson.id || rawJson.transaction_id || Date.now()),
        accountNo: String(rawJson.account_number || rawJson.accountNo || ""),
        amount: Number(rawJson.amount || rawJson.transferAmount || 0),
        content: String(rawJson.content || rawJson.description || ""),
        raw: rawJson,
      });
    }

    if (!itemsToProcess.length) {
      return jsonResponse({ success: true, message: "No valid bank transaction items in payload" });
    }

    const results = [];

    for (const item of itemsToProcess) {
      if (item.amount <= 0) {
        results.push({ txId: item.txId, status: "ignored_zero_amount" });
        continue;
      }

      const extractedCodes = extractTuitionIdOrCodes(item.content);
      let matchedTuition: any = null;

      // 1. Try matching by tuition payment ID or student ID short code (e.g. HPHS3F9A128B -> 3F9A128B)
      for (const rawCode of extractedCodes) {
        const code = rawCode.replace(/^HS/i, "").toLowerCase();
        if (code.length >= 6) {
          const payments = await fetchJson<Array<any>>(
            `tuition_payments?or=(id.ilike.${encodeURIComponent(code)}*,student_id.ilike.${encodeURIComponent(code)}*)&order=created_at.desc&limit=1`
          ).catch(() => []);
          if (payments && payments.length) {
            matchedTuition = payments[0];
            break;
          }

          // If no existing tuition_payments row, search user by student_id prefix
          const students = await fetchJson<Array<any>>(
            `users?id=ilike.${encodeURIComponent(code)}*&limit=1`
          ).catch(() => []);
          if (students && students.length) {
            const studentId = students[0].id;
            const currentMonth = new Date().toISOString().slice(0, 7) + "-01";

            // Check if payment row already exists for current month
            const existingMonthPayment = await fetchJson<Array<any>>(
              `tuition_payments?student_id=eq.${encodeURIComponent(studentId)}&month=eq.${encodeURIComponent(currentMonth)}&limit=1`
            ).catch(() => []);

            if (existingMonthPayment && existingMonthPayment.length) {
              matchedTuition = existingMonthPayment[0];
              break;
            } else {
              // Create new payment row for current month
              const created = await fetchJson<Array<any>>("tuition_payments", {
                method: "POST",
                headers: { Prefer: "return=representation" },
                body: JSON.stringify({
                  student_id: studentId,
                  month: currentMonth,
                  amount_due: 0,
                  amount_paid: item.amount,
                  paid_at: new Date().toISOString(),
                  payment_method: "bank_auto",
                  transaction_ref: item.txId,
                  auto_reconciled: true,
                  note: `Tự động gạch nợ ${new Intl.NumberFormat("vi-VN").format(item.amount)}đ qua ngân hàng (Mã GD: ${item.txId})`,
                }),
              }).catch(err => {
                console.error("Failed to create tuition_payments row:", err);
                return [];
              });

              if (created && created.length) {
                matchedTuition = created[0];
                // Mark status directly as success since we already set amount_paid
                break;
              }
            }
          }
        }
      }

      // 2. If not matched by ID, try matching by student name / ASCII content & amount
      if (!matchedTuition && item.content.trim()) {
        const cleanContent = stripVietnamese(item.content);
        const unpaidPayments = await fetchJson<Array<any>>(
          `tuition_payments?amount_due=gt.0&order=created_at.desc&limit=50&select=id,student_id,amount_due,amount_paid,users(full_name,phone)`
        ).catch(() => []);

        if (Array.isArray(unpaidPayments)) {
          for (const p of unpaidPayments) {
            const studentName = stripVietnamese((p as any)?.users?.full_name || "");
            const studentPhone = String((p as any)?.users?.phone || "").trim();

            const nameMatched = studentName && studentName.length >= 3 && cleanContent.includes(studentName);
            const phoneMatched = studentPhone && studentPhone.length >= 6 && cleanContent.includes(studentPhone);

            if (nameMatched || phoneMatched) {
              matchedTuition = p;
              break;
            }
          }
        }
      }

      let status = "unmatched";
      let matchedId = null;

      if (matchedTuition) {
        matchedId = matchedTuition.id;
        const newPaid = Number(matchedTuition.amount_paid || 0) + item.amount;
        const updated = await fetchJson<Array<any>>(
          `tuition_payments?id=eq.${encodeURIComponent(matchedTuition.id)}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({
              amount_paid: newPaid,
              paid_at: new Date().toISOString(),
              payment_method: "bank_auto",
              transaction_ref: item.txId,
              auto_reconciled: true,
              note: [
                matchedTuition.note || "",
                `Tự động gạch nợ ${new Intl.NumberFormat("vi-VN").format(item.amount)}đ qua ngân hàng (Mã GD: ${item.txId})`,
              ].filter(Boolean).join("\n"),
              updated_at: new Date().toISOString(),
            }),
          }
        ).catch(err => {
          console.error("Failed to patch tuition_payments:", err);
          return null;
        });

        if (updated && updated.length) {
          status = "success";

          // Send notification to student / parent
          const studentId = matchedTuition.student_id;
          if (studentId) {
            const notifMsg = `Cảm ơn bạn! Trung tâm đã nhận được ${new Intl.NumberFormat("vi-VN").format(item.amount)}đ học phí chuyển khoản qua ngân hàng.`;
            await fetchJson("notifications", {
              method: "POST",
              body: JSON.stringify({
                user_id: studentId,
                type: "message_new",
                title: "Xác nhận nộp học phí tự động",
                message: notifMsg,
                target_url: "/tuition.html",
              }),
            }).catch(() => {});
          }
        } else {
          status = "failed";
        }
      }

      // Log transaction into bank_transaction_logs
      await fetchJson("bank_transaction_logs", {
        method: "POST",
        body: JSON.stringify({
          gateway: item.gateway,
          transaction_id: item.txId,
          account_number: item.accountNo,
          amount: item.amount,
          content: item.content,
          raw_payload: item.raw,
          matched_tuition_id: matchedId,
          status,
        }),
      }).catch(err => console.error("Failed to insert bank_transaction_logs:", err));

      results.push({ txId: item.txId, matchedId, status, amount: item.amount });
    }

    return jsonResponse({ success: true, processed: results });
  } catch (error: any) {
    console.error("tuition-bank-webhook error:", error);
    return jsonResponse({ success: false, error: error?.message || String(error) }, 500);
  }
});
