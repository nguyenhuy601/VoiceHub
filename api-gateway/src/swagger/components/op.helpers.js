/**
 * Helper — chuẩn hóa operation OpenAPI (checklist bắt buộc).
 */

const STANDARD_ERROR_RESPONSES = {
  400: {
    description: 'Bad request / validation failed',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ValidationErrorBody' },
        example: {
          success: false,
          message: 'Validation failed',
          errorCode: 'VALIDATION_REQUIRED',
          messageUser: 'Dữ liệu không hợp lệ.',
          errors: [{ field: 'email', message: 'must be a valid email' }],
        },
      },
    },
  },
  401: { $ref: '#/components/responses/Unauthorized' },
  403: { $ref: '#/components/responses/Forbidden' },
  404: { $ref: '#/components/responses/NotFound' },
  500: { $ref: '#/components/responses/InternalError' },
};

/**
 * @param {object} opts
 * @param {string} opts.operationId
 * @param {string[]} opts.tags
 * @param {string} opts.summary
 * @param {string} opts.description
 * @param {boolean} [opts.public] — security: []
 * @param {boolean} [opts.requireNotFound=true]
 * @param {Array} [opts.parameters]
 * @param {object} [opts.requestBody]
 * @param {number} [opts.successStatus=200]
 * @param {object} [opts.successSchema]
 * @param {object} [opts.successExample]
 * @param {string} [opts.successDescription]
 */
function buildOperation(opts) {
  const {
    operationId,
    tags,
    summary,
    description,
    public: isPublic = false,
    requireNotFound = true,
    parameters,
    requestBody,
    successStatus = 200,
    successSchema = { $ref: '#/components/schemas/ApiSuccess' },
    successExample,
    successDescription = 'Success',
  } = opts;

  if (!operationId || !tags?.length || !summary || !description) {
    throw new Error(`buildOperation missing required meta: ${operationId || '?'}`);
  }

  const responses = {
    [String(successStatus)]: {
      description: successDescription,
      content: {
        'application/json': {
          schema: successSchema,
          ...(successExample ? { example: successExample } : {}),
        },
      },
    },
    400: STANDARD_ERROR_RESPONSES[400],
    401: STANDARD_ERROR_RESPONSES[401],
    403: STANDARD_ERROR_RESPONSES[403],
    500: STANDARD_ERROR_RESPONSES[500],
  };
  if (requireNotFound) {
    responses[404] = STANDARD_ERROR_RESPONSES[404];
  }

  const op = {
    operationId,
    tags,
    summary,
    description,
    security: isPublic ? [] : [{ bearerAuth: [] }],
    responses,
  };
  if (parameters?.length) op.parameters = parameters;
  if (requestBody) op.requestBody = requestBody;
  return op;
}

function pathParam(name, description, example = '507f1f77bcf86cd799439011') {
  return {
    name,
    in: 'path',
    required: true,
    description,
    schema: { type: 'string', example },
  };
}

module.exports = {
  STANDARD_ERROR_RESPONSES,
  buildOperation,
  pathParam,
};
