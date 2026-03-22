import { useEffect, useState } from 'react';
import { FiEdit2, FiPlus, FiSettings, FiTrash2, FiUsers } from 'react-icons/fi';
import { Link, useParams } from 'react-router-dom';
import { NotificationModal } from '../../components/Shared';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Textarea from '../../components/ui/Textarea';
import { useAuth } from '../../context/AuthContext';
import { organizationAPI } from '../../services/api/organizationAPI';

const OrganizationPage = () => {
  const { orgId } = useParams();
  const { user } = useAuth();
  const [organization, setOrganization] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: '', description: '' });
  const [notice, setNotice] = useState(null);

  const notify = (message, type = 'success') => {
    setNotice({
      type,
      title: type === 'fail' ? 'Thông báo lỗi' : type === 'info' ? 'Thông tin' : 'Thông báo',
      message,
    });
  };

  useEffect(() => {
    loadOrganization();
    loadDepartments();
    loadMembers();
  }, [orgId]);

  const loadOrganization = async () => {
    try {
      const data = await organizationAPI.getOrganization(orgId);
      setOrganization(data);
    } catch (error) {
      notify('Không thể tải thông tin tổ chức', 'fail');
    }
  };

  const loadDepartments = async () => {
    try {
      const data = await organizationAPI.getDepartments(orgId);
      setDepartments(data);
    } catch (error) {
      console.error('Error loading departments:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async () => {
    try {
      const data = await organizationAPI.getMembers(orgId);
      setMembers(data);
    } catch (error) {
      console.error('Error loading members:', error);
    }
  };

  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    try {
      await organizationAPI.createDepartment(orgId, deptForm);
      notify('Tạo phòng ban thành công', 'success');
      setShowDeptModal(false);
      setDeptForm({ name: '', description: '' });
      loadDepartments();
    } catch (error) {
      notify('Không thể tạo phòng ban', 'fail');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Không tìm thấy tổ chức</h2>
          <Link to="/dashboard">
            <Button>Quay lại Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">{organization.name}</h1>
          <p className="text-gray-600 mt-2">{organization.description}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" icon={FiSettings}>
            Cài đặt
          </Button>
          <Button icon={FiPlus} onClick={() => setShowMemberModal(true)}>
            Mời thành viên
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 rounded-lg">
              <FiUsers className="text-blue-600" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-gray-600 text-sm">Thành viên</p>
              <p className="text-2xl font-bold text-gray-800">{members.length}</p>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-green-100 rounded-lg">
              <FiUsers className="text-green-600" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-gray-600 text-sm">Phòng ban</p>
              <p className="text-2xl font-bold text-gray-800">{departments.length}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-purple-100 rounded-lg">
              <FiUsers className="text-purple-600" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-gray-600 text-sm">Nhóm</p>
              <p className="text-2xl font-bold text-gray-800">0</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Departments Section */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800">Phòng ban</h2>
          <Button size="sm" icon={FiPlus} onClick={() => setShowDeptModal(true)}>
            Tạo phòng ban
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <Card key={dept._id} hover>
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-bold text-lg text-gray-800">{dept.name}</h3>
                <div className="flex gap-2">
                  <button className="p-1 hover:bg-gray-100 rounded">
                    <FiEdit2 size={16} className="text-gray-600" />
                  </button>
                  <button className="p-1 hover:bg-gray-100 rounded">
                    <FiTrash2 size={16} className="text-red-600" />
                  </button>
                </div>
              </div>
              <p className="text-gray-600 text-sm mb-3">{dept.description}</p>
              <div className="flex items-center text-sm text-gray-500">
                <FiUsers size={14} className="mr-1" />
                <span>0 thành viên</span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Members Section */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Thành viên</h2>
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tên
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vai trò
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {members.map((member) => (
                  <tr key={member._id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <img
                            className="h-10 w-10 rounded-full"
                            src={member.user?.avatar || `https://ui-avatars.com/api/?name=${member.user?.name}`}
                            alt=""
                          />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{member.user?.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{member.user?.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {member.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button className="text-indigo-600 hover:text-indigo-900 mr-3">Sửa</button>
                      <button className="text-red-600 hover:text-red-900">Xóa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Create Department Modal */}
      <Modal
        isOpen={showDeptModal}
        onClose={() => setShowDeptModal(false)}
        title="Tạo phòng ban mới"
      >
        <form onSubmit={handleCreateDepartment}>
          <div className="space-y-4">
            <Input
              label="Tên phòng ban"
              value={deptForm.name}
              onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
              placeholder="Nhập tên phòng ban"
              required
            />
            <Textarea
              label="Mô tả"
              value={deptForm.description}
              onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
              placeholder="Mô tả phòng ban"
              rows={3}
            />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setShowDeptModal(false)}>
              Hủy
            </Button>
            <Button type="submit">Tạo phòng ban</Button>
          </div>
        </form>
      </Modal>
      <NotificationModal notice={notice} onClose={() => setNotice(null)} />
    </div>
  );
};

export default OrganizationPage;
