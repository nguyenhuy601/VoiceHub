import { Link } from 'react-router-dom';
import { GradientButton } from '../../components/Shared';

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <div className="text-8xl mb-6 animate-float">🚀</div>
        <h1 className="text-6xl font-black text-gradient mb-4">404</h1>
        <p className="text-2xl text-gray-400 mb-8">Trang không tồn tại</p>
        <Link to="/dashboard">
          <GradientButton variant="primary">Quay về Dashboard</GradientButton>
        </Link>
      </div>
    </div>
  );
}

export default NotFoundPage;
