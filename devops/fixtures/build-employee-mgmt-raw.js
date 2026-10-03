/**
 * One-shot: build Customer Requirement Raw sample for Employee Management.
 * Usage: node devops/fixtures/build-employee-mgmt-raw.js
 */
const path = require('path');
const ExcelJS = require(path.join(
  __dirname,
  '../../services/project-service/node_modules/exceljs'
));
const {
  CUSTOMER_RAW_SHEETS,
  CUSTOMER_RAW_SHEET_COLUMNS,
  CUSTOMER_RAW_CONTEXT_FIELDS,
  CUSTOMER_RAW_META_DEFAULTS,
  CUSTOMER_RAW_README_ROWS,
} = require('../../services/project-service/src/constants/customerRawTemplate.constants');

const OUT = path.join(__dirname, 'Customer_Requirement_Raw_QuanLyNhanVien.xlsx');

const CONTEXT_VALUES = {
  'Project ID': 'PRJ-HRM-2026',
  'Project Name': 'Hệ thống Quản lý nhân viên (Employee Management)',
  Customer: 'Công ty TNHH VoiceHub Demo',
  'Business Domain': 'Nhân sự / HRM',
  'Project Objective':
    'Số hóa quản lý hồ sơ nhân viên, chấm công, nghỉ phép, cơ cấu tổ chức và báo cáo nhân sự để thay quy trình Excel/giấy tờ.',
  'Business Problem':
    'Hồ sơ nhân viên phân tán trên Excel; chấm công thủ công dễ sai; duyệt nghỉ phép qua email chậm; thiếu báo cáo headcount realtime.',
  'Business Scope':
    'Web app nội bộ quản lý nhân viên: hồ sơ, phòng ban, chấm công, nghỉ phép, phân quyền, báo cáo cơ bản. Không gồm tính lương phức tạp đầy đủ trong giai đoạn 1.',
  'In Scope':
    'Quản lý hồ sơ NV; cơ cấu phòng ban; chấm công vào/ra; đăng ký & duyệt nghỉ phép; phân quyền theo vai trò; báo cáo headcount & công; thông báo duyệt.',
  'Out of Scope':
    'Payroll đầy đủ (tính thuế TNCN, BHXH chi tiết); tuyển dụng ATS; đánh giá KPI 360; mobile native app; tích hợp máy chấm công phần cứng giai 1.',
  'Target Users': 'Nhân viên, Trưởng phòng, HR Admin, HR Manager, System Admin',
  'Expected Outcome':
    'Giảm thời gian xử lý nghỉ phép < 1 ngày; hồ sơ NV tập trung; báo cáo headcount theo phòng ban realtime; giảm sai sót chấm công.',
  'Target Platform': 'Web (responsive), API nội bộ',
  'Existing System': 'Excel master list nhân viên + email duyệt nghỉ + máy chấm công độc lập (CSV export)',
  Integration:
    'SSO công ty (OIDC); email/SMTP thông báo; import CSV từ máy chấm công; đồng bộ danh mục phòng ban từ hệ thống Org (nếu có)',
  Constraint:
    'Dữ liệu nhân sự chỉ lưu trong VN; tuân thủ nội quy bảo mật thông tin cá nhân; giai đoạn 1 tối đa ~2.000 nhân viên active',
  Deadline: '2026-12-15',
  Budget: 'Theo hợp đồng giai đoạn 1 (khách cung cấp sau)',
  Priority: 'High',
  Assumption:
    'Mỗi nhân viên có email công ty duy nhất; phòng ban có cây tối đa 4 cấp; ca làm việc mặc định 08:00–17:00 trừ khi cấu hình khác',
  Source: 'Workshop HR 2026-09-12; Email HR Manager 2026-09-18; Quy trình nghỉ phép hiện tại.docx',
};

