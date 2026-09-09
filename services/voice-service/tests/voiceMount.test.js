const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('voice-service mount (D3)', () => {
  it('splits meetings and voice routers', () => {
    const appSrc = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
    assert.ok(appSrc.includes("app.use('/api/meetings', meetingRoutes)"));
    assert.ok(appSrc.includes("app.use('/api/voice', voiceRoutes)"));
    assert.equal(appSrc.includes("app.use('/api/voice', meetingRoutes)"), false);

    const meetingSrc = fs.readFileSync(
      path.join(__dirname, '../src/routes/meeting.routes.js'),
      'utf8'
    );
    assert.equal(meetingSrc.includes('call.routes'), false);
    assert.equal(meetingSrc.includes('/rooms/:roomId'), false);

    const voiceSrc = fs.readFileSync(path.join(__dirname, '../src/routes/voice.routes.js'), 'utf8');
    assert.ok(voiceSrc.includes("router.use(callRoutes)"));
    assert.ok(voiceSrc.includes('/rooms/:roomId/bootstrap'));
  });
});
