import { describe, it, expect } from 'vitest';
import { parseAnkiTxt } from '../anki-import';

const SAMPLE_ANKI = `#separator:tab
#html:false
.	Come on!	[Cc]ome +on[ \\!]?		嚟 啦 。	嚟 啦 。	le̖i lā.	lei4 laa1.	leih4 la1.	lei4 laa1.	((嚟|[o口]黎|來)|[Ll]ei4?|[Ll]eih4?)\\W*(啦|[Ll]aa1?|[Ll]a1?)\\W*			come !	lei4 laa1. / leih4 la1.	le̖ʲ lāː 	1
.	He dances.	[Hh]e +dances[ \\.]?		佢 跳舞 。	佢 跳舞 。	kö̗ü tiu̟ mo̗u.	keoi5 tiu3 mou5.	keuih5 tiu3 mouh5.	keoi5 tiu3 mou5.	((佢|人巨|他)|[Kk]eoi5?|[Kk]euih5?)\\W*(跳|[Tt]iu3?)\\W*(舞|[Mm]ou5?|[Mm]ouh5?)\\W*			s/he dance	keoi5 tiu3 mou5. / keuih5 tiu3 mouh5.	kʰø̗ᶣ tʰi̟ːʷ`;

describe('parseAnkiTxt', () => {
  it('parses separator directive', () => {
    const result = parseAnkiTxt(SAMPLE_ANKI);
    expect(result.separator).toBe('\t');
  });

  it('parses html directive', () => {
    const result = parseAnkiTxt(SAMPLE_ANKI);
    expect(result.isHtml).toBe(false);
  });

  it('parses correct number of rows', () => {
    const result = parseAnkiTxt(SAMPLE_ANKI);
    expect(result.columns[0].length).toBe(2);
  });

  it('parses columns correctly', () => {
    const result = parseAnkiTxt(SAMPLE_ANKI);
    expect(result.columns[0][0]).toBe('.');
    expect(result.columns[1][0]).toBe('Come on!');
    expect(result.columns[1][1]).toBe('He dances.');
  });

  it('detects correct column count', () => {
    const result = parseAnkiTxt(SAMPLE_ANKI);
    expect(result.columnCount).toBeGreaterThan(5);
  });

  it('handles custom separator', () => {
    const csv = '#separator:,\na,b,c\n1,2,3';
    const result = parseAnkiTxt(csv);
    expect(result.separator).toBe(',');
    expect(result.columnCount).toBe(3);
    expect(result.columns[0]).toEqual(['a', '1']);
  });

  it('handles empty input with only directives', () => {
    const result = parseAnkiTxt('#separator:tab\n#html:true');
    expect(result.columnCount).toBe(0);
    expect(result.isHtml).toBe(true);
  });

  it('skips blank lines', () => {
    const result = parseAnkiTxt('a\tb\n\nc\td\n');
    expect(result.columns[0].length).toBe(2);
    expect(result.columns[0]).toEqual(['a', 'c']);
  });
});
