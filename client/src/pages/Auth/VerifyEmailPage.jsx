import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GradientButton } from '../../components/Shared';
import authService from '../../services/authService';
import toast from 'react-hot-toast';

function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const token = searchParams.get('token');
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!token) {
      toast.error('Xác thực email không thành công: Token xác thực không hợp lệ hoặc đã hết hạn.');
      navigate('/register', {
        state: {
          error: 'Token xác thực không hợp lệ hoặc đã hết hạn. Vui lòng đăng ký lại hoặc yêu cầu email xác thực mới.',
        },
      });
      return;
    }
    if (hasRunRef.current) return;
    hasRunRef.current = true;
    handleVerifyEmail();
  }, [token]);

  const handleVerifyEmail = async () => {
    if (!token) return;

    setLoading(true);
    try {
      const response = await authService.verifyEmail(token);
      
      if (response.success) {
        setVerified(true);
        toast.success('✅ Xác thực email thành công! Bạn có thể đăng nhập ngay.');
        
        // Sau 2 giây redirect về trang đăng nhập
        setTimeout(() => {
          navigate('/login', {
            state: {
              message: 'Email đã được xác thực thành công. Vui lòng đăng nhập.'
            }
          });
        }, 2000);
      } else {
        // Trường hợp backend trả success = false
        const errorMessage = response.message || 'Xác thực email không thành công.';
        toast.error(`❌ Xác thực email không thành công: ${errorMessage}`);
        setTimeout(() => {
          navigate('/register', {
            state: {
              error: errorMessage,
            },
          });
        }, 2000);
      }
    } catch (error) {
      const errorMessage = error?.message || 'Xác thực email không thành công.';
      toast.error(`❌ Xác thực email không thành công: ${errorMessage}`);
      setTimeout(() => {
        navigate('/register', {
          state: {
            error: errorMessage,
          },
        });
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  if (verified) {
    return (
      <div className="relative min-h-screen bg-[#020817] text-slate-100 overflow-hidden flex items-center justify-center p-5">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-16 -left-16 h-72 w-72 rounded-full border border-emerald-500/20 bg-emerald-500/10 blur-2xl" />
          <div className="absolute -bottom-12 right-8 h-64 w-64 rounded-full border border-indigo-500/20 bg-indigo-500/10 blur-2xl" />
        </div>

        <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-800/80 bg-[#020a1f]/85 p-8 text-center shadow-[0_12px_32px_rgba(2,8,23,0.6)] backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-400 text-2xl font-black text-white shadow-[0_0_22px_rgba(16,185,129,0.35)]">
            ✓
          </div>
          <h1 className="mt-5 text-3xl font-extrabold text-white">Xác thực thành công</h1>
          <p className="mt-2 text-sm text-slate-300">Email của bạn đã được xác thực. Bạn có thể đăng nhập ngay bây giờ.</p>
          <div className="mt-6 flex justify-center">
            <GradientButton
              variant="primary"
              className="rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-2.5 text-sm hover:from-violet-400 hover:to-indigo-400"
              onClick={() => navigate('/login')}
            >
              Đăng nhập ngay
            </GradientButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#020817] text-slate-100 overflow-hidden flex items-center justify-center p-5">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-16 -left-16 h-72 w-72 rounded-full border border-blue-500/20 bg-blue-500/10 blur-2xl" />
        <div className="absolute -bottom-12 right-8 h-64 w-64 rounded-full border border-violet-500/20 bg-violet-500/10 blur-2xl" />
      </div>

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-800/80 bg-[#020a1f]/85 p-8 text-center shadow-[0_12px_32px_rgba(2,8,23,0.6)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-2xl font-black text-white animate-pulse shadow-[0_0_22px_rgba(99,102,241,0.35)]">
          ...
        </div>
        <h1 className="mt-5 text-3xl font-extrabold text-white">Đang xác thực email</h1>
        <p className="mt-2 text-sm text-slate-300">{loading ? 'Đang xác thực email của bạn...' : 'Vui lòng đợi...'}</p>
        <div className="mx-auto mt-5 h-1.5 w-44 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-1/2 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" />
        </div>
      </div>
    </div>
  );
}

export default VerifyEmailPage;

