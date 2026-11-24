import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCardFile, parseWordList } from '../src/lib/wordlist.ts'

test('parses newline-separated terms and ignores blank lines', () => {
  assert.deepEqual(parseWordList('  photosynthesis  \n\nserendipity\n'), [
    { front: 'photosynthesis', back: '' },
    { front: 'serendipity', back: '' },
  ])
})

test('parses definitions separated by a pipe or tab', () => {
  assert.deepEqual(parseWordList('photosynthesis | how plants use light\nmitosis\tcell division'), [
    { front: 'photosynthesis', back: 'how plants use light' },
    { front: 'mitosis', back: 'cell division' },
  ])
})

test('parses CSV files with a header and quoted commas', () => {
  assert.deepEqual(parseCardFile('front,back\n"hello, world","a greeting"\nterm,definition', 'cards.csv'), [
    { front: 'hello, world', back: 'a greeting' },
    { front: 'term', back: 'definition' },
  ])
})

test('rejects CSV rows with unclosed quotes', () => {
  assert.throws(() => parseCardFile('"term,definition', 'cards.csv'), /unclosed quote/)
})
