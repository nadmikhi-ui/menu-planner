import { describe, expect, it } from 'vitest';
import { parseHash } from './navigation';

describe('parseHash', () => {
  it('reads the tab and nested path', () => {
    expect(parseHash('#/dishes')).toEqual({ tab: 'dishes', path: [] });
    expect(parseHash('#/dishes/12')).toEqual({ tab: 'dishes', path: ['12'] });
    expect(parseHash('#/more/settings/')).toEqual({ tab: 'more', path: ['settings'] });
  });

  it('falls back to the week tab', () => {
    expect(parseHash('')).toEqual({ tab: 'week', path: [] });
    expect(parseHash('#/unknown/1')).toEqual({ tab: 'week', path: [] });
  });
});
