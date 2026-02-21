import { describe, it, expect } from 'vitest';
import { reviewCard, getNextReviewLabel, Rating } from '../scheduler';
import { createFlashCard } from '../storage';

describe('scheduler', () => {
  it('reviewCard updates FSRS state', () => {
    const card = createFlashCard('Q', 'A');
    const updated = reviewCard(card, Rating.Good);
    expect(updated.fsrs.reps).toBe(1);
    expect(updated.front).toBe('Q');
    expect(updated.back).toBe('A');
    expect(updated.id).toBe(card.id);
  });

  it('reviewCard with Again produces shorter interval', () => {
    const card = createFlashCard('Q', 'A');
    const again = reviewCard(card, Rating.Again);
    const easy = reviewCard(card, Rating.Easy);
    expect(new Date(again.fsrs.due).getTime()).toBeLessThanOrEqual(
      new Date(easy.fsrs.due).getTime(),
    );
  });

  it('getNextReviewLabel returns "Now" for new cards', () => {
    const card = createFlashCard('Q', 'A');
    expect(getNextReviewLabel(card)).toBe('Now');
  });

  it('getNextReviewLabel returns time label for future cards', () => {
    const card = createFlashCard('Q', 'A');
    // Set due to 2 hours from now
    card.fsrs.due = new Date(Date.now() + 2 * 60 * 60 * 1000);
    expect(getNextReviewLabel(card)).toBe('2h');
  });

  it('getNextReviewLabel returns days for far future cards', () => {
    const card = createFlashCard('Q', 'A');
    card.fsrs.due = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    expect(getNextReviewLabel(card)).toBe('3d');
  });

  it('getNextReviewLabel returns minutes for near future cards', () => {
    const card = createFlashCard('Q', 'A');
    card.fsrs.due = new Date(Date.now() + 15 * 60 * 1000);
    expect(getNextReviewLabel(card)).toBe('15m');
  });
});
