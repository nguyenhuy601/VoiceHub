/**
 * Huy: Domain Cơ cấu tổ chức — admin org-structure.
 * Huy P5: panels Dept/Team/Branch legacy — thin wrappers; ưu tiên OrgLevelsPanel + OrgUnitTreePanel.
 */
export { default as DeptListPanel } from './DeptListPanel';
export { default as DeptCreatePanel } from './DeptCreatePanel';
export { default as DeptEditPanel } from './DeptEditPanel';
export { default as DeptDisablePanel } from './DeptDisablePanel';
export { default as DeptParentPanel } from './DeptParentPanel';
export { default as DeptHeadPanel } from './DeptHeadPanel';
export { default as DeptMembersPanel } from './DeptMembersPanel';
export { default as DeptOrgRolesPanel } from './DeptOrgRolesPanel';
export { default as DeptTransferPanel } from './DeptTransferPanel';

export { default as TeamListPanel } from './TeamListPanel';
export { default as TeamCreatePanel } from './TeamCreatePanel';
export { default as TeamEditPanel } from './TeamEditPanel';
export { default as TeamArchivePanel } from './TeamArchivePanel';
export { default as TeamMembersPanel } from './TeamMembersPanel';
export { default as TeamLeaderPanel } from './TeamLeaderPanel';
export { default as TeamDeptPanel } from './TeamDeptPanel';

export { default as BranchListPanel } from './BranchListPanel';
export { default as BranchCreatePanel } from './BranchCreatePanel';
export { default as BranchEditPanel } from './BranchEditPanel';
export { default as BranchDisablePanel } from './BranchDisablePanel';
export { default as BranchDeptPanel } from './BranchDeptPanel';

export { default as DivisionListPanel } from './DivisionListPanel';
export { default as DivisionCreatePanel } from './DivisionCreatePanel';
export { default as DivisionEditPanel } from './DivisionEditPanel';
export { default as DivisionDisablePanel } from './DivisionDisablePanel';
export { default as DivisionDeptPanel } from './DivisionDeptPanel';

export { default as PosListPanel } from './PosListPanel';
export { default as PosCreatePanel } from './PosCreatePanel';
export { default as PosEditPanel } from './PosEditPanel';
export { default as PosDisablePanel } from './PosDisablePanel';
export { default as PosAssignPanel } from './PosAssignPanel';

// Huy: Dynamic OU
export { default as OrgLevelsPanel } from './OrgLevelsPanel';
export { default as OrgUnitTreePanel } from './OrgUnitTreePanel';
export { default as OrgStructureSetupModal } from './OrgStructureSetupModal';
