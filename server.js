require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
const PORT = Number(process.env.PORT || 3000);
const TIKTOK_USERNAME = String(process.env.TIKTOK_USERNAME || 'kon.coffee').replace(/^@/, '').trim();
const ADMIN_AUTH_DISABLED = process.env.ADMIN_AUTH_DISABLED === 'true';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : '123456789');
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || ADMIN_PASSWORD;
const ADMIN_COOKIE = 'kon_admin_session';
const ADMIN_SESSION_TTL = 12 * 60 * 60 * 1000;
const adminSessions = new Map();
let adminState = {
  lighting: 'normal', brightness: 100, decorations: true,
  musicEnabled: true, musicVolume: 35,
  voiceEnabled: true, voiceVolume: 85,
  sfxEnabled: true, sfxVolume: 60,
  updatedAt: Date.now()
};

app.use(express.json({ limit: '32kb' }));
app.use(express.static(__dirname, { etag: true, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
let tiktokConnected = false;
app.get('/healthz', (_req, res) => res.json({ ok: true, tiktokConnected, username: TIKTOK_USERNAME, version: '2.0.2' }));

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function cookieValue(header, name) {
  const item = String(header || '').split(';').map(v => v.trim()).find(v => v.startsWith(name + '='));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : '';
}
function signToken(token) {
  return crypto.createHmac('sha256', ADMIN_SESSION_SECRET || 'local-kon-session').update(token).digest('hex');
}
function adminToken(req) { return cookieValue(req.headers.cookie, ADMIN_COOKIE); }
function isAdmin(req) {
  if (ADMIN_AUTH_DISABLED) return true;
  if (!ADMIN_PASSWORD || !ADMIN_SESSION_SECRET) return false;
  const token = adminToken(req);
  const record = adminSessions.get(token);
  return !!(record && record.expiresAt > Date.now() && safeEqual(record.signature, signToken(token)));
}
function requireAdmin(req, res, next) {
  if (ADMIN_AUTH_DISABLED) return next();
  if (!ADMIN_PASSWORD) return res.status(503).json({ ok: false, error: 'Chưa cấu hình ADMIN_PASSWORD trong Environment của Render.' });
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Vui lòng đăng nhập Admin.' });
  next();
}

app.get('/api/admin/status', (_req, res) => res.json({ enabled: ADMIN_AUTH_DISABLED || !!ADMIN_PASSWORD, loginRequired: !ADMIN_AUTH_DISABLED }));
app.post('/api/admin/login', (req, res) => {
  if (ADMIN_AUTH_DISABLED) return res.json({ ok: true, state: adminState });
  if (!ADMIN_PASSWORD) return res.status(503).json({ ok: false, error: 'Chủ hệ thống cần đặt ADMIN_PASSWORD trong Environment.' });
  if (!safeEqual(req.body?.password, ADMIN_PASSWORD)) return res.status(401).json({ ok: false, error: 'Mật khẩu không đúng.' });
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, { signature: signToken(token), expiresAt: Date.now() + ADMIN_SESSION_TTL });
  const parts = [`${ADMIN_COOKIE}=${encodeURIComponent(token)}`, 'HttpOnly', 'Path=/', 'SameSite=Strict', 'Max-Age=43200'];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
  res.json({ ok: true, state: adminState });
});
app.post('/api/admin/logout', requireAdmin, (req, res) => {
  adminSessions.delete(adminToken(req));
  const parts = [`${ADMIN_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
  res.json({ ok: true });
});
app.get('/api/admin/state', requireAdmin, (_req, res) => res.json({ ok: true, state: adminState }));
app.patch('/api/admin/state', requireAdmin, (req, res) => {
  const body = req.body || {};
  if (body.lighting !== undefined) {
    if (!['normal', 'lights-off', 'sunset', 'night'].includes(body.lighting)) return res.status(400).json({ ok: false, error: 'Chế độ ánh sáng không hợp lệ.' });
    adminState.lighting = body.lighting;
  }
  if (body.brightness !== undefined) {
    const n = Number(body.brightness);
    if (!Number.isFinite(n) || n < 35 || n > 100) return res.status(400).json({ ok: false, error: 'Độ sáng phải từ 35 đến 100.' });
    adminState.brightness = n;
  }
  for (const key of ['decorations', 'musicEnabled', 'voiceEnabled', 'sfxEnabled']) {
    if (body[key] !== undefined) adminState[key] = !!body[key];
  }
  for (const key of ['musicVolume', 'voiceVolume', 'sfxVolume']) {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < 0 || n > 100) return res.status(400).json({ ok: false, error: `${key} phải từ 0 đến 100.` });
      adminState[key] = n;
    }
  }
  adminState.updatedAt = Date.now();
  io.emit('admin:state', adminState);
  res.json({ ok: true, state: adminState });
});
app.post('/api/admin/announce', requireAdmin, (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 260);
  if (!text) return res.status(400).json({ ok: false, error: 'Bạn chưa nhập nội dung thông báo.' });
  io.emit('admin:announce', { text });
  res.json({ ok: true });
});

io.use((socket, next) => {
  if (socket.handshake.auth?.role !== 'admin') return next();
  if (ADMIN_AUTH_DISABLED) return next();
  const token = cookieValue(socket.handshake.headers.cookie, ADMIN_COOKIE);
  const record = adminSessions.get(token);
  if (record && record.expiresAt > Date.now() && safeEqual(record.signature, signToken(token))) return next();
  return next(new Error('Admin authentication required'));
});
io.on('connection', socket => {
  socket.emit('admin:state', adminState);
  console.log(`🟢 Client đã kết nối: ${socket.id}`);
  socket.on('disconnect', () => console.log(`⚪ Client đã ngắt: ${socket.id}`));
});

function userFrom(data) {
  const user = data?.user || {};
  const profile = user.profilePicture || data?.profilePicture || {};
  const avatar = profile?.url?.[0] || user.profilePictureUrl || data?.profilePictureUrl || '';
  return {
    uniqueId: user.uniqueId || user.userId || data?.uniqueId || data?.userId || 'khach',
    nickname: user.nickname || data?.nickname || user.uniqueId || 'Khách KON',
    avatar
  };
}
const tiktokConnection = new TikTokLiveConnection(TIKTOK_USERNAME, { enableExtendedGiftInfo: true });
let reconnectTimer = null;
let connecting = false;
function scheduleReconnect(delay = 45000) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connectTikTok(); }, delay);
  reconnectTimer.unref?.();
}
async function connectTikTok() {
  if (connecting || tiktokConnected) return;
  connecting = true;
  try {
    const state = await tiktokConnection.connect();
    tiktokConnected = true;
    console.log(`✅ Đã kết nối LIVE @${TIKTOK_USERNAME} | Room ID: ${state.roomId}`);
  } catch (err) {
    tiktokConnected = false;
    const message = String(err?.message || err || 'Lỗi không xác định');
    const isOffline = /isn't online|not online|room id/i.test(message);
    console[isOffline ? 'log' : 'error'](`${isOffline ? '⏳' : '❌'} @${TIKTOK_USERNAME}: ${message}. Thử lại sau ${isOffline ? 45 : 20} giây.`);
    scheduleReconnect(isOffline ? 45000 : 20000);
  } finally { connecting = false; }
}

tiktokConnection.on(WebcastEvent.CHAT, data => {
  io.emit('tiktok_chat', { ...userFrom(data), comment: data.comment || '' });
});
tiktokConnection.on(WebcastEvent.MEMBER, data => {
  io.emit('tiktok_member', userFrom(data));
});
tiktokConnection.on(WebcastEvent.LIKE, data => {
  io.emit('tiktok_like', { ...userFrom(data), likeCount: Number(data.likeCount || 0), totalLikeCount: Number(data.totalLikeCount || 0) });
});
tiktokConnection.on(WebcastEvent.GIFT, data => {
  const details = data.giftDetails || data.extendedGiftInfo || {};
  const giftType = Number(details.giftType ?? data.giftType ?? 0);
  const repeatEnd = data.repeatEnd === true || data.repeatEnd === 1 || data.repeatEnd === '1';
  if (giftType === 1 && !repeatEnd) return;
  const repeatCount = Math.max(1, Number(data.repeatCount || 1));
  const diamonds = Number(details.diamondCount ?? details.diamond_count ?? data.diamondCount ?? 0);
  io.emit('tiktok_gift', {
    ...userFrom(data), giftId: Number(details.giftId ?? data.giftId ?? 0),
    giftName: details.giftName || details.name || data.giftName || 'Quà TikTok',
    giftType, repeatCount, totalDiamonds: diamonds * repeatCount,
    transactionId: data.msgId || data.transactionId || null
  });
});
tiktokConnection.on(WebcastEvent.STREAM_END, () => {
  tiktokConnected = false;
  console.log('ℹ️ TikTok LIVE đã kết thúc. Máy chủ tiếp tục chờ phiên LIVE tiếp theo.');
  scheduleReconnect(45000);
});
tiktokConnection.on(ControlEvent.DISCONNECTED, () => {
  tiktokConnected = false;
  scheduleReconnect(45000);
});
tiktokConnection.on('error', err => console.warn('TikTok connector:', err?.message || err));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 KON COFFEE LIVE v2.0.2 chạy tại cổng ${PORT}`);
  console.log(`🎥 Kênh TikTok: @${TIKTOK_USERNAME}`);
  if (ADMIN_AUTH_DISABLED) console.warn('⚠️ Admin đang mở không cần mật khẩu. Chỉ dùng trên môi trường bạn chấp nhận truy cập công khai.');
  else if (!ADMIN_PASSWORD) console.warn('⚠️ Thiếu ADMIN_PASSWORD. Hãy thêm biến này trong Render Environment.');
  connectTikTok();
});
process.on('SIGTERM', () => { try { tiktokConnection.disconnect(); } catch (_) {} server.close(() => process.exit(0)); });