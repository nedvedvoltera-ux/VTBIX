export function stripThink(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
}

export function extractJsonObject(text) {
  if (!text) return null
  const cleaned = stripThink(text)
  const start = cleaned.indexOf('{')
  if (start < 0) return null
  let slice = cleaned.slice(start).replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(slice)
  } catch {
    return repairAndParse(slice)
  }
}

function repairAndParse(source) {
  let text = source.trim()
  text = text.replace(/,\s*$/, '')
  text = dropIncompleteTail(text)

  const stack = []
  let inString = false
  let escape = false
  for (const char of text) {
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (char === '\\') {
        escape = true
        continue
      }
      if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') stack.push('}')
    else if (char === '[') stack.push(']')
    else if (char === '}' || char === ']') stack.pop()
  }
  if (inString) text += '"'
  while (stack.length) text += stack.pop()
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function dropIncompleteTail(text) {
  let next = text.replace(/,\s*"[^"]*$/, '')
  next = next.replace(/,\s*"[^"]*"\s*:\s*$/, '')
  next = next.replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/, '')
  next = next.replace(/,\s*"[^"]*"\s*:\s*-?\d+\.?$/, '')
  next = next.replace(/:\s*$/, '')
  return next.replace(/,\s*$/, '')
}
