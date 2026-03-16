// ===== Page Context Types =====

export interface PageContext {
  url: string
  title: string
  forms: FormDescription[]
  buttons: ButtonDescription[]
  headings: string[]
  metadata: Record<string, string>
}

export interface FormDescription {
  selector: string
  fields: FieldDescription[]
}

export interface FieldDescription {
  selector: string
  type: string
  name: string
  label: string
  placeholder: string
  required: boolean
  currentValue: string
  options?: string[]
}

export interface ButtonDescription {
  selector: string
  text: string
  type: string
}

// ===== AI Provider Types =====

export type ProviderType = 'openai-compatible' | 'anthropic'

export interface ProviderConfig {
  id: string
  name: string
  type: ProviderType
  baseUrl: string
  apiKey: string
  model: string
}

/** @deprecated Use ProviderConfig instead */
export type AIProviderName = 'anthropic' | 'openai'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model: string
  maxTokens: number
  temperature: number
  stream: boolean
}

// ===== Workflow Types =====

export interface RecordedAction {
  type: 'click' | 'input' | 'select' | 'navigate' | 'wait' | 'keypress'
  selector: string
  xpathFallback: string
  value?: string
  timestamp: number
}

export interface Workflow {
  id: string
  name: string
  actions: RecordedAction[]
  variables: Record<string, string>
  createdAt: string
  updatedAt: string
}

// ===== Storage Types =====

export interface StorageData {
  providers: ProviderConfig[]
  activeProviderId: string
  workflows: Workflow[]
}

/** @deprecated Old storage format for migration */
export interface StorageDataV1 {
  apiKeys: Partial<Record<AIProviderName, string>>
  activeProvider: AIProviderName
  activeModel: string
  workflows: Workflow[]
}
