const supabaseUrl = 'https://eyokhisijabitzjiydmz.supabase.co';
const supabaseKey = 'sb_publishable_QpEskJHtmFlVVAJXUsBj9Q_nDPl6wP4';

async function testJWT() {
  const testEmail = `test_${Date.now()}@example.com`;
  const testUsername = `testuser_${Date.now()}`;
  
  const authRes = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      email: testEmail, 
      password: 'password123',
      data: { username: testUsername, display_name: 'Test User' }
    })
  });

  const authData = await authRes.json();
  const token = authData.access_token;
  
  // Base64 decode the payload
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  console.log('JWT Payload:', payload);
}
testJWT();
