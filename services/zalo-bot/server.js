const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3456;
const HOST = '127.0.0.1';
const GATEWAY_URL = process.env.ZALO_GATEWAY_URL || '';
const GATEWAY_TOKEN = process.env.ZALO_GATEWAY_TOKEN || '';
const ALLOWED_ORIGINS = new Set([
  'https://www.mindup.edu.vn',
  'https://mindup.edu.vn',
  'https://tuduytoandien.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

app.use(cors({ origin(origin, callback) {
  callback(null, !origin || ALLOWED_ORIGINS.has(origin));
} }));
app.use((req, res, next) => {
  if (!['127.0.0.1', 'localhost'].includes(String(req.headers.host || '').split(':')[0])) {
    return res.status(403).json({ error: 'Local access only' });
  }
  next();
});
app.use(express.json());
let gatewayBusy = false;
let gatewayListening = false;
let nextGatewaySendAt = 0;
let nextParentPollAt = 0;
let gatewayBatchCount = 0;
const pendingIncoming = new Map();
let flushingIncoming = false;

async function gatewayRequest(payload) {
  if (!GATEWAY_URL || !GATEWAY_TOKEN) throw new Error('Zalo gateway is not configured');
  const response = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-zalo-gateway-token': GATEWAY_TOKEN },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Gateway HTTP ${response.status}`);
  return response.json();
}

async function syncGatewayOutbox() {
  if (gatewayBusy || !zaloApi || !GATEWAY_URL || !GATEWAY_TOKEN
    || campaignStatus !== 'idle' || Date.now() < nextGatewaySendAt) return;
  gatewayBusy = true;
  try {
    const { job } = await gatewayRequest({ action: 'claim' });
    if (!job) return;
    scheduleNextGatewayAction();
    try {
      await zaloApi.sendMessage(job.content, job.zalo_uid);
      try {
        await gatewayRequest({ action: 'finish', jobId: job.job_id, status: 'sent' });
      } catch (ackError) {
        // An unacknowledged send must never be retried automatically.
        console.error('[ZaloBot] Tin đã gửi nhưng chưa xác nhận được:', ackError);
      }
    } catch (error) {
      await gatewayRequest({ action: 'finish', jobId: job.job, status: 'uncertain', error: String(error?.message || error) });
    }
  } catch (error) {
    console.warn('[ZaloBot] Không đồng bộ được hàng đợi:', error?.message || error);
  } finally {
    gatewayBusy = false;
  }
}

function scheduleNextGatewayAction() {
  gatewayBatchCount++;
  const pauseSeconds = gatewayBatchCount >= botConfig.batchSize
    ? botConfig.batchPauseMinutes * 60 : 0;
  if (pauseSeconds) gatewayBatchCount = 0;
  nextGatewaySendAt = Date.now() + (pauseSeconds || getRandomDelay(
    botConfig.minDelaySeconds, botConfig.maxDelaySeconds)) * 1000;
}

function isZaloLimitError(error) {
  return /rate.?limit|quota|too many|429|giới hạn|thao tác quá nhiều|tạm khóa/i
    .test(String(error?.message || error));
}

function buildParentGreeting(studentName, recipientKey) {
  const student = String(studentName || '').trim();
  const child = student ? `em ${student}` : 'con';
  const opening = student
    ? `Trung tâm MindUp xin chào Quý phụ huynh của em ${student}!`
    : 'Trung tâm MindUp xin chào Quý phụ huynh!';
  const variants = [
    `MindUp vừa gửi lời mời kết bạn Zalo tới anh/chị. Đây là kênh liên hệ của trung tâm để cập nhật lịch học, nhận xét học tập, kết quả kiểm tra và thông tin học phí của ${child}. Anh/chị vui lòng xác nhận lời mời; khi cần trao đổi, cứ nhắn tại đây để nhân sự phụ trách tiếp nhận và phản hồi. Cảm ơn anh/chị đã đồng hành cùng MindUp!`,
    `Chúng tôi gửi lời mời kết bạn để việc trao đổi về ${child} được thuận tiện hơn. Qua cuộc trò chuyện này, MindUp sẽ thông báo lịch học, tình hình học tập, điểm kiểm tra và học phí; anh/chị cũng có thể nhắn lại mọi thắc mắc cho trung tâm. Mong anh/chị xác nhận lời mời kết bạn. MindUp cảm ơn anh/chị!`,
    `MindUp rất vui được đồng hành cùng gia đình trong quá trình học tập của ${child}. Trung tâm vừa gửi lời mời kết bạn Zalo; sau khi anh/chị xác nhận, chúng tôi sẽ dùng kênh này để gửi lịch học, đánh giá học tập, kết quả kiểm tra và nhắc học phí khi cần. Nếu có điều gì muốn trao đổi, anh/chị hãy nhắn trực tiếp tại đây. Xin cảm ơn anh/chị!`,
    `Để anh/chị tiện theo dõi việc học của ${child}, MindUp đã gửi lời mời kết bạn từ tài khoản trung tâm. Khi kết nối, các thông báo về lịch học, nhận xét, điểm kiểm tra và học phí sẽ được gửi qua cuộc trò chuyện này. Anh/chị có thể phản hồi ngay tại đây, nhân sự phụ trách sẽ hỗ trợ. Rất mong anh/chị xác nhận lời mời. MindUp xin cảm ơn!`
  ];
  const hash = [...String(recipientKey || student)].reduce((value, char) => value + char.charCodeAt(0), 0);
  return `${opening}\n\n${variants[hash % variants.length]}`;
}

async function checkQueuedParent(job) {
  const result = {
    action: 'finishParent', parentId: job.parent_id, phone: job.phone,
    uid: job.zalo_uid || null, status: 'error', invited: false, greeted: false,
    error: null
  };
  try {
    const phone = job.phone.startsWith('0') ? `84${job.phone.slice(1)}` : job.phone;
    let uid = job.zalo_uid || friendPhoneMap.get(phone)?.userId || null;
    if (!uid) {
      const found = await zaloApi.findUser(phone);
      if (!found?.uid) {
        result.status = 'not_found';
        await gatewayRequest(result);
        return;
      }
      uid = String(found.uid);
    }
    result.uid = String(uid);
    const relationship = await zaloApi.getFriendRequestStatus(result.uid);
    if (!relationship) throw new Error('Không đọc được trạng thái kết bạn');
    if (relationship.is_friend === 1) {
      result.status = 'friend';
    } else if (relationship.is_requested === 1) {
      await zaloApi.acceptFriendRequest(result.uid);
      result.status = 'friend';
    } else {
      result.status = relationship.is_requesting === 1 || job.invitation_sent_at ? 'invited' : 'not_friend';
      if (result.status === 'not_friend' && !job.invitation_attempted_at) {
        await gatewayRequest({ action: 'markParentAttempt', parentId: job.parent_id,
          phone: job.phone, kind: 'invite' });
        await zaloApi.sendFriendRequest(
          `MindUp xin chào Quý phụ huynh${job.student_name ? ` của em ${job.student_name}` : ''}. Mong anh/chị đồng ý kết bạn để tiện trao đổi việc học của con.`, result.uid);
        result.invited = true;
        result.status = 'invited';
      }
    }
    if (!job.greeting_attempted_at && (result.status === 'friend' ||
      (result.status === 'invited' && (result.invited || job.invitation_sent_at)))) {
      await gatewayRequest({ action: 'markParentAttempt', parentId: job.parent_id,
        phone: job.phone, kind: 'greeting' });
      await zaloApi.sendMessage(buildParentGreeting(job.student_name, job.parent_id), result.uid);
      result.greeted = true;
    }
  } catch (error) {
    result.status = isZaloLimitError(error) ? 'rate_limited'
      : (result.status === 'friend' ? 'friend'
        : (result.invited || job.invitation_sent_at ? 'invited' : 'error'));
    result.error = String(error?.message || error);
    console.warn('[ZaloBot] Kiểm tra phụ huynh:', result.error);
  }
  await gatewayRequest(result);
}

async function sendQueuedTuition(job) {
  let qrSent = false;
  try {
    await zaloApi.sendMessage(job.content, job.zalo_uid);
  } catch (error) {
    if (isZaloLimitError(error)) {
      await gatewayRequest({ action: 'pauseAutomation', reason: String(error?.message || error) });
    }
    await gatewayRequest({ action: 'finishTuition', jobId: job.job_id,
      status: 'uncertain', error: String(error?.message || error) });
    return;
  }
  let qrError = null;
  if (job.qr_url) {
    const tempFile = path.join(__dirname, 'temp', `tuition_${job.job_id}.png`);
    try {
      fs.mkdirSync(path.dirname(tempFile), { recursive: true });
      await downloadImage(job.qr_url, tempFile);
      await zaloApi.sendMessage({ msg: 'Mã QR thanh toán học phí MindUp', attachments: [tempFile] }, job.zalo_uid);
      qrSent = true;
    } catch (error) {
      qrError = `Đã gửi nội dung, ảnh QR lỗi: ${error?.message || error}`;
    } finally {
      try { fs.unlinkSync(tempFile); } catch (_) {}
    }
  }
  await gatewayRequest({ action: 'finishTuition', jobId: job.job_id,
    status: 'sent', qrSent, error: qrError });
}

async function syncParentTuition() {
  if (gatewayBusy || !zaloApi || !GATEWAY_URL || !GATEWAY_TOKEN ||
    campaignStatus !== 'idle' || Date.now() < nextGatewaySendAt) return;
  gatewayBusy = true;
  let processed = false;
  try {
    const { job: tuitionJob } = await gatewayRequest({ action: 'claimTuition' });
    if (tuitionJob) {
      processed = true;
      await sendQueuedTuition(tuitionJob);
      return;
    }
    if (Date.now() < nextParentPollAt) return;
    nextParentPollAt = Date.now() + 5 * 60 * 1000;
    const { job: parentJob } = await gatewayRequest({ action: 'claimParent' });
    if (parentJob) {
      processed = true;
      await checkQueuedParent(parentJob);
    }
  } catch (error) {
    console.warn('[ZaloBot] Đồng bộ phụ huynh/học phí:', error?.message || error);
  } finally {
    if (processed) {
      scheduleNextGatewayAction();
      nextParentPollAt = nextGatewaySendAt;
    }
    gatewayBusy = false;
  }
}

async function flushIncoming() {
  if (flushingIncoming || !GATEWAY_URL || !GATEWAY_TOKEN || !pendingIncoming.size) return;
  flushingIncoming = true;
  try {
    for (const [key, payload] of pendingIncoming) {
      try {
        await gatewayRequest(payload);
        pendingIncoming.delete(key);
        persistIncoming();
      } catch (error) {
        console.warn('[ZaloBot] Chờ gửi lại tin nhận:', error?.message || error);
        break;
      }
    }
  } finally {
    flushingIncoming = false;
  }
}

function startGatewayListener() {
  if (!zaloApi || gatewayListening || !GATEWAY_URL || !GATEWAY_TOKEN) return;
  gatewayListening = true;
  zaloApi.listener.on('message', (message) => {
    if (message.isSelf || message.type !== 0) return;
    const content = message.data?.content;
    if (typeof content !== 'string' || !content.trim()) return;
    const externalId = String(message.data?.msgId || message.data?.cliMsgId || '');
    const zaloUid = String(message.threadId || '');
    if (!externalId || !zaloUid) return;
    const payload = {
      action: 'incoming', externalId: `${zaloUid}:${externalId}`, zaloUid,
      content, displayName: String(message.data?.dName || '')
    };
    if (pendingIncoming.size >= 1000) {
      console.error('[ZaloBot] Hàng đợi tin nhận đầy, cần kiểm tra kết nối gateway');
      return;
    }
    pendingIncoming.set(payload.externalId, payload);
    try { persistIncoming(); } catch (error) {
      console.error('[ZaloBot] Không lưu được tin nhận trên máy:', error);
    }
    flushIncoming().catch(console.error);
  });
  zaloApi.listener.on('error', error => console.warn('[ZaloBot] Zalo listener:', error));
  zaloApi.listener.start({ retryOnClose: true });
}

// Session and Storage setup
const SESSION_DIR = path.join(__dirname, 'session');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');
const INCOMING_FILE = path.join(SESSION_DIR, 'pending-incoming.json');
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}
try {
  for (const payload of JSON.parse(fs.readFileSync(INCOMING_FILE, 'utf8'))) {
    if (payload?.externalId) pendingIncoming.set(payload.externalId, payload);
  }
} catch (error) {
  if (error.code !== 'ENOENT') console.error('[ZaloBot] Không đọc được tin nhận đang chờ:', error);
}

function persistIncoming() {
  const tempFile = `${INCOMING_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify([...pendingIncoming.values()]), { mode: 0o600 });
  fs.renameSync(tempFile, INCOMING_FILE);
}

// Bot State
let botStatus = 'disconnected'; // 'disconnected' | 'qr_ready' | 'connected'
let qrCodeDataUrl = null;
let userInfo = null;
let zaloInstance = null;
let zaloApi = null;
let isLoggingIn = false;

let friendPhoneMap = new Map();
let friendUserIdSet = new Set();
let completedResults = [];

async function syncFriendsList() {
  if (!zaloApi || typeof zaloApi.getAllFriends !== 'function') return;
  try {
    console.log("[ZaloBot] Đang đồng bộ danh bạ bạn bè Zalo vào bộ nhớ cache...");
    const res = await zaloApi.getAllFriends().catch(() => null);
    const friends = (res && Array.isArray(res)) ? res : (res && res.data && Array.isArray(res.data)) ? res.data : [];

    friendPhoneMap.clear();
    friendUserIdSet.clear();

    for (const f of friends) {
      const uid = String(f.userId || f.uid || '');
      if (uid) friendUserIdSet.add(uid);

      const rawPhone = String(f.phoneNumber || f.phone || '').replace(/\D/g, '');
      if (rawPhone) {
        friendPhoneMap.set(rawPhone, f);
        if (rawPhone.startsWith('84')) {
          friendPhoneMap.set('0' + rawPhone.substring(2), f);
        } else if (rawPhone.startsWith('0')) {
          friendPhoneMap.set('84' + rawPhone.substring(1), f);
        }
      }
    }
    console.log(`[ZaloBot] ✓ Đã đồng bộ ${friendUserIdSet.size} bạn bè vào bộ nhớ cache!`);
  } catch (err) {
    console.warn("[ZaloBot] Lỗi khi đồng bộ danh bạ bạn bè:", err?.message || err);
  }
}

// Campaign Queue State
let campaignQueue = [];
let campaignStatus = 'idle'; // 'idle' | 'running' | 'paused'
let isWorkerRunning = false;
let currentProgress = {
  total: 0,
  sent: 0,
  friendRequested: 0,
  failed: 0,
  skipped: 0,
  currentStudent: '',
  currentPhone: '',
  nextSendInSeconds: 0,
  batchCount: 0
};

// Anti-ban configuration
let botConfig = {
  minDelaySeconds: 45,
  maxDelaySeconds: 90,
  batchSize: 50,
  batchPauseMinutes: 30
};

const https = require('https');
const http = require('http');

// Helper: Download image to local file for Zalo attachment upload
function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} khi tải ảnh QR`));
      }
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(destPath);
      });
      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Timeout khi tải ảnh QR từ VietQR'));
    });
  });
}

