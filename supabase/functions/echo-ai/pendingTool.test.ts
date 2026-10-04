import { describe, expect, it } from 'vitest';
import { findPendingToolCall, type StoredMessageRow } from './pendingTool';

const call = (id: string, name: string) => ({ id, type: 'function', function: { name, arguments: '{}' } });
const assistant = (...calls: ReturnType<typeof call>[]): StoredMessageRow => ({ role: 'assistant', tool_calls: calls });
const tool = (id: string): StoredMessageRow => ({ role: 'tool', tool_call_id: id });

describe('findPendingToolCall', () => {
  it('finds a call the assistant made that nobody has answered', () => {
    const rows = [{ role: 'user' }, assistant(call('c1', 'compose_post'))];
    expect(findPendingToolCall(rows, 'c1')).toEqual({ name: 'compose_post' });
  });

  it('refuses an id the model never issued', () => {
    // The hole: confirm took any id and ran the agent loop on it, so a client could
    // replay a made-up confirm indefinitely.
    expect(findPendingToolCall([assistant(call('c1', 'compose_post'))], 'forged')).toBeNull();
    expect(findPendingToolCall([], 'c1')).toBeNull();
  });

  it('refuses a call that already has a result, so a confirm cannot be replayed', () => {
    const rows = [assistant(call('c1', 'compose_post')), tool('c1')];
    expect(findPendingToolCall(rows, 'c1')).toBeNull();
  });

  it('keeps the other call of a pair pending after one is answered', () => {
    const rows = [assistant(call('a', 'compose_post'), call('b', 'compose_poll')), tool('a')];
    expect(findPendingToolCall(rows, 'a')).toBeNull();
    expect(findPendingToolCall(rows, 'b')).toEqual({ name: 'compose_poll' });
  });

  it('is not fooled by a tool result sitting on a different id', () => {
    const rows = [assistant(call('c1', 'compose_post')), tool('other')];
    expect(findPendingToolCall(rows, 'c1')).toEqual({ name: 'compose_post' });
  });

  it('ignores a tool_calls field on a non-assistant row', () => {
    const rows: StoredMessageRow[] = [{ role: 'user', tool_calls: [call('c1', 'compose_post')] }];
    expect(findPendingToolCall(rows, 'c1')).toBeNull();
  });

  it('rejects non-string ids and malformed stored calls without throwing', () => {
    const rows: StoredMessageRow[] = [{ role: 'assistant', tool_calls: [{ id: 'c1' } as never, null as never] }];
    expect(findPendingToolCall(rows, undefined as never)).toBeNull();
    expect(findPendingToolCall(rows, 42 as never)).toBeNull();
    expect(findPendingToolCall(rows, 'c1')).toBeNull();
    expect(findPendingToolCall([{ role: 'assistant', tool_calls: 'nope' as never }], 'c1')).toBeNull();
  });
});
