import type { Workflow, RecordedAction } from '../shared/types'
import type { ReplayStatusPayload } from '../shared/messages'

function findElement(action: RecordedAction): Element | null {
  // Try CSS selector first
  let el = document.querySelector(action.selector)
  if (el) return el

  // Fallback to XPath
  try {
    const result = document.evaluate(
      action.xpathFallback,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    )
    el = result.singleNodeValue as Element | null
    if (el) return el
  } catch {
    // XPath evaluation failed
  }

  return null
}

function replaceVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`)
}

async function waitForStable(timeout = 1000): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>
    const observer = new MutationObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        observer.disconnect()
        resolve()
      }, 300)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    timer = setTimeout(() => {
      observer.disconnect()
      resolve()
    }, timeout)
  })
}

function sendStatus(status: ReplayStatusPayload): void {
  chrome.runtime.sendMessage({
    type: 'REPLAY_STATUS',
    payload: status,
  }).catch(() => {})
}

async function executeAction(action: RecordedAction, variables: Record<string, string>): Promise<void> {
  const el = findElement(action)
  if (!el) {
    throw new Error(`Element not found: ${action.selector}`)
  }

  switch (action.type) {
    case 'click':
      (el as HTMLElement).click()
      break

    case 'input': {
      const input = el as HTMLInputElement | HTMLTextAreaElement
      const value = action.value ? replaceVariables(action.value, variables) : ''
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value'
      )?.set
      if (setter) setter.call(input, value)
      else input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      break
    }

    case 'select': {
      const select = el as HTMLSelectElement
      const value = action.value ? replaceVariables(action.value, variables) : ''
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
      break
    }

    case 'navigate':
      if (action.value) window.location.href = action.value
      break

    case 'wait':
      await new Promise((r) => setTimeout(r, parseInt(action.value || '1000')))
      break

    case 'keypress':
      if (action.value) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: action.value, bubbles: true }))
        el.dispatchEvent(new KeyboardEvent('keyup', { key: action.value, bubbles: true }))
      }
      break
  }
}

export async function replayWorkflow(
  workflow: Workflow
): Promise<{ completed: number; total: number; error?: string }> {
  const { actions, variables } = workflow
  const total = actions.length

  for (let i = 0; i < actions.length; i++) {
    sendStatus({ step: i + 1, total, status: 'running' })

    try {
      await executeAction(actions[i], variables)
      await waitForStable()
    } catch (err) {
      sendStatus({ step: i + 1, total, status: 'error', error: String(err) })
      return { completed: i, total, error: String(err) }
    }
  }

  sendStatus({ step: total, total, status: 'done' })
  return { completed: total, total }
}
