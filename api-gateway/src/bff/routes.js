const express = require('express');
const { handleBootstrap } = require('./bootstrap.handler');
const { handleDashboardSummary } = require('./dashboardSummary.handler');
const { handleOrgShell } = require('./orgShell.handler');
const { handleDocumentsOverview } = require('./documentsOverview.handler');

/** BFF không cần permission middleware (bootstrap, dashboard). */
const publicBffRouter = express.Router();

/**
 * @openapi
 * /api/bootstrap:
 *   get:
 *     tags: [BFF]
 *     summary: Bootstrap session / app shell data
 *     description: Aggregate dữ liệu khởi động client qua Gateway BFF. Yêu cầu JWT.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bootstrap payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
publicBffRouter.get('/api/bootstrap', handleBootstrap);

/**
 * @openapi
 * /api/dashboard/summary:
 *   get:
 *     tags: [BFF]
 *     summary: Dashboard summary
 *     description: Tóm tắt dashboard cá nhân / org context qua BFF.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema: { type: string }
 *         description: Org context (optional)
 *     responses:
 *       200:
 *         description: Summary
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
publicBffRouter.get('/api/dashboard/summary', handleDashboardSummary);

/** BFF org read — sau permission; org-service vẫn kiểm tra membership. */
const orgBffRouter = express.Router();

/**
 * @openapi
 * /api/organizations/{orgId}/shell:
 *   get:
 *     tags: [BFF]
 *     summary: Org shell (nav / membership snapshot)
 *     description: BFF gom shell org cho UI admin/collaborate.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Org shell
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
orgBffRouter.get('/api/organizations/:orgId/shell', handleOrgShell);

/**
 * @openapi
 * /api/organizations/{orgId}/documents-overview:
 *   get:
 *     tags: [BFF]
 *     summary: Documents overview (BFF aggregate)
 *     description: Tổng quan tài liệu theo org — timeout BFF riêng.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Overview
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
orgBffRouter.get('/api/organizations/:orgId/documents-overview', handleDocumentsOverview);

module.exports = { publicBffRouter, orgBffRouter };