const BUSINESS_REQUESTS = [
  [
    'BRQ-001',
    'Quản lý hồ sơ nhân viên tập trung',
    'Muốn có một nơi lưu hồ sơ nhân viên thay vì nhiều file Excel.',
    'Hồ sơ phân tán, khó tìm, dễ lệch phiên bản khi nhiều HR cùng sửa.',
    'Có danh bạ / hồ sơ nhân viên chuẩn hóa, tra cứu nhanh, cập nhật có lịch sử.',
    'Giảm thời gian tìm hồ sơ; giảm sai sót thông tin cá nhân.',
    'High',
    'HR Manager',
    'Workshop HR 2026-09-12',
    '2026-09-12',
    'Ưu tiên phase 1',
  ],
  [
    'BRQ-002',
    'Cơ cấu phòng ban và vị trí',
    'Cần quản lý phòng ban, vị trí công việc và gán nhân viên vào đúng đơn vị.',
    'Org chart đang vẽ tay trên PowerPoint, không khớp Excel.',
    'Cây phòng ban + vị trí + gán NV; báo cáo headcount theo đơn vị.',
    'Headcount theo phòng ban chính xác phục vụ lãnh đạo.',
    'High',
    'HR Admin',
    'Workshop HR 2026-09-12',
    '2026-09-12',
    '',
  ],
  [
    'BRQ-003',
    'Chấm công điện tử',
    'Nhân viên chấm công vào/ra trên web; HR import được file từ máy chấm công.',
    'Chấm công thủ công và CSV máy chấm công xử lý tay mỗi tháng.',
    'Ghi nhận công hàng ngày; HR điều chỉnh có lý do; xuất báo cáo công.',
    'Giảm sai sót công; rút ngắn chốt công cuối tháng.',
    'High',
    'HR Admin',
    'Email HR 2026-09-18',
    '2026-09-18',
    'Máy chấm công cũ vẫn giữ, chỉ import CSV',
  ],
  [
    'BRQ-004',
    'Đăng ký và duyệt nghỉ phép',
    'Nhân viên xin nghỉ trên hệ thống; trưởng phòng duyệt; HR theo dõi số ngày còn lại.',
    'Xin nghỉ qua email/Zalo; không biết còn bao nhiêu ngày phép.',
    'Workflow xin nghỉ → duyệt/từ chối; theo dõi số dư phép; thông báo email.',
    'Rút ngắn vòng duyệt; minh bạch số ngày phép.',
    'High',
    'Trưởng phòng / HR',
    'Workshop HR 2026-09-12',
    '2026-09-12',
    'Loại nghỉ: phép năm, ốm, không lương, công tác',
  ],
  [
    'BRQ-005',
    'Phân quyền theo vai trò',
    'Mỗi người chỉ xem/sửa đúng phạm vi: NV tự xem; TP xem team; HR xem toàn công ty.',
    'Hiện chia sẻ Excel nên lộ thông tin lương/cá nhân không cần thiết.',
    'RBAC theo vai trò + phạm vi phòng ban.',
    'Bảo vệ dữ liệu nhạy cảm; đúng người đúng việc.',
    'High',
    'System Admin / HR Manager',
    'Security note 2026-09-20',
    '2026-09-20',
    '',
  ],
  [
    'BRQ-006',
    'Báo cáo nhân sự cơ bản',
    'Lãnh đạo muốn xem headcount, biến động nhân sự, tổng hợp công/nghỉ theo tháng.',
    'Báo cáo làm tay cuối tháng, chậm 3–5 ngày.',
    'Dashboard/báo cáo xuất Excel: headcount, biến động, công, nghỉ phép.',
    'Quyết định nhân sự kịp thời hơn.',
    'Medium',
    'HR Manager / Ban Giám đốc',
    'Meeting BGĐ 2026-09-22',
    '2026-09-22',
    'Phase 1: báo cáo cơ bản, chưa BI nâng cao',
  ],
  [
    'BRQ-007',
    'Thông báo và nhắc việc',
    'Khi có đơn nghỉ cần duyệt hoặc sắp hết hạn hợp đồng, hệ thống gửi thông báo.',
    'Hay quên duyệt hoặc quên gia hạn HĐLĐ.',
    'Email + in-app notification cho sự kiện duyệt và nhắc HĐ.',
    'Giảm bỏ sót duyệt và rủi ro hết hạn HĐ.',
    'Medium',
    'HR Admin',
    'Email HR 2026-09-18',
    '2026-09-18',
    '',
  ],
];

