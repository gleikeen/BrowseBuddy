import type { FillFormResultPayload } from '../shared/messages'

const log = (...args: unknown[]) => console.log('[BrowseBuddy:fill]', ...args)

interface FillInstruction {
  selector: string
  value: string
}

function highlightField(el: HTMLElement): void {
  const original = el.style.outline
  el.style.outline = '2px solid #22c55e'
  el.style.outlineOffset = '1px'
  el.style.transition = 'outline 0.3s ease'
  setTimeout(() => {
    el.style.outline = original
    el.style.outlineOffset = ''
  }, 1000)
}

// Dispatch a complete, realistic event sequence for framework compatibility
function dispatchInputEvents(el: HTMLElement): void {
  el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
  el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
  // React 16+ uses onInput which maps to 'input' event
  // Some frameworks also listen for InputEvent specifically
  try {
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
  } catch {
    // InputEvent not supported in older envs
  }
}

function dispatchSelectEvents(el: HTMLSelectElement): void {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
}

function setSelectValue(el: HTMLSelectElement, value: string): boolean {
  log('select:', el.name || el.id, 'options:', Array.from(el.options).map((o) => `"${o.text}"(${o.value})`), 'target:', value)

  const valLower = value.trim().toLowerCase()
  // Exact match on value or text
  let match = Array.from(el.options).find(
    (o) => o.value === value || o.text.trim() === value || o.text.trim().toLowerCase() === valLower
  )
  // Exact match on value attribute (number strings like "03" for March)
  if (!match) {
    match = Array.from(el.options).find(
      (o) => o.value.toLowerCase() === valLower
    )
  }
  // Fuzzy: contains match
  if (!match) {
    match = Array.from(el.options).find(
      (o) => {
        const t = o.text.toLowerCase()
        return (t.includes(valLower) || valLower.includes(t)) && t !== ''
      }
    )
  }
  // Numeric: try as 1-based index or month number
  if (!match) {
    const num = parseInt(value)
    if (!isNaN(num)) {
      // Try as direct option value
      match = Array.from(el.options).find((o) => o.value === String(num))
      // Try as 1-based index (skip placeholder at 0)
      if (!match && num >= 1 && num < el.options.length) {
        match = el.options[num]
      }
    }
  }

  if (match) {
    // Use native setter for React compatibility
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    if (nativeSetter) {
      nativeSetter.call(el, match.value)
    } else {
      el.value = match.value
    }
    el.selectedIndex = match.index
    dispatchSelectEvents(el)
    log('select: matched →', `"${match.text}"(${match.value})`)
    return true
  }

  log('select: no match found')
  return false
}

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  log('input:', el.name || el.id, `type=${(el as HTMLInputElement).type || 'textarea'}`, '→', value)

  el.focus()
  el.dispatchEvent(new Event('focus', { bubbles: true }))

  // Use native setter for React/Vue/Angular compatibility
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set

  if (nativeSetter) {
    nativeSetter.call(el, value)
  } else {
    el.value = value
  }

  // Fire comprehensive events
  dispatchInputEvents(el)

  // For React: also try setting via simulated keyboard-like behavior
  // React fiber tracks _valueTracker — resetting it forces React to see the change
  const tracker = (el as unknown as Record<string, unknown>)._valueTracker
  if (tracker && typeof (tracker as Record<string, unknown>).setValue === 'function') {
    (tracker as { setValue: (v: string) => void }).setValue('')
    log('input: reset React _valueTracker')
  }
  dispatchInputEvents(el)

  el.dispatchEvent(new Event('blur', { bubbles: true }))
  el.blur()
}

function findLabelFor(el: HTMLInputElement): string {
  if (!el.id) return ''
  try {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
    if (label) return label.textContent?.trim() || ''
  } catch { /* ignore */ }
  // Fallback: manual search by htmlFor
  const labels = document.querySelectorAll('label')
  for (const label of labels) {
    if (label.htmlFor === el.id) return label.textContent?.trim() || ''
  }
  return el.closest('label')?.textContent?.trim() || ''
}

function setCheckableValue(el: HTMLInputElement, value: string): boolean {
  log('checkable:', el.name || el.id, `type=${el.type}`, `value="${el.value}"`, `checked=${el.checked}`, '→ target:', value)
  const shouldCheck = /^(true|yes|1|on|checked)$/i.test(value.trim())
  const shouldUncheck = /^(false|no|0|off|unchecked)$/i.test(value.trim())

  if (el.type === 'radio') {
    // Collect all radios in group
    const radios = el.name
      ? Array.from(document.querySelectorAll(`input[type="radio"]`)).filter(
          (r) => (r as HTMLInputElement).name === el.name
        ) as HTMLInputElement[]
      : [el]

    log('radio: searching group, size:', radios.length)
    const valLower = value.trim().toLowerCase()

    for (const r of radios) {
      const labelText = findLabelFor(r)

      log('radio option:', `value="${r.value}"`, `label="${labelText}"`)

      if (
        r.value === value ||
        r.value.toLowerCase() === valLower ||
        labelText.toLowerCase() === valLower ||
        labelText.toLowerCase().includes(valLower) ||
        valLower.includes(labelText.toLowerCase())
      ) {
        r.focus()
        r.checked = true
        r.click()
        r.dispatchEvent(new Event('change', { bubbles: true }))
        log('radio: matched →', labelText || r.value)
        return true
      }
    }
    log('radio: no match found')
    return false
  }

  // Checkbox: true/false
  if (shouldCheck || shouldUncheck) {
    const target = shouldCheck
    log('checkbox: toggle →', target, 'current:', el.checked)
    if (el.checked !== target) {
      el.click()
    }
    return true
  }

  // Checkbox: match by label text in group
  if (el.name) {
    const checkboxes = Array.from(document.querySelectorAll(`input[type="checkbox"]`)).filter(
      (c) => (c as HTMLInputElement).name === el.name
    ) as HTMLInputElement[]

    log('checkbox: searching group by label, size:', checkboxes.length)
    const valLower = value.trim().toLowerCase()

    for (const c of checkboxes) {
      const labelText = findLabelFor(c)

      log('checkbox option:', `value="${c.value}"`, `label="${labelText}"`)

      if (
        c.value === value ||
        c.value.toLowerCase() === valLower ||
        labelText.toLowerCase() === valLower ||
        labelText.toLowerCase().includes(valLower)
      ) {
        if (!c.checked) c.click()
        log('checkbox: matched →', labelText || c.value)
        return true
      }
    }
  }

  // Default: toggle on
  log('checkbox: default toggle on')
  if (!el.checked) el.click()
  return true
}

