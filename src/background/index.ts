import type { ExtensionMessage, MessageType } from '../shared/messages'
import { handleValidateProvider, getProviders, saveProviders } from './api-key-manager'
import { handleAIChat } from '../ai/service'
import type { ProviderConfig } from '../shared/types'

const log = (...args: unknown[]) => console.log('[BrowseBuddy:bg]', ...args)

type MessageHandler = (
  payload: unknown
) => Promise<unknown>

const handlers: Partial<Record<MessageType, MessageHandler>> = {
  VALIDATE_PROVIDER: handleValidateProvider,
  AI_CHAT: handleAIChat,
  GET_PROVIDERS: async () => {
    const providers = await getProviders()
    const result = await chrome.storage.local.get('activeProviderId')
    log('GET_PROVIDERS:', providers.length, 'providers, active:', result.activeProviderId)
    return { providers, activeProviderId: result.activeProviderId || providers[0]?.id }
  },
  SAVE_PROVIDERS: async (payload) => {
    const { providers, activeProviderId } = payload as { providers: ProviderConfig[]; activeProviderId: string }
    await saveProviders(providers)
    await chrome.storage.local.set({ activeProviderId })
    log('SAVE_PROVIDERS:', providers.length, 'providers, active:', activeProviderId)
    return { ok: true }
  },
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    const handler = handlers[message.type]
    if (handler) {
      log('→', message.type)
      handler(message.payload)
        .then((result) => {
          log('←', message.type, 'ok')
          sendResponse(result)
        })
        .catch((err) => {
          log('←', message.type, 'ERROR:', String(err))
          sendResponse({ error: String(err) })
        })
      return true
    }

    if (message.type === 'PAGE_CONTEXT_RESULT' || message.type === 'RECORDING_ACTION') {
      chrome.runtime.sendMessage(message).catch(() => {})
    }

    return false
  }
)

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id })
  }
})

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {})

log('service worker loaded')
