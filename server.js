const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

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

tiktokConnection.on('streamEnd', () => {
  console.log('⚠️ Phiên LIVE đã kết thúc. Server tiếp tục chờ kết nối phiên LIVE tiếp theo.');
});

tiktokConnection.on('disconnected', () => {
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

server.listen(PORT, () => {
  console.log(`🚀 KON COFFEE LIVE đang chạy tại http://localhost:${PORT}`);
  console.log(`🎥 Kênh TikTok: @${TIKTOK_USERNAME}`);
  connectTikTok();
});
