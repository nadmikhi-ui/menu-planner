import { describe, expect, it } from 'vitest';
import { matchProducts } from './products';

const products = ['яйца', 'филе индейки', 'перец черный молотый', 'перец болгарский', 'сыр козий', 'творог'];

describe('matchProducts', () => {
  it('finds by start of the name first, then by a word, then anywhere', () => {
    expect(matchProducts(['сладкий перец', 'перец болгарский', 'суперперец'], 'перец', [])).toEqual([
      'перец болгарский',
      'сладкий перец',
      'суперперец',
    ]);
  });

  it('ignores case and ё', () => {
    expect(matchProducts(['перец черный молотый'], 'ЧЁРН', [])).toEqual(['перец черный молотый']);
  });

  it('leaves out products already chosen', () => {
    expect(matchProducts(products, 'перец', ['перец болгарский'])).toEqual(['перец черный молотый']);
  });

  it('returns everything alphabetically for an empty query', () => {
    expect(matchProducts(products, '  ', [])).toEqual([
      'перец болгарский',
      'перец черный молотый',
      'сыр козий',
      'творог',
      'филе индейки',
      'яйца',
    ]);
  });
});
