import type { Deck, FlashCard } from './models';
import { loadDecks, saveDecks, createDeck, createFlashCard, getDueCards } from './storage';
import { reviewCard, Rating, getNextReviewLabel, formatDueDate, type Grade } from './scheduler';
import { parseAnkiTxt, type AnkiParseResult } from './anki-import';
import { startG2Review } from './g2-review';

let decks: Deck[] = loadDecks();
const app = document.getElementById('app')!;

function save() {
  saveDecks(decks);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Deck List ──────────────────────────────────────────────

function renderDeckList() {
  app.innerHTML = `
    <h1>📚 G2 Flashcards</h1>
    <div class="btn-row">
      <button class="primary" id="add-deck-btn">+ New Deck</button>
      <button id="import-btn">Import Anki TXT</button>
    </div>
    <div id="deck-form" class="hidden">
      <div class="form-group">
        <label>Deck Name</label>
        <input id="deck-name-input" placeholder="Enter deck name..." />
      </div>
      <div class="btn-row">
        <button class="primary" id="save-deck-btn">Save</button>
        <button id="cancel-deck-btn">Cancel</button>
      </div>
    </div>
    <div id="deck-list"></div>
  `;

  const form = document.getElementById('deck-form')!;
  const input = document.getElementById('deck-name-input') as HTMLInputElement;

  document.getElementById('add-deck-btn')!.onclick = () => {
    form.classList.remove('hidden');
    input.value = '';
    input.focus();
  };

  document.getElementById('cancel-deck-btn')!.onclick = () => {
    form.classList.add('hidden');
  };

  document.getElementById('save-deck-btn')!.onclick = () => {
    const name = input.value.trim();
    if (!name) return;
    decks.push(createDeck(name));
    save();
    renderDeckList();
  };

  document.getElementById('import-btn')!.onclick = () => {
    renderImportPage();
  };

  renderDeckItems();
}

function renderDeckItems() {
  const container = document.getElementById('deck-list')!;
  if (decks.length === 0) {
    container.innerHTML = '<div class="empty">No decks yet. Create one or import from Anki.</div>';
    return;
  }

  container.innerHTML = decks
    .map((deck) => {
      const dueCount = getDueCards(deck, Infinity).length;
      return `
      <div class="card" data-id="${escapeHtml(deck.id)}">
        <div class="card-header">
          <h3>${escapeHtml(deck.name)}</h3>
          <div class="card-actions">
            <button class="deck-open" data-id="${escapeHtml(deck.id)}">Open</button>
            <button class="deck-delete danger" data-id="${escapeHtml(deck.id)}">Delete</button>
          </div>
        </div>
        <div class="card-meta">
          ${deck.cards.length} card(s) · ${dueCount} due
        </div>
      </div>`;
    })
    .join('');

  container.querySelectorAll('.deck-open').forEach((btn) => {
    (btn as HTMLElement).onclick = () => {
      const id = (btn as HTMLElement).dataset.id!;
      renderDeckView(id);
    };
  });

  container.querySelectorAll('.deck-delete').forEach((btn) => {
    (btn as HTMLElement).onclick = () => {
      const id = (btn as HTMLElement).dataset.id!;
      if (confirm('Delete this deck and all its cards?')) {
        decks = decks.filter((d) => d.id !== id);
        save();
        renderDeckList();
      }
    };
  });
}

// ─── Deck View ──────────────────────────────────────────────

function renderDeckView(deckId: string) {
  const deck = decks.find((d) => d.id === deckId);
  if (!deck) {
    renderDeckList();
    return;
  }

  const dueCards = getDueCards(deck, Infinity);

  app.innerHTML = `
    <div class="breadcrumb"><a id="back-to-decks">Decks</a> / ${escapeHtml(deck.name)}</div>
    <h2>${escapeHtml(deck.name)}</h2>
    <div class="card-meta" style="margin-bottom:12px">
      ${deck.cards.length} card(s) · ${dueCards.length} due
    </div>
    <div class="btn-row">
      <button class="primary" id="add-card-btn">+ Add Card</button>
      <button id="review-btn" ${dueCards.length === 0 ? 'disabled' : ''}>
        Review on G2 (${dueCards.length} due)
      </button>
      <button id="rename-deck-btn">Rename</button>
    </div>
    <div id="card-form" class="hidden">
      <div class="form-group">
        <label>Front</label>
        <textarea id="card-front-input" placeholder="Question / prompt..."></textarea>
      </div>
      <div class="form-group">
        <label>Back</label>
        <textarea id="card-back-input" placeholder="Answer..."></textarea>
      </div>
      <input type="hidden" id="card-edit-id" value="" />
      <div class="btn-row">
        <button class="primary" id="save-card-btn">Save Card</button>
        <button id="cancel-card-btn">Cancel</button>
      </div>
    </div>
    <div id="review-setup" class="hidden review-setup">
      <div class="form-group">
        <label>Cards to review</label>
        <input type="number" id="review-count" min="1" max="${dueCards.length}" value="${Math.min(dueCards.length, 20)}" />
      </div>
      <div class="btn-row">
        <button class="primary" id="start-review-btn">Start Review</button>
        <button id="cancel-review-btn">Cancel</button>
      </div>
    </div>
    <div id="card-list"></div>
  `;

  document.getElementById('back-to-decks')!.onclick = () => renderDeckList();

  const cardForm = document.getElementById('card-form')!;
  const frontInput = document.getElementById('card-front-input') as HTMLTextAreaElement;
  const backInput = document.getElementById('card-back-input') as HTMLTextAreaElement;
  const editIdInput = document.getElementById('card-edit-id') as HTMLInputElement;

  document.getElementById('add-card-btn')!.onclick = () => {
    cardForm.classList.remove('hidden');
    frontInput.value = '';
    backInput.value = '';
    editIdInput.value = '';
    frontInput.focus();
  };

  document.getElementById('cancel-card-btn')!.onclick = () => {
    cardForm.classList.add('hidden');
  };

  document.getElementById('save-card-btn')!.onclick = () => {
    const front = frontInput.value.trim();
    const back = backInput.value.trim();
    if (!front || !back) return;

    const editId = editIdInput.value;
    if (editId) {
      const card = deck.cards.find((c) => c.id === editId);
      if (card) {
        card.front = front;
        card.back = back;
      }
    } else {
      deck.cards.push(createFlashCard(front, back));
    }
    save();
    renderDeckView(deckId);
  };

  document.getElementById('rename-deck-btn')!.onclick = () => {
    const newName = prompt('Rename deck:', deck.name);
    if (newName && newName.trim()) {
      deck.name = newName.trim();
      save();
      renderDeckView(deckId);
    }
  };

  // Review setup
  const reviewSetup = document.getElementById('review-setup')!;
  document.getElementById('review-btn')!.onclick = () => {
    reviewSetup.classList.toggle('hidden');
  };

  document.getElementById('cancel-review-btn')!.onclick = () => {
    reviewSetup.classList.add('hidden');
  };

  document.getElementById('start-review-btn')!.onclick = async () => {
    const count = parseInt((document.getElementById('review-count') as HTMLInputElement).value);
    const reviewCards = getDueCards(deck, count);
    if (reviewCards.length === 0) return;

    app.innerHTML = '<div class="empty">Review in progress on G2 glasses...</div>';
    try {
      await startG2Review(reviewCards, (updatedCards) => {
        for (const updated of updatedCards) {
          const idx = deck.cards.findIndex((c) => c.id === updated.id);
          if (idx !== -1) {
            deck.cards[idx] = updated;
          }
        }
        save();
        renderDeckView(deckId);
      });
    } catch {
      alert('Could not connect to G2 glasses. Make sure the app is running in the Even Hub.');
      renderDeckView(deckId);
    }
  };

  // Card list
  renderCardItems(deck);
}

function renderCardItems(deck: Deck) {
  const container = document.getElementById('card-list')!;
  if (deck.cards.length === 0) {
    container.innerHTML = '<div class="empty">No cards yet. Add one above.</div>';
    return;
  }

  container.innerHTML = deck.cards
    .map((card) => {
      const nextReview = getNextReviewLabel(card);
      const isDue = nextReview === 'Now';
      const dueDate = formatDueDate(card);
      return `
      <div class="card">
        <div class="card-header">
          <h3>${escapeHtml(card.front)}</h3>
          <div class="card-actions">
            <span class="status-badge ${isDue ? 'due' : 'later'}">${isDue ? 'Due' : nextReview}</span>
            <button class="card-edit" data-id="${escapeHtml(card.id)}">Edit</button>
            <button class="card-delete danger" data-id="${escapeHtml(card.id)}">Del</button>
          </div>
        </div>
        <div class="card-meta">${escapeHtml(card.back.slice(0, 100))}</div>
        <div class="card-meta">Due: ${escapeHtml(dueDate)}</div>
      </div>`;
    })
    .join('');

  container.querySelectorAll('.card-edit').forEach((btn) => {
    (btn as HTMLElement).onclick = () => {
      const id = (btn as HTMLElement).dataset.id!;
      const card = deck.cards.find((c) => c.id === id);
      if (!card) return;
      const form = document.getElementById('card-form')!;
      form.classList.remove('hidden');
      (document.getElementById('card-front-input') as HTMLTextAreaElement).value = card.front;
      (document.getElementById('card-back-input') as HTMLTextAreaElement).value = card.back;
      (document.getElementById('card-edit-id') as HTMLInputElement).value = card.id;
    };
  });

  container.querySelectorAll('.card-delete').forEach((btn) => {
    (btn as HTMLElement).onclick = () => {
      const id = (btn as HTMLElement).dataset.id!;
      deck.cards = deck.cards.filter((c) => c.id !== id);
      save();
      renderCardItems(deck);
    };
  });
}

// ─── Anki Import ────────────────────────────────────────────

function renderImportPage() {
  app.innerHTML = `
    <div class="breadcrumb"><a id="back-to-decks">Decks</a> / Import Anki TXT</div>
    <h2>Import Anki TXT</h2>
    <div class="form-group">
      <label>Paste Anki export or upload a file</label>
      <textarea id="import-text" rows="8" placeholder="Paste Anki TXT export here..."></textarea>
    </div>
    <div class="btn-row">
      <button id="upload-file-btn">Upload File</button>
      <input type="file" id="file-input" accept=".txt" class="hidden" />
      <button class="primary" id="parse-btn">Parse</button>
    </div>
    <div id="import-preview" class="hidden"></div>
  `;

  document.getElementById('back-to-decks')!.onclick = () => renderDeckList();

  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const textArea = document.getElementById('import-text') as HTMLTextAreaElement;

  document.getElementById('upload-file-btn')!.onclick = () => fileInput.click();

  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      textArea.value = reader.result as string;
    };
    reader.readAsText(file);
  };

  document.getElementById('parse-btn')!.onclick = () => {
    const text = textArea.value.trim();
    if (!text) return;
    const result = parseAnkiTxt(text);
    if (result.columnCount === 0 || result.columns[0].length === 0) {
      alert('No data found. Check the format.');
      return;
    }
    renderImportPreview(result);
  };
}

