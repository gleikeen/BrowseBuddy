import type { PageContext, ChatMessage, RecordedAction, Workflow, ProviderType } from './types'

// ===== Message Types =====

export type MessageType =
  | 'EXTRACT_PAGE_CONTEXT'
  | 'PAGE_CONTEXT_RESULT'
  | 'FILL_FORM'
  | 'FILL_FORM_RESULT'
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'RECORDING_ACTION'
  | 'REPLAY_WORKFLOW'
  | 'REPLAY_STATUS'
  | 'AI_CHAT'
  | 'AI_CHAT_STREAM'
  | 'AI_CHAT_DONE'
  | 'AI_CHAT_ERROR'
  | 'VALIDATE_PROVIDER'
  | 'VALIDATE_PROVIDER_RESULT'
  | 'GET_PROVIDERS'
  | 'SAVE_PROVIDERS'

export interface ExtensionMessage<T = unknown> {
  type: MessageType
  payload: T
  tabId?: number
}

// ===== Payload Types =====

export interface ExtractPageContextPayload {}

export interface PageContextResultPayload {
  context: PageContext
}

export interface FillFormPayload {
  fields: Array<{ selector: string; value: string }>
}

export interface FillFormResultPayload {
  filled: number
  failed: string[]
}

export interface StartRecordingPayload {}

export interface StopRecordingPayload {}

export interface RecordingActionPayload {
  action: RecordedAction
}

export interface ReplayWorkflowPayload {
  workflow: Workflow
}

export interface ReplayStatusPayload {
  step: number
  total: number
  status: 'running' | 'paused' | 'done' | 'error'
  error?: string
}

export interface AIChatPayload {
  messages: ChatMessage[]
  pageContext?: PageContext
}

export interface AIChatStreamPayload {
  chunk: string
}

export interface AIChatErrorPayload {
  error: string
}

export interface ValidateProviderPayload {
  providerId?: string
  type: ProviderType
  baseUrl: string
  apiKey: string
}

export interface ValidateProviderResultPayload {
  valid: boolean
  error?: string
}

// ===== Helper =====

export function sendMessage<T>(message: ExtensionMessage<T>): Promise<unknown> {
  return chrome.runtime.sendMessage(message)
}

export function sendTabMessage<T>(tabId: number, message: ExtensionMessage<T>): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, message)
}
