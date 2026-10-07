const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildApiErrorBody, GENERIC_5XX_MESSAGE } = require('@enterprise/shared/middleware/httpErrorResponse');

describe('project-service error sanitize (Wave 3)', () => {
  describe('5xx responses', () => {
    it('should return generic message for status 500', () => {
      const body = buildApiErrorBody(500, {
        errorCode: 'TASK_INTERNAL_ERROR',
        message: 'MongoServerError: E11000 duplicate key error',
      });

      assert.strictEqual(body.success, false);
      assert.strictEqual(body.message, GENERIC_5XX_MESSAGE);
      assert.strictEqual(body.messageUser, GENERIC_5XX_MESSAGE);
      assert.strictEqual(body.errorCode, 'TASK_INTERNAL_ERROR');
      assert.ok(!body.message.includes('MongoServerError'));
      assert.ok(!body.message.includes('E11000'));
    });

    it('should return generic message for status 503', () => {
      const body = buildApiErrorBody(503, {
        errorCode: 'TASK_INTERNAL_ERROR',
        message: 'ECONNREFUSED: Connection refused to database',
      });

      assert.strictEqual(body.success, false);
      assert.strictEqual(body.message, GENERIC_5XX_MESSAGE);
      assert.strictEqual(body.messageUser, GENERIC_5XX_MESSAGE);
      assert.ok(!body.message.includes('ECONNREFUSED'));
    });

    it('should not leak stack trace in 5xx', () => {
      const stackTrace = 'Error: Something failed\n    at Object.<anonymous> (/app/services/project-service/src/controllers/requirement.controller.js:100:15)';
      const body = buildApiErrorBody(500, {
        errorCode: 'TASK_INTERNAL_ERROR',
        message: stackTrace,
      });

      assert.ok(!body.message.includes('stack trace'));
      assert.ok(!body.message.includes('/app/services'));
      assert.ok(!body.message.includes('requirement.controller.js'));
    });

    it('should handle MongoDB error messages', () => {
      const mongoError = 'MongoServerError: Plan executor error during find: { operationTime: Timestamp({ t: 1234567890, i: 1 }) }';
      const body = buildApiErrorBody(500, {
        errorCode: 'TASK_INTERNAL_ERROR',
        message: mongoError,
      });

      assert.strictEqual(body.message, GENERIC_5XX_MESSAGE);
      assert.ok(!body.message.includes('MongoServerError'));
      assert.ok(!body.message.includes('Plan executor'));
    });
  });

  describe('4xx responses', () => {
    it('should preserve message for status 400', () => {
      const businessMessage = 'organizationId bắt buộc';
      const body = buildApiErrorBody(400, {
        message: businessMessage,
      });

      assert.strictEqual(body.success, false);
      assert.strictEqual(body.message, businessMessage);
      assert.strictEqual(body.messageUser, businessMessage);
    });

    it('should preserve message for status 404', () => {
      const businessMessage = 'Requirement pack not found';
      const body = buildApiErrorBody(404, {
        message: businessMessage,
        errorCode: 'REQ_PACK_NOT_FOUND',
      });

      assert.strictEqual(body.success, false);
      assert.strictEqual(body.message, businessMessage);
      assert.strictEqual(body.errorCode, 'REQ_PACK_NOT_FOUND');
    });

    it('should preserve message for status 409', () => {
      const businessMessage = 'Concurrent requirement-pack update; retry callback delivery';
      const body = buildApiErrorBody(409, {
        message: businessMessage,
        errorCode: 'REMOTE_RESULT_CAS_RETRY',
      });

      assert.strictEqual(body.success, false);
      assert.strictEqual(body.message, businessMessage);
      assert.strictEqual(body.errorCode, 'REMOTE_RESULT_CAS_RETRY');
    });

    it('should preserve message for status 410', () => {
      const businessMessage = 'AI planning heuristic đã gỡ — dùng phase_what / phase_how';
      const body = buildApiErrorBody(410, {
        message: businessMessage,
        errorCode: 'LEGACY_AI_PLANNING_REMOVED',
      });

      assert.strictEqual(body.success, false);
      assert.strictEqual(body.message, businessMessage);
      assert.strictEqual(body.errorCode, 'LEGACY_AI_PLANNING_REMOVED');
    });
  });

  describe('sendErrorFromCatch integration', () => {
    it('should sanitize 5xx error with err.message', () => {
      const { sendErrorFromCatch } = require('../src/middleware/sendServiceError');

      const mockRes = {
        headersSent: false,
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(body) {
          this.body = body;
          return this;
        },
      };

      // Non-duplicate 5xx: classifier must not leak internal text (E11000 → 409 covered in projectErrorClassify.test.js)
      const err = new Error('MongoServerError: unexpected server failure at primary');
      err.statusCode = 500;
      err.name = 'MongoServerError';

      sendErrorFromCatch(mockRes, err, 500, 'REQUIREMENT_ERROR');

      assert.strictEqual(mockRes.statusCode, 500);
      assert.strictEqual(mockRes.body.success, false);
      assert.strictEqual(mockRes.body.message, GENERIC_5XX_MESSAGE);
      assert.strictEqual(mockRes.body.messageUser, GENERIC_5XX_MESSAGE);
      assert.ok(!mockRes.body.message.includes('MongoServerError'));
      assert.ok(!mockRes.body.message.includes('primary'));
    });

    it('should preserve 4xx error message', () => {
      const { sendErrorFromCatch } = require('../src/middleware/sendServiceError');

      const mockRes = {
        headersSent: false,
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(body) {
          this.body = body;
          return this;
        },
      };

      const err = new Error('organizationId bắt buộc');
      err.statusCode = 400;

      sendErrorFromCatch(mockRes, err, 400, 'REQUIREMENT_ERROR');

      assert.strictEqual(mockRes.statusCode, 400);
      assert.strictEqual(mockRes.body.success, false);
      assert.strictEqual(mockRes.body.message, 'organizationId bắt buộc');
      assert.strictEqual(mockRes.body.messageUser, 'organizationId bắt buộc');
    });

    it('should use errorCode from err when present', () => {
      const { sendErrorFromCatch } = require('../src/middleware/sendServiceError');

      const mockRes = {
        headersSent: false,
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(body) {
          this.body = body;
          return this;
        },
      };

      const err = new Error('Not found');
      err.statusCode = 404;
      err.errorCode = 'REQ_PACK_NOT_FOUND';

      sendErrorFromCatch(mockRes, err, 404, 'REQUIREMENT_ERROR');

      assert.strictEqual(mockRes.statusCode, 404);
      assert.strictEqual(mockRes.body.errorCode, 'REQ_PACK_NOT_FOUND');
    });
  });

  describe('P0 controller handlers', () => {
    function makeRes() {
      return {
        headersSent: false,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          this.body = body;
          return this;
        },
      };
    }

    const req = { params: { projectId: 'p1' }, query: {}, body: {}, headers: {}, user: { id: 'u1' } };

    // Stub the service in require.cache so the controller loads without mongoose/DB.
    function loadDeliveryPlanningController(listArtifacts) {
      const servicePath = require.resolve('../src/services/deliveryPlanning.service');
      const controllerPath = require.resolve('../src/controllers/deliveryPlanning.controller');
      require.cache[servicePath] = {
        id: servicePath,
        filename: servicePath,
        loaded: true,
        exports: { listArtifacts },
      };
      delete require.cache[controllerPath];
      return require(controllerPath);
    }

    it('deliveryPlanning 5xx: generic body, no raw err.message', async () => {
      const controller = loadDeliveryPlanningController(async () => {
        throw new Error('MongoServerError: connection pool closed');
      });
      const res = makeRes();
      await controller.listArtifacts(req, res);
      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.body.message, GENERIC_5XX_MESSAGE);
      assert.ok(!JSON.stringify(res.body).includes('MongoServerError'));
      assert.strictEqual(res.body.details, undefined);
    });

    it('deliveryPlanning 4xx with details: keeps message and details for FE column errors', async () => {
      const details = [{ field: 'title', code: 'required' }];
      const controller = loadDeliveryPlanningController(async () => {
        const err = new Error('Artifact không hợp lệ');
        err.statusCode = 400;
        err.errorCode = 'ARTIFACT_INVALID';
        err.details = details;
        throw err;
      });
      const res = makeRes();
      await controller.listArtifacts(req, res);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.message, 'Artifact không hợp lệ');
      assert.strictEqual(res.body.errorCode, 'ARTIFACT_INVALID');
      assert.deepStrictEqual(res.body.details, details);
    });
  });
});