// Helper: Random Delay (Anti-Ban)
function getRandomDelay(minSec, maxSec) {
  return Math.floor(Math.random() * (maxSec - minSec + 1) + minSec);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// Zalo Connection Management
// ==========================================
async function initZaloClient(forceQr = false) {
  if (isLoggingIn && !forceQr) return;
  isLoggingIn = true;

  try {
    let zca;
    try {
      zca = require('zca-js');
    } catch (e) {
      console.warn("[ZaloBot] Chưa tải được thư viện zca-js.");
      isLoggingIn = false;
      return;
    }

    const { Zalo, LoginQRCallbackEventType } = zca;
    if (!Zalo) {
      isLoggingIn = false;
      return;
    }

    zaloInstance = new Zalo({
      selfListen: false,
      checkUpdate: false,
      imageMetadataGetter: async (filePath) => {
        try {
          const buf = Buffer.alloc(32);
          const fd = fs.openSync(filePath, 'r');
          fs.readSync(fd, buf, 0, 32, 0);
          fs.closeSync(fd);
          const width = buf.readUInt32BE(16) || 540;
          const height = buf.readUInt32BE(20) || 640;
          const size = fs.statSync(filePath).size;
          return { width, height, size };
        } catch (e) {
          return { width: 540, height: 640, size: 100000 };
        }
      }
    });

    // 1. Try saved session if available and not forcing new QR
    if (!forceQr && fs.existsSync(SESSION_FILE)) {
      try {
        const savedSession = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        if (savedSession && savedSession.cookie && savedSession.imei) {
          console.log("[ZaloBot] Thử khôi phục đăng nhập bằng phiên đã lưu...");
          const api = await zaloInstance.login(savedSession);
          if (api) {
            zaloApi = api;
            botStatus = 'connected';
            qrCodeDataUrl = null;
            console.log("[ZaloBot] ✓ Đăng nhập bằng session cũ thành công!");
            syncFriendsList().catch(console.error);
            startGatewayListener();
            isLoggingIn = false;
            return;
          }
        }
      } catch (sessErr) {
        console.warn("[ZaloBot] Session cũ hết hạn hoặc không hợp lệ, sẽ quét QR mới:", sessErr?.message || sessErr);
      }
    }

    // 2. Start QR login flow
    botStatus = 'qr_ready';
    console.log("[ZaloBot] Đang tạo mã QR đăng nhập...");

    zaloInstance.loginQR({}, (event) => {
      if (!event) return;

      if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
        if (event.data && event.data.image) {
          const rawBase64 = event.data.image.replace(/^data:image\/png;base64,/, '');
          qrCodeDataUrl = `data:image/png;base64,${rawBase64}`;
          botStatus = 'qr_ready';
          console.log("[ZaloBot] ✓ Đã sinh mã QR đăng nhập. Sẵn sàng quét trên app Zalo!");
        }
      } else if (event.type === LoginQRCallbackEventType.QRCodeScanned) {
        console.log("[ZaloBot] 📱 Mã QR đã được quét. Vui lòng bấm [Xác nhận đăng nhập] trên điện thoại!");
      } else if (event.type === LoginQRCallbackEventType.QRCodeExpired) {
        console.log("[ZaloBot] Mã QR đã hết hạn.");
        botStatus = 'disconnected';
        qrCodeDataUrl = null;
      } else if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
        console.log("[ZaloBot] ✓ Nhận thông tin đăng nhập thành công. Đang lưu session...");
        try {
          fs.writeFileSync(SESSION_FILE, JSON.stringify(event.data, null, 2), 'utf8');
        } catch (e) {
          console.error("[ZaloBot] Không thể ghi file session:", e);
        }
      }
    }).then(api => {
      if (api) {
        zaloApi = api;
        botStatus = 'connected';
        qrCodeDataUrl = null;
        console.log("[ZaloBot] 🎉 Đăng nhập Zalo thành công! Bot đã sẵn sàng hoạt động.");
        syncFriendsList().catch(console.error);
        startGatewayListener();
      }
    }).catch(err => {
      console.warn("[ZaloBot] Kết thúc lượt quét QR:", err?.message || err);
      if (botStatus !== 'connected') {
        botStatus = 'disconnected';
      }
    }).finally(() => {
      isLoggingIn = false;
    });

  } catch (err) {
    console.error("[ZaloBot] Lỗi khởi tạo Zalo Client:", err);
    botStatus = 'disconnected';
    isLoggingIn = false;
  }
}