const REQUIREMENTS = [
  // BRQ-001 Hồ sơ
  ['CR-001', 'BRQ-001', 'HR tạo hồ sơ nhân viên mới với mã NV tự sinh hoặc nhập tay (unique)', 'Functional', 'Hồ sơ nhân viên', 'HR Admin', 'High', 'Tạo thành công; mã NV không trùng; hồ sơ ở trạng thái Active.', 'Workshop', 'Workshop HR #1', 'HR Manager', '2026-09-12', 'Mã NV dạng NV-YYYY-xxxx', 'REF-001'],
  ['CR-002', 'BRQ-001', 'HR cập nhật thông tin cá nhân, liên hệ, hợp đồng của nhân viên', 'Functional', 'Hồ sơ nhân viên', 'HR Admin', 'High', 'Thay đổi được lưu; có thể xem lại lịch sử chỉnh sửa cơ bản.', 'Workshop', 'Workshop HR #1', 'HR Manager', '2026-09-12', '', 'REF-001'],
  ['CR-003', 'BRQ-001', 'HR và NV tìm kiếm nhân viên theo tên, mã NV, phòng ban, trạng thái', 'Functional', 'Hồ sơ nhân viên', 'HR Admin / Nhân viên', 'High', 'Kết quả trả về đúng bộ lọc trong vài giây với ~2.000 NV.', 'Workshop', 'Workshop HR #1', 'HR Admin', '2026-09-12', '', 'REF-001'],
  ['CR-004', 'BRQ-001', 'Nhân viên xem hồ sơ của chính mình (thông tin được phép xem)', 'Functional', 'Hồ sơ nhân viên', 'Nhân viên', 'High', 'NV chỉ xem được hồ sơ mình; không xem lương/đánh giá nếu chưa mở quyền.', 'Workshop', 'Workshop HR #1', 'HR Manager', '2026-09-12', '', 'REF-001'],
  ['CR-005', 'BRQ-001', 'HR chuyển trạng thái nhân viên: Active / On leave / Resigned / Terminated', 'Functional', 'Hồ sơ nhân viên', 'HR Admin', 'High', 'Đổi trạng thái có ngày hiệu lực; NV Resigned không đăng nhập được.', 'Workshop', 'Workshop HR #1', 'HR Manager', '2026-09-12', '', 'REF-002'],
  ['CR-006', 'BRQ-001', 'HR đính kèm tài liệu hồ sơ (HĐLĐ scan, CCCD) dưới dạng file', 'Functional', 'Hồ sơ nhân viên', 'HR Admin', 'Medium', 'Upload file PDF/JPG; dung lượng theo giới hạn công ty; chỉ HR xem.', 'Email', 'Email HR 2026-09-18', 'HR Admin', '2026-09-18', 'Giới hạn 10MB/file', 'REF-003'],
  ['CR-007', 'BRQ-001', 'HR nhập hàng loạt nhân viên từ file Excel/CSV theo mẫu', 'Functional', 'Hồ sơ nhân viên', 'HR Admin', 'Medium', 'Import báo dòng lỗi rõ; dòng hợp lệ được tạo; không tạo trùng mã NV.', 'Workshop', 'Workshop HR #1', 'HR Admin', '2026-09-12', '', 'REF-001'],
  ['CR-008', 'BRQ-001', 'Hệ thống lưu ngày vào làm, ngày nghỉ việc, loại hợp đồng', 'Functional', 'Hồ sơ nhân viên', 'HR Admin', 'High', 'Các trường ngày bắt buộc theo loại HĐ; dùng cho báo cáo biến động.', 'Document', 'Quy trình NS hiện tại', 'HR Manager', '2026-09-12', '', 'REF-002'],

  // BRQ-002 Org
  ['CR-009', 'BRQ-002', 'HR tạo/sửa/vô hiệu hóa phòng ban theo cây phân cấp', 'Functional', 'Tổ chức', 'HR Admin', 'High', 'Cây phòng ban hiển thị đúng cha-con; không xóa phòng còn NV active.', 'Workshop', 'Workshop HR #1', 'HR Admin', '2026-09-12', 'Tối đa 4 cấp', 'REF-001'],
  ['CR-010', 'BRQ-002', 'HR tạo danh mục vị trí / chức danh và gán cho nhân viên', 'Functional', 'Tổ chức', 'HR Admin', 'High', 'Mỗi NV có ít nhất 1 vị trí chính tại một thời điểm.', 'Workshop', 'Workshop HR #1', 'HR Admin', '2026-09-12', '', 'REF-001'],
  ['CR-011', 'BRQ-002', 'HR gán nhân viên vào phòng ban và chỉ định trưởng phòng', 'Functional', 'Tổ chức', 'HR Admin', 'High', 'Mỗi phòng có 0 hoặc 1 trưởng phòng; NV thuộc đúng phòng.', 'Workshop', 'Workshop HR #1', 'HR Manager', '2026-09-12', '', 'REF-001'],
  ['CR-012', 'BRQ-002', 'Người dùng xem sơ đồ tổ chức (org chart) theo phòng ban', 'Functional', 'Tổ chức', 'Tất cả', 'Medium', 'Hiển thị cây phòng + số NV; ẩn thông tin nhạy cảm.', 'Meeting', 'Meeting BGĐ 2026-09-22', 'HR Manager', '2026-09-22', '', 'REF-004'],
  ['CR-013', 'BRQ-002', 'Khi chuyển phòng ban, hệ thống ghi nhận lịch sử chuyển công tác', 'Functional', 'Tổ chức', 'HR Admin', 'Medium', 'Có bản ghi from→to + ngày hiệu lực; báo cáo biến động dùng được.', 'Workshop', 'Workshop HR #1', 'HR Admin', '2026-09-12', '', 'REF-002'],

  // BRQ-003 Chấm công
  ['CR-014', 'BRQ-003', 'Nhân viên chấm công Check-in / Check-out trên web trong ngày làm việc', 'Functional', 'Chấm công', 'Nhân viên', 'High', 'Ghi nhận thời điểm; không cho check-in trùng khi đã check-in chưa out.', 'Email', 'Email HR 2026-09-18', 'HR Admin', '2026-09-18', '', 'REF-003'],
  ['CR-015', 'BRQ-003', 'Hệ thống tính công ngày theo ca mặc định 08:00–17:00 (có cấu hình)', 'Functional', 'Chấm công', 'Hệ thống', 'High', 'Công ngày phản ánh đúng giờ vào/ra và quy tắc đi muộn/về sớm đã cấu hình.', 'Email', 'Email HR 2026-09-18', 'HR Manager', '2026-09-18', 'Ca linh hoạt phase sau', 'REF-003'],
  ['CR-016', 'BRQ-003', 'HR import file CSV chấm công từ máy chấm công theo mẫu', 'Functional', 'Chấm công', 'HR Admin', 'High', 'Map được mã NV ↔ máy chấm công; dòng lỗi báo rõ; không ghi đè tay không có lý do.', 'Email', 'Email HR 2026-09-18', 'HR Admin', '2026-09-18', 'Máy cũ export CSV', 'REF-005'],
  ['CR-017', 'BRQ-003', 'HR điều chỉnh công thủ công kèm lý do và người duyệt', 'Functional', 'Chấm công', 'HR Admin', 'High', 'Mọi điều chỉnh có lý do + audit; NV/TP có thể xem ghi chú.', 'Workshop', 'Workshop HR #1', 'HR Manager', '2026-09-12', '', 'REF-001'],
  ['CR-018', 'BRQ-003', 'HR và Trưởng phòng xem bảng công theo tháng của phạm vi mình', 'Functional', 'Chấm công', 'HR Admin / Trưởng phòng', 'High', 'TP chỉ xem team; HR xem toàn công ty; lọc theo tháng/phòng.', 'Workshop', 'Workshop HR #1', 'Trưởng phòng', '2026-09-12', '', 'REF-001'],
  ['CR-019', 'BRQ-003', 'Xuất bảng công tháng ra Excel', 'Functional', 'Chấm công', 'HR Admin', 'Medium', 'File Excel đủ cột ngày công, đi muộn, vắng, nghỉ phép.', 'Email', 'Email HR 2026-09-18', 'HR Admin', '2026-09-18', '', 'REF-003'],
  ['CR-020', 'BRQ-003', 'Hệ thống đánh dấu ngày lễ / ngày nghỉ cấu hình theo lịch công ty', 'Functional', 'Chấm công', 'HR Admin', 'Medium', 'Ngày lễ không tính công bắt buộc; cấu hình theo năm.', 'Document', 'Lịch nghỉ lễ 2026', 'HR Admin', '2026-09-20', '', 'REF-006'],

  // BRQ-004 Nghỉ phép
  ['CR-021', 'BRQ-004', 'Nhân viên tạo đơn xin nghỉ (loại, từ ngày–đến ngày, lý do)', 'Functional', 'Nghỉ phép', 'Nhân viên', 'High', 'Đơn ở trạng thái Pending; validate ngày hợp lệ và đủ số dư (phép năm).', 'Workshop', 'Workshop HR #1', 'Nhân viên', '2026-09-12', 'Loại: phép năm, ốm, không lương, công tác', 'REF-001'],
  ['CR-022', 'BRQ-004', 'Trưởng phòng duyệt hoặc từ chối đơn nghỉ của nhân viên trong phòng', 'Functional', 'Nghỉ phép', 'Trưởng phòng', 'High', 'Duyệt/từ chối có ghi chú; trạng thái cập nhật; gửi thông báo cho NV.', 'Workshop', 'Workshop HR #1', 'Trưởng phòng', '2026-09-12', '', 'REF-001'],
  ['CR-023', 'BRQ-004', 'HR xem và có thể override / hủy đơn nghỉ theo quy định', 'Functional', 'Nghỉ phép', 'HR Admin', 'Medium', 'HR ghi lý do override; có audit trail.', 'Workshop', 'Workshop HR #1', 'HR Manager', '2026-09-12', '', 'REF-002'],
  ['CR-024', 'BRQ-004', 'Hệ thống theo dõi số dư phép năm của từng nhân viên', 'Functional', 'Nghỉ phép', 'Nhân viên / HR', 'High', 'Số dư giảm khi duyệt phép năm; NV xem được số dư còn lại.', 'Workshop', 'Workshop HR #1', 'HR Manager', '2026-09-12', 'Mặc định 12 ngày/năm (cấu hình)', 'REF-002'],
  ['CR-025', 'BRQ-004', 'Không cho đăng ký nghỉ phép chồng ngày đã có đơn Approved/Pending', 'Functional', 'Nghỉ phép', 'Hệ thống', 'High', 'Hệ thống từ chối tạo đơn trùng khoảng ngày.', 'Workshop', 'Workshop HR #1', 'HR Admin', '2026-09-12', 'Khách nhấn mạnh', 'REF-001'],
  ['CR-026', 'BRQ-004', 'Đơn nghỉ đã duyệt tự động phản ánh vào bảng công', 'Functional', 'Nghỉ phép', 'Hệ thống', 'High', 'Ngày nghỉ approved hiển thị đúng loại trên bảng công tháng.', 'Email', 'Email HR 2026-09-18', 'HR Admin', '2026-09-18', '', 'REF-003'],
  ['CR-027', 'BRQ-004', 'Nhân viên hủy đơn Pending; không hủy đơn đã Approved trừ qua HR', 'Functional', 'Nghỉ phép', 'Nhân viên', 'Medium', 'Pending hủy được; Approved chỉ HR/TP hủy theo policy.', 'Workshop', 'Workshop HR #1', 'HR Manager', '2026-09-12', '', 'REF-001'],

  // BRQ-005 Phân quyền
  ['CR-028', 'BRQ-005', 'Hệ thống có các vai trò: Nhân viên, Trưởng phòng, HR Admin, HR Manager, System Admin', 'Functional', 'Phân quyền', 'System Admin', 'High', 'Mỗi user có ≥1 vai trò; quyền theo ma trận đã thống nhất.', 'Document', 'Security note', 'System Admin', '2026-09-20', '', 'REF-007'],
  ['CR-029', 'BRQ-005', 'Trưởng phòng chỉ xem/duyệt dữ liệu nhân viên thuộc phòng mình (và phòng con nếu có)', 'Functional', 'Phân quyền', 'Trưởng phòng', 'High', 'Không xem được NV ngoài phạm vi; thử truy cập ID khác bị từ chối.', 'Document', 'Security note', 'HR Manager', '2026-09-20', '', 'REF-007'],
  ['CR-030', 'BRQ-005', 'Đăng nhập qua SSO công ty (OIDC); phiên hết hạn theo chính sách', 'Functional', 'Phân quyền', 'Tất cả', 'High', 'User đăng nhập SSO thành công; session timeout theo cấu hình.', 'Document', 'Security note', 'System Admin', '2026-09-20', '', 'REF-007'],
  ['CR-031', 'BRQ-005', 'Che / không hiển thị trường nhạy cảm (lương, CCCD đầy đủ) theo vai trò', 'Functional', 'Phân quyền', 'Hệ thống', 'High', 'NV thường không thấy lương; chỉ HR Manager/HR Admin theo policy.', 'Document', 'Security note', 'HR Manager', '2026-09-20', 'Phase 1 có thể chỉ lưu trường cơ bản, chưa module lương', 'REF-007'],
  ['CR-032', 'BRQ-005', 'Ghi nhật ký thao tác quan trọng (tạo/sửa hồ sơ, duyệt nghỉ, điều chỉnh công)', 'Functional', 'Phân quyền', 'System Admin / HR Manager', 'Medium', 'Audit log có user, thời gian, hành động, đối tượng.', 'Document', 'Security note', 'System Admin', '2026-09-20', '', 'REF-007'],

  // BRQ-006 Báo cáo
  ['CR-033', 'BRQ-006', 'Báo cáo headcount theo phòng ban và trạng thái tại một ngày', 'Functional', 'Báo cáo', 'HR Manager', 'High', 'Số liệu khớp danh sách NV active; xuất Excel được.', 'Meeting', 'Meeting BGĐ', 'Ban Giám đốc', '2026-09-22', '', 'REF-004'],
  ['CR-034', 'BRQ-006', 'Báo cáo biến động nhân sự (vào mới / nghỉ việc) theo khoảng thời gian', 'Functional', 'Báo cáo', 'HR Manager', 'Medium', 'Liệt kê đúng NV join/leave trong kỳ.', 'Meeting', 'Meeting BGĐ', 'HR Manager', '2026-09-22', '', 'REF-004'],
  ['CR-035', 'BRQ-006', 'Báo cáo tổng hợp công và nghỉ phép theo tháng / phòng ban', 'Functional', 'Báo cáo', 'HR Admin / HR Manager', 'High', 'Tổng hợp khớp bảng công và đơn nghỉ approved.', 'Meeting', 'Meeting BGĐ', 'HR Manager', '2026-09-22', '', 'REF-004'],
  ['CR-036', 'BRQ-006', 'Dashboard tóm tắt: tổng NV, đơn nghỉ pending, sắp hết hạn HĐ (30/60 ngày)', 'Functional', 'Báo cáo', 'HR Admin', 'Medium', 'Widget hiển thị số liệu realtime hoặc gần realtime sau refresh.', 'Meeting', 'Meeting BGĐ', 'HR Admin', '2026-09-22', '', 'REF-004'],

  // BRQ-007 Thông báo
  ['CR-037', 'BRQ-007', 'Gửi email khi có đơn nghỉ chờ trưởng phòng duyệt', 'Functional', 'Thông báo', 'Hệ thống', 'High', 'TP nhận email có link tới đơn; không gửi trùng spam trong cùng sự kiện.', 'Email', 'Email HR 2026-09-18', 'HR Admin', '2026-09-18', '', 'REF-003'],
  ['CR-038', 'BRQ-007', 'Gửi email cho nhân viên khi đơn nghỉ được duyệt hoặc từ chối', 'Functional', 'Thông báo', 'Hệ thống', 'High', 'NV nhận email kèm trạng thái và ghi chú duyệt.', 'Email', 'Email HR 2026-09-18', 'Nhân viên', '2026-09-18', '', 'REF-003'],
  ['CR-039', 'BRQ-007', 'Nhắc HR khi hợp đồng sắp hết hạn trong 30/60 ngày', 'Functional', 'Thông báo', 'HR Admin', 'Medium', 'Có danh sách + email định kỳ (hàng ngày hoặc hàng tuần — cấu hình).', 'Email', 'Email HR 2026-09-18', 'HR Manager', '2026-09-18', '', 'REF-003'],
  ['CR-040', 'BRQ-007', 'Hiển thị thông báo trong ứng dụng (chuông) cho sự kiện duyệt nghỉ', 'Functional', 'Thông báo', 'Tất cả', 'Low', 'Có badge số chưa đọc; đánh dấu đã đọc được.', 'Workshop', 'Workshop HR #1', 'HR Admin', '2026-09-12', '', 'REF-001'],

  // Cross-cutting / UX
  ['CR-041', 'BRQ-001', 'Giao diện hỗ trợ tiếng Việt; ngày tháng theo định dạng dd/MM/yyyy', 'Non-functional', 'Chung', 'Tất cả', 'High', 'UI tiếng Việt nhất quán; ngày hiển thị đúng locale VN.', 'Workshop', 'Workshop HR #1', 'HR Manager', '2026-09-12', '', 'REF-001'],
  ['CR-042', 'BRQ-005', 'Hệ thống dùng được trên trình duyệt desktop và tablet (responsive cơ bản)', 'Non-functional', 'Chung', 'Tất cả', 'Medium', 'Các màn hình chính dùng được trên chiều rộng ≥768px.', 'Workshop', 'Workshop HR #1', 'HR Admin', '2026-09-12', 'Mobile native out of scope', 'REF-001'],
  ['CR-043', 'BRQ-003', 'Khi mất kết nối mạng tạm thời, thao tác chấm công báo lỗi rõ và cho thử lại', 'Functional', 'Chấm công', 'Nhân viên', 'Medium', 'Không mất im hoặc ghi nhận sai khi lỗi mạng.', 'Email', 'Email HR 2026-09-18', 'Nhân viên', '2026-09-18', '', 'REF-003'],
  ['CR-044', 'BRQ-002', 'Không cho gán nhân viên vào phòng ban đã vô hiệu hóa', 'Functional', 'Tổ chức', 'HR Admin', 'Medium', 'Validate từ chối kèm thông báo rõ.', 'Workshop', 'Workshop HR #1', 'HR Admin', '2026-09-12', '', 'REF-001'],
  ['CR-045', 'BRQ-004', 'HR cấu hình số ngày phép năm mặc định và ngày reset chu kỳ phép', 'Functional', 'Nghỉ phép', 'HR Manager', 'Medium', 'Cấu hình áp dụng cho chu kỳ mới; không tự xóa lịch sử cũ.', 'Document', 'Quy trình nghỉ phép', 'HR Manager', '2026-09-12', '', 'REF-002'],
];

