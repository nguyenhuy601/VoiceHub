const httpProxy = require('http-proxy');
const { getServiceByPath } = require('../config/services');
const { URL } = require('url');

// Cache proxy instances để tránh tạo lại mỗi request
const proxyCache = new Map();

/**
 * Middleware proxy request đến microservice
 */
const proxyMiddleware = (req, res, next) => {
  // Tìm service phù hợp với path
  const service = getServiceByPath(req.path);

  // Debug log: xem request đang đi đâu
  // eslint-disable-next-line no-console
  console.log(`[API-Gateway] Incoming ${req.method} ${req.path} -> service:`, service?.name || 'NONE');
  console.log(`[API-Gateway] Service URL:`, service?.url);
  console.log(`[API-Gateway] Full target URL will be:`, service?.url ? `${service.url}${req.path}` : 'N/A');

  if (!service) {
    return res.status(404).json({
      success: false,
      message: 'Service not found',
    });
  }

  // Validate service URL - không được proxy đến chính Gateway
  if (!service.url || service.url.includes('localhost:3000') || service.url.includes(':3000')) {
    console.error(`[API-Gateway] ❌ Invalid service URL detected: ${service.url}`);
    console.error(`[API-Gateway] This would cause proxy loop!`);
    return res.status(500).json({
      success: false,
      message: 'Invalid service configuration',
      error: `Service URL cannot be ${service.url}`,
    });
  }

  // Lưu service URL vào biến để đảm bảo không bị thay đổi
  const targetUrl = service.url;
  const serviceName = service.name;
  const serviceUrl = service.url;
  
  // Parse URL để đảm bảo format đúng
  const targetUrlObj = new URL(targetUrl);
  const proxyHost = targetUrlObj.hostname;
  const proxyPort = parseInt(targetUrlObj.port) || (targetUrlObj.protocol === 'https:' ? 443 : 80);
  const proxyTarget = `${targetUrlObj.protocol}//${proxyHost}:${proxyPort}`;
  const fullTargetUrl = `${targetUrl}${req.path}`;
  
  console.log(`[API-Gateway] Creating proxy to: ${targetUrl}`);
  console.log(`[API-Gateway] Full target URL: ${fullTargetUrl}`);
  
  // Dùng proxyTarget làm cache key thay vì targetUrl gốc
  let proxy = proxyCache.get(proxyTarget);
  
  if (!proxy) {
    console.log(`[API-Gateway] Creating new proxy instance for ${proxyTarget}`);
    
    // Tạo proxy server với các options
    // Dùng object với hostname và port
    proxy = httpProxy.createProxyServer({
      target: {
        protocol: targetUrlObj.protocol,
        host: proxyHost,
        port: proxyPort,
      },
      changeOrigin: true,
      timeout: 60000, // 60 seconds timeout
      proxyTimeout: 60000, // 60 seconds proxy timeout
      ws: false, // Không cần WebSocket
      xfwd: true, // Forward X-Forwarded-* headers
      secure: false, // Tắt SSL verification cho localhost
      followRedirects: true,
    });
    
    // Xử lý proxy errors - lưu service info vào proxy instance để dùng trong error handler
    proxy.on('error', (err, req, res) => {
      // Lấy service info từ request hoặc từ proxy instance
      const serviceInfo = req._serviceInfo || { name: 'unknown', url: targetUrl };
      const svcName = serviceInfo.name;
      const svcUrl = serviceInfo.url;
      
      console.error(`[API-Gateway] ❌ ========== PROXY ERROR ==========`);
      console.error(`[API-Gateway] ❌ Proxy error for ${req.path || req.url}:`, err.message);
      console.error(`[API-Gateway] Error code:`, err.code);
      console.error(`[API-Gateway] Error name:`, err.name);
      console.error(`[API-Gateway] Error stack:`, err.stack);
      console.error(`[API-Gateway] Target service:`, svcUrl);
      console.error(`[API-Gateway] Request method:`, req.method);
      console.error(`[API-Gateway] Request URL:`, req.url);
      
      // Xử lý timeout error
      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
        console.error(`[API-Gateway] ❌ Timeout connecting to ${svcUrl}`);
        if (res && !res.headersSent) {
          return res.status(504).json({
            success: false,
            message: 'Gateway Timeout - Backend service did not respond in time',
            error: err.message,
            service: svcName,
            targetUrl: svcUrl,
          });
        }
      }
      
      // Xử lý connection refused
      if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        console.error(`[API-Gateway] ❌ Connection refused to ${svcUrl}`);
        if (res && !res.headersSent) {
          return res.status(503).json({
            success: false,
            message: `Cannot connect to ${svcName} at ${svcUrl}. Please check if the service is running.`,
            error: err.message,
            service: svcName,
            targetUrl: svcUrl,
          });
        }
      }
      
      if (res && !res.headersSent) {
        res.status(503).json({
          success: false,
          message: 'Service unavailable',
          error: err.message,
          errorCode: err.code,
          service: svcName,
          targetUrl: svcUrl,
        });
      }
    });
    
    // Cache proxy instance với proxyTarget
    proxyCache.set(proxyTarget, proxy);
    console.log(`[API-Gateway] Proxy instance cached for ${proxyTarget}`);
  } else {
    console.log(`[API-Gateway] Using cached proxy instance for ${proxyTarget}`);
  }

  // Lưu service info vào request để dùng trong error handler
  req._serviceInfo = { name: serviceName, url: targetUrl };
  
  // Thực thi proxy
  console.log(`[API-Gateway] Executing proxy for ${req.method} ${req.path}`);
  console.log(`[API-Gateway] Request headers present:`, !!req.headers);
  console.log(`[API-Gateway] Request body present:`, !!req.body);
  console.log(`[API-Gateway] ✅ ========== PROXY REQUEST STARTED ==========`);
  console.log(`[API-Gateway] Proxying ${req.method} ${req.path} to ${fullTargetUrl}`);
  
  // Forward user info trong header (nếu có)
  if (req.user) {
    req.headers['x-user-id'] = req.user.id;
    req.headers['x-user-email'] = req.user.email;
  }
  
  // Đảm bảo Content-Type được forward
  if (req.headers['content-type']) {
    console.log(`[API-Gateway] Content-Type: ${req.headers['content-type']}`);
  }
  
  // Thêm event listeners để debug
  req.on('error', (err) => {
    console.error(`[API-Gateway] ❌ Request error:`, err);
  });
  
  res.on('error', (err) => {
    console.error(`[API-Gateway] ❌ Response error:`, err);
  });
  
  res.on('close', () => {
    if (!res.headersSent) {
      console.error(`[API-Gateway] ❌ Response closed without sending headers!`);
    } else {
      console.log(`[API-Gateway] Response closed (headers were sent)`);
    }
  });
  
  // Proxy response handler - dùng once để chỉ listen một lần cho request này
  const proxyResHandler = (proxyRes, reqProxy, resProxy) => {
    // Chỉ log nếu đây là request của chúng ta
    if (reqProxy === req) {
      console.log(`[API-Gateway] ✅ Response from ${serviceName}: ${proxyRes.statusCode}`);
      console.log(`[API-Gateway] Response headers:`, JSON.stringify(proxyRes.headers, null, 2));
    }
  };
  
  proxy.once('proxyRes', proxyResHandler);
  
  try {
    // Gọi proxy.web() để forward request
    // Proxy instance đã được config với target khi tạo, không cần pass lại
    proxy.web(req, res, {}, (err) => {
      // Callback này được gọi nếu có lỗi
      if (err) {
        console.error(`[API-Gateway] ❌ Proxy.web() callback error:`, err);
        console.error(`[API-Gateway] Error message:`, err.message);
        console.error(`[API-Gateway] Error code:`, err.code);
        
        // Xử lý ECONNREFUSED - service không chạy
        if (err.code === 'ECONNREFUSED') {
          console.error(`[API-Gateway] ❌ Cannot connect to ${serviceName} at ${targetUrl}`);
          console.error(`[API-Gateway] Please check if ${serviceName} is running on port ${new URL(targetUrl).port}`);
          if (!res.headersSent) {
            return res.status(503).json({
              success: false,
              message: `Cannot connect to ${serviceName}. Please check if the service is running on ${targetUrl}`,
              error: err.message,
              errorCode: err.code,
              service: serviceName,
              targetUrl: targetUrl,
              suggestion: `Make sure ${serviceName} is running. Try: cd services/${serviceName} && npm run dev`,
            });
          }
        }
        
        if (!res.headersSent) {
          return res.status(500).json({
            success: false,
            message: 'Proxy error',
            error: err.message,
            errorCode: err.code,
            service: serviceName,
            targetUrl: targetUrl,
          });
        }
      }
    });
    
    console.log(`[API-Gateway] Proxy.web() called successfully`);
  } catch (error) {
    console.error(`[API-Gateway] ❌ Error executing proxy:`, error);
    console.error(`[API-Gateway] Error stack:`, error.stack);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Proxy execution error',
        error: error.message,
      });
    }
  }
};

module.exports = proxyMiddleware;
