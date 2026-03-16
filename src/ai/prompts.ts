import type { PageContext } from '../shared/types'

export function buildSystemPrompt(pageContext?: PageContext): string {
  let prompt = `You are BrowseBuddy, an AI assistant that helps users interact with web pages. You can:
1. Understand page structure and content
2. Fill forms with appropriate data
3. Explain what's on the page
4. Help automate repetitive tasks

When the user asks you to fill a form, you MUST respond with a JSON block using the EXACT selectors from the page context. Selectors use a special format like "id:elementId" or "name:fieldName". Copy them exactly as shown. Example:

\`\`\`json
{
  "action": "fill_form",
  "fields": [
    { "selector": "id:email", "value": "test@example.com" },
    { "selector": "name:username", "value": "john" }
  ]
}
\`\`\`

IMPORTANT:
- Copy the "selector" values EXACTLY as they appear in the page context. Do NOT modify, escape, or convert them.
- For checkbox fields: set "value" to "true" to check, "false" to uncheck. If options are listed, set "value" to the option label text you want to check.
- For radio fields: set "value" to the option label text you want to select from the listed options.
- For select/dropdown fields: set "value" to the option text you want to select.
- Always include the JSON block when filling forms, even if you also explain what you're doing.
- Keep responses concise.`

  if (pageContext) {
    prompt += `\n\n## Current Page Context\n`
    prompt += `URL: ${pageContext.url}\n`
    prompt += `Title: ${pageContext.title}\n`

    if (pageContext.headings.length > 0) {
      prompt += `\nHeadings: ${pageContext.headings.join(', ')}\n`
    }

    if (pageContext.forms.length > 0) {
      prompt += `\n### Forms on page:\n`
      for (const form of pageContext.forms) {
        prompt += `Form (${form.selector}):\n`
        for (const field of form.fields) {
          prompt += `  - selector: "${field.selector}"`
          if (field.label) prompt += `, label: "${field.label}"`
          if (field.name) prompt += `, name: "${field.name}"`
          prompt += `, type: ${field.type}`
          if (field.placeholder) prompt += `, placeholder: "${field.placeholder}"`
          if (field.required) prompt += `, required`
          if (field.currentValue) prompt += `, currentValue: "${field.currentValue}"`
          if (field.options) {
            const isChoice = field.type === 'radio' || field.type === 'checkbox' || field.type === 'select'
            prompt += `, options: [${field.options.map((o) => `"${o}"`).join(', ')}]`
            if (isChoice) prompt += ` (use option text as value)`
          }
          prompt += `\n`
        }
      }
    }

    if (pageContext.buttons.length > 0) {
      prompt += `\nButtons:\n`
      for (const btn of pageContext.buttons) {
        prompt += `  - selector: "${btn.selector}", text: "${btn.text}"\n`
      }
    }
  } else {
    prompt += `\n\nNo page context available. Ask the user to describe the page or try refreshing the connection.`
  }

  return prompt
}

export function buildFormFillPrompt(instruction: string, _pageContext: PageContext): string {
  return `The user wants to fill a form on the current page.

User instruction: "${instruction}"

Based on the page context provided in the system prompt, generate appropriate values for each form field and return a JSON block with the fill instructions.

Requirements:
- Use the EXACT CSS selectors from the page context
- Generate realistic, appropriate test data
- Match field types (email fields get emails, phone fields get phone numbers, etc.)
- Respect field constraints (required fields must be filled)
- For select/radio fields, choose from available options
- For Chinese content, use Chinese characters where appropriate`
}
