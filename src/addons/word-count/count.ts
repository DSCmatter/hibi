const words = new Intl.Segmenter(undefined, { granularity: 'word' })
const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function countText(text: string) {
  let wordCount = 0
  let characterCount = 0
  for (const part of words.segment(text)) if (part.isWordLike) wordCount++
  for (const _part of characters.segment(text)) characterCount++
  return { words: wordCount, characters: characterCount }
}
