import { config } from './config.js'
import { DEFAULT_MEDIA_SITES } from './mediaPrompt.js'

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.5',
}

const SITE_RSS = {
  'interfax.ru': 'https://www.interfax.ru/rss.asp',
  'tass.ru': 'https://tass.ru/rss/v2.xml',
  'ria.ru': 'https://ria.ru/export/rss2/archive/index.xml',
  'kommersant.ru': 'https://www.kommersant.ru/RSS/news.xml',
  'rbc.ru': 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss',
  'vedomosti.ru': 'https://www.vedomosti.ru/rss/news',
  'rg.ru': 'https://rg.ru/xml/index.xml',
  'iz.ru': 'https://iz.ru/xml/rss/all.xml',
}

function decodeHtml(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function stripTags(html) {
  return decodeHtml(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function unwrapDuckUrl(href) {
  try {
    const url = new URL(href, 'https://duckduckgo.com')
    const target = url.searchParams.get('uddg') || url.searchParams.get('u')
    return target ? decodeURIComponent(target) : url.href
  } catch {
    return href
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function sourceFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

function withinLookback(dateText, lookbackDays) {
  if (!dateText || !lookbackDays) return true
  const parsed = Date.parse(dateText)
  if (!Number.isFinite(parsed)) return true
  const min = Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  return parsed >= min
}

function matchesKeywords(text, keywords) {
  if (!keywords.length) return true
  const hay = text.toLowerCase()
  return keywords.some((word) => hay.includes(String(word).toLowerCase()))
}

async function fetchText(url, { timeoutMs = 12_000, maxBytes = 400_000 } = {}) {
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`${response.status}`)
  const reader = response.body?.getReader()
  if (!reader) return response.text()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    chunks.push(value)
    if (size >= maxBytes) {
      reader.cancel().catch(() => undefined)
      break
    }
  }
  return Buffer.concat(chunks.map((item) => Buffer.from(item))).toString('utf8')
}

function parseRss(xml, domain) {
  const items = []
  const blocks = String(xml).match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || []
  for (const block of blocks) {
    const title = stripTags((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '')
    const linkTag = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i)
    const linkText = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]
    const url = String(linkTag?.[1] || stripTags(linkText || '')).trim()
    const date =
      stripTags((block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] || '') ||
      stripTags((block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) || [])[1] || '') ||
      stripTags((block.match(/<published[^>]*>([\s\S]*?)<\/published>/i) || [])[1] || '')
    const snippet = stripTags(
      (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] ||
        (block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1] ||
        '',
    )
    if (!title || !isHttpUrl(url)) continue
    items.push({
      title,
      url,
      snippet: snippet.slice(0, 400),
      publishedAt: date || undefined,
      source: domain || sourceFromUrl(url),
      via: 'rss',
    })
  }
  return items
}

async function rssForSite(domain) {
  const known = SITE_RSS[domain]
  const candidates = known
    ? [known]
    : [`https://${domain}/rss`, `https://${domain}/feed`, `https://www.${domain}/rss.xml`]
  for (const url of candidates) {
    try {
      const xml = await fetchText(url, { timeoutMs: 8000, maxBytes: 250_000 })
      if (!/<item|<entry/i.test(xml)) continue
      return parseRss(xml, domain)
    } catch {
      // try next
    }
  }
  return []
}

function parseDuckHtml(html) {
  const results = []
  const regex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = regex.exec(html))) {
    const href = unwrapDuckUrl(decodeHtml(match[1]))
    const title = stripTags(match[2])
    if (!isHttpUrl(href) || /duckduckgo\.com/i.test(href) || title.length < 8) continue
    results.push({ title, url: href, snippet: '', source: sourceFromUrl(href), via: 'web' })
  }
  return results
}

function parseBingHtml(html) {
  const results = []
  const blocks = String(html).match(/<li class="b_algo"[\s\S]*?<\/li>/gi) || []
  for (const block of blocks) {
    const link = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!link) continue
    const url = decodeHtml(link[1])
    const title = stripTags(link[2])
    const snippet = stripTags((block.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '')
    if (!isHttpUrl(url) || title.length < 8) continue
    results.push({ title, url, snippet: snippet.slice(0, 400), source: sourceFromUrl(url), via: 'web' })
  }
  return results
}

