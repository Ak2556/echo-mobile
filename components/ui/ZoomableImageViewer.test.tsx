import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * The save action is an author's permission made visible, so the case that
 * matters is the negative one: a viewer opened on media whose author opted out
 * must not offer it. Testing only the happy path would leave the opt-out — the
 * half with privacy consequences — unguarded.
 */

const saveMediaToDevice = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('../../lib/mediaDownload', () => ({ saveMediaToDevice }));
vi.mock('./Toast', () => ({ showToast }));

import { ZoomableImageViewer } from './ZoomableImageViewer';

const URIS = ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'];
const SAVE_LABEL = /save photo to your device/i;

function open(props: Partial<React.ComponentProps<typeof ZoomableImageViewer>> = {}) {
  return render(
    <ZoomableImageViewer visible uris={URIS} onClose={() => {}} {...props} />,
  );
}

describe('ZoomableImageViewer save action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveMediaToDevice.mockResolvedValue({ ok: true });
  });

  it('offers no save action by default — avatars and chrome use this too', () => {
    open();
    expect(screen.queryByLabelText(SAVE_LABEL)).toBeNull();
  });

  it('offers no save action when the author has opted out', () => {
    open({ canDownload: false });
    expect(screen.queryByLabelText(SAVE_LABEL)).toBeNull();
  });

  it('offers it when the author allows downloads', () => {
    open({ canDownload: true });
    expect(screen.queryByLabelText(SAVE_LABEL)).not.toBeNull();
  });

  it('saves the photo on screen, not the first of the set', async () => {
    open({ canDownload: true, initialIndex: 1 });
    fireEvent.click(screen.getByLabelText(SAVE_LABEL));
    await waitFor(() => expect(saveMediaToDevice).toHaveBeenCalledWith(URIS[1]));
  });

  it('surfaces a failure instead of failing silently', async () => {
    saveMediaToDevice.mockResolvedValue({ ok: false, reason: 'Download failed (404).' });
    open({ canDownload: true });
    fireEvent.click(screen.getByLabelText(SAVE_LABEL));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Download failed (404).'));
  });

  it('says nothing when the save succeeds — the share sheet is the feedback', async () => {
    open({ canDownload: true });
    fireEvent.click(screen.getByLabelText(SAVE_LABEL));
    await waitFor(() => expect(saveMediaToDevice).toHaveBeenCalled());
    expect(showToast).not.toHaveBeenCalled();
  });
});
