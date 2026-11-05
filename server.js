const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));
app.get('/admin', (_req, res) => res.sendFile(require('path').join(__dirname, 'admin.html')));

let tiktokConnected = false;
app.get('/healthz', (_req, res) => res.json({ ok: true, tiktokConnected, username: TIKTOK_USERNAME }));

const PORT = Number(process.env.PORT || 3000);
const TIKTOK_USERNAME = (process.env.TIKTOK_USERNAME || 'kon.coffee').replace(/^@/, '');

const tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME, {
  processInitialData: false,
  enableExtendedGiftInfo: true,
  enableWebsocketUpgrade: true,
  requestPollingIntervalMs: 1000
});

let reconnectTimer = null;
let connecting = false;

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectTikTok();
  }, 10000);
}

async function connectTikTok() {
  if (connecting) return;
  connecting = true;
  try {
    const state = await tiktokConnection.connect();
    tiktokConnected = true;
    console.log(`✅ Đã kết nối @${TIKTOK_USERNAME} | Room ID: ${state.roomId}`);
  } catch (error) {
    console.error(`❌ Không kết nối được @${TIKTOK_USERNAME}: ${error.message}`);
    scheduleReconnect();
  } finally {
    connecting = false;
  }
}

tiktokConnection.on('chat', data => {
  io.emit('tiktok_chat', {
    uniqueId: data.uniqueId || data.userId || data.user?.uniqueId,
    nickname: data.nickname || data.user?.nickname || data.uniqueId || 'Khách KON',
    avatar: data.profilePictureUrl || data.user?.profilePictureUrl || '',
    comment: data.comment || ''
  });
});

tiktokConnection.on('like', data => {
  io.emit('tiktok_like', {
    uniqueId: data.uniqueId || data.userId || data.user?.uniqueId,
    nickname: data.nickname || data.user?.nickname || data.uniqueId || 'Khách KON',
    likeCount: Number(data.likeCount || 0)
  });
});

tiktokConnection.on('gift', data => {
  // Gift dạng streak phát nhiều event có repeatCount tăng dần.
  // Chỉ xử lý event cuối để không cộng một combo nhiều lần.
  const giftType = Number(data.giftType ?? data.giftDetails?.giftType ?? data.extendedGiftInfo?.giftType ?? 0);
  const repeatEnd = data.repeatEnd === true || data.repeatEnd === 1 || data.repeatEnd === '1';
  if (giftType === 1 && !repeatEnd) return;

  const repeatCount = Math.max(1, Number(data.repeatCount || 1));
  const diamondCount = Number(data.diamondCount ?? data.giftDetails?.diamondCount ?? data.extendedGiftInfo?.diamondCount ?? 0);
  const giftName =
    data.giftName ||
    data.giftDetails?.giftName ||
    data.extendedGiftInfo?.name ||
    data.extendedGiftInfo?.giftName ||
    'Quà TikTok';

  const payload = {
    uniqueId: data.uniqueId || data.userId || data.user?.uniqueId,
    nickname: data.nickname || data.user?.nickname || data.uniqueId || 'Gia chủ Chill',
    avatar: data.profilePictureUrl || data.user?.profilePictureUrl || '',
    giftId: Number(data.giftId || data.giftDetails?.giftId || data.extendedGiftInfo?.giftId || 0),
    giftName,
    giftType,
    repeatCount,
    totalDiamonds: diamondCount * repeatCount,
    transactionId: data.msgId || data.transactionId || null
  };

  console.log(`🎁 @${payload.uniqueId || 'unknown'} gửi ${repeatCount} x ${giftName} (giftId: ${payload.giftId})`);
  io.emit('tiktok_gift', payload);
});

tiktokConnection.on('member', data => {
  const user = data.user || data;
  const payload = {
    uniqueId: user.uniqueId || user.userId || data.uniqueId || data.userId,
    nickname: user.nickname || data.nickname || user.uniqueId || 'Khách mới',
    avatar: user.profilePictureUrl || data.profilePictureUrl || ''
  };
  io.emit('tiktok_member', payload);
  console.log(`👋 Khách mới vào LIVE: ${payload.nickname}`);
});

tiktokConnection.on('streamEnd', () => {
  tiktokConnected = false;
  console.log('⚠️ Phiên LIVE đã kết thúc. Server tiếp tục chờ kết nối phiên LIVE tiếp theo.');
});

tiktokConnection.on('disconnected', () => {
  tiktokConnected = false;
  console.log('⚠️ Kết nối TikTok bị ngắt. Sẽ thử kết nối lại sau 10 giây...');
  scheduleReconnect();
});