async function searchDuckDuckGo(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const html = await fetchText(url, { timeoutMs: 12_000 })
  return parseDuckHtml(html)
}

async function searchBing(query) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=ru-RU&cc=RU`
  const html = await fetchText(url, { timeoutMs: 12_000 })
  return parseBingHtml(html)
}

async function searchBrave(query, site) {
  if (!config.braveSearchApiKey) return []
  const q = site ? `site:${site} ${query}` : query
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=8&search_lang=ru&country=RU`
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': config.braveSearchApiKey },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) return []
  const json = await response.json()
  return (json?.web?.results || []).map((item) => ({
    title: item.title || '',
    url: item.url || '',
    snippet: String(item.description || '').slice(0, 400),
    source: sourceFromUrl(item.url || ''),
    via: 'brave',
  })).filter((item) => isHttpUrl(item.url) && item.title)
}

function buildQuery(keywords) {
  const core = keywords.slice(0, 6).join(' OR ')
  return `${core} (концессия OR ГЧП OR инфраструктура OR строительство)`
}

function allowedBySites(url, sites) {
  if (!sites.length) return true
  const host = sourceFromUrl(url)
  return sites.some((site) => host === site || host.endsWith(`.${site}`))
}

function mergeResults(lists) {
  const seen = new Set()
  const out = []
  for (const item of lists.flat()) {
    if (!item?.url || seen.has(item.url)) continue
    seen.add(item.url)
    out.push(item)
  }
  return out
}

export async function collectSearchResults({ keywords, sites, searchMode, lookbackDays, maxResults }) {
  const query = buildQuery(keywords)
  const siteList = searchMode === 'sites' ? sites.filter(Boolean) : []
  const errors = []
  const buckets = []

  if (config.braveSearchApiKey) {
    try {
      if (siteList.length) {
        for (const site of siteList.slice(0, 10)) {
          buckets.push(await searchBrave(query, site))
        }
      } else {
        buckets.push(await searchBrave(query))
      }
    } catch (error) {
      errors.push(`Brave: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const rssDomains = siteList.length ? siteList : DEFAULT_MEDIA_SITES
  if (searchMode === 'sites' || !buckets.flat().length) {
    for (const domain of rssDomains.slice(0, 12)) {
      try {
        const items = await rssForSite(domain)
        buckets.push(
          items.filter(
            (item) =>
              matchesKeywords(`${item.title} ${item.snippet}`, keywords) &&
              withinLookback(item.publishedAt, lookbackDays),
          ),
        )
      } catch (error) {
        errors.push(`${domain}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  if (searchMode === 'web' || buckets.flat().length < 4) {
    const webQueries = siteList.length
      ? siteList.slice(0, 8).map((site) => `site:${site} ${query}`)
      : [query]
    for (const q of webQueries) {
      try {
        buckets.push(await searchDuckDuckGo(q))
      } catch (error) {
        errors.push(`DuckDuckGo: ${error instanceof Error ? error.message : String(error)}`)
        try {
          buckets.push(await searchBing(q))
        } catch (bingError) {
          errors.push(`Bing: ${bingError instanceof Error ? bingError.message : String(bingError)}`)
        }
      }
    }
  }

  let results = mergeResults(buckets).filter((item) => allowedBySites(item.url, siteList))
  results = results.slice(0, Math.max(maxResults * 2, 16))
  return { results, query, errors, provider: config.braveSearchApiKey ? 'brave+rss+web' : 'rss+web' }
}

function htmlToText(html) {
  const cleaned = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
  return stripTags(cleaned).slice(0, 3500)
}

async function mapPool(items, limit, mapper) {
  const out = []
  let index = 0
  async function worker() {
    while (index < items.length) {
      const current = index
      index += 1
      out[current] = await mapper(items[current], current)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return out
}

export async function hydratePages(results, maxPages) {
  const slice = results.slice(0, maxPages)
  const pages = await mapPool(slice, 3, async (item) => {
    try {
      const html = await fetchText(item.url, { timeoutMs: 10_000, maxBytes: 280_000 })
      const text = htmlToText(html)
      return {
        ...item,
        snippet: item.snippet || text.slice(0, 400),
        text,
      }
    } catch {
      return { ...item, text: item.snippet || '' }
    }
  })
  return pages.filter((item) => item && (item.text || item.snippet || item.title))
}
