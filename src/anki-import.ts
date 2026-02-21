export interface AnkiParseResult {
  separator: string;
  isHtml: boolean;
  columns: string[][];
  columnCount: number;
}

export function parseAnkiTxt(text: string): AnkiParseResult {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  let separator = '\t';
  let isHtml = false;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('#separator:')) {
      const sep = line.slice('#separator:'.length).trim();
      separator = sep === 'tab' || sep === 'Tab' ? '\t' : sep;
    } else if (line.startsWith('#html:')) {
      isHtml = line.slice('#html:'.length).trim().toLowerCase() === 'true';
    } else if (!line.startsWith('#')) {
      dataLines.push(line);
    }
  }

  const rows = dataLines.map((line) => line.split(separator));
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);

  const columns: string[][] = [];
  for (let c = 0; c < columnCount; c++) {
    columns.push(rows.map((row) => (c < row.length ? row[c] : '')));
  }

  return { separator, isHtml, columns, columnCount };
}
