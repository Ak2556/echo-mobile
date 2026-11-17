import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const m = vi.hoisted(() => ({
  auth: { status: 'ready', session: { user: { id: 'u1' } } as { user: { id: string } } | null },
  stored: new Map<string, unknown>(),
}));

vi.mock('../../lib/auth', () => ({ useAuth: () => m.auth, signOut: vi.fn(() => Promise.resolve()) }));
vi.mock('../../lib/supabaseEchoApi', () => ({
  fetchMyLegalAcceptance: vi.fn(),
  recordLegalAcceptance: vi.fn(),
}));
vi.mock('../../store/persist', () => ({
  persistGet: (k: string, d: unknown) => (m.stored.has(k) ? m.stored.get(k) : d),
  persistSet: (k: string, v: unknown) => { m.stored.set(k, v); },
}));
vi.mock('../../lib/core/remoteConfig', () => ({ isSupabaseRemote: () => true }));
vi.mock('../../lib/routing/openExternalUrl', () => ({ openExternalUrl: vi.fn(() => Promise.resolve(true)) }));
vi.mock('../../lib/routing/publicHost', () => ({ PUBLIC_WEB_ORIGIN: 'https://example.test' }));
vi.mock('../../lib/i18n/i18n', () => ({ ttx: (s: string) => s }));
vi.mock('../../lib/ui/theme', () => ({
  useTheme: () => ({
    colors: { bg: '#fff', text: '#000', textSecondary: '#444', border: '#ccc', accent: '#0a0', onAccent: '#fff', danger: '#c00' },
    radius: { card: 10, full: 9999 },
    font: { display: {}, body: {}, bodySemibold: {}, bodyBold: {} },
  }),
}));

import { TermsGate } from './TermsGate';
import { signOut } from '../../lib/auth';
import { fetchMyLegalAcceptance, recordLegalAcceptance } from '../../lib/supabaseEchoApi';
import { ACCEPTED_STORAGE_KEY, CURRENT_LEGAL, acceptedToken } from '../../lib/legal/acceptance';
import { useTermsGateStore } from '../../lib/legal/gateStore';

const fetchRows = vi.mocked(fetchMyLegalAcceptance);
const record = vi.mocked(recordLegalAcceptance);
const AGREE = 'Agree and continue';
const currentRows = [
  { kind: 'terms', version: CURRENT_LEGAL.terms },
  { kind: 'privacy', version: CURRENT_LEGAL.privacy },
];

beforeEach(() => {
  m.auth = { status: 'ready', session: { user: { id: 'u1' } } };
  m.stored.clear();
  fetchRows.mockReset();
  record.mockReset();
  vi.mocked(signOut).mockClear();
  useTermsGateStore.setState({ open: false });
});

describe('TermsGate', () => {
  it('asks someone with no agreement on record, and tells the birthday card to wait', async () => {
    fetchRows.mockResolvedValue([]);
    render(<TermsGate />);
    expect(await screen.findByText(AGREE)).toBeTruthy();
    expect(screen.getByText('Read the Terms of Service')).toBeTruthy();
    // Polled, not read once: the store is updated by an effect, which can flush after the modal is
    // already in the DOM. Reading it straight after findByText failed once on a slow CI runner.
    await waitFor(() => expect(useTermsGateStore.getState().open).toBe(true));
  });

  it('says nothing to someone who already agreed to the current versions, and remembers it', async () => {
    fetchRows.mockResolvedValue(currentRows);
    render(<TermsGate />);
    await waitFor(() => expect(m.stored.get(ACCEPTED_STORAGE_KEY)).toBe(acceptedToken('u1')));
    expect(screen.queryByText(AGREE)).toBeNull();
    expect(useTermsGateStore.getState().open).toBe(false);
  });

  it('does not touch the network when this device already knows', async () => {
    m.stored.set(ACCEPTED_STORAGE_KEY, acceptedToken('u1'));
    render(<TermsGate />);
    await act(async () => { await Promise.resolve(); });
    expect(fetchRows).not.toHaveBeenCalled();
    expect(screen.queryByText(AGREE)).toBeNull();
  });

  it('asks again when the device remembers an older version', async () => {
    m.stored.set(ACCEPTED_STORAGE_KEY, acceptedToken('u1', { terms: '0.1', privacy: '0.1' }));
    fetchRows.mockResolvedValue([]);
    render(<TermsGate />);
    expect(await screen.findByText(AGREE)).toBeTruthy();
  });

  it('records the agreement for the current versions and closes', async () => {
    fetchRows.mockResolvedValue([]);
    record.mockResolvedValue(undefined);
    render(<TermsGate />);
    fireEvent.click(await screen.findByText(AGREE));
    await waitFor(() => expect(record).toHaveBeenCalledWith(CURRENT_LEGAL.terms, CURRENT_LEGAL.privacy));
    // The gate's own state, not the DOM: react-native-web keeps a fading Modal mounted until a CSS
    // animationend event, which jsdom never fires.
    await waitFor(() => expect(useTermsGateStore.getState().open).toBe(false));
    expect(m.stored.get(ACCEPTED_STORAGE_KEY)).toBe(acceptedToken('u1'));
  });

  it('stays up with an error when the save fails, and remembers nothing', async () => {
    fetchRows.mockResolvedValue([]);
    record.mockRejectedValue(new Error('network'));
    render(<TermsGate />);
    fireEvent.click(await screen.findByText(AGREE));
    expect(await screen.findByText(/Could not save your choice/)).toBeTruthy();
    expect(screen.getByText(AGREE)).toBeTruthy();
    expect(m.stored.has(ACCEPTED_STORAGE_KEY)).toBe(false);
  });

  it('declining signs out', async () => {
    fetchRows.mockResolvedValue([]);
    render(<TermsGate />);
    fireEvent.click(await screen.findByText('Decline and sign out'));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(record).not.toHaveBeenCalled();
  });

  it('never locks anyone out when the read fails', async () => {
    fetchRows.mockRejectedValue(new Error('offline'));
    render(<TermsGate />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText(AGREE)).toBeNull();
    expect(useTermsGateStore.getState().open).toBe(false);
  });

  it('does nothing when signed out', async () => {
    m.auth = { status: 'signed-out', session: null };
    render(<TermsGate />);
    await act(async () => { await Promise.resolve(); });
    expect(fetchRows).not.toHaveBeenCalled();
    expect(screen.queryByText(AGREE)).toBeNull();
  });

  it('also asks mid-signup, before onboarding finishes', async () => {
    m.auth = { status: 'needs-onboarding', session: { user: { id: 'u1' } } };
    fetchRows.mockResolvedValue([]);
    render(<TermsGate />);
    expect(await screen.findByText(AGREE)).toBeTruthy();
  });
});
