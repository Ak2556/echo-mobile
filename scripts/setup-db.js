#!/usr/bin/env node
/**
 * Runs backend/db/schema.sql against the Supabase project.
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/setup-db.js
 *
 * Get your service role key from:
 *   Supabase dashboard → Project Settings → API → service_role (secret)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PROJECT_REF = 'eyokhisijabitzjiydmz';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('❌  Missing SUPABASE_SERVICE_ROLE_KEY env var.');
  console.error('   Get it from: Supabase dashboard → Project Settings → API → service_role');
  console.error('   Then run: SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/setup-db.js');
  process.exit(1);
}

const schemaPath = path.join(__dirname, '..', 'backend', 'db', 'schema.sql');
const sql = fs.readFileSync(schemaPath, 'utf8');

const body = JSON.stringify({ query: sql });

const options = {
  hostname: `${PROJECT_REF}.supabase.co`,
  port: 443,
  path: '/rest/v1/rpc/exec_sql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
  },
};

// Supabase doesn't expose a raw SQL exec via REST by default.
// We use the Management API instead.
const mgmtOptions = {
  hostname: 'api.supabase.com',
  port: 443,
  path: `/v1/projects/${PROJECT_REF}/database/query`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Authorization': `Bearer ${SERVICE_KEY}`,
  },
};

console.log('⏳  Running schema against Supabase...');

const req = https.request(mgmtOptions, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅  Schema applied successfully!');
    } else {
      // Try direct SQL via service role using pg connection
      console.log(`⚠️  Management API returned ${res.statusCode}. Trying direct approach...`);
      console.log(data);
      runDirectSQL(sql, SERVICE_KEY);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
  runDirectSQL(sql, SERVICE_KEY);
});

req.write(body);
req.end();

function runDirectSQL(sql, serviceKey) {
  // Split into statements and run each via PostgREST admin endpoint
  const stmts = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📋  Attempting to run ${stmts.length} SQL statements via service role...`);

  const createFnBody = JSON.stringify({
    query: sql
  });

  const directOpts = {
    hostname: `${PROJECT_REF}.supabase.co`,
    port: 443,
    path: '/pg/query',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(createFnBody),
      'Authorization': `Bearer ${serviceKey}`,
    },
  };

  const r2 = https.request(directOpts, (res2) => {
    let d = '';
    res2.on('data', c => { d += c; });
    res2.on('end', () => {
      if (res2.statusCode >= 200 && res2.statusCode < 300) {
        console.log('✅  Schema applied via pg endpoint!');
      } else {
        console.log('\n──────────────────────────────────────────────────────────');
        console.log('ℹ️  Automated migration requires a Personal Access Token.');
        console.log('   The service role key only works for data operations.');
        console.log('\n   To apply the schema manually (30 seconds):');
        console.log('   1. Go to: https://supabase.com/dashboard/project/' + PROJECT_REF + '/editor');
        console.log('   2. Paste contents of: backend/db/schema.sql');
        console.log('   3. Click Run');
        console.log('──────────────────────────────────────────────────────────\n');
      }
    });
  });
  r2.on('error', () => {
    console.log('\n──────────────────────────────────────────────────────────');
    console.log('   Manual step required — apply schema in Supabase SQL Editor:');
    console.log('   https://supabase.com/dashboard/project/' + PROJECT_REF + '/editor');
    console.log('──────────────────────────────────────────────────────────\n');
  });
  r2.write(createFnBody);
  r2.end();
}
