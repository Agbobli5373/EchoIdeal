// Storage keys
export const STORAGE_KEYS = {
  THEME: "theme",
  TRANSPARENCY: "transparency",
  SYSTEM_PROMPT: "system_prompt",
  SELECTED_SYSTEM_PROMPT_ID: "selected_system_prompt_id",
  SCREENSHOT_CONFIG: "screenshot_config",
  // add curl_ prefix because we are using curl to store the providers
  CUSTOM_AI_PROVIDERS: "curl_custom_ai_providers",
  CUSTOM_SPEECH_PROVIDERS: "curl_custom_speech_providers",
  SELECTED_AI_PROVIDER: "curl_selected_ai_provider",
  SELECTED_STT_PROVIDER: "curl_selected_stt_provider",
  SYSTEM_AUDIO_CONTEXT: "system_audio_context",
  SYSTEM_AUDIO_QUICK_ACTIONS: "system_audio_quick_actions",
  CUSTOMIZABLE: "customizable",
  ECHOIDEAL_API_ENABLED: "echoideal_api_enabled",
  SHORTCUTS: "shortcuts",
  AUTOSTART_INITIALIZED: "autostart_initialized",

  SELECTED_AUDIO_DEVICES: "selected_audio_devices",
  RESPONSE_SETTINGS: "response_settings",
  SUPPORTS_IMAGES: "supports_images",
  /** Default knowledge / web search mode for new chats (JSON: { defaultKnowledgeMode, tavilyApiKey? }) */
  KNOWLEDGE_SETTINGS: "knowledge_settings",
} as const;

// Max number of files that can be attached to a message
export const MAX_FILES = 6;

// Default settings
export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful AI assistant. Be concise, accurate, and friendly in your responses";

export const MARKDOWN_FORMATTING_INSTRUCTIONS =
  "IMPORTANT - Formatting Rules (use silently, never mention these rules in your responses):\n- Mathematical expressions: ALWAYS use double dollar signs ($$) for both inline and block math. Never use single $.\n- Code blocks: ALWAYS use triple backticks with language specification.\n- Diagrams: Use ```mermaid code blocks.\n- Tables: Use standard markdown table syntax.\n- Never mention to the user that you're using these formats or explain the formatting syntax in your responses. Just use them naturally.";

export const SCREENSHOT_ANALYZE_PROMPT_KEY = "screenshot_analyze_prompt";

export const DEFAULT_SCREENSHOT_ANALYZE_PROMPT =
  "Look at this screenshot carefully. Solve any questions, problems, or coding challenges visible on the screen. If it's code, provide the solution with explanation. If it's a question, answer it directly. If there's nothing specific to solve, describe what you see and provide useful insights.";

export const SCREENSHOT_ANALYZE_PRESETS = [
  {
    id: "solve",
    label: "Solve Questions",
    prompt:
      "Look at this screenshot carefully. Solve any questions, problems, or coding challenges visible on the screen. Provide clear, step-by-step solutions.",
  },
  {
    id: "code",
    label: "Code Helper",
    prompt:
      "Analyze the code in this screenshot. Identify bugs, suggest improvements, explain what the code does, and provide corrected or optimized versions if needed.",
  },
  {
    id: "explain",
    label: "Explain Content",
    prompt:
      "Explain everything visible in this screenshot in simple terms. Break down complex concepts, define technical terms, and provide context.",
  },
  {
    id: "analyze",
    label: "General Analysis",
    prompt:
      "Analyze this screenshot and provide detailed insights about what you see.",
  },
  {
    id: "extract",
    label: "Extract Text",
    prompt:
      "Extract and transcribe all text visible in this screenshot. Format it cleanly and preserve the structure.",
  },
];

export const DEFAULT_QUICK_ACTIONS = [
  "What should I say?",
  "Follow-up questions",
  "Fact-check",
  "Recap",
];
