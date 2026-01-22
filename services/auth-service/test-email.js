/**
 * Test script để kiểm tra email service
 * Chạy: node test-email.js
 */

require('dotenv').config();
const emailService = require('./src/utils/email');

async function testEmail() {
  console.log('=== Testing Email Service ===\n');
  
  // Kiểm tra cấu hình
  console.log('1. Checking configuration:');
  console.log('   EMAIL_USER:', process.env.EMAIL_USER || 'NOT SET');
  console.log('   EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'SET' : 'NOT SET');
  console.log('   FRONTEND_URL:', process.env.FRONTEND_URL || 'NOT SET');
  console.log('   EMAIL_FROM_NAME:', process.env.EMAIL_FROM_NAME || 'NOT SET');
  console.log('');
  
  // Kiểm tra availability
  console.log('2. Checking availability:');
  const isAvailable = emailService.isAvailable();
  console.log('   isAvailable():', isAvailable);
  console.log('');
  
  if (!isAvailable) {
    console.log('❌ Email service is not available. Please check configuration.');
    process.exit(1);
  }
  
  // Test connection
  console.log('3. Testing SMTP connection:');
  try {
    const verified = await emailService.verifyConnection();
    console.log('   Connection verified:', verified);
    console.log('');
  } catch (error) {
    console.error('   ❌ Connection failed:', error.message);
    process.exit(1);
  }
  
  // Test sending email
  console.log('4. Testing email send:');
  const testEmail = process.env.TEST_EMAIL || process.env.EMAIL_USER;
  const testToken = 'test-token-' + Date.now();
  
  console.log('   Sending test email to:', testEmail);
  console.log('   Test token:', testToken);
  console.log('');
  
  try {
    const result = await emailService.sendVerificationEmail(testEmail, testToken);
    
    if (result && result.messageId) {
      console.log('✅ Email sent successfully!');
      console.log('   MessageId:', result.messageId);
      console.log('   Response:', result.response);
      console.log('   Accepted:', result.accepted);
      console.log('   Rejected:', result.rejected);
    } else {
      console.log('❌ Email service returned null');
    }
  } catch (error) {
    console.error('❌ Failed to send email:');
    console.error('   Error:', error.message);
    console.error('   Code:', error.code);
    console.error('   Response:', error.response);
    process.exit(1);
  }
  
  console.log('\n=== Test completed ===');
}

testEmail().catch(console.error);


