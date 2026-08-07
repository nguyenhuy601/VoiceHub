/**
 * Mount Swagger UI + OpenAPI JSON/YAML trên API Gateway.
 */

const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const { isSwaggerEnabled, isSwaggerLiveScanEnabled } = require('./isSwaggerEnabled');
const { buildOpenApiBase } = require('./openapi.base');

const BUNDLE_PATH = path.join(__dirname, 'openapi.bundle.json');

function loadBundleSpec() {
  if (!fs.existsSync(BUNDLE_PATH)) {
    return buildOpenApiBase();
  }
  try {
    return JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8'));
  } catch (err) {
    console.warn('[API-Gateway] Failed to parse openapi.bundle.json:', err?.message || err);
    return buildOpenApiBase();
  }
}

/**
 * Live rebuild từ monorepo (dev only) — chạy build-openapi logic nhẹ qua require scan.
 */
function buildLiveSpec() {
  const repoRoot = path.resolve(__dirname, '../../..');
  const { scanPublicRoutePaths } = require(path.join(repoRoot, 'devops/scripts/openapi-scan-routes'));
  const { globSync } = require('glob');
  const definition = buildOpenApiBase();
  const scanned = scanPublicRoutePaths(repoRoot);
  definition.paths = { ...scanned };
  const files = globSync('api-gateway/src/swagger/paths/**/*.paths.js', {
    cwd: repoRoot,
    absolute: true,
    windowsPathsNoEscape: true,
  });
  for (const file of files.sort()) {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const mod = require(file);
    for (const [p, methods] of Object.entries(mod)) {
      definition.paths[p] = { ...(definition.paths[p] || {}), ...methods };
    }
  }
  return definition;
}

function canLiveScan() {
  if (!isSwaggerLiveScanEnabled()) return false;
  const sample = path.resolve(__dirname, '../../../services/auth-service/src/routes/auth.routes.js');
  return fs.existsSync(sample);
}

function resolveOpenApiSpec() {
  if (canLiveScan()) {
    try {
      return buildLiveSpec();
    } catch (err) {
      console.warn('[API-Gateway] Live OpenAPI scan failed, using bundle:', err?.message || err);
    }
  }
  return loadBundleSpec();
}

/**
 * @param {import('express').Express} app
 * @returns {boolean}
 */
function mountSwagger(app) {
  if (!isSwaggerEnabled()) return false;

  const spec = resolveOpenApiSpec();

  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('application/json');
    res.json(spec);
  });

  app.get('/api/docs.yaml', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('application/yaml');
    res.send(yaml.dump(spec, { lineWidth: 120, noRefs: true }));
  });

  const customCss = `
    .download-openapi { margin: 8px 16px; font-size: 13px; }
    .download-openapi a { margin-right: 12px; }
  `;
  const customJs = `
    window.addEventListener('load', function () {
      setTimeout(function () {
        var bar = document.querySelector('.swagger-ui .topbar') || document.querySelector('.swagger-ui .information-container');
        if (!bar || document.getElementById('vh-openapi-downloads')) return;
        var el = document.createElement('div');
        el.id = 'vh-openapi-downloads';
        el.className = 'download-openapi';
        el.innerHTML = '<a href="/api/docs.json" download="voicehub-openapi.json">Download OpenAPI JSON</a>'
          + '<a href="/api/docs.yaml" download="voicehub-openapi.yaml">Download OpenAPI YAML</a>';
        bar.parentNode.insertBefore(el, bar.nextSibling);
      }, 500);
    });
  `;

  // Write tiny custom JS to temp served via setup — swagger-ui-express supports customJsUrl;
  // use customJs inline via swaggerOptions unsupported — serve via middleware:
  app.get('/api/docs-assets/download-links.js', (req, res) => {
    res.type('application/javascript');
    res.send(customJs);
  });

  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: 'VoiceHub API Docs',
      customCss,
      customJs: '/api/docs-assets/download-links.js',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'list',
        filter: true,
        tryItOutEnabled: true,
        displayOperationId: true,
      },
    })
  );

  console.log('[API-Gateway] Swagger UI: /api/docs | JSON: /api/docs.json | YAML: /api/docs.yaml');
  return true;
}

module.exports = {
  mountSwagger,
  resolveOpenApiSpec,
  BUNDLE_PATH,
};