const NFRS = [
  ['NFR-001', 'Performance', 'Tra cứu danh sách nhân viên và bảng công phải nhanh với quy mô giai 1', '< 2 giây cho danh sách ~2.000 NV (mạng nội bộ)', 'High', 'Workshop HR #1'],
  ['NFR-002', 'Availability', 'Hệ thống sẵn sàng trong giờ hành chính và hỗ trợ chấm công đầu/cuối ngày', '99.5% trong giờ 07:00–19:00 ngày làm việc', 'High', 'Meeting BGĐ'],
  ['NFR-003', 'Security', 'Chỉ người được phân quyền mới xem/sửa dữ liệu nhân sự; hỗ trợ SSO', '', 'High', 'Security note'],
  ['NFR-004', 'Privacy', 'Dữ liệu cá nhân nhân viên lưu và xử lý theo nội quy bảo mật công ty (VN)', 'Lưu trữ trong lãnh thổ VN; không lộ CCCD/lương sai phạm vi', 'High', 'Security note'],
  ['NFR-005', 'Scalability', 'Hỗ trợ quy mô công ty giai đoạn 1', 'Tối đa ~2.000 nhân viên active', 'Medium', 'Customer'],
  ['NFR-006', 'Usability', 'Nhân viên không chuyên IT vẫn xin nghỉ và chấm công được sau hướng dẫn ngắn', 'Hoàn thành xin nghỉ < 2 phút sau đào tạo 15 phút', 'Medium', 'Workshop HR #1'],
  ['NFR-007', 'Reliability', 'Không mất dữ liệu đơn nghỉ / bản ghi chấm công đã xác nhận khi lỗi hệ thống', 'Có backup hàng ngày; khôi phục được theo RPO thỏa thuận', 'High', 'IT / Customer'],
  ['NFR-008', 'Compatibility', 'Chạy trên Chrome / Edge phiên bản gần nhất', 'Chrome, Edge (2 major gần nhất)', 'Medium', 'Workshop HR #1'],
  ['NFR-009', 'Maintainability', 'HR tự cấu hình ngày lễ, loại nghỉ, số phép mặc định không cần dev', '', 'Medium', 'Email HR'],
  ['NFR-010', 'Auditability', 'Thao tác quan trọng có thể truy vết (ai, khi nào, gì)', 'Giữ audit tối thiểu 12 tháng', 'High', 'Security note'],
];

