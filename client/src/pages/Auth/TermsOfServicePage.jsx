import { Link } from 'react-router-dom';
import { ArrowLeft, Scale } from 'lucide-react';
import AuthPageLayout from '../../components/Auth/AuthPageLayout';
import AuthMarketingAside from '../../components/Auth/AuthMarketingAside';
import { useTheme } from '../../context/ThemeContext';

function TermsOfServicePage() {
  const { isDarkMode } = useTheme();
  const h1 = isDarkMode ? 'text-white' : 'text-[#0f172a]';
  const h2 = isDarkMode ? 'text-white' : 'text-slate-900';
  const body = isDarkMode ? 'text-slate-300' : 'text-slate-600';
  const linkCyan = isDarkMode ? 'text-cyan-400 hover:underline' : 'text-cyan-700 hover:underline';
  const callout = isDarkMode
    ? 'rounded-xl border border-cyan-500/25 bg-cyan-500/[0.08] p-4 text-cyan-100'
    : 'rounded-xl border border-cyan-200/90 bg-cyan-50 p-4 text-cyan-950';
  const iconWrap = isDarkMode ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-100 text-cyan-700';

  return (
    <AuthPageLayout aside={<AuthMarketingAside />} contentMaxWidth="max-w-4xl" mainAlign="start">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconWrap}`}>
            <Scale className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </div>
          <div>
            <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${h1}`}>Điều khoản dịch vụ</h1>
            <p className={`mt-2 text-base ${body}`}>Điều kiện sử dụng nền tảng VoiceHub cho đội ngũ và doanh nghiệp.</p>
          </div>
        </div>
        <Link
          to="/register"
          className={`inline-flex shrink-0 items-center gap-2 self-start text-base font-semibold ${linkCyan}`}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Quay lại đăng ký
        </Link>
      </div>

      <div className={`space-y-6 text-base leading-relaxed ${body}`}>
        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>1. Phạm vi áp dụng</h2>
          <p>
            Điều khoản này điều chỉnh việc truy cập và sử dụng nền tảng VoiceHub cho mục đích làm việc nhóm, giao tiếp
            nội bộ và quản trị cộng tác doanh nghiệp.
          </p>
        </section>

        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>2. Tài khoản người dùng</h2>
          <p>
            Bạn chịu trách nhiệm về thông tin đăng nhập, hoạt động phát sinh từ tài khoản và việc bảo mật mật khẩu. Mọi
            hành vi sử dụng trái phép cần được thông báo ngay cho quản trị viên hệ thống.
          </p>
        </section>

        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>3. Quy tắc sử dụng</h2>
          <p>
            Người dùng không được phát tán nội dung vi phạm pháp luật, xâm phạm quyền riêng tư, quấy rối, gây gián đoạn
            dịch vụ hoặc khai thác lỗ hổng bảo mật của hệ thống.
          </p>
        </section>

        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>4. Dữ liệu và quyền sở hữu</h2>
          <p>
            Dữ liệu công việc do tổ chức của bạn tạo ra vẫn thuộc quyền quản lý của tổ chức. VoiceHub chỉ xử lý dữ liệu
            để cung cấp tính năng vận hành, đồng bộ và bảo mật theo phạm vi dịch vụ đã công bố.
          </p>
        </section>

        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>5. Giới hạn trách nhiệm</h2>
          <p>
            VoiceHub nỗ lực duy trì tính sẵn sàng và an toàn của hệ thống, tuy nhiên không cam kết dịch vụ luôn không
            gián đoạn trong mọi tình huống bất khả kháng, bảo trì hoặc sự cố hạ tầng bên thứ ba.
          </p>
        </section>

        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>6. Chấm dứt và cập nhật điều khoản</h2>
          <p>
            Chúng tôi có thể tạm ngưng hoặc chấm dứt quyền truy cập khi phát hiện vi phạm nghiêm trọng. Điều khoản có thể
            được cập nhật theo nhu cầu vận hành và sẽ được thông báo trên nền tảng.
          </p>
        </section>

        <section className={callout}>
          <p className="text-base">
            Nếu bạn có câu hỏi về điều khoản sử dụng, vui lòng liên hệ đội hỗ trợ qua email:
            <span className="font-semibold"> support@voicehub.com</span>.
          </p>
        </section>
      </div>
    </AuthPageLayout>
  );
}

export default TermsOfServicePage;
