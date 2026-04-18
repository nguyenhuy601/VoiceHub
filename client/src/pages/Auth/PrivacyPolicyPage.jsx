import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import AuthPageLayout from '../../components/Auth/AuthPageLayout';
import AuthMarketingAside from '../../components/Auth/AuthMarketingAside';
import { useTheme } from '../../context/ThemeContext';

function PrivacyPolicyPage() {
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
            <Shield className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </div>
          <div>
            <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${h1}`}>Chính sách bảo mật</h1>
            <p className={`mt-2 text-base ${body}`}>Cách VoiceHub thu thập, sử dụng và bảo vệ dữ liệu của bạn.</p>
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
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>1. Dữ liệu chúng tôi thu thập</h2>
          <p>
            Chúng tôi thu thập thông tin cần thiết để vận hành dịch vụ như email, tên hiển thị, nhật ký truy cập, dữ liệu
            phiên làm việc và nội dung cộng tác theo phạm vi cấu hình của tổ chức.
          </p>
        </section>

        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>2. Mục đích sử dụng dữ liệu</h2>
          <p>
            Dữ liệu được sử dụng để xác thực người dùng, đồng bộ trải nghiệm, tăng cường bảo mật và cải thiện chất lượng
            dịch vụ. Chúng tôi không sử dụng dữ liệu ngoài phạm vi mục đích đã công bố.
          </p>
        </section>

        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>3. Bảo mật và lưu trữ</h2>
          <p>
            VoiceHub áp dụng các biện pháp kỹ thuật hợp lý để bảo vệ dữ liệu, bao gồm kiểm soát truy cập theo vai trò,
            mã hóa khi truyền tải và giám sát truy cập bất thường.
          </p>
        </section>

        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>4. Chia sẻ dữ liệu với bên thứ ba</h2>
          <p>
            Chúng tôi chỉ chia sẻ dữ liệu khi cần thiết cho hạ tầng vận hành, tuân thủ pháp luật hoặc theo yêu cầu chính
            đáng của tổ chức sở hữu dữ liệu.
          </p>
        </section>

        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>5. Quyền của người dùng</h2>
          <p>
            Người dùng có quyền yêu cầu cập nhật thông tin cá nhân, xem lịch sử xử lý dữ liệu và gửi yêu cầu hỗ trợ liên
            quan đến quyền riêng tư thông qua kênh hỗ trợ chính thức.
          </p>
        </section>

        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>6. Cập nhật chính sách</h2>
          <p>
            Chính sách có thể được điều chỉnh để phản ánh thay đổi về tính năng, pháp lý hoặc tiêu chuẩn bảo mật, và sẽ
            được thông báo trước khi có hiệu lực.
          </p>
        </section>

        <section className={callout}>
          <p className="text-base">
            Mọi yêu cầu về quyền riêng tư vui lòng liên hệ:
            <span className="font-semibold"> privacy@voicehub.com</span>.
          </p>
        </section>
      </div>
    </AuthPageLayout>
  );
}

export default PrivacyPolicyPage;