function renderImportPreview(parsed: AnkiParseResult) {
  const preview = document.getElementById('import-preview')!;
  preview.classList.remove('hidden');

  const colStates: ('none' | 'front' | 'back')[] = new Array(parsed.columnCount).fill('none');
  const rowCount = parsed.columns[0].length;

  function render() {
    const headerCells = Array.from({ length: parsed.columnCount }, (_, i) => {
      const cls = colStates[i] !== 'none' ? colStates[i] : '';
      return `<th>Col ${i + 1}</th>`;
    }).join('');

    const previewRows = Math.min(rowCount, 5);
    let tableRows = '';
    for (let r = 0; r < previewRows; r++) {
      const cells = Array.from({ length: parsed.columnCount }, (_, c) =>
        `<td>${escapeHtml(parsed.columns[c][r])}</td>`,
      ).join('');
      tableRows += `<tr>${cells}</tr>`;
    }
    if (rowCount > 5) {
      tableRows += `<tr><td colspan="${parsed.columnCount}" style="text-align:center;color:var(--text2)">...${rowCount - 5} more rows</td></tr>`;
    }

    const chips = Array.from({ length: parsed.columnCount }, (_, i) => {
      const st = colStates[i];
      const label = `Col ${i + 1}`;
      return `<button class="column-chip ${st}" data-col="${i}">${label}: ${st === 'none' ? '—' : st}</button>`;
    }).join('');

    const hasFront = colStates.some((s) => s === 'front');
    const hasBack = colStates.some((s) => s === 'back');

    let cardPreview = '';
    if (hasFront && hasBack) {
      const frontParts: string[] = [];
      const backParts: string[] = [];
      for (let c = 0; c < parsed.columnCount; c++) {
        if (colStates[c] === 'front') frontParts.push(parsed.columns[c][0]);
        if (colStates[c] === 'back') backParts.push(parsed.columns[c][0]);
      }
      cardPreview = `
        <h3 style="margin:12px 0 8px">Card Preview (Row 1)</h3>
        <div class="flashcard-preview">
          <div class="front">
            <div class="label">Front</div>
            <div>${escapeHtml(frontParts.join('\n'))}</div>
          </div>
          <div class="back">
            <div class="label">Back</div>
            <div>${escapeHtml(backParts.join('\n'))}</div>
          </div>
        </div>
      `;
    }

    preview.innerHTML = `
      <h3>Column Assignment</h3>
      <p style="font-size:0.8rem;color:var(--text2);margin-bottom:8px">Click to cycle: — → front → back → —</p>
      <div class="column-selector">${chips}</div>
      <div class="table-wrapper">
        <table class="preview-table">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      ${cardPreview}
      <div class="form-group">
        <label>Deck Name</label>
        <input id="import-deck-name" value="Imported Deck" />
      </div>
      <button class="primary" id="import-confirm-btn" ${hasFront && hasBack ? '' : 'disabled'}>
        Import ${rowCount} cards
      </button>
    `;

    preview.querySelectorAll('.column-chip').forEach((chip) => {
      (chip as HTMLElement).onclick = () => {
        const col = parseInt((chip as HTMLElement).dataset.col!);
        const cycle: ('none' | 'front' | 'back')[] = ['none', 'front', 'back'];
        const current = cycle.indexOf(colStates[col]);
        colStates[col] = cycle[(current + 1) % cycle.length];
        render();
      };
    });

    const confirmBtn = document.getElementById('import-confirm-btn');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        const deckName = (document.getElementById('import-deck-name') as HTMLInputElement).value.trim() || 'Imported Deck';
        const deck = createDeck(deckName);
        for (let r = 0; r < rowCount; r++) {
          const frontParts: string[] = [];
          const backParts: string[] = [];
          for (let c = 0; c < parsed.columnCount; c++) {
            if (colStates[c] === 'front') frontParts.push(parsed.columns[c][r]);
            if (colStates[c] === 'back') backParts.push(parsed.columns[c][r]);
          }
          if (frontParts.join('').trim() || backParts.join('').trim()) {
            deck.cards.push(createFlashCard(frontParts.join('\n'), backParts.join('\n')));
          }
        }
        decks.push(deck);
        save();
        renderDeckList();
      };
    }
  }

  render();
}

// ─── Init ───────────────────────────────────────────────────

export function initApp() {
  decks = loadDecks();
  renderDeckList();
}