// ==========================================
// Anti-Ban Campaign Worker
// ==========================================
async function startCampaignWorker() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;
  campaignStatus = 'running';

  console.log(`[ZaloBot] 🚀 Bắt đầu chiến dịch gửi tin (${campaignQueue.length} phụ huynh).`);

  while (campaignQueue.length > 0) {
    if (campaignStatus === 'paused') {
      console.log("[ZaloBot] Chiến dịch đang tạm dừng...");
      await sleep(2000);
      continue;
    }
    if (campaignStatus === 'idle') {
      console.log("[ZaloBot] Chiến dịch đã dừng.");
      break;
    }

    // Batch pause check
    if (currentProgress.batchCount >= botConfig.batchSize) {
      console.log(`[ZaloBot] 🛡️ Đã gửi hết mẻ ${botConfig.batchSize} tin. Nghỉ ${botConfig.batchPauseMinutes} phút để bảo vệ tài khoản...`);
      for (let sec = botConfig.batchPauseMinutes * 60; sec > 0; sec--) {
        if (campaignStatus !== 'running') break;
        currentProgress.nextSendInSeconds = sec;
        await sleep(1000);
      }
      currentProgress.batchCount = 0;
    }

    const item = campaignQueue.shift();
    if (!item) break;

    currentProgress.currentStudent = item.studentName || 'Học sinh';
    currentProgress.currentPhone = item.phone || '';

    // Calculate human-like delay
    const delaySec = getRandomDelay(botConfig.minDelaySeconds, botConfig.maxDelaySeconds);
    console.log(`[ZaloBot] Chuẩn bị xử lý cho PH em ${item.studentName} (${item.phone}). Đợi ${delaySec}s để chống chặn...`);

    for (let s = delaySec; s > 0; s--) {
      if (campaignStatus !== 'running') break;
      currentProgress.nextSendInSeconds = s;
      await sleep(1000);
    }

    if (campaignStatus !== 'running') {
      campaignQueue.unshift(item);
      continue;
    }

    // Execute Send & Friendship check
    try {
      const result = await sendMessageToParent(item);
      currentProgress.batchCount++;
      if (result.status === 'friend_requested') {
        currentProgress.friendRequested = (currentProgress.friendRequested || 0) + 1;
        completedResults.push({
          studentId: item.studentId,
          phone: item.phone,
          studentName: item.studentName,
          status: 'friend_requested',
          isFriend: false,
          note: item.note
        });
        console.log(`[ZaloBot] [⚠️ CHƯA KẾT BẠN] Đã gửi lời mời & tin chào cho PH em ${item.studentName} (${item.phone}). Note: Cần gọi điện.`);
      } else {
        currentProgress.sent++;
        completedResults.push({
          studentId: item.studentId,
          phone: item.phone,
          studentName: item.studentName,
          status: 'sent',
          isFriend: true,
          note: 'Đã gửi học phí (Bạn bè)'
        });
        console.log(`[ZaloBot] [✓ ĐÃ GỬI BẠN BÈ] PH em ${item.studentName} (${item.phone}) thành công.`);
      }
    } catch (sendErr) {
      currentProgress.failed++;
      item.status = 'failed';
      item.error = sendErr?.message || String(sendErr);
      completedResults.push({
        studentId: item.studentId,
        phone: item.phone,
        studentName: item.studentName,
        status: 'failed',
        isFriend: false,
        error: item.error
      });
      console.error(`[ZaloBot] [✗ THẤT BẠI] Gửi PH em ${item.studentName} (${item.phone}):`, item.error);
    }
  }

  isWorkerRunning = false;
  if (campaignStatus === 'running') {
    campaignStatus = 'idle';
    console.log(`[ZaloBot] Hoàn thành chiến dịch! Gửi bạn bè: ${currentProgress.sent}, Chưa kết bạn (đã mời): ${currentProgress.friendRequested || 0}, Lỗi: ${currentProgress.failed}`);
  }
}

