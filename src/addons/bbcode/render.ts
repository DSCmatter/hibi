import html from '@bbob/html'
import preset from '@bbob/preset-html5'
import DOMPurify from 'dompurify'

const tags = preset.extend((defaults) => ({
  ...defaults,
  b: (node) => ({ tag: 'strong', attrs: {}, content: node.content ?? [] }),
  i: (node) => ({ tag: 'em', attrs: {}, content: node.content ?? [] }),
  u: (node) => ({ tag: 'u', attrs: {}, content: node.content ?? [] }),
  s: (node) => ({ tag: 's', attrs: {}, content: node.content ?? [] }),
}))
export function renderBBCode(source: string) {
  if (source.length > 2 * 1024 * 1024)
    throw new Error('This document exceeds the 2 MiB preview limit.')
  const escaped = source
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
  const clean = DOMPurify.sanitize(
    html(escaped, [tags()], {
      onlyAllowTags: [
        'b',
        'i',
        'u',
        's',
        'url',
        'img',
        'quote',
        'code',
        'list',
        '*',
        'color',
        'size',
      ],
      contextFreeTags: ['code'],
    }),
    {
      ALLOWED_TAGS: [
        'strong',
        'em',
        'u',
        's',
        'a',
        'img',
        'blockquote',
        'p',
        'pre',
        'ul',
        'ol',
        'li',
        'span',
        'br',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'style', 'type'],
    },
  )
  const document = new DOMParser().parseFromString(clean, 'text/html')
  for (const link of document.querySelectorAll('a[href]')) {
    let href = link.getAttribute('href') ?? ''
    try {
      href = decodeURIComponent(href)
    } catch {
      /* Keep malformed escapes inert. */
    }
    if (/^(?:https?:\/\/|mailto:|#)/i.test(href))
      link.setAttribute('href', href)
    else link.removeAttribute('href')
  }
  for (const element of document.querySelectorAll<HTMLElement>('[style]')) {
    const color = element.style.color,
      size = element.style.fontSize
    element.removeAttribute('style')
    if (/^(?:#[\da-f]{3,8}|[a-z]+|rgba?\([\d.,% ]+\))$/i.test(color))
      element.style.color = color
    if (
      /^[\d.]+em$/.test(size) &&
      parseFloat(size) >= 0.5 &&
      parseFloat(size) <= 4
    )
      element.style.fontSize = size
  }
  for (const image of document.querySelectorAll('img')) {
    if (!/^https:\/\//i.test(image.getAttribute('src') ?? ''))
      image.removeAttribute('src')
  }
  return `<div class="bbcode-content">${document.body.innerHTML}</div>`
}
