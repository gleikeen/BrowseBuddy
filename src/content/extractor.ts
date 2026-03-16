import type { PageContext, FormDescription, FieldDescription, ButtonDescription } from '../shared/types'

// Generate a simple, AI-friendly locator that avoids CSS selector escaping issues.
// Format: "id:rawId" or "name:rawName" or a CSS path as fallback.
function getLocator(el: Element): string {
  if (el.id) return `id:${el.id}`
  if (el.getAttribute('name')) return `name:${el.getAttribute('name')!}`
  // Fallback: build a simple CSS path (no special chars in tag names)
  const parts: string[] = []
  let current: Element | null = el
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase()
    if (current.id) {
      parts.unshift(`id:${current.id}`)
      break
    }
    const parent = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === current!.tagName
      )
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1
        selector += `:nth-of-type(${index})`
      }
    }
    parts.unshift(selector)
    current = current.parentElement
  }
  return parts.join(' > ')
}

function getLabelForField(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  // Check for <label for="id"> — use CSS.escape for querySelector safety
  if (field.id) {
    try {
      const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`)
      if (label) return label.textContent?.trim() || ''
    } catch {
      // CSS.escape or querySelector failed, try fallback
    }
    // Fallback: iterate labels manually
    const labels = document.querySelectorAll('label')
    for (const label of labels) {
      if (label.htmlFor === field.id) return label.textContent?.trim() || ''
    }
  }
  // Check parent label
  const parentLabel = field.closest('label')
  if (parentLabel) {
    const text = parentLabel.textContent?.trim() || ''
    const fieldValue = field.value || ('placeholder' in field ? (field as HTMLInputElement).placeholder : '') || ''
    return text.replace(fieldValue, '').trim()
  }
  // Check aria-label
  return field.getAttribute('aria-label') || ''
}

function extractField(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): FieldDescription {
  const field: FieldDescription = {
    selector: getLocator(el),
    type: el instanceof HTMLSelectElement ? 'select' : (el as HTMLInputElement).type || 'text',
    name: el.name || '',
    label: getLabelForField(el),
    placeholder: 'placeholder' in el ? (el as HTMLInputElement).placeholder || '' : '',
    required: el.required,
    currentValue: el.value,
  }

  if (el instanceof HTMLSelectElement) {
    field.options = Array.from(el.options).map((opt) => opt.text)
  }

  if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
    // Group by name — escape for querySelectorAll
    const escapedName = el.name ? CSS.escape(el.name) : ''
    if (escapedName) {
      const group = document.querySelectorAll(`input[name="${escapedName}"]`)
      field.options = Array.from(group).map((r) => {
        const label = getLabelForField(r as HTMLInputElement)
        return label || (r as HTMLInputElement).value
      })
    }
  }

  return field
}

function extractForm(form: HTMLFormElement): FormDescription {
  const fields: FieldDescription[] = []
  const inputs = form.querySelectorAll('input, select, textarea')

  const seenNames = new Set<string>()
  inputs.forEach((el) => {
    const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    // Skip hidden and submit inputs
    if (input instanceof HTMLInputElement && ['hidden', 'submit', 'button', 'image'].includes(input.type)) return
    // Skip duplicate radio/checkbox groups
    if (input.name && (input instanceof HTMLInputElement) && ['radio', 'checkbox'].includes(input.type)) {
      if (seenNames.has(input.name)) return
      seenNames.add(input.name)
    }
    fields.push(extractField(input))
  })

  return {
    selector: getLocator(form),
    fields,
  }
}

function extractButtons(): ButtonDescription[] {
  const buttons: ButtonDescription[] = []
  const els = document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]')
  els.forEach((el) => {
    const text = el.textContent?.trim() || (el as HTMLInputElement).value || ''
    if (!text) return
    buttons.push({
      selector: getLocator(el),
      text,
      type: el.tagName.toLowerCase(),
    })
  })
  return buttons.slice(0, 20) // limit
}

function extractHeadings(): string[] {
  const headings: string[] = []
  document.querySelectorAll('h1, h2, h3').forEach((el) => {
    const text = el.textContent?.trim()
    if (text) headings.push(text)
  })
  return headings.slice(0, 10)
}

function extractMetadata(): Record<string, string> {
  const meta: Record<string, string> = {}
  document.querySelectorAll('meta[name], meta[property]').forEach((el) => {
    const name = el.getAttribute('name') || el.getAttribute('property') || ''
    const content = el.getAttribute('content') || ''
    if (name && content) meta[name] = content
  })
  return meta
}

export function extractPageContext(): PageContext {
  const forms = Array.from(document.querySelectorAll('form')).map(extractForm)

  // Also detect standalone inputs not inside forms
  const standaloneInputs = document.querySelectorAll('input:not(form input), select:not(form select), textarea:not(form textarea)')
  if (standaloneInputs.length > 0) {
    const fields: FieldDescription[] = []
    standaloneInputs.forEach((el) => {
      const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      if (input instanceof HTMLInputElement && ['hidden', 'submit', 'button'].includes(input.type)) return
      fields.push(extractField(input))
    })
    if (fields.length > 0) {
      forms.push({ selector: 'body', fields })
    }
  }

  return {
    url: location.href,
    title: document.title,
    forms,
    buttons: extractButtons(),
    headings: extractHeadings(),
    metadata: extractMetadata(),
  }
}

// ===== MutationObserver for dynamic pages =====

let cachedContext: PageContext | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

export function getCachedContext(): PageContext {
  if (!cachedContext) {
    cachedContext = extractPageContext()
  }
  return cachedContext
}

export function startObserving(): void {
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      cachedContext = extractPageContext()
    }, 500)
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['value', 'disabled', 'hidden'],
  })
}