async function sendMessageToParent(item) {
  const cleanPhone = String(item.phone || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 9) {
    throw new Error('Số điện thoại không hợp lệ: ' + item.phone);
  }

  // Format phone to 84... and 0...
  let intlPhone = cleanPhone;
  if (intlPhone.startsWith('0')) {
    intlPhone = '84' + intlPhone.substring(1);
  }
  let localPhone = cleanPhone;
  if (localPhone.startsWith('84')) {
    localPhone = '0' + localPhone.substring(2);
  }

  if (zaloApi && typeof zaloApi.findUser === 'function') {
    // 1. Kiểm tra bạn bè trong cache danh bạ SĐT trước (nếu có để tiết kiệm quota)
    const cachedFriend = friendPhoneMap.get(intlPhone) || friendPhoneMap.get(localPhone);
    let threadId = cachedFriend ? String(cachedFriend.userId || cachedFriend.uid) : null;

    // 2. Nếu chưa có threadId, tìm kiếm qua SĐT
    if (!threadId) {
      console.log(`[ZaloBot] Tìm kiếm tài khoản Zalo qua SĐT ${item.phone}...`);
      const userResult = await zaloApi.findUser(intlPhone).catch(() => null);
      if (!userResult || !userResult.uid) {
        throw new Error(`Không tìm thấy tài khoản Zalo với SĐT ${item.phone}`);
      }
      threadId = String(userResult.uid);
    }

    // 3. XÁC THỰC QUAN HỆ BẠN BÈ THỜI GIAN THỰC TỪ SERVER ZALO (CHUẨN XÁC 100%)
    let isFriend = false;
    let isRequesting = false;
    let isRequested = false;

    if (typeof zaloApi.getFriendRequestStatus === 'function') {
      try {
        const friendStatus = await zaloApi.getFriendRequestStatus(threadId);
        console.log(`[ZaloBot] Trạng thái quan hệ với PH em ${item.studentName} (UID: ${threadId}):`, friendStatus);
        if (friendStatus) {
          isFriend = (friendStatus.is_friend === 1);
          isRequesting = (friendStatus.is_requesting === 1);
          isRequested = (friendStatus.is_requested === 1);
        }
      } catch (stErr) {
        console.warn(`[ZaloBot] Lỗi kiểm tra getFriendRequestStatus:`, stErr?.message || stErr);
      }
    } else {
      if (friendUserIdSet.has(threadId)) {
        isFriend = true;
      }
    }

    // ========================================================
    // KỊCH BẢN 1: NẾU ĐÃ LÀ BẠN BÈ -> Gửi học phí + ảnh QR
    // ========================================================
    if (isFriend) {
      console.log(`[ZaloBot] ✓ ĐÃ LÀ BẠN BÈ với PH em ${item.studentName} (${item.phone}). Bắt đầu gửi học phí + QR...`);
      friendUserIdSet.add(threadId);
      friendPhoneMap.set(intlPhone, { userId: threadId });
      friendPhoneMap.set(localPhone, { userId: threadId });

      // Gửi tin nhắn nội dung học phí
      if (typeof zaloApi.sendMessage === 'function') {
        await zaloApi.sendMessage(item.messageText, threadId);
      }

      // Gửi ảnh mã QR đính kèm
      if (item.qrUrl && typeof zaloApi.sendMessage === 'function') {
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempQrFile = path.join(tempDir, `qr_${Date.now()}_${Math.floor(Math.random() * 10000)}.png`);

        try {
          console.log(`[ZaloBot] Đang tải ảnh QR từ VietQR cho ${item.studentName}...`);
          await downloadImage(item.qrUrl, tempQrFile);
          console.log(`[ZaloBot] Đang gửi ảnh QR đính kèm qua Zalo cho ${item.studentName}...`);
          await zaloApi.sendMessage({
            msg: `Mã QR thanh toán học phí em ${item.studentName} (Quét để tự động điền thông tin):`,
            attachments: [tempQrFile]
          }, threadId);
          console.log(`[ZaloBot] ✓ Đã gửi ảnh QR cho ${item.studentName} thành công!`);
        } catch (imgErr) {
          console.warn("[ZaloBot] Không gửi được ảnh QR đính kèm:", imgErr?.message || imgErr);
        } finally {
          if (fs.existsSync(tempQrFile)) {
            try { fs.unlinkSync(tempQrFile); } catch (e) {}
          }
        }
      }

      item.status = 'sent';
      item.isFriend = true;
      item.note = 'Đã gửi học phí (Bạn bè)';
      return item;
    }

    // ========================================================
    // KỊCH BẢN 2: CHƯA PHẢI BẠN BÈ
    // -> Gửi lời mời kết bạn + Nhắn tin chào thân thiện + Ghi chú cần gọi điện
    // ========================================================
    console.log(`[ZaloBot] ⚠️ CHƯA KẾT BẠN với PH em ${item.studentName} (${item.phone}). Bắt đầu gửi lời mời kết bạn & tin chào...`);
    // Xóa khỏi cache nếu trước đây từng có (do mới hủy kết bạn)
    friendUserIdSet.delete(threadId);
    friendPhoneMap.delete(intlPhone);
    friendPhoneMap.delete(localPhone);

    // A. Xử lý Lời mời kết bạn
    const friendReqMsg = `Dạ em chào anh/chị, em là giáo viên trung tâm MindUp dạy cháu ${item.studentName}. Anh/chị đồng ý kết bạn để em tiện gửi thông tin của con nhé ạ!`;

    if (isRequested) {
      console.log(`[ZaloBot] Phụ huynh em ${item.studentName} đã gửi lời mời trước đó. Tự động chấp nhận...`);
      try {
        if (typeof zaloApi.acceptFriendRequest === 'function') {
          await zaloApi.acceptFriendRequest(threadId);
        }
      } catch (accErr) {
        console.warn(`[ZaloBot] Lỗi chấp nhận kết bạn:`, accErr?.message || accErr);
      }
    } else if (!isRequesting) {
      try {
        if (typeof zaloApi.sendFriendRequest === 'function') {
          await zaloApi.sendFriendRequest(friendReqMsg, threadId);
          console.log(`[ZaloBot] ✓ Đã gửi Lời mời kết bạn tới PH em ${item.studentName} (${item.phone}).`);
        }
      } catch (reqErr) {
        const errMsg = reqErr?.message || String(reqErr);
        if (errMsg.includes('225') || errMsg.includes('already friends')) {
          console.log(`[ZaloBot] Phụ huynh em ${item.studentName} thực tế đã là bạn bè.`);
          isFriend = true;
        } else {
          console.warn(`[ZaloBot] Lời mời kết bạn cho PH em ${item.studentName}:`, errMsg);
        }
      }
    } else {
      console.log(`[ZaloBot] Đã gửi lời mời kết bạn từ trước đó cho PH em ${item.studentName}, đang chờ đồng ý.`);
    }

    // B. Nhắn tin với lời chào thân thiện (không gửi dồn dập bảng học phí)
    const friendlyGreeting = buildParentGreeting(item.studentName, item.phone);
    try {
      if (typeof zaloApi.sendMessage === 'function') {
        await zaloApi.sendMessage(friendlyGreeting, threadId);
        console.log(`[ZaloBot] ✓ Đã gửi tin nhắn chào thân thiện tới PH em ${item.studentName} (${item.phone}).`);
      }
    } catch (msgErr) {
      console.warn(`[ZaloBot] Phụ huynh có thể chặn tin nhắn từ người lạ (nhưng lời mời kết bạn vẫn đến):`, msgErr?.message || msgErr);
    }

    item.status = 'friend_requested';
    item.isFriend = false;
    item.note = 'Chưa kết bạn với phụ huynh này (Cần gọi điện thoại trực tiếp)';
    return item;

  } else {
    // Chế độ mô phỏng kiểm thử (nếu chưa đăng nhập Zalo thật)
    console.log(`[SIMULATION MODE] Gửi tin đến SĐT ${intlPhone}:\n${item.messageText}`);
    await sleep(400);
    item.status = 'sent';
    item.isFriend = true;
    item.note = 'Đã gửi (Mô phỏng)';
    return item;
  }
}

