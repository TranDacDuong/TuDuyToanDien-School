const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3456;

app.use(cors());
app.use(express.json());

// Session and Storage setup
const SESSION_DIR = path.join(__dirname, 'session');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
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
    // 1. Kiểm tra bạn bè trong cache danh bạ (Tiết kiệm 100% quota tìm kiếm Zalo)
    const cachedFriend = friendPhoneMap.get(intlPhone) || friendPhoneMap.get(localPhone);
    let threadId = cachedFriend ? String(cachedFriend.userId || cachedFriend.uid) : null;
    let isFriend = !!cachedFriend;

    // 2. Nếu chưa có trong cache, tìm kiếm qua SĐT
    let userResult = null;
    if (!threadId) {
      userResult = await zaloApi.findUser(intlPhone).catch(() => null);
      if (!userResult || !userResult.uid) {
        throw new Error(`Không tìm thấy tài khoản Zalo với SĐT ${item.phone}`);
      }
      threadId = String(userResult.uid);
      if (friendUserIdSet.has(threadId) || userResult.is_friend === 1 || userResult.is_friend === true) {
        isFriend = true;
      }
    }

    // A. Nếu chưa là bạn bè, thử gửi lời mời kết bạn trước
    if (!isFriend) {
      console.log(`[ZaloBot] ⚠️ Chưa kết bạn với PH em ${item.studentName} (${item.phone}). Bắt đầu gửi lời mời kết bạn & tin chào...`);
      const friendReqMsg = `Dạ em chào anh/chị, em là giáo viên trung tâm MindUp dạy cháu ${item.studentName}. Anh/chị đồng ý kết bạn để em tiện gửi thông tin của con nhé ạ!`;
      try {
        if (typeof zaloApi.sendFriendRequest === 'function') {
          await zaloApi.sendFriendRequest(friendReqMsg, threadId);
          console.log(`[ZaloBot] ✓ Đã gửi Lời mời kết bạn tới PH em ${item.studentName} (${item.phone}).`);
        }
      } catch (reqErr) {
        const errMsg = reqErr?.message || String(reqErr);
        if (errMsg.includes('225') || errMsg.includes('already friends')) {
          console.log(`[ZaloBot] Phụ huynh em ${item.studentName} thực tế đã là bạn bè (code 225).`);
          isFriend = true;
        } else if (errMsg.includes('222')) {
          console.log(`[ZaloBot] Phụ huynh em ${item.studentName} đã gửi lời mời trước đó, kết bạn thành công (code 222).`);
          isFriend = true;
        } else {
          console.warn(`[ZaloBot] Lời mời kết bạn cho PH em ${item.studentName}:`, errMsg);
        }
      }
    }

    // ========================================================
    // KỊCH BẢN 1: NẾU ĐÃ LÀ BẠN BÈ -> Gửi học phí + ảnh QR
    // ========================================================
    if (isFriend) {
      friendUserIdSet.add(threadId);
      if (userResult) {
        friendPhoneMap.set(intlPhone, userResult);
        friendPhoneMap.set(localPhone, userResult);
      }

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
    // KỊCH BẢN 2: VẪN CHƯA PHẢI BẠN BÈ
    // -> Nhắn tin với lời chào thân thiện + Ghi chú cần gọi điện
    // ========================================================
    const friendlyGreeting = `Trung tâm MindUp xin chào Quý phụ huynh em ${item.studentName}! 🌸\n\nDạ em là giáo viên/phụ trách lớp của cháu ${item.studentName} tại trung tâm MindUp. Em vừa gửi lời mời kết bạn Zalo với anh/chị.\nAnh/chị vui lòng bấm "Đồng ý" kết bạn để trung tâm tiện gửi thông báo học tập và chi tiết học phí của con hàng tháng nhé ạ!\nTrung tâm xin chân thành cảm ơn Quý phụ huynh! ❤️`;
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
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🤖 Dịch vụ Zalo Bot MindUp đang chạy tại: http://localhost:${PORT}`);
  console.log(`🛡️  Chế độ Anti-Ban: Giãn cách ngẫu nhiên ${botConfig.minDelaySeconds}s - ${botConfig.maxDelaySeconds}s/tin`);
  console.log(`=======================================================`);

  // Tự động kiểm tra session Zalo khi khởi động
  initZaloClient().catch(console.error);
});