const REFERENCES = [
  ['REF-001', 'Meeting', 'Workshop HR #1 — thu thập yêu cầu Quản lý nhân viên', 'Customer', '2026-09-12', 'CR-001…CR-027, CR-040…CR-042, CR-044'],
  ['REF-002', 'Document', 'Quy trình nhân sự & nghỉ phép hiện tại.docx', 'Customer', '2026-09-10', 'CR-005, CR-008, CR-013, CR-023…CR-024, CR-045'],
  ['REF-003', 'Email', 'Email HR Manager — chấm công CSV & thông báo duyệt', 'Customer', '2026-09-18', 'CR-006, CR-014…CR-019, CR-026, CR-037…CR-039, CR-043'],
  ['REF-004', 'Meeting', 'Meeting Ban Giám đốc — báo cáo headcount', 'Customer', '2026-09-22', 'CR-012, CR-033…CR-036'],
  ['REF-005', 'Document', 'Mẫu CSV export máy chấm công (template).csv', 'Customer', '2026-09-18', 'CR-016'],
  ['REF-006', 'Document', 'Lịch nghỉ lễ công ty 2026.xlsx', 'Customer', '2026-09-20', 'CR-020'],
  ['REF-007', 'Document', 'Security note — phân quyền & dữ liệu nhạy cảm.pdf', 'Customer', '2026-09-20', 'CR-028…CR-032, NFR-003…NFR-004'],
  ['REF-008', 'Image', 'Ảnh quy trình duyệt nghỉ hiện tại (email/Zalo)', 'Customer', '2026-09-12', 'BRQ-004'],
];

