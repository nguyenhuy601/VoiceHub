import { Link } from 'react-router-dom';

function PrivacyPolicyPage() {
  return (
    <div className="relative min-h-screen bg-[#020817] text-slate-100 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-20 -left-20 h-[22rem] w-[22rem] rounded-full border border-cyan-500/20 bg-cyan-500/10 blur-2xl animate-pulse-slow" />
        <div className="absolute top-20 left-1/3 h-56 w-[20rem] rounded-[48%] border border-sky-500/20 bg-sky-500/10 blur-2xl animate-pulse-slow" style={{ animationDelay: '0.45s' }} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
        <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-[#07122f]/90 to-[#030b1f]/95 p-6 shadow-[0_14px_40px_rgba(2,8,23,0.62)] backdrop-blur-xl sm:p-8 animate-slideUp">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h1 className="text-3xl font-bold text-white">Chính sách bảo mật</h1>
            <Link to="/register" className="text-sm font-semibold text-cyan-400 hover:text-cyan-300">Quay lại đăng ký</Link>
          </div>

          <div className="space-y-5 text-sm leading-7 text-slate-300">
            <section>
              <h2 className="mb-2 text-lg font-semibold text-white">1. Dữ liệu chúng tôi thu thập</h2>
              <p>
                Chúng tôi thu thập thông tin cần thiết để vận hành dịch vụ như email, tên hiển thị, nhật ký truy cập,
                dữ liệu phiên làm việc và nội dung cộng tác theo phạm vi cấu hình của tổ chức.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-white">2. Mục đích sử dụng dữ liệu</h2>
              <p>
                Dữ liệu được sử dụng để xác thực người dùng, đồng bộ trải nghiệm, tăng cường bảo mật và cải thiện
                chất lượng dịch vụ. Chúng tôi không sử dụng dữ liệu ngoài phạm vi mục đích đã công bố.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-white">3. Bảo mật và lưu trữ</h2>
              <p>
                VoiceHub áp dụng các biện pháp kỹ thuật hợp lý để bảo vệ dữ liệu, bao gồm kiểm soát truy cập theo vai
                trò, mã hóa khi truyền tải và giám sát truy cập bất thường.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-white">4. Chia sẻ dữ liệu với bên thứ ba</h2>
              <p>
                Chúng tôi chỉ chia sẻ dữ liệu khi cần thiết cho hạ tầng vận hành, tuân thủ pháp luật hoặc theo yêu cầu
                chính đáng của tổ chức sở hữu dữ liệu.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-white">5. Quyền của người dùng</h2>
              <p>
                Người dùng có quyền yêu cầu cập nhật thông tin cá nhân, xem lịch sử xử lý dữ liệu và gửi yêu cầu hỗ trợ
                liên quan đến quyền riêng tư thông qua kênh hỗ trợ chính thức.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-white">6. Cập nhật chính sách</h2>
              <p>
                Chính sách có thể được điều chỉnh để phản ánh thay đổi về tính năng, pháp lý hoặc tiêu chuẩn bảo mật,
                và sẽ được thông báo trước khi có hiệu lực.
              </p>
            </section>

            <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-cyan-100">
              <p>
                Mọi yêu cầu về quyền riêng tư vui lòng liên hệ:
                <span className="font-semibold"> privacy@voicehub.com</span>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicyPage;