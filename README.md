# KON COFFEE LIVE · v1.4.0

Game TikTok LIVE dạng Browser Source 1080×1920, sân vườn cafe 25 bàn / 100 chỗ.

## Luật chơi được giữ nguyên
- 25 bàn × 4 ghế = 100 khách.
- Bình luận gọi món hoặc chọn bàn 1–25 để vào quán.
- Hoa Hồng được cộng dồn theo từng người gửi trong phiên LIVE; đủ 10 bông từ cùng một người sẽ kích hoạt **BAO CẢ QUÁN**.
- Thanh CHILL đạt 100% sẽ bật Hoàng Hôn Bãi Cháy.
- Giọng đọc chỉ dùng voice `vi-VN` / `vi`; không tự fallback sang tiếng Anh.

## Chạy local
1. Cài Node.js 20 LTS.
2. Mở terminal trong thư mục dự án và chạy `npm install`.
3. Tạo `.env` từ `.env.example` nếu cần đổi tài khoản TikTok.
4. Chạy `npm start`, mở `http://localhost:3000`.
5. OBS / TikTok Live Studio → Browser Source → URL `http://localhost:3000`, kích thước 1080×1920.
6. Nhấn **BẬT GIỌNG VIỆT** một lần trong Browser Source (hoặc phím `V`) để cho phép trình duyệt phát tiếng. Voice dùng thư viện giọng có sẵn trên máy chạy OBS, không phải voice server.

## Kiểm tra nhanh
- `npm run check`: kiểm tra cú pháp server và JavaScript trong trang.
- Phím `1`: thêm khách test.
- Phím `2`: test combo 10 Hoa Hồng.
- Phím `3`: đẩy CHILL lên 100%.
- Phím `V`: bật / thử giọng Việt.
- `GET /healthz`: trạng thái server và kết nối TikTok.

## Deploy bằng GitHub + Render
GitHub lưu mã nguồn; Render chạy Node.js, Socket.IO và kết nối TikTok. Không dùng GitHub Pages cho backend Node.

1. Đưa các file trong thư mục này lên repo GitHub, giữ `index.html`, `server.js`, `package.json`, `garden-bg.jpg` ở thư mục gốc.
2. Render → New → Blueprint → chọn repo `KON_COFFEE_LIVE`; Render đọc `render.yaml`.
3. Xác nhận tạo Web Service. Blueprint hiện đặt `plan: starter` và region Singapore để tránh free service ngủ trong lúc LIVE. Kiểm tra giá hiển thị trong Render trước khi xác nhận.
4. Sau deploy, mở URL Render `/healthz`. Nếu `ok: true`, server đã chạy; `tiktokConnected: true` mới xác nhận connector đang bắt được phiên LIVE.
5. Trong OBS Browser Source dùng URL gốc Render, ví dụ `https://ten-dich-vu.onrender.com`, kích thước 1080×1920.
6. Mỗi lần push commit lên nhánh đã kết nối, Render tự deploy bản mới.

## Lưu ý quan trọng
- Repository hiện có thể đang Public. Chuyển sang Private trước khi đưa code lên nếu muốn giữ mã nguồn riêng.
- Không đưa mật khẩu TikTok, cookie, token hay file `.env` lên GitHub.
- TikTok connector là thư viện bên thứ ba, không phải API LIVE chính thức; TikTok có thể thay đổi giao thức. Cần test trên phiên LIVE thật trước khi dùng chính thức.
- Kiểm tra gift ID / gift name thực tế của Hoa Hồng ở phiên LIVE đầu tiên; nếu catalog theo vùng thay đổi thì cập nhật `roseGiftIds` trong `index.html`.
- `tiktokConnected: false` không nhất thiết là lỗi deploy; kênh phải đang LIVE công khai và connector phải truy cập được.