// ==========================================
// REST API Endpoints
// ==========================================

// 1. Trạng thái Bot và Tiến độ hiện tại
app.get('/api/status', (req, res) => {
  res.json({
    botStatus,
    hasQr: !!qrCodeDataUrl,
    userInfo,
    friendsCount: friendUserIdSet.size,
    campaign: {
      status: campaignStatus,
      queueLength: campaignQueue.length,
      progress: currentProgress,
      completedResults: completedResults.slice(-100)
    },
    config: botConfig
  });
});

// 2. Lấy mã QR đăng nhập
app.get('/api/qr', (req, res) => {
  if (qrCodeDataUrl) {
    const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': imgBuffer.length
    });
    res.end(imgBuffer);
  } else {
    res.status(404).send('Chưa có mã QR');
  }
});

// 3. Yêu cầu tạo mới QR đăng nhập
app.post('/api/login-qr', async (req, res) => {
  try {
    initZaloClient(true).catch(console.error);
    res.json({ success: true, message: 'Đang khởi tạo mã QR...' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Đăng xuất Zalo
app.post('/api/logout', (req, res) => {
  try {
    try { zaloApi?.listener?.stop(); } catch (_) {}
    gatewayListening = false;
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
    }
    botStatus = 'disconnected';
    zaloApi = null;
    userInfo = null;
    qrCodeDataUrl = null;
    res.json({ success: true, message: 'Đã đăng xuất tài khoản Zalo.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Cập nhật cấu hình giãn cách chống chặn
app.post('/api/config', (req, res) => {
  const { minDelaySeconds, maxDelaySeconds, batchSize, batchPauseMinutes } = req.body || {};
  if (minDelaySeconds) botConfig.minDelaySeconds = Math.max(30, Number(minDelaySeconds));
  if (maxDelaySeconds) botConfig.maxDelaySeconds = Math.max(botConfig.minDelaySeconds, Number(maxDelaySeconds));
  if (batchSize) botConfig.batchSize = Math.max(10, Number(batchSize));
  if (batchPauseMinutes) botConfig.batchPauseMinutes = Math.max(5, Number(batchPauseMinutes));
  res.json({ success: true, config: botConfig });
});

// 6. Khởi động chiến dịch gửi danh sách phụ huynh
app.post('/api/start-campaign', (req, res) => {
  const { items, config } = req.body || {};
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Danh sách học sinh trống.' });
  }

  if (config) {
    if (config.minDelaySeconds) botConfig.minDelaySeconds = Math.max(30, Number(config.minDelaySeconds));
    if (config.maxDelaySeconds) botConfig.maxDelaySeconds = Math.max(botConfig.minDelaySeconds, Number(config.maxDelaySeconds));
  }

  campaignQueue = [...items];
  completedResults = [];
  currentProgress = {
    total: items.length,
    sent: 0,
    friendRequested: 0,
    failed: 0,
    skipped: 0,
    currentStudent: '',
    currentPhone: '',
    nextSendInSeconds: 0,
    batchCount: 0
  };

  startCampaignWorker();

  res.json({
    success: true,
    message: `Đã đưa ${items.length} tin nhắn vào hàng đợi an toàn.`,
    queueLength: campaignQueue.length
  });
});

// 7. Tạm dừng / Tiếp tục / Hủy chiến dịch
app.post('/api/pause-campaign', (req, res) => {
  campaignStatus = 'paused';
  res.json({ success: true, message: 'Đã tạm dừng chiến dịch.' });
});

app.post('/api/resume-campaign', (req, res) => {
  if (campaignStatus === 'paused') {
    campaignStatus = 'running';
    if (!isWorkerRunning) startCampaignWorker();
  }
  res.json({ success: true, message: 'Đã tiếp tục chiến dịch.' });
});

app.post('/api/stop-campaign', (req, res) => {
  campaignStatus = 'idle';
  campaignQueue = [];
  res.json({ success: true, message: 'Đã hủy chiến dịch hiện tại.' });
});

// 8. Gửi thử 1 tin nhắn test
app.post('/api/test-send', async (req, res) => {
  const { phone, studentName, messageText, qrUrl } = req.body || {};
  if (!phone || !messageText) {
    return res.status(400).json({ success: false, error: 'Thiếu số điện thoại hoặc nội dung.' });
  }

  try {
    const result = await sendMessageToParent({ phone, studentName: studentName || 'Học sinh Test', messageText, qrUrl });
    res.json({ success: true, message: `Đã xử lý gửi tin nhắn tới ${phone}`, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Khởi động server
app.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`🤖 Dịch vụ Zalo Bot MindUp đang chạy tại: http://localhost:${PORT}`);
  console.log(`🛡️  Chế độ Anti-Ban: Giãn cách ngẫu nhiên ${botConfig.minDelaySeconds}s - ${botConfig.maxDelaySeconds}s/tin`);
  console.log(`=======================================================`);

  // Tự động kiểm tra session Zalo khi khởi động
  initZaloClient().catch(console.error);
  setInterval(async () => {
    await syncGatewayOutbox();
    await syncParentTuition();
  }, 12000).unref();
  setInterval(flushIncoming, 10000).unref();
});
