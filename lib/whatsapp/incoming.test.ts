import { describe, expect, it } from 'vitest';
import { parseIncoming, verifyHandshake } from './incoming';

const envelope = (value: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: '0', changes: [{ field: 'messages', value }] }],
});

describe('parseIncoming', () => {
  it('reads a text message and the sender name', () => {
    const msgs = parseIncoming(envelope({
      contacts: [{ wa_id: '919876543210', profile: { name: 'Anita' } }],
      messages: [{ id: 'wamid.1', from: '919876543210', timestamp: '1787900000', type: 'text', text: { body: 'remind me to run' } }],
    }));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      id: 'wamid.1', waId: '919876543210', profileName: 'Anita',
      kind: 'text', text: 'remind me to run', timestamp: 1787900000,
    });
  });

  it('treats a voice note as first class, not unsupported media', () => {
    // Voice is the reason this channel is worth having here.
    const msgs = parseIncoming(envelope({
      messages: [{ id: 'wamid.2', from: '919876543210', timestamp: '1', type: 'audio', audio: { id: 'media-123', voice: true } }],
    }));
    expect(msgs[0].kind).toBe('audio');
    expect(msgs[0].mediaId).toBe('media-123');
  });

  it('reads an image and keeps its caption', () => {
    const msgs = parseIncoming(envelope({
      messages: [{ id: 'wamid.3', from: '91987', timestamp: '1', type: 'image', image: { id: 'img-1', caption: 'my lunch' } }],
    }));
    expect(msgs[0]).toMatchObject({ kind: 'image', mediaId: 'img-1', text: 'my lunch' });
  });

  it('ignores delivery statuses', () => {
    // Statuses outnumber messages in practice. Answering one would mean Echo
    // replying to a read receipt.
    const msgs = parseIncoming(envelope({
      statuses: [{ id: 'wamid.1', status: 'read', recipient_id: '919876543210' }],
    }));
    expect(msgs).toEqual([]);
  });

  it('picks the messages out of a batch that also carries statuses', () => {
    const msgs = parseIncoming(envelope({
      statuses: [{ id: 'wamid.0', status: 'delivered' }],
      messages: [{ id: 'wamid.9', from: '91987', timestamp: '1', type: 'text', text: { body: 'hi' } }],
    }));
    expect(msgs.map(m => m.id)).toEqual(['wamid.9']);
  });

  it('flattens several entries and changes in one POST', () => {
    const msgs = parseIncoming({
      object: 'whatsapp_business_account',
      entry: [
        { changes: [{ value: { messages: [{ id: 'a', from: '1', timestamp: '1', type: 'text', text: { body: 'one' } }] } }] },
        { changes: [{ value: { messages: [{ id: 'b', from: '2', timestamp: '2', type: 'text', text: { body: 'two' } }] } }] },
      ],
    });
    expect(msgs.map(m => m.id)).toEqual(['a', 'b']);
  });

  it('marks message types Echo cannot act on rather than dropping them silently', () => {
    const msgs = parseIncoming(envelope({
      messages: [{ id: 'wamid.4', from: '91987', timestamp: '1', type: 'location', location: {} }],
    }));
    expect(msgs[0].kind).toBe('unsupported');
  });

  it('survives junk without throwing', () => {
    // This runs on a public endpoint; anything can be POSTed at it.
    for (const junk of [null, undefined, {}, [], 'string', { object: 'page' }, { object: 'whatsapp_business_account' }]) {
      expect(() => parseIncoming(junk)).not.toThrow();
      expect(parseIncoming(junk)).toEqual([]);
    }
  });

  it('skips messages missing an id or a sender', () => {
    const msgs = parseIncoming(envelope({
      messages: [
        { from: '91987', timestamp: '1', type: 'text', text: { body: 'no id' } },
        { id: 'x', timestamp: '1', type: 'text', text: { body: 'no sender' } },
      ],
    }));
    expect(msgs).toEqual([]);
  });
});

describe('verifyHandshake', () => {
  const q = (o: Record<string, string>) => new URLSearchParams(o);

  it('returns the challenge when the token matches', () => {
    const r = verifyHandshake(
      q({ 'hub.mode': 'subscribe', 'hub.verify_token': 'secret', 'hub.challenge': '12345' }),
      'secret',
    );
    expect(r).toEqual({ ok: true, challenge: '12345' });
  });

  it('refuses a wrong token', () => {
    // Echoing the challenge unconditionally would let anyone point their own
    // webhook subscription at this endpoint.
    expect(verifyHandshake(
      q({ 'hub.mode': 'subscribe', 'hub.verify_token': 'guess', 'hub.challenge': '1' }), 'secret',
    )).toEqual({ ok: false });
  });

  it('refuses when the server has no token configured', () => {
    expect(verifyHandshake(
      q({ 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': '1' }), '',
    )).toEqual({ ok: false });
  });

  it('refuses a non-subscribe mode or a missing challenge', () => {
    expect(verifyHandshake(q({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'secret', 'hub.challenge': '1' }), 'secret')).toEqual({ ok: false });
    expect(verifyHandshake(q({ 'hub.mode': 'subscribe', 'hub.verify_token': 'secret' }), 'secret')).toEqual({ ok: false });
  });
});