tiktokConnection.on('error', error => {
  console.error('❌ TikTok connector:', error?.message || error);
});

io.on('connection', socket => {
  console.log(`🟢 Màn hình game đã kết nối: ${socket.id}`);
  socket.on('disconnect', () => console.log(`⚪ Màn hình game đã ngắt: ${socket.id}`));
});


// ===== KON ADMIN: private login + real-time controls =====
const crypto = require('crypto');
app.use(express.json({ limit: '32kb' }));
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || ADMIN_PASSWORD;
const ADMIN_COOKIE = 'kon_admin_session';
const ADMIN_SESSION_TTL = 12 * 60 * 60 * 1000;
let adminState = { lighting: 'normal', brightness: 100, decorations: true, updatedAt: Date.now() };
const adminSessions = new Map();

function signAdminToken(token) {
  return crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(token).digest('hex');
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const item = raw.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : '';
}
function isAdminRequest(req) {
  if (!ADMIN_SESSION_SECRET) return false;
  const token = getCookie(req, ADMIN_COOKIE);
  const record = adminSessions.get(token);
  return !!(record && record.expiresAt > Date.now() && safeEqual(record.signature, signAdminToken(token)));
}
function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ ok:false, error:'Chưa cấu hình ADMIN_PASSWORD trên Render.' });
  if (!isAdminRequest(req)) return res.status(401).json({ ok:false, error:'Vui lòng đăng nhập Admin.' });
  next();
}
app.get('/api/admin/status', (_req, res) => res.json({ enabled: !!ADMIN_PASSWORD }));
app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ ok:false, error:'Chủ hệ thống cần đặt biến ADMIN_PASSWORD trên Render.' });
  const supplied = String(req.body?.password || '');
  if (!safeEqual(supplied, ADMIN_PASSWORD)) return res.status(401).json({ ok:false, error:'Mật khẩu không đúng.' });
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, { signature: signAdminToken(token), expiresAt: Date.now() + ADMIN_SESSION_TTL });
  res.cookie(ADMIN_COOKIE, token, { httpOnly:true, secure:process.env.NODE_ENV === 'production', sameSite:'strict', path:'/', maxAge:ADMIN_SESSION_TTL });
  res.json({ ok:true, state:adminState });
});
app.post('/api/admin/logout', requireAdmin, (req, res) => {
  adminSessions.delete(getCookie(req, ADMIN_COOKIE));
  res.clearCookie(ADMIN_COOKIE, { path:'/', sameSite:'strict', secure:process.env.NODE_ENV === 'production' });
  res.json({ ok:true });
});
app.get('/api/admin/state', requireAdmin, (_req, res) => res.json({ ok:true, state:adminState }));
app.patch('/api/admin/state', requireAdmin, (req, res) => {
  const body = req.body || {};
  if (body.lighting !== undefined) {
    if (!['normal','lights-off','sunset','night'].includes(body.lighting)) return res.status(400).json({ok:false,error:'Chế độ ánh sáng không hợp lệ.'});
    adminState.lighting = body.lighting;
  }
  if (body.brightness !== undefined) {
    const n = Number(body.brightness);
    if (!Number.isFinite(n) || n < 35 || n > 100) return res.status(400).json({ok:false,error:'Độ sáng phải từ 35 đến 100.'});
    adminState.brightness = n;
  }
  if (body.decorations !== undefined) adminState.decorations = !!body.decorations;
  adminState.updatedAt = Date.now();
  io.emit('admin:state', adminState);
  res.json({ok:true,state:adminState});
});
io.use((socket, next) => {
  if (socket.handshake.auth?.role !== 'admin') return next();
  const raw = socket.handshake.headers.cookie || '';
  const item = raw.split(';').map(v=>v.trim()).find(v=>v.startsWith(ADMIN_COOKIE+'='));
  const token = item ? decodeURIComponent(item.slice(ADMIN_COOKIE.length+1)) : '';
  const record = adminSessions.get(token);
  if (record && record.expiresAt > Date.now() && safeEqual(record.signature, signAdminToken(token))) return next();
  next(new Error('Admin authentication required'));
});
io.on('connection', socket => {
  socket.emit('admin:state', adminState);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 KON COFFEE LIVE đang chạy tại http://localhost:${PORT}`);
  console.log(`🎥 Kênh TikTok: @${TIKTOK_USERNAME}`);
  connectTikTok();
});
