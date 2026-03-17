import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GlassCard, GradientButton } from '../../components/Shared';
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
      <div className="min-h-screen flex items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute top-20 left-20 w-[500px] h-[500px] bg-green-600/20 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-20 right-20 w-[500px] h-[500px] bg-emerald-600/20 rounded-full blur-3xl animate-float" style={{animationDelay: '1s'}}></div>
        
        <div className="relative z-10 w-full max-w-md animate-scaleIn">
          <GlassCard className="glass-strong p-10 text-center">
            <div className="text-8xl mb-6 animate-bounce">✅</div>
            <h1 className="text-4xl font-black text-gradient mb-4">Xác Thực Thành Công!</h1>
            <p className="text-gray-300 mb-6">
              Email của bạn đã được xác thực. Bạn có thể đăng nhập ngay bây giờ.
            </p>
            <div className="flex justify-center">
              <GradientButton variant="primary" onClick={() => navigate('/login')}>
                Đăng Nhập Ngay
              </GradientButton>
            </div>
          </GlassCard>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 relative overflow-hidden">
      <div className="absolute top-20 left-20 w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-3xl animate-float"></div>
      <div className="absolute bottom-20 right-20 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-3xl animate-float" style={{animationDelay: '1s'}}></div>
      
      <div className="relative z-10 w-full max-w-md animate-scaleIn">
        <GlassCard className="glass-strong p-10 text-center">
          <div className="text-8xl mb-6 animate-spin">⏳</div>
          <h1 className="text-4xl font-black text-gradient mb-4">Đang Xác Thực...</h1>
          <p className="text-gray-300">
            {loading ? 'Đang xác thực email của bạn...' : 'Vui lòng đợi...'}
          </p>
        </GlassCard>
      </div>
    </div>
  );
}

export default VerifyEmailPage;

