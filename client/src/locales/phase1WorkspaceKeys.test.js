/**
 * Guard: mọi key workspace.phase1* / phaseNav* mà Phase 1 UI cần
 * phải có trong catalog vi + en (tránh raw key trên UI).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS } from './buildStrings.js';

/** Keys bắt buộc dưới workspace (không gồm prefix workspace.). */
export const REQUIRED_PHASE1_WORKSPACE_KEYS = [
  'phase1EmptySection',
  'phase1EmptyArtifacts',
  'phase1EmptyPlanning',
  'phase1ArtifactCreated',
  'phase1ArtifactSaved',
  'phase1Items',
  'phase1CreateArtifact',
  'phase1CustomerDocsHint',
  'phase1DownloadRawTemplate',
  'phase1DownloadAnalysisTemplate',
  'phase1DownloadTemplateOk',
  'phase1DownloadTemplateFail',
  'phase1DocUploaded',
  'phase1ImportPreviewReady',
  'phase1ImportDone',
  'phase1ImportPreview',
  'phase1ConfirmImport',
  'phase1Upload',
  'phase1UploadRaw',
  'phase1UploadAnalysis',
  'phase1RawAttached',
  'phase1NeedRawFirst',
  'phase1ExpectAnalysisFile',
  'phase1ActiveImportSet',
  'phase1DraftImportSet',
  'phase1TrashImportSets',
  'phase1NoActiveImportSet',
  'phase1TrashEmpty',
  'phase1ImportSetStatus',
  'phase1TrashImportSet',
  'phase1RestoreImportSet',
  'phase1ImportSetTrashed',
  'phase1ImportSetRestored',
  'phase1NoDocs',
  'phase1Gaps',
  'phase1NoGaps',
  'phase1NoLinks',
  'phase1LinkCreated',
  'phase1LinkUc',
  'phase1SrsCut',
  'phase1NoSrsBaseline',
  'phase1CutSrs',
  'phase1ApprovalHint',
  'phase1NoReviewPerm',
  'phase1TransitionOk',
  'phase1QueueEmpty',
  'phase1PlanningStarted',
  'phase1PlanningEmpty',
  'phase1AiSuggest',
  'phase1AiSuggestStub',
  'phase1AllPlanningApproved',
  'phase1PlanningBaselineCut',
  'phase1CutPlanningBaseline',
  'phase1ColKey',
  'phase1ColTitle',
  'phase1ColStatus',
  'phase1ColVer',
  'phase1ColSource',
  'phase1ColPriority',
  'phase1ColStatement',
  'phase1ColSuccessMetric',
  'phase1ColDescription',
  'phase1ColWhenApplies',
  'phase1ColException',
  'phase1ColRelatedBg',
  'phase1ColProcessName',
  'phase1ColStep',
  'phase1ColActor',
  'phase1ColAction',
  'phase1ColRelatedSystems',
  'phase1ColLevel',
  'phase1ColModule',
  'phase1ColFeature',
  'phase1ColArtifact',
  'phase1ColRequirement',
  'phase1ColPrecondition',
  'phase1ColRelatedFr',
  'phase1ColCategory',
  'phase1ColTarget',
  'phase1ColScopeType',
  'phase1PlaceholderExternalKey',
  'phase1PlaceholderTitle',
  'phase1PlaceholderSummary',
  'phase1Summary',
  'phase1Flows',
  'phase1UseCases',
  'phase1VersionHistory',
  'phase1CurrentVersion',
  'phase1TabDraft',
  'phase1TabPreview',
  'phase1TabBaselines',
  'phase1SrsBaselineDefault',
  'phase1SrsBaselineTitle',
  'phase1ArtifactsMeta',
  'phase1SrsVersionPlaceholder',
  'phase1QueueBaReview',
  'phase1QueueTechReview',
  'phase1QueuePoApproval',
  'phase1Approve',
  'phase1Reject',
  'phase1RejectNote',
  'phase1FrToUc',
  'phase1GapFrMissingUc',
  'phase1GapBrMissingBg',
  'phase1GapFrMissingUcCount',
  'phase1GapBrMissingBgCount',
  'phase1GapCritical',
  'phase1GapSrsBaseline',
  'phase1GapPlanningBaseline',
  'phase1GapReadyForPhase2',
  'phase1PlanningApprovedDraft',
  'phase1PlanningListHint',
  'phase1PendingArtifacts',
  'phase1Advance',
  'phase1Baselines',
  'phase1PlanVersionPlaceholder',
  'phase1BaselineArtifactsCount',
  'phase1OverviewTitle',
  'phase1StartPlanning',
  'phase1RaApprovedTitle',
  'phase1RaApprovedBody',
  'phase1GroupRequirementAnalysis',
  'phase1GroupPlanning',
  'phase1PlanningLockedHint',
  'phase1AnalysisCapLockedHint',
  'phase1PlanningCapLockedHint',
  'phaseNavCustomerDocuments',
  'phaseNavTraceability',
  'phaseNavAnalysisReviews',
  'phaseNavSrsBaselines',
  'phaseNavPlanningApproval',
  'phaseNavPlanningOverview',
];

describe('phase1 workspace locale keys', () => {
  for (const locale of ['vi', 'en']) {
    it(`${locale}: required Phase 1 workspace keys exist and are non-empty strings`, () => {
      const workspace = STRINGS[locale]?.workspace;
      assert.ok(workspace && typeof workspace === 'object', `STRINGS.${locale}.workspace missing`);
      const missing = [];
      for (const key of REQUIRED_PHASE1_WORKSPACE_KEYS) {
        const val = workspace[key];
        if (typeof val !== 'string' || !val.trim()) missing.push(key);
      }
      assert.deepEqual(missing, [], `Missing/empty keys in ${locale}: ${missing.join(', ')}`);
    });
  }

  it('vi catalog is not leftover English for core overview CTAs', () => {
    const vi = STRINGS.vi.workspace;
    assert.notEqual(vi.phase1OverviewTitle, 'Phase 1 Overview');
    assert.notEqual(vi.phase1StartPlanning, 'Start Planning');
    assert.ok(!String(vi.phase1RaApprovedBody).includes('Planning is ready to start'));
  });
});
