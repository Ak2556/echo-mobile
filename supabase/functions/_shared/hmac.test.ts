import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { hmacSha256Hex } from './hmac';

describe('hmacSha256Hex', () => {
  it('matches the reference implementation (the Razorpay webhook signature)', async () => {
    const body = '{"event":"payment.captured","payload":{}}';
    expect(await hmacSha256Hex('rzp_webhook_secret', body))
      .toBe(createHmac('sha256', 'rzp_webhook_secret').update(body).digest('hex'));
  });

  it('handles non-ASCII bodies byte-for-byte', async () => {
    const body = '{"notes":"नमस्ते ₹500"}';
    expect(await hmacSha256Hex('s', body)).toBe(createHmac('sha256', 's').update(body, 'utf8').digest('hex'));
  });
});
