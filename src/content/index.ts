import { getCachedContext, startObserving } from './extractor'
import { handleFillForm } from './form-filler'
import { startRecording, stopRecording } from './recorder'
import { replayWorkflow } from './player'
import type { ExtensionMessage, FillFormPayload } from '../shared/messages'
import type { Workflow } from '../shared/types'

const log = (...args: unknown[]) => console.log('[BrowseBuddy:content]', ...args)

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    log('message received:', message.type)
    switch (message.type) {
      case 'EXTRACT_PAGE_CONTEXT': {
        const context = getCachedContext()
        log('page context:', context.url, `forms:${context.forms.length}`, `fields:${context.forms.reduce((s, f) => s + f.fields.length, 0)}`, `buttons:${context.buttons.length}`)
        sendResponse({ context })
        return false
      }
      case 'FILL_FORM': {
        const payload = message.payload as FillFormPayload
        log('fill request:', payload.fields.length, 'fields', payload.fields.map((f) => `${f.selector} = "${f.value}"`))
        handleFillForm(payload.fields)
          .then((result) => {
            log('fill result:', `filled:${result.filled}`, `failed:${result.failed.length}`, result.failed.length > 0 ? result.failed : '')
            sendResponse(result)
          })
          .catch((err) => {
            log('fill error:', err)
            sendResponse({ error: String(err) })
          })
        return true
      }
      case 'START_RECORDING': {
        log('recording started')
        startRecording()
        sendResponse({ ok: true })
        return false
      }
      case 'STOP_RECORDING': {
        const actions = stopRecording()
        log('recording stopped:', actions.length, 'actions')
        sendResponse({ actions })
        return false
      }
      case 'REPLAY_WORKFLOW': {
        log('replay started')
        replayWorkflow(message.payload as Workflow)
          .then((r) => { log('replay done:', r); sendResponse(r) })
          .catch((err) => { log('replay error:', err); sendResponse({ error: String(err) }) })
        return true
      }
    }
    return false
  }
)

startObserving()
log('loaded on', location.href)
