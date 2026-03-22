import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { NotificationModal } from '../../components/Shared';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { organizationAPI } from '../../services/api/organizationAPI';

const OrganizationDetailPage = () => {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const [organization, setOrganization] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [pendingRedirect, setPendingRedirect] = useState('');

  const notify = (message, type = 'success') => {
    setNotice({
      type,
      title: type === 'fail' ? 'Thông báo lỗi' : type === 'info' ? 'Thông tin' : 'Thông báo',
      message,
    });
  };

  useEffect(() => {
    loadOrganizationDetails();
  }, [orgId]);

  const loadOrganizationDetails = async () => {
    try {
      const [orgData, deptData, memberData] = await Promise.all([
        organizationAPI.getOrganization(orgId),
        organizationAPI.getDepartments(orgId),
        organizationAPI.getMembers(orgId)
      ]);
      
      setOrganization(orgData);
      setDepartments(deptData);
      setMembers(memberData);
    } catch (error) {
      notify('Không thể tải thông tin tổ chức', 'fail');
      setPendingRedirect('/organizations');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!organization) {
    return (
      <NotificationModal
        notice={notice}
        onClose={() => {
          setNotice(null);
          if (pendingRedirect) {
            navigate(pendingRedirect);
            setPendingRedirect('');
          }
        }}
      />
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="secondary"
          onClick={() => navigate('/organizations')}
          className="mb-4"
        >
          ← Quay lại
        </Button>
        
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">{organization.name}</h1>
            <p className="text-gray-400">{organization.description}</p>
          </div>
          <Button onClick={() => navigate(`/organizations/${orgId}/settings`)}>
            Cài đặt
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <h3 className="text-gray-400 text-sm mb-1">Thành viên</h3>
          <p className="text-2xl font-bold">{members.length}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-gray-400 text-sm mb-1">Phòng ban</h3>
          <p className="text-2xl font-bold">{departments.length}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-gray-400 text-sm mb-1">Trạng thái</h3>
          <p className="text-2xl font-bold text-green-500">Hoạt động</p>
        </Card>
      </div>

      {/* Departments */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Phòng ban</h2>
          <Button onClick={() => navigate(`/organizations/${orgId}/departments/new`)}>
            + Thêm phòng ban
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <Card key={dept._id} className="p-4 hover:border-primary-500 cursor-pointer transition-all">
              <h3 className="font-semibold mb-2">{dept.name}</h3>
              <p className="text-sm text-gray-400">{dept.description}</p>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-gray-500">{dept.memberCount || 0} thành viên</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate(`/organizations/${orgId}/departments/${dept._id}`)}
                >
                  Chi tiết
                </Button>
              </div>
            </Card>
          ))}
          
          {departments.length === 0 && (
            <div className="col-span-full text-center py-8 text-gray-400">
              Chưa có phòng ban nào
            </div>
          )}
        </div>
      </div>

      {/* Members */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Thành viên</h2>
          <Button onClick={() => navigate(`/organizations/${orgId}/members/invite`)}>
            + Mời thành viên
          </Button>
        </div>
        
        <Card>
          <div className="divide-y divide-dark-700">
            {members.map((member) => (
              <div key={member._id} className="p-4 flex items-center justify-between hover:bg-dark-700/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center">
                    <span className="text-white font-semibold">
                      {member.user?.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium">{member.user?.name}</p>
                    <p className="text-sm text-gray-400">{member.user?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-primary-500/20 text-primary-400">
                    {member.role}
                  </span>
                </div>
              </div>
            ))}
            
            {members.length === 0 && (
              <div className="p-8 text-center text-gray-400">
                Chưa có thành viên nào
              </div>
            )}
          </div>
        </Card>
      </div>
      <NotificationModal
        notice={notice}
        onClose={() => {
          setNotice(null);
          if (pendingRedirect) {
            navigate(pendingRedirect);
            setPendingRedirect('');
          }
        }}
      />
    </div>
  );
};

export default OrganizationDetailPage;
