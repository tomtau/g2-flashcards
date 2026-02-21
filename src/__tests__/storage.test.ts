import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadDecks, saveDecks, createDeck, createFlashCard, getDueCards } from '../storage';
import type { Deck } from '../models';

// Mock localStorage
const storage: Record<string, string> = {};
beforeEach(() => {
  for (const key in storage) delete storage[key];
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => { storage[key] = value; },
    removeItem: (key: string) => { delete storage[key]; },
  });
});

describe('storage', () => {
  it('loadDecks returns empty array when no data', () => {
    expect(loadDecks()).toEqual([]);
  });

  it('saveDecks and loadDecks round-trip', () => {
    const deck = createDeck('Test');
    deck.cards.push(createFlashCard('Q1', 'A1'));
    saveDecks([deck]);
    const loaded = loadDecks();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Test');
    expect(loaded[0].cards).toHaveLength(1);
    expect(loaded[0].cards[0].front).toBe('Q1');
    expect(loaded[0].cards[0].back).toBe('A1');
  });

  it('createDeck creates deck with unique id', () => {
    const d1 = createDeck('A');
    const d2 = createDeck('B');
    expect(d1.id).not.toBe(d2.id);
    expect(d1.name).toBe('A');
    expect(d1.cards).toEqual([]);
  });

  it('createFlashCard creates card with FSRS state', () => {
    const card = createFlashCard('Front', 'Back');
    expect(card.front).toBe('Front');
    expect(card.back).toBe('Back');
    expect(card.fsrs).toBeDefined();
    expect(card.fsrs.due).toBeInstanceOf(Date);
    expect(card.fsrs.reps).toBe(0);
  });

  it('getDueCards returns cards due now', () => {
    const deck = createDeck('Test');
    // New cards have due = now, so they should be due
    deck.cards.push(createFlashCard('Q1', 'A1'));
    deck.cards.push(createFlashCard('Q2', 'A2'));
    const due = getDueCards(deck, 10);
    expect(due).toHaveLength(2);
  });

  it('getDueCards respects limit', () => {
    const deck = createDeck('Test');
    for (let i = 0; i < 5; i++) {
      deck.cards.push(createFlashCard(`Q${i}`, `A${i}`));
    }
    const due = getDueCards(deck, 3);
    expect(due).toHaveLength(3);
  });

  it('loadDecks handles corrupt data gracefully', () => {
    storage['g2-flashcards-decks'] = 'not json';
    expect(loadDecks()).toEqual([]);
  });

  it('preserves FSRS date fields through serialization', () => {
    const deck = createDeck('Test');
    deck.cards.push(createFlashCard('Q', 'A'));
    saveDecks([deck]);
    const loaded = loadDecks();
    expect(loaded[0].cards[0].fsrs.due).toBeInstanceOf(Date);
  });
});
