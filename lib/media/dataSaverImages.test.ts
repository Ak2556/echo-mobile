import { beforeEach, describe, expect, it } from 'vitest';
import { isPhotoLoaded, markPhotoLoaded, resetLoadedPhotos } from './dataSaverImages';

beforeEach(() => resetLoadedPhotos());

describe('photos loaded under Data Saver', () => {
  it('a photo is held until it is asked for, then stays loaded', () => {
    expect(isPhotoLoaded('https://a/1.jpg')).toBe(false);
    markPhotoLoaded('https://a/1.jpg');
    expect(isPhotoLoaded('https://a/1.jpg')).toBe(true);
  });

  it('ignores an empty uri', () => {
    markPhotoLoaded('');
    expect(isPhotoLoaded('')).toBe(false);
  });

  it('remembers a bounded number, forgetting the oldest first', () => {
    for (let i = 0; i < 500; i++) markPhotoLoaded(`https://a/${i}.jpg`);
    markPhotoLoaded('https://a/new.jpg');
    expect(isPhotoLoaded('https://a/0.jpg')).toBe(false);
    expect(isPhotoLoaded('https://a/1.jpg')).toBe(true);
    expect(isPhotoLoaded('https://a/new.jpg')).toBe(true);
  });
});
