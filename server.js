const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));
app.get('/admin', (_req, res) => res.sendFile(require('path').join(__dirname, 'admin.html')));

let tiktokConnected = false;
app.get('/healthz', (_req, res) => res.json({ ok: true, tiktokConnected, username: TIKTOK_USERNAME }));

const PORT = Number(process.env.PORT || 3000);
const TIKTOK_USERNAME = (process.env.TIKTOK_USERNAME || 'kon.coffee').replace(/^@/, '');

const tiktokConnection = new TikTokLiveConnection(TIKTOK_USERNAME, {
  signApiKey: process.env.EULER_API_KEY || undefined,
  enableExtendedGiftInfo: true
});

let reconnectTimer = null;
let connecting = false;

function scheduleReconnect(delayMs = 30000) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectTikTok();
  }, delayMs);
}

function tiktokUser(data) {
  const user = data.user || {};
  const profile = user.profilePicture || data.profilePicture || {};
  return {
    uniqueId: user.uniqueId || user.userId || data.uniqueId || data.userId || 'khach',
    nickname: user.nickname || data.nickname || user.uniqueId || 'Khách KON',
    avatar: profile.url?.[0] || user.profilePictureUrl || data.profilePictureUrl || ''
  };
}

async function connectTikTok() {
  if (connecting || tiktokConnected) return;
  connecting = true;
  try {
    const state = await tiktokConnection.connect();
    tiktokConnected = true;
    console.log('✅ Đã kết nối @' + TIKTOK_USERNAME + ' | Room ID: ' + state.roomId);
  } catch (error) {
    tiktokConnected = false;
    console.error('❌ Không kết nối được @' + TIKTOK_USERNAME + ': ' + (error.message || error));
    scheduleReconnect(error && error.name === 'UserOfflineError' ? 45000 : 15000);
  } finally {
    connecting = false;
  }
}

tiktokConnection.on(WebcastEvent.CHAT, data => {
  const user = tiktokUser(data);
  io.emit('tiktok_chat', { ...user, comment: data.comment || '' });
});

tiktokConnection.on(WebcastEvent.MEMBER, data => {
  const user = tiktokUser(data);
  io.emit('tiktok_member', user);
  console.log('👋 Khách mới vào LIVE: ' + user.nickname);
});

tiktokConnection.on(WebcastEvent.LIKE, data => {
  const user = tiktokUser(data);
  io.emit('tiktok_like', { ...user, likeCount: Number(data.likeCount || 1) });
});

tiktokConnection.on(WebcastEvent.GIFT, data => {
  const details = data.giftDetails || {};
  const extended = data.extendedGiftInfo || {};
  const giftType = Number(details.giftType ?? extended.giftType ?? data.giftType ?? 0);
  const repeatEnd = data.repeatEnd === true || data.repeatEnd === 1 || data.repeatEnd === '1';
  if (giftType === 1 && !repeatEnd) return;

  const repeatCount = Math.max(1, Number(data.repeatCount || 1));
  const diamondCount = Number(details.diamondCount ?? extended.diamond_count ?? data.diamondCount ?? 0);
  const giftName = details.giftName || extended.name || data.giftName || 'Quà TikTok';
  const user = tiktokUser(data);
  const payload = {
    ...user,
    giftId: Number(details.giftId ?? extended.gift_id ?? data.giftId ?? 0),
    giftName,
    giftType,
    repeatCount,
    totalDiamonds: diamondCount * repeatCount,
    transactionId: data.msgId || data.transactionId || null
  };

  console.log('🎁 @' + payload.uniqueId + ' gửi ' + repeatCount + ' x ' + giftName + ' (giftId: ' + payload.giftId + ')');
  io.emit('tiktok_gift', payload);
});

tiktokConnection.on(WebcastEvent.STREAM_END, () => {
  tiktokConnected = false;
  console.log('⚠️ Phiên LIVE đã kết thúc. Server tiếp tục chờ phiên LIVE tiếp theo.');
  scheduleReconnect(45000);
});

tiktokConnection.on(ControlEvent.DISCONNECTED, () => {
  tiktokConnected = false;
  console.log('⚠️ Kết nối TikTok bị ngắt. Sẽ thử lại sau 30 giây.');
  scheduleReconnect();
});

