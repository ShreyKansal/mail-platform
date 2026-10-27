import { expect, it } from 'vitest';
import { csvCell, csvDocument } from './csv';
it('escapes CSV delimiters, quotes and line breaks while preventing spreadsheet formulas', () => {
  expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  for (const value of ['=1+1', '+cmd', '-cmd', '@SUM(A1)', '\t=1']) expect(csvCell(value)).toBe(`"'${value}"`);
  expect(csvDocument([['header'], ['hello']])).toBe('\uFEFF"header"\r\n"hello"\r\n');
});
