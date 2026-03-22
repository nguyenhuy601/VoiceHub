import { Link } from 'react-router-dom';

function TermsOfServicePage() {
  return (
    <div className="relative min-h-screen bg-[#020817] text-slate-100 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-20 -left-20 h-[22rem] w-[22rem] rounded-full border border-cyan-500/20 bg-cyan-500/10 blur-2xl animate-pulse-slow" />
        <div className="absolute top-20 left-1/3 h-56 w-[20rem] rounded-[48%] border border-sky-500/20 bg-sky-500/10 blur-2xl animate-pulse-slow" style={{ animationDelay: '0.45s' }} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
        <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-[#07122f]/90 to-[#030b1f]/95 p-6 shadow-[0_14px_40px_rgba(2,8,23,0.62)] backdrop-blur-xl sm:p-8 animate-slideUp">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h1 className="text-3xl font-bold text-white">Điều khoản dịch vụ</h1>
            <Link to="/register" className="text-sm font-semibold text-cyan-400 hover:text-cyan-300">Quay lại đăng ký</Link>
          </div>

          <div className="space-y-5 text-sm leading-7 text-slate-300">
            <section>
              <h2 className="mb-2 text-lg font-semibold text-white">1. Phạm vi áp dụng</h2>
              <p>
                Điều khoản này điều chỉnh việc truy cập và sử dụng nền tảng VoiceHub cho mục đích làm việc nhóm,
                giao tiếp nội bộ và quản trị cộng tác doanh nghiệp.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-white">2. Tài khoản người dùng</h2>
              <p>
                Bạn chịu trách nhiệm về thông tin đăng nhập, hoạt động phát sinh từ tài khoản và việc bảo mật mật khẩu.
                Mọi hành vi sử dụng trái phép cần được thông báo ngay cho quản trị viên hệ thống.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-white">3. Quy tắc sử dụng</h2>
              <p>
                Người dùng không được phát tán nội dung vi phạm pháp luật, xâm phạm quyền riêng tư, quấy rối,
                gây gián đoạn dịch vụ hoặc khai thác lỗ hổng bảo mật của hệ thống.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-white">4. Dữ liệu và quyền sở hữu</h2>
              <p>
                Dữ liệu công việc do tổ chức của bạn tạo ra vẫn thuộc quyền quản lý của tổ chức. VoiceHub chỉ xử lý
                dữ liệu để cung cấp tính năng vận hành, đồng bộ và bảo mật theo phạm vi dịch vụ đã công bố.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-white">5. Giới hạn trách nhiệm</h2>
              <p>
                VoiceHub nỗ lực duy trì tính sẵn sàng và an toàn của hệ thống, tuy nhiên không cam kết dịch vụ luôn
                không gián đoạn trong mọi tình huống bất khả kháng, bảo trì hoặc sự cố hạ tầng bên thứ ba.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-white">6. Chấm dứt và cập nhật điều khoản</h2>
              <p>
                Chúng tôi có thể tạm ngưng hoặc chấm dứt quyền truy cập khi phát hiện vi phạm nghiêm trọng. Điều khoản
                có thể được cập nhật theo nhu cầu vận hành và sẽ được thông báo trên nền tảng.
              </p>
            </section>

            <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-cyan-100">
              <p>
                Nếu bạn có câu hỏi về điều khoản sử dụng, vui lòng liên hệ đội hỗ trợ qua email:
                <span className="font-semibold"> support@voicehub.com</span>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TermsOfServicePage;