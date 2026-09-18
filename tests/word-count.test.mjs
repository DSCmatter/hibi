import assert from 'node:assert/strict'
import test from 'node:test'
import { countText } from '../src/addons/word-count/count.ts'

test('document counts handle whitespace, combining accents, emoji, and non-latin words', () => {
  assert.deepEqual(countText(''), { words: 0, characters: 0 })
  assert.deepEqual(countText('one two\nthree'), { words: 3, characters: 13 })
  assert.deepEqual(countText('cafe\u0301 👨‍👩‍👧‍👦\n中文'), {
    words: 2,
    characters: 9,
  })
  assert.deepEqual(countText(' \n\t'), { words: 0, characters: 3 })
})
