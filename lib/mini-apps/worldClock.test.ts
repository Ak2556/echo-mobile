import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('./miniAppSync', () => ({ pullMiniAppIfNewer: vi.fn(), pushMiniApp: vi.fn() }));

import { PRESET_CITIES, zoneLabel } from './worldClock';

const preset = (id: string) => PRESET_CITIES.find(c => c.id === id)!;
const OCT_1 = Date.UTC(2026, 9, 1, 9, 0);
const JAN_15 = Date.UTC(2026, 0, 15, 9, 0);
const JUL_15 = Date.UTC(2026, 6, 15, 9, 0);

// The presets stored one fixed abbreviation, so on 1 Oct 2026 New York said
// "EST" and London "GMT" while showing summer-time clocks.
describe('zoneLabel', () => {
  it('uses the summer abbreviation while daylight saving is on', () => {
    expect(zoneLabel(preset('new-york'), OCT_1)).toBe('EDT');
    expect(zoneLabel(preset('london'), OCT_1)).toBe('BST');
    expect(zoneLabel(preset('paris'), OCT_1)).toBe('CEST');
    expect(zoneLabel(preset('chicago'), JUL_15)).toBe('CDT');
  });

  it('uses the standard abbreviation in winter', () => {
    expect(zoneLabel(preset('new-york'), JAN_15)).toBe('EST');
    expect(zoneLabel(preset('london'), JAN_15)).toBe('GMT');
  });

  it('handles southern-hemisphere summer', () => {
    expect(zoneLabel(preset('sydney'), JAN_15)).toBe('AEDT');
    expect(zoneLabel(preset('sydney'), JUL_15)).toBe('AEST');
  });

  it('leaves zones without daylight saving alone', () => {
    expect(zoneLabel(preset('tokyo'), JUL_15)).toBe('JST');
    expect(zoneLabel(preset('mexico-city'), JUL_15)).toBe('CST');
  });

  it('keeps a searched place’s region text', () => {
    const searched = { id: 'paris-tx', name: 'Paris', timezone: 'America/Chicago', region: 'Texas, United States', flag: '', source: 'search' as const };
    expect(zoneLabel(searched, JUL_15)).toBe('Texas, United States');
  });
});
