import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadDecks, saveDecks, createDeck, createFlashCard, getDueCards,
  getCardCounts, getDueCardCounts, loadReviewPrefs, saveReviewPrefs,
  exportAppState, importAppState,
} from '../storage';
import type { Deck } from '../models';
import { State } from 'ts-fsrs';

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

  it('getDueCards with newCardLimit mixes reviewed and new cards', () => {
    const deck = createDeck('Test');
    // Add 3 new cards (State.New, due now)
    for (let i = 0; i < 3; i++) {
      deck.cards.push(createFlashCard(`New${i}`, `ANew${i}`));
    }
    // Add 2 review cards (State.Review, due now)
    for (let i = 0; i < 2; i++) {
      const card = createFlashCard(`Rev${i}`, `ARev${i}`);
      card.fsrs.state = State.Review;
      card.fsrs.due = new Date(Date.now() - 1000);
      deck.cards.push(card);
    }

    // limit=5, newCardLimit=1 => 2 review + 1 new = 3
    const due = getDueCards(deck, 5, 1);
    expect(due).toHaveLength(3);
    const reviewCards = due.filter((c) => c.fsrs.state === State.Review);
    const newCards = due.filter((c) => c.fsrs.state === State.New);
    expect(reviewCards).toHaveLength(2);
    expect(newCards).toHaveLength(1);
  });

  it('getDueCards without newCardLimit uses legacy behavior', () => {
    const deck = createDeck('Test');
    for (let i = 0; i < 5; i++) {
      deck.cards.push(createFlashCard(`Q${i}`, `A${i}`));
    }
    // Without newCardLimit, all due cards returned up to limit
    const due = getDueCards(deck, 3);
    expect(due).toHaveLength(3);
  });

  it('getDueCards newCardLimit=0 returns only review cards', () => {
    const deck = createDeck('Test');
    // 3 new cards
    for (let i = 0; i < 3; i++) {
      deck.cards.push(createFlashCard(`New${i}`, `ANew${i}`));
    }
    // 2 review cards
    for (let i = 0; i < 2; i++) {
      const card = createFlashCard(`Rev${i}`, `ARev${i}`);
      card.fsrs.state = State.Review;
      card.fsrs.due = new Date(Date.now() - 1000);
      deck.cards.push(card);
    }

    const due = getDueCards(deck, 10, 0);
    expect(due).toHaveLength(2);
    expect(due.every((c) => c.fsrs.state === State.Review)).toBe(true);
  });

  it('getCardCounts categorizes cards correctly', () => {
    const deck = createDeck('Test');
    deck.cards.push(createFlashCard('New1', 'A1'));
    const learningCard = createFlashCard('Learn1', 'A2');
    learningCard.fsrs.state = State.Learning;
    deck.cards.push(learningCard);
    const reviewCard = createFlashCard('Rev1', 'A3');
    reviewCard.fsrs.state = State.Review;
    deck.cards.push(reviewCard);
    const relearnCard = createFlashCard('Relearn1', 'A4');
    relearnCard.fsrs.state = State.Relearning;
    deck.cards.push(relearnCard);

    const counts = getCardCounts(deck);
    expect(counts.new).toBe(1);
    expect(counts.learning).toBe(2); // Learning + Relearning
    expect(counts.review).toBe(1);
  });

  it('getDueCardCounts only counts due cards', () => {
    const deck = createDeck('Test');
    // Due new card
    deck.cards.push(createFlashCard('New1', 'A1'));
    // Future review card (not due)
    const futureCard = createFlashCard('Rev1', 'A2');
    futureCard.fsrs.state = State.Review;
    futureCard.fsrs.due = new Date(Date.now() + 86400000);
    deck.cards.push(futureCard);
    // Due review card
    const dueReview = createFlashCard('Rev2', 'A3');
    dueReview.fsrs.state = State.Review;
    dueReview.fsrs.due = new Date(Date.now() - 1000);
    deck.cards.push(dueReview);

    const counts = getDueCardCounts(deck);
    expect(counts.newDue).toBe(1);
    expect(counts.reviewDue).toBe(1);
    expect(counts.learningDue).toBe(0);
  });

  it('saveReviewPrefs and loadReviewPrefs round-trip', () => {
    saveReviewPrefs('deck1', { reviewCount: 15, newCardLimit: 5 });
    const prefs = loadReviewPrefs('deck1');
    expect(prefs).toEqual({ reviewCount: 15, newCardLimit: 5 });
  });

  it('loadReviewPrefs returns null for unknown deck', () => {
    expect(loadReviewPrefs('nonexistent')).toBeNull();
  });

  it('saveReviewPrefs preserves prefs for other decks', () => {
    saveReviewPrefs('deck1', { reviewCount: 10, newCardLimit: 3 });
    saveReviewPrefs('deck2', { reviewCount: 20, newCardLimit: 8 });
    expect(loadReviewPrefs('deck1')).toEqual({ reviewCount: 10, newCardLimit: 3 });
    expect(loadReviewPrefs('deck2')).toEqual({ reviewCount: 20, newCardLimit: 8 });
  });

  // ─── Backup / Restore ───────────────────────────────────────

  it('exportAppState includes decks and review prefs', () => {
    const deck = createDeck('Export Test');
    deck.cards.push(createFlashCard('Q1', 'A1'));
    saveDecks([deck]);
    saveReviewPrefs(deck.id, { reviewCount: 15, newCardLimit: 5 });

    const json = exportAppState();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBeDefined();
    expect(parsed.decks).toHaveLength(1);
    expect(parsed.decks[0].name).toBe('Export Test');
    expect(parsed.reviewPrefs[deck.id]).toEqual({ reviewCount: 15, newCardLimit: 5 });
  });

  it('importAppState restores decks and prefs', () => {
    const deck = createDeck('Import Test');
    deck.cards.push(createFlashCard('Q1', 'A1'));
    const state = {
      version: 1,
      exportedAt: new Date().toISOString(),
      decks: [deck],
      reviewPrefs: { [deck.id]: { reviewCount: 10, newCardLimit: 3 } },
    };

    const result = importAppState(JSON.stringify(state));
    expect(result.success).toBe(true);
    expect(result.deckCount).toBe(1);

    const loaded = loadDecks();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Import Test');
    expect(loaded[0].cards[0].fsrs.due).toBeInstanceOf(Date);

    expect(loadReviewPrefs(deck.id)).toEqual({ reviewCount: 10, newCardLimit: 3 });
  });

  it('importAppState rejects invalid JSON', () => {
    const result = importAppState('not json');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid JSON');
  });

  it('importAppState rejects wrong version', () => {
    const result = importAppState(JSON.stringify({ version: 99, decks: [] }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('version');
  });

  it('importAppState rejects missing decks', () => {
    const result = importAppState(JSON.stringify({ version: 1 }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('deck data');
  });

  it('importAppState rejects invalid deck structure', () => {
    const result = importAppState(JSON.stringify({ version: 1, decks: [{ id: 123 }] }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid deck');
  });

  it('exportAppState and importAppState round-trip', () => {
    const deck = createDeck('Round Trip');
    deck.cards.push(createFlashCard('Q', 'A'));
    saveDecks([deck]);
    saveReviewPrefs(deck.id, { reviewCount: 20, newCardLimit: 8 });

    const json = exportAppState();

    // Clear storage
    for (const key in storage) delete storage[key];
    expect(loadDecks()).toEqual([]);

    const result = importAppState(json);
    expect(result.success).toBe(true);

    const loaded = loadDecks();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Round Trip');
    expect(loaded[0].cards[0].front).toBe('Q');
    expect(loadReviewPrefs(deck.id)).toEqual({ reviewCount: 20, newCardLimit: 8 });
  });
});
