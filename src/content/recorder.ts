import type { RecordedAction } from '../shared/types'

let recording = false
let actions: RecordedAction[] = []
let indicator: HTMLDivElement | null = null

function getSelector(el: Element): string {
  if (el.id) return `id:${el.id}`
  if (el.getAttribute('name')) return `name:${el.getAttribute('name')!}`
  const parts: string[] = []
  let current: Element | null = el
  while (current && current !== document.body) {
    let sel = current.tagName.toLowerCase()
    if (current.id) {
      parts.unshift(`id:${current.id}`)
      break
    }
    const parent = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === current!.tagName)
      if (siblings.length > 1) {
        sel += `:nth-of-type(${siblings.indexOf(current) + 1})`
      }
    }
    parts.unshift(sel)
    current = current.parentElement
  }
  return parts.join(' > ')
}

function getXPath(el: Element): string {
  const parts: string[] = []
  let current: Element | null = el
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 0
    let sibling: Element | null = current.previousElementSibling
    while (sibling) {
      if (sibling.tagName === current.tagName) index++
      sibling = sibling.previousElementSibling
    }
    parts.unshift(`${current.tagName.toLowerCase()}[${index + 1}]`)
    current = current.parentElement
  }
  return '/' + parts.join('/')
}

function showIndicator(): void {
  indicator = document.createElement('div')
  indicator.id = 'browsebuddy-recorder-indicator'
  indicator.style.cssText = `
    position: fixed; top: 8px; right: 8px; z-index: 999999;
    width: 12px; height: 12px; border-radius: 50%;
    background: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,0.3);
    animation: browsebuddy-pulse 1.5s infinite;
  `
  const style = document.createElement('style')
  style.textContent = `
    @keyframes browsebuddy-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `
  document.head.appendChild(style)
  document.body.appendChild(indicator)
}

function hideIndicator(): void {
  indicator?.remove()
  indicator = null
}

function handleClick(e: MouseEvent): void {
  if (!recording) return
  const target = e.target as Element
  if (target.id === 'browsebuddy-recorder-indicator') return

  actions.push({
    type: 'click',
    selector: getSelector(target),
    xpathFallback: getXPath(target),
    timestamp: Date.now(),
  })

  chrome.runtime.sendMessage({
    type: 'RECORDING_ACTION',
    payload: { action: actions[actions.length - 1] },
  }).catch(() => {})
}

function handleInput(e: Event): void {
  if (!recording) return
  const target = e.target as HTMLInputElement | HTMLTextAreaElement
  if (!target.tagName) return

  // Debounce: update last action if same field
  const lastAction = actions[actions.length - 1]
  if (lastAction?.type === 'input' && lastAction.selector === getSelector(target)) {
    lastAction.value = target.value
    lastAction.timestamp = Date.now()
    return
  }

  actions.push({
    type: 'input',
    selector: getSelector(target),
    xpathFallback: getXPath(target),
    value: target.value,
    timestamp: Date.now(),
  })
}

function handleChange(e: Event): void {
  if (!recording) return
  const target = e.target as HTMLSelectElement
  if (target.tagName !== 'SELECT') return

  actions.push({
    type: 'select',
    selector: getSelector(target),
    xpathFallback: getXPath(target),
    value: target.value,
    timestamp: Date.now(),
  })
}

export function startRecording(): void {
  actions = []
  recording = true
  showIndicator()
  document.addEventListener('click', handleClick, true)
  document.addEventListener('input', handleInput, true)
  document.addEventListener('change', handleChange, true)
}

export function stopRecording(): RecordedAction[] {
  recording = false
  hideIndicator()
  document.removeEventListener('click', handleClick, true)
  document.removeEventListener('input', handleInput, true)
  document.removeEventListener('change', handleChange, true)
  return [...actions]
}

export function isRecording(): boolean {
  return recording
}