io.on('connection', socket => {
  console.log(`🟢 Màn hình game đã kết nối: ${socket.id}`);
  socket.on('disconnect', () => console.log(`⚪ Màn hình game đã ngắt: ${socket.id}`));
});


// ===== KON ADMIN: private login + real-time controls =====
const crypto = require('crypto');
app.use(express.json({ limit: '32kb' }));
const ADMIN_AUTH_DISABLED = process.env.ADMIN_AUTH_DISABLED === 'true';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || ADMIN_PASSWORD;
const ADMIN_COOKIE = 'kon_admin_session';
const ADMIN_SESSION_TTL = 12 * 60 * 60 * 1000;
let adminState = { lighting: 'normal', brightness: 100, decorations: true, musicEnabled: true, musicVolume: 35, voiceEnabled: true, voiceVolume: 85, sfxEnabled: true, sfxVolume: 60, updatedAt: Date.now() };
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
  if (ADMIN_AUTH_DISABLED) return true;
  if (!ADMIN_SESSION_SECRET) return false;
  const token = getCookie(req, ADMIN_COOKIE);
  const record = adminSessions.get(token);
  return !!(record && record.expiresAt > Date.now() && safeEqual(record.signature, signAdminToken(token)));
}
function requireAdmin(req, res, next) {
  if (ADMIN_AUTH_DISABLED) return next();
  if (!ADMIN_PASSWORD) return res.status(503).json({ ok:false, error:'Chưa cấu hình ADMIN_PASSWORD trên Render.' });
  if (!isAdminRequest(req)) return res.status(401).json({ ok:false, error:'Vui lòng đăng nhập Admin.' });
  next();
}
app.get('/api/admin/status', (_req, res) => res.json({ enabled: ADMIN_AUTH_DISABLED || !!ADMIN_PASSWORD, loginRequired: !ADMIN_AUTH_DISABLED }));
app.post('/api/admin/login', (req, res) => {
  if (ADMIN_AUTH_DISABLED) return res.json({ ok:true, state:adminState });
  if (!ADMIN_PASSWORD) return res.status(503).json({ ok:false, error:'Chủ hệ thống cần đặt biến ADMIN_PASSWORD trên Render.' });
  const supplied = String(req.body?.password || '');
  if (!safeEqual(supplied, ADMIN_PASSWORD)) return res.status(401).json({ ok:false, error:'Mật khẩu không đúng.' });
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, { signature: signAdminToken(token), expiresAt: Date.now() + ADMIN_SESSION_TTL });
  const cookieParts = [`${ADMIN_COOKIE}=${encodeURIComponent(token)}`, 'HttpOnly', 'Path=/', 'SameSite=Strict', 'Max-Age=43200'];
  if (process.env.NODE_ENV === 'production') cookieParts.push('Secure');
  res.setHeader('Set-Cookie', cookieParts.join('; '));
  res.json({ ok:true, state:adminState });
});
app.post('/api/admin/logout', requireAdmin, (req, res) => {
  adminSessions.delete(getCookie(req, ADMIN_COOKIE));
  const clearParts = [`${ADMIN_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`];
  if (process.env.NODE_ENV === 'production') clearParts.push('Secure');
  res.setHeader('Set-Cookie', clearParts.join('; '));
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
  for (const key of ['musicEnabled', 'voiceEnabled', 'sfxEnabled']) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'boolean') return res.status(400).json({ok:false,error:'Trạng thái âm thanh không hợp lệ.'});
      adminState[key] = body[key];
    }
  }
  for (const key of ['musicVolume', 'voiceVolume', 'sfxVolume']) {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < 0 || n > 100) return res.status(400).json({ok:false,error:'Âm lượng phải từ 0 đến 100.'});
      adminState[key] = n;
    }
  }
  adminState.updatedAt = Date.now();
  io.emit('admin:state', adminState);
  res.json({ok:true,state:adminState});
});
io.use((socket, next) => {
  if (socket.handshake.auth?.role !== 'admin') return next();
  if (ADMIN_AUTH_DISABLED) return next();
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
