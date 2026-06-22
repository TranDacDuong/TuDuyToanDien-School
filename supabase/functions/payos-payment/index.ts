const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function env(name: string) {
  return Deno.env.get(name) || "";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceHeaders(extra: Record<string, string> = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

async function rest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: { ...serviceHeaders(), ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || body?.error || response.statusText);
  return body as T;
}

// Convert accented characters to unaccented characters (ASCII)
function toAscii(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Build transaction-friendly transfer description (max 25 characters)
function buildTransferDescription(studentName: string, phone: string, month: string): string {
  const cleanName = toAscii(studentName).toUpperCase();
  const cleanPhone = phone.replace(/\D/g, "");
  const [year, m] = month.split("-");
  
  // Format: "[Clean Student Name] [Phone] NOP HP T[Month]" -> e.g. "NGUYEN VAN ANH 0987654321 NOP HP T06"
  let desc = `${cleanName} ${cleanPhone} NOP HP T${m}`.replace(/\s+/g, " ").trim();
  
  // If it exceeds 25 characters, fallback to first name + phone + NOP HP T[Month]
  if (desc.length > 25) {
    const nameParts = cleanName.split(/\s+/);
    const firstName = nameParts[nameParts.length - 1] || "HS";
    desc = `${firstName} ${cleanPhone} NOP HP T${m}`.replace(/\s+/g, " ").trim();
  }
  
  return desc.slice(0, 25).toUpperCase();
}

// HMAC-SHA256 signature generator
async function hmacSha256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyBuf = encoder.encode(key);
  const dataBuf = encoder.encode(data);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", cryptoKey, dataBuf);
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Reconstruct signature query string by sorting keys alphabetically
function getSignatureDataString(data: any): string {
  const sortedKeys = Object.keys(data).sort();
  const pairs = sortedKeys.map((key) => {
    let val = data[key];
    if (val === null || val === undefined) {
      val = "";
    } else if (typeof val === "object") {
      val = JSON.stringify(val);
    }
    return `${key}=${val}`;
  });
  return pairs.join("&");
}

async function authorizeUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Unauthorized");
  
  const response = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: `Bearer ${token}` },
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) throw new Error("Unauthorized");
  return user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname;

  // Endpoint: Create payment link
  if (req.method === "POST" && path.endsWith("/create-link")) {
    try {
      const user = await authorizeUser(req);
      const body = await req.json().catch(() => ({}));
      const { studentId, month, amount } = body;

      if (!studentId || !month) {
        return json({ error: "Missing studentId or month" }, 400);
      }

      // 1. Fetch student info
      const studentProfile = await rest<any[]>(`users?id=eq.${studentId}&select=id,full_name,phone&limit=1`);
      if (!studentProfile.length) {
        return json({ error: "Student not found" }, 404);
      }
      const student = studentProfile[0];

      // 2. Fetch or calculate tuition payment amount
      const monthStart = month + "-01";
      const paymentRecord = await rest<any[]>(
        `tuition_payments?student_id=eq.${studentId}&month=eq.${monthStart}&select=*&limit=1`
      );
      
      let amountToPay = Number(amount || 0);
      let paymentId = "";
      
      if (paymentRecord.length > 0) {
        const record = paymentRecord[0];
        paymentId = record.id;
        if (record.amount_paid >= record.amount_due) {
          return json({ error: "Học phí tháng này đã được đóng đủ." }, 400);
        }
        if (!amountToPay) {
          amountToPay = Number(record.amount_due) - Number(record.amount_paid);
        }
      } else {
        return json({ error: "Không tìm thấy hóa đơn học phí của tháng này. Vui lòng liên hệ Admin." }, 400);
      }

      if (amountToPay <= 0) {
        return json({ error: "Số tiền cần thanh toán phải lớn hơn 0đ." }, 400);
      }

      // 3. Generate dynamic VietQR details with PayOS
      const orderCode = Math.floor(Date.now() / 1000) * 100 + Math.floor(Math.random() * 100);
      const description = buildTransferDescription(student.full_name, student.phone || "0000000000", month);
      
      // Build PayOS request payloads
      const originUrl = req.headers.get("origin") || `${url.protocol}//${url.host}`;
      const cancelUrl = `${originUrl}/tuition.html?month=${encodeURIComponent(month)}&payment=cancelled`;
      const returnUrl = `${originUrl}/tuition.html?month=${encodeURIComponent(month)}&payment=success`;
      
      const checksumData = `amount=${amountToPay}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
      const signatureKey = env("PAYOS_CHECKSUM_KEY");
      if (!signatureKey) {
        return json({ error: "Server Configuration Error: Missing PayOS Checksum Key" }, 500);
      }
      const signature = await hmacSha256(signatureKey, checksumData);

      const payosBody = {
        orderCode,
        amount: amountToPay,
        description,
        cancelUrl,
        returnUrl,
        signature,
      };

      // 4. Send request to PayOS
      const payosHeaders = {
        "x-client-id": env("PAYOS_CLIENT_ID"),
        "x-api-key": env("PAYOS_API_KEY"),
        "Content-Type": "application/json",
      };

      if (!payosHeaders["x-client-id"] || !payosHeaders["x-api-key"]) {
        return json({ error: "Server Configuration Error: Missing PayOS API Credentials" }, 500);
      }

      const payosResponse = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
        method: "POST",
        headers: payosHeaders,
        body: JSON.stringify(payosBody),
      });

      const payosResult = await payosResponse.json();
      if (!payosResponse.ok || payosResult.code !== "00") {
        throw new Error(payosResult.desc || "Failed to create PayOS payment request");
      }

      // 5. Update database record with PayOS orderCode
      await rest(`tuition_payments?id=eq.${paymentId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          payos_order_code: orderCode,
          payos_link_id: payosResult.data.paymentLinkId,
          payos_status: "PENDING",
        }),
      });

      return json({
        ok: true,
        checkoutUrl: payosResult.data.checkoutUrl,
        qrCode: payosResult.data.qrCode,
        amount: amountToPay,
        description,
        orderCode,
      });

    } catch (error) {
      console.error("Create payment link failed:", error);
      return json({ error: error instanceof Error ? error.message : "Internal Server Error" }, 500);
    }
  }

  // Endpoint: PayOS Webhook
  if (req.method === "POST" && path.endsWith("/webhook")) {
    try {
      const body = await req.json().catch(() => ({}));
      const { data, signature } = body;

      if (!data || !signature) {
        return json({ error: "Missing data or signature" }, 400);
      }

      // 1. Verify PayOS Webhook Signature
      const signatureKey = env("PAYOS_CHECKSUM_KEY");
      const signatureDataString = getSignatureDataString(data);
      const computedSignature = await hmacSha256(signatureKey, signatureDataString);

      if (computedSignature !== signature) {
        console.warn("PayOS webhook invalid signature");
        return json({ error: "Invalid signature" }, 400);
      }

      // 2. Handle successful payment
      if (data.desc === "success" || data.code === "00") {
        const orderCode = Number(data.orderCode);
        
        // Find matching tuition payment record
        const paymentRecord = await rest<any[]>(
          `tuition_payments?payos_order_code=eq.${orderCode}&select=*&limit=1`
        );

        if (paymentRecord.length > 0) {
          const record = paymentRecord[0];
          
          // Double check if payment is already processed
          if (record.amount_paid < record.amount_due) {
            // Standard update: mark as paid fully
            await rest(`tuition_payments?id=eq.${record.id}`, {
              method: "PATCH",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify({
                amount_paid: record.amount_due,
                paid_at: new Date().toISOString(),
                note: record.note ? `${record.note}\n[Thanh toán tự động qua PayOS]` : "[Thanh toán tự động qua PayOS]",
                payos_status: "PAID",
              }),
            });
            console.log(`Processed PayOS payment for tuition: ${record.id}, orderCode: ${orderCode}`);
          }
        } else {
          console.warn(`PayOS webhook received for unknown orderCode: ${orderCode}`);
        }
      }

      return json({ ok: true });

    } catch (error) {
      console.error("Webhook processing failed:", error);
      return json({ error: error instanceof Error ? error.message : "Internal Server Error" }, 500);
    }
  }

  return json({ error: "Not found" }, 404);
});