function addSheet(wb, name, columns, rows = []) {
  const ws = wb.addWorksheet(name);
  ws.addRow(columns);
  for (const row of rows) ws.addRow(row);
  ws.getRow(1).font = { bold: true };
  return ws;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VoiceHub';
  wb.created = new Date();

  const metaRows = CUSTOMER_RAW_META_DEFAULTS.map(([k, v]) => {
    const map = {
      CustomerName: 'Công ty TNHH VoiceHub Demo',
      ProjectName: 'Hệ thống Quản lý nhân viên (Employee Management)',
      CollectedBy: 'BA Demo',
      CollectedDate: '2026-09-22',
      Language: 'vi',
    };
    return [k, map[k] !== undefined ? map[k] : v];
  });

  addSheet(wb, CUSTOMER_RAW_SHEETS.META, CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.META], metaRows);
  addSheet(wb, CUSTOMER_RAW_SHEETS.README, CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.README], [
    ...CUSTOMER_RAW_README_ROWS,
  ]);

  const contextRows = CUSTOMER_RAW_CONTEXT_FIELDS.map((f) => [
    f.field,
    CONTEXT_VALUES[f.field] || '',
    f.guidance,
  ]);
  addSheet(wb, CUSTOMER_RAW_SHEETS.CONTEXT, CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.CONTEXT], contextRows);

  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST],
    BUSINESS_REQUESTS
  );
  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.REQUIREMENT,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.REQUIREMENT],
    REQUIREMENTS
  );
  addSheet(wb, CUSTOMER_RAW_SHEETS.NFR, CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.NFR], NFRS);
  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.REFERENCE,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.REFERENCE],
    REFERENCES
  );

  await wb.xlsx.writeFile(OUT);

  const { validateCustomerRawForm } = require('../../services/project-service/src/utils/requirement/customerRawFormValidate');
  const fs = require('fs');
  const result = validateCustomerRawForm(fs.readFileSync(OUT));
  if (!result.ok) {
    console.error('Form INVALID', result);
    process.exit(1);
  }
  console.log('Wrote', OUT);
  console.log('Form OK:', result.ok, 'type:', result.templateType);
  console.log(
    `Counts: BRQ=${BUSINESS_REQUESTS.length}, CR=${REQUIREMENTS.length}, NFR=${NFRS.length}, REF=${REFERENCES.length}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