function tryClickCustomDropdown(el: HTMLElement, value: string): boolean {
  log('custom dropdown:', el.tagName, el.className, '→', value)
  el.click()

  // Wait a frame for dropdown to appear
  const listbox = document.querySelector('[role="listbox"], [role="menu"], .dropdown-menu, .select-options, ul.options')
  if (listbox) {
    const items = listbox.querySelectorAll('[role="option"], li, [data-value]')
    log('custom dropdown: found', items.length, 'options')
    const valLower = value.trim().toLowerCase()
    for (const item of items) {
      const text = (item as HTMLElement).textContent?.trim() || ''
      const dataVal = (item as HTMLElement).getAttribute('data-value') || ''
      if (text.toLowerCase() === valLower || dataVal === value || text.toLowerCase().includes(valLower)) {
        ;(item as HTMLElement).click()
        log('custom dropdown: matched →', text)
        return true
      }
    }
  }
  log('custom dropdown: no match')
  return false
}

function findElement(selector: string): HTMLElement | null {
  // 1. "id:rawId" format — direct getElementById, no escaping needed
  if (selector.startsWith('id:')) {
    const rawId = selector.slice(3)
    const el = document.getElementById(rawId)
    if (el) { log('lookup: getElementById ok for', rawId); return el }
    log('lookup: getElementById miss for', rawId)
    return null
  }

  // 2. "name:rawName" format — direct getElementsByName
  if (selector.startsWith('name:')) {
    const rawName = selector.slice(5)
    const els = document.getElementsByName(rawName)
    if (els.length > 0) { log('lookup: getElementsByName ok for', rawName); return els[0] as HTMLElement }
    log('lookup: getElementsByName miss for', rawName)
    return null
  }

  // 3. CSS selector fallback (for path-based selectors)
  try {
    const el = document.querySelector(selector)
    if (el) { log('lookup: querySelector ok'); return el as HTMLElement }
  } catch {
    log('lookup: querySelector threw for', selector)
  }

  // 4. Legacy: try extracting id from #id or [id="..."] patterns
  const idMatch = selector.match(/^#(.+)$/) || selector.match(/^\[id="(.+?)"\]$/)
  if (idMatch) {
    const rawId = idMatch[1].replace(/\\(.)/g, '$1')
    const el = document.getElementById(rawId)
    if (el) { log('lookup: legacy getElementById ok for', rawId); return el }
  }

  const nameMatch = selector.match(/\[name="(.+?)"\]$/)
  if (nameMatch) {
    const rawName = nameMatch[1].replace(/\\(.)/g, '$1')
    const els = document.getElementsByName(rawName)
    if (els.length > 0) { log('lookup: legacy getElementsByName ok for', rawName); return els[0] as HTMLElement }
  }

  log('lookup: all strategies failed for', selector)
  return null
}

export async function handleFillForm(fields: FillInstruction[]): Promise<FillFormResultPayload> {
  log('=== fill start:', fields.length, 'fields ===')
  let filled = 0
  const failed: string[] = []

  for (const { selector, value } of fields) {
    try {
      const el = findElement(selector)
      if (!el) {
        log('MISS:', selector, '(element not found)')
        failed.push(selector)
        continue
      }

      log('found:', selector, '→', el.tagName, el instanceof HTMLInputElement ? `type=${el.type}` : '', `id=${el.id}`)

      if (el instanceof HTMLInputElement) {
        const isCreditCard = /credit|card|cvv|cvc|expir/i.test(
          el.name + el.id + el.placeholder + (el.getAttribute('aria-label') || '')
        )
        if (isCreditCard) {
          log('SKIP: sensitive field')
          failed.push(`${selector} (sensitive)`)
          continue
        }
      }

      let success = false

      if (el instanceof HTMLSelectElement) {
        success = setSelectValue(el, value)
      } else if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        success = setCheckableValue(el, value)
      } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        setInputValue(el, value)
        success = true
      } else {
        success = tryClickCustomDropdown(el, value)
        if (!success && el.isContentEditable) {
          el.textContent = value
          dispatchInputEvents(el)
          log('contenteditable fill')
          success = true
        }
      }

      if (success) {
        highlightField(el)
        filled++
        log('OK:', selector)
      } else {
        log('FAIL:', selector, '(handler returned false)')
        failed.push(selector)
      }
    } catch (err) {
      log('ERROR:', selector, err)
      failed.push(selector)
    }

    await new Promise((r) => setTimeout(r, 150))
  }

  log('=== fill done:', `filled:${filled}`, `failed:${failed.length}`, '===')
  return { filled, failed }
}
