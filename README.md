# KON COFFEE LIVE v2.0.2 · CHIBI + AUDIO + ADMIN

Bản triển khai thử nghiệm độc lập, dùng Node.js 20+, Express, Socket.IO và tiktok-live-connector 2.5.0.

## Chạy trên máy tính
1. Cài Node.js 20 trở lên.
2. Mở thư mục này, chạy `npm install`.
3. Sao chép `.env.example` thành `.env`.
4. Mở `.env` và đặt `ADMIN_PASSWORD=123456789`; đặt `ADMIN_SESSION_SECRET` thành chuỗi dài riêng.
5. Chạy `npm start`, mở `http://localhost:3000` và `http://localhost:3000/admin`.

Có thể chạy nhanh bằng `START-KON-COFFEE.bat` trên Windows.

## Render (chỉ bản TEST)
- Build: `npm install`
- Start: `npm start`
- Health check: `/healthz`
- Environment: `NODE_ENV=production`, `TIKTOK_USERNAME=kon.coffee`, `ADMIN_PASSWORD=123456789`, `ADMIN_SESSION_SECRET` là chuỗi bí mật riêng.
- `render.yaml` được đặt tên service `kon-coffee-live-test`, không phải service LIVE chính.

Không tải `.env` lên GitHub. Không dùng mật khẩu thử nghiệm này cho tài khoản hoặc dữ liệu nhạy cảm.

## Nội dung
- `index.html`: giao diện game minh họa, 25 bàn và 100 chỗ, sự kiện khách/bình luận/quà.
- `admin.html`: quản trị âm thanh, giọng đọc, hiệu ứng, ánh sáng, thông báo.
- `server.js`: server, API Admin, Socket.IO, TikTok LIVE connector.
- `assets/kon-garden.webp`: nền minh họa KON COFFEE.
- `assets/characters/`: 6 nhân vật chibi PNG.
- `assets/audio/`: nhạc Lo-fi và 3 hiệu ứng WAV.
- `.github/workflows/validate.yml`, `scripts/`: kiểm tra cú pháp và tài nguyên.

Ảnh mockup trong thư mục `DESIGN_REFERENCE` của gói ZIP bên ngoài là ảnh tham khảo bố cục, không phải ảnh chụp trạng thái website đã deploy.


## Cập nhật 2.0.2
- Giao diện minh họa KON COFFEE và 6 nhân vật chibi được phục vụ từ thư mục assets.
- Nhạc Lo-fi và hiệu ứng được tổng hợp trực tiếp bằng Web Audio trong trình duyệt; không phụ thuộc tệp nhạc ngoài. Gói nền và 6 nhân vật được giải nén tự động khi khởi động.
- Admin hỗ trợ chế độ không mật khẩu khi đặt `ADMIN_AUTH_DISABLED=true`; không bật chế độ này trên dịch vụ công khai không được bảo vệ.