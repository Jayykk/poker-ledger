import { SUITS } from './constants.js';

/**
 * Tailwind text colour for a card string such as "A♠" or "10♥".
 * Hearts and diamonds render red, everything else follows the theme.
 * @param {string} card
 * @returns {string}
 */
export const getCardColor = (card) => {
  if (typeof card === 'string' && (card.includes(SUITS.HEARTS) || card.includes(SUITS.DIAMONDS))) {
    return 'text-red-500';
  }
  return 'text-gray-900 dark:text-white';
};
