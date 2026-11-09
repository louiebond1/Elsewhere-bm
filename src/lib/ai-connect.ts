/** How to connect each AI app. Menu names in these apps change, so the steps say what to look for. */
export type AiApp = 'chatgpt' | 'claude';
export const AI_APPS: Record<AiApp, { name: string; open: string; steps: string[]; note: string }> = {
  chatgpt: {
    name: 'ChatGPT',
    open: 'https://chatgpt.com/',
    steps: [
      'In ChatGPT, open Plugins (or Apps & Connectors in Settings) and add a custom MCP server.',
      'Paste the address below, choose OAuth, and leave Client ID and Secret empty.',
      'A small Elsewhere window opens. Press Allow ChatGPT.',
    ],
    note: 'Adding your own connector depends on your ChatGPT plan. If you can’t see the option, Claude works the same way.',
  },
  claude: {
    name: 'Claude',
    open: 'https://claude.ai/',
    steps: [
      'In Claude, open Connectors (in Customize or Settings).',
      'Choose Add custom connector and paste the address below.',
      'A small Elsewhere window opens. Press Allow Claude.',
    ],
    note: 'The free Claude plan allows one custom connector.',
  },
};
export const AI_NOTE = 'Your AI drafts. You check and confirm.';
