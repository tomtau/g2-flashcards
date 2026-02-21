import type { Deck, FlashCard } from './models';
import { generateId } from './models';
import { createEmptyCard } from 'ts-fsrs';

const STORAGE_KEY = 'g2-flashcards-decks';

export function loadDecks(): Deck[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const decks: Deck[] = JSON.parse(raw);
    for (const deck of decks) {
      for (const card of deck.cards) {
        card.fsrs.due = new Date(card.fsrs.due);
        if (card.fsrs.last_review) {
          card.fsrs.last_review = new Date(card.fsrs.last_review);
        }
      }
    }
    return decks;
  } catch {
    return [];
  }
}

export function saveDecks(decks: Deck[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
}

export function createDeck(name: string): Deck {
  return {
    id: generateId(),
    name,
    cards: [],
    createdAt: new Date().toISOString(),
  };
}

export function createFlashCard(front: string, back: string): FlashCard {
  return {
    id: generateId(),
    front,
    back,
    fsrs: createEmptyCard(),
  };
}

export function getDueCards(deck: Deck, limit: number): FlashCard[] {
  const now = new Date();
  const due = deck.cards
    .filter((c) => new Date(c.fsrs.due) <= now)
    .sort((a, b) => new Date(a.fsrs.due).getTime() - new Date(b.fsrs.due).getTime());
  return due.slice(0, limit);
}
