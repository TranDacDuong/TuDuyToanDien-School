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
  accountNumber?: string;
  code?: string | null;
  content?: string;
  transferType?: string;
  transferAmount?: number;
  accumulative?: number;
  accumulated?: number;
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

function normalizeDirection(value: unknown, amount: number): "in" | "out" {
  const clean = String(value || "").trim().toLowerCase();
  if (["out", "withdraw", "withdrawal", "debit", "chi"].includes(clean)) return "out";
  if (["in", "deposit", "credit", "thu"].includes(clean)) return "in";
  return amount < 0 ? "out" : "in";
}

function normalizeTransactionAt(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();
  const withTimezone = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(" ", "T")}+07:00`
    : raw;
  const parsed = new Date(withTimezone);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function tuitionDescription(studentName: string, monthValue: string): string {
  const monthDate = new Date(`${String(monthValue || "").slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(monthDate.getTime())) {
    return `Học phí của em ${studentName || "học sinh"}`;
  }
  return `Học phí của em ${studentName || "học sinh"} tháng ${monthDate.getMonth() + 1} năm ${monthDate.getFullYear()}`;
}

interface ParsedCodeInfo {
  month?: string;
  code?: string;
  studentName?: string;
  phoneSuffix?: string;
}

function extractTuitionParsedInfo(content: string): ParsedCodeInfo[] {
  const clean = stripVietnamese(content);
  const infos: ParsedCodeInfo[] = [];

  // Match NEW format: SEVQR HP{MM}{YY} {2_words_name} {4_digits_phone}
  // e.g. "SEVQR HP0926 Dac Duong 5267" or "HP0926 Dac Duong 5267"
  const newFormatMatches = clean.match(/(?:SEVQR\s+)?HP\s*(\d{2})(\d{2})\s+([A-Za-z0-9\s]+?)\s+(\d{4})(?:\s|$|[^\w])/gi);
  if (newFormatMatches) {
    newFormatMatches.forEach(m => {
      const match = /(?:SEVQR\s+)?HP\s*(\d{2})(\d{2})\s+([A-Za-z0-9\s]+?)\s+(\d{4})(?:\s|$|[^\w])/i.exec(m);
      if (match) {
        const mm = match[1];
        const yy = match[2];
        const studentName = match[3].trim().toLowerCase();
        const phoneSuffix = match[4];
        const year = Number(yy) > 50 ? `19${yy}` : `20${yy}`;
        const monthStr = `${year}-${mm}-01`;
        infos.push({ month: monthStr, studentName, phoneSuffix, code: phoneSuffix });
      }
    });
  }

  // Match HPHS or HP followed by 4 digits (MMYY) and shortcode (e.g. HPHS082651DA1870 or HPHS0826 51DA1870)
  const monthCodeMatches = clean.match(/(?:HPHS|HP)\s*[-_]?\s*(\d{4})\s*[-_]?\s*([A-Z0-9]{4,36})/gi);
  if (monthCodeMatches) {
    monthCodeMatches.forEach(m => {
      const match = /(?:HPHS|HP)\s*[-_]?\s*(\d{2})(\d{2})\s*[-_]?\s*([A-Z0-9]{4,36})/i.exec(m);
      if (match) {
        const mm = match[1];
        const yy = match[2];
        const studentCode = match[3].toLowerCase();
        const year = Number(yy) > 50 ? `19${yy}` : `20${yy}`;
        const monthStr = `${year}-${mm}-01`;
        infos.push({ month: monthStr, code: studentCode });
      }
    });
  }

  // Match HPHS without month (legacy format HPHS3F9A128B)
  const hphsMatches = clean.match(/HPHS\s*[-_]?\s*([A-Z0-9]{4,36})/gi);
  if (hphsMatches) {
    hphsMatches.forEach(m => {
      const raw = m.replace(/^HPHS\s*[-_]?\s*/i, "").trim().toLowerCase();
      if (raw && !/^\d{4}/.test(raw)) {
        infos.push({ code: raw });
      }
    });
  }

  // Match HP without month
  const hpMatches = clean.match(/HP\s*[-_]?\s*([A-Z0-9]{4,36})/gi);
  if (hpMatches) {
    hpMatches.forEach(m => {
      const raw = m.replace(/^HP\s*[-_]?\s*/i, "").trim().toLowerCase();
      if (raw && !/^\d{4}/.test(raw)) {
        infos.push({ code: raw });
      }
    });
  }

  // Match UUIDs inside text
  const uuidMatches = clean.match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/gi);
  if (uuidMatches) {
    uuidMatches.forEach(id => infos.push({ code: id.toLowerCase() }));
  }

  return infos;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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
      direction: "in" | "out";
      transactionAt: string;
      accumulative: number | null;
      content: string;
      raw: any;
    }> = [];

    // Check SePay format
    if (rawJson.transferAmount !== undefined || rawJson.content !== undefined) {
      const payload = rawJson as SePayWebhookPayload;
      const rawAmount = Number(payload.transferAmount || 0);
      itemsToProcess.push({
        gateway: payload.gateway || "sepay",
        txId: String(payload.id || payload.referenceCode || Date.now()),
        accountNo: String(payload.accountNo || payload.accountNumber || ""),
        amount: Math.abs(rawAmount),
        direction: normalizeDirection(payload.transferType, rawAmount),
        transactionAt: normalizeTransactionAt(payload.transactionDate),
        accumulative: (payload.accumulative !== undefined || payload.accumulated !== undefined)
          && Number.isFinite(Number(payload.accumulative ?? payload.accumulated))
          ? Number(payload.accumulative ?? payload.accumulated)
          : null,
        content: String(payload.content || payload.description || ""),
        raw: payload,
      });
    } else if (Array.isArray(rawJson.data)) {
      // Check Casso format
      const payload = rawJson as CassoWebhookPayload;
      (payload.data || []).forEach(tx => {
        const rawAmount = Number(tx.amount || 0);
        itemsToProcess.push({
          gateway: "casso",
          txId: String(tx.id || tx.tid || Date.now()),
          accountNo: String(tx.bank_account_id || ""),
          amount: Math.abs(rawAmount),
          direction: normalizeDirection(undefined, rawAmount),
          transactionAt: normalizeTransactionAt(tx.bookingDate),
          accumulative: null,
          content: String(tx.description || ""),
          raw: tx,
        });
      });
    } else if (rawJson.amount && (rawJson.content || rawJson.description)) {
      // Generic bank format
      const rawAmount = Number(rawJson.amount || rawJson.transferAmount || 0);
      itemsToProcess.push({
        gateway: rawJson.gateway || "custom_bank",
        txId: String(rawJson.id || rawJson.transaction_id || Date.now()),
        accountNo: String(rawJson.account_number || rawJson.accountNo || ""),
        amount: Math.abs(rawAmount),
        direction: normalizeDirection(rawJson.direction || rawJson.transferType, rawAmount),
        transactionAt: normalizeTransactionAt(rawJson.transaction_at || rawJson.transactionDate || rawJson.created_at),
        accumulative: rawJson.accumulative !== undefined && rawJson.accumulative !== null && Number.isFinite(Number(rawJson.accumulative))
          ? Number(rawJson.accumulative)
          : null,
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

      // Atomically reserve the bank transaction before changing tuition. The unique
      // constraint closes the race where two callbacks could both credit one payment.
      const claimedLogs = await fetchJson<Array<any>>(
        "bank_transaction_logs?on_conflict=gateway,transaction_id",
        {
          method: "POST",
          headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
          body: JSON.stringify({
            gateway: item.gateway,
            transaction_id: item.txId,
            account_number: item.accountNo,
            amount: item.amount,
            content: item.content,
            raw_payload: item.raw,
            status: "failed",
            direction: item.direction,
            signed_amount: item.direction === "out" ? -item.amount : item.amount,
            transaction_at: item.transactionAt,
            accumulative: item.accumulative,
            entry_source: "bank",
          }),
        }
      ).catch(err => {
        console.error("Failed to reserve bank transaction:", err);
        return null;
      });
      if (!claimedLogs) {
        results.push({ txId: item.txId, status: "log_reservation_failed" });
        continue;
      }
      if (!claimedLogs.length) {
        results.push({ txId: item.txId, status: "duplicate_ignored" });
        continue;
      }

      // Outgoing transactions belong to the cash ledger but never pay tuition.
      if (item.direction === "out") {
        await fetchJson(
          `bank_transaction_logs?gateway=eq.${encodeURIComponent(item.gateway)}&transaction_id=eq.${encodeURIComponent(item.txId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ status: "resolved" }),
          },
        ).catch(err => console.error("Failed to finalize outgoing bank transaction:", err));
        results.push({ txId: item.txId, status: "recorded_outgoing", amount: item.amount });
        continue;
      }

      // Registered bundles are reconciled atomically, oldest month first. Never
      // allow a failed bundle lookup to fall through to the single-month parser.
      let bundleResult: any;
      try {
        bundleResult = await fetchJson<any>("rpc/reconcile_tuition_bundle", {
          method: "POST", body: JSON.stringify({ p_log_id: claimedLogs[0].id }),
        });
      } catch (err) {
        console.error("Bundle reconciliation failed:", err);
        results.push({ txId: item.txId, status: "failed" });
        continue;
      }
      if (bundleResult?.handled) {
        results.push({ txId: item.txId, ...bundleResult, amount: item.amount });
        continue;
      }
      const parsedInfos = extractTuitionParsedInfo(item.content);
      let matchedTuition: any = null;

      // 1. Try matching by parsed info (new format: studentName + phoneSuffix + month, or legacy code)
      for (const info of parsedInfos) {
        // A. Match by Name + Phone suffix + Month
        if (info.studentName && info.phoneSuffix && info.month) {
          const allStudents = await fetchJson<Array<any>>(
            `users?role=eq.student&select=id,full_name,phone&limit=300`
          ).catch(() => []);

          const matchedStudents = (allStudents || []).filter(u => {
            const studentPhone = String(u.phone || "").replace(/\D/g, "");
            const nameAscii = stripVietnamese(u.full_name || "").toLowerCase();
            const phoneMatch = studentPhone.endsWith(info.phoneSuffix!);
            const nameMatch = nameAscii.includes(info.studentName!);
            return phoneMatch && nameMatch;
          });

          let targetStudent = matchedStudents[0];
          // Fallback: match by phone suffix only if name had slight spelling variation
          if (!targetStudent) {
            targetStudent = (allStudents || []).find(u => {
              const studentPhone = String(u.phone || "").replace(/\D/g, "");
              return studentPhone && studentPhone.endsWith(info.phoneSuffix!);
            });
          }
          // Fallback: match by name only
          if (!targetStudent) {
            targetStudent = (allStudents || []).find(u => {
              const nameAscii = stripVietnamese(u.full_name || "").toLowerCase();
              return nameAscii && nameAscii.includes(info.studentName!);
            });
          }

          if (targetStudent) {
            const monthPayments = await fetchJson<Array<any>>(
              `tuition_payments?student_id=eq.${targetStudent.id}&month=eq.${info.month}&limit=1`
            ).catch(() => []);

            if (monthPayments && monthPayments.length) {
              matchedTuition = monthPayments[0];
              break;
            } else {
              const created = await fetchJson<Array<any>>("tuition_payments", {
                method: "POST",
                headers: { Prefer: "return=representation" },
                body: JSON.stringify({
                  student_id: targetStudent.id,
                  month: info.month,
                  amount_due: 0,
                  amount_paid: 0,
                  paid_at: null,
                  payment_method: "bank_auto",
                  transaction_ref: item.txId,
                  auto_reconciled: true,
                }),
              }).catch(() => []);

              if (created && created.length) {
                matchedTuition = created[0];
                break;
              }
            }
          }
        }

        // B. Match by short UUID code
        const cleanCode = (info.code || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
        if (cleanCode.length >= 4) {
          if (info.month) {
            const allStudents = await fetchJson<Array<any>>(
              `users?role=eq.student&select=id,full_name,phone&limit=200`
            ).catch(() => []);

            const student = (allStudents || []).find(u => {
              const uid = String(u.id || "").replace(/-/g, "").toLowerCase();
              return uid.startsWith(cleanCode);
            });

            if (student) {
              const monthPayments = await fetchJson<Array<any>>(
                `tuition_payments?student_id=eq.${student.id}&month=eq.${info.month}&limit=1`
              ).catch(() => []);

              if (monthPayments && monthPayments.length) {
                matchedTuition = monthPayments[0];
                break;
              } else {
                const created = await fetchJson<Array<any>>("tuition_payments", {
                  method: "POST",
                  headers: { Prefer: "return=representation" },
                  body: JSON.stringify({
                    student_id: student.id,
                    month: info.month,
                    amount_due: 0,
                    amount_paid: 0,
                    paid_at: null,
                    payment_method: "bank_auto",
                    transaction_ref: item.txId,
                    auto_reconciled: true,
                  }),
                }).catch(() => []);

                if (created && created.length) {
                  matchedTuition = created[0];
                  break;
                }
              }
            }
          }

          // Fallback: Fetch tuition_payments and match in memory to avoid PostgreSQL UUID ilike operator errors
          const allPayments = await fetchJson<Array<any>>(
            `tuition_payments?order=created_at.desc&limit=100`
          ).catch(() => []);

          if (Array.isArray(allPayments)) {
            matchedTuition = allPayments.find(p => {
              const sid = String(p.student_id || "").replace(/-/g, "").toLowerCase();
              const pid = String(p.id || "").replace(/-/g, "").toLowerCase();
              return sid.startsWith(cleanCode) || pid.startsWith(cleanCode);
            });
          }

          if (matchedTuition) break;
        }
      }

      // 2. If not matched by ID, try matching by student name / ASCII content & amount
      if (!matchedTuition && item.content.trim()) {
        const cleanContent = stripVietnamese(item.content);
        const unpaidPayments = await fetchJson<Array<any>>(
          `tuition_payments?amount_due=gt.0&order=created_at.desc&limit=50&select=id,student_id,month,amount_due,amount_paid,users(full_name,phone)`
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
      let businessDescription: string | null = null;

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

          const students = await fetchJson<Array<any>>(
            `users?id=eq.${encodeURIComponent(matchedTuition.student_id)}&select=full_name&limit=1`,
          ).catch(() => []);
          businessDescription = tuitionDescription(
            String(students?.[0]?.full_name || "học sinh"),
            String(matchedTuition.month || ""),
          );

          await fetchJson("rpc/enqueue_zalo_tuition_receipt", {
            method: "POST",
            body: JSON.stringify({
              p_payment_id: matchedTuition.id,
              p_received_amount: item.amount,
              p_event_key: `bank:${item.gateway}:${item.txId}`.slice(0, 200),
            }),
          }).catch(err => console.error("Failed to queue Zalo tuition receipt:", err));

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

      await fetchJson(
        `bank_transaction_logs?gateway=eq.${encodeURIComponent(item.gateway)}&transaction_id=eq.${encodeURIComponent(item.txId)}`,
        {
        method: "PATCH",
        body: JSON.stringify({
          matched_tuition_id: matchedId,
          status,
          business_description: businessDescription,
        }),
      }).catch(err => console.error("Failed to update bank_transaction_logs:", err));

      results.push({ txId: item.txId, matchedId, status, amount: item.amount });
    }

    return jsonResponse({ success: true, processed: results });
  } catch (error: any) {
    console.error("tuition-bank-webhook error:", error);
    return jsonResponse({ success: false, error: error?.message || String(error) }, 500);
  }
});
