const supabaseUrl = 'https://eyokhisijabitzjiydmz.supabase.co';
const supabaseKey = 'sb_publishable_QpEskJHtmFlVVAJXUsBj9Q_nDPl6wP4';
const workerUrl = 'https://echo-mobile.at3236129.workers.dev';

async function testUpload() {
  console.log('1. Signing up test user via REST API...');
  const testEmail = `test_${Date.now()}@example.com`;
  const testUsername = `testuser_${Date.now()}`;
  
  const authRes = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
    },
    body: JSON.stringify({ 
      email: testEmail, 
      password: 'password123',
      data: { username: testUsername, display_name: 'Test User' }
    })
  });

  if (!authRes.ok) {
    console.error('Failed to sign up:', await authRes.text());
    return;
  }
  
  const authData = await authRes.json();
  const token = authData.access_token;
  const userId = authData.user.id;
  console.log(`User created. ID: ${userId}`);

  console.log('\n2. Requesting presigned URL from Cloudflare Worker...');
  const filename = 'test-avatar.txt';
  const path = `${userId}/${filename}`;
  const response = await fetch(`${workerUrl}/upload-url?bucket=avatars&path=${path}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Failed to get signed URL:', response.status, err);
    return;
  }

  const { signedUrl, publicUrl } = await response.json();
  console.log('Got signed URL:', signedUrl.substring(0, 50) + '...');
  console.log('Expected public URL:', publicUrl);

  console.log('\n3. Uploading file to R2 directly...');
  const fileContent = 'Hello Cloudflare R2! This is a test file from the migration.';
  const uploadRes = await fetch(signedUrl, {
    method: 'PUT',
    body: fileContent,
    headers: {
    }
  });

  if (!uploadRes.ok) {
    console.error('Upload to R2 failed:', uploadRes.status, await uploadRes.text());
    return;
  }

  console.log('\n✅ 🚀 ALL SUCCESSFUL! The file was uploaded to R2.');
}

testUpload();
