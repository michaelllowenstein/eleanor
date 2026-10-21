// global constants

// Mock-Realtime Transport
/** Mic RMS above this counts as "you are talking". */
export const SPEECH_LEVEL = 0.02;
 
/** Silence this long ends your turn. */
export const END_OF_TURN_MS = 600;
 
/** Pause between your turn ending and the reply starting. */
export const THINKING_MS = 400;
 
/** Length of the synthetic reply. */
export const REPLY_MS = 1_600;
 
export const TICK_MS = 50;

/**
 * App paths in one place. The assistant still lives at /home; when it moves
 * to /assistant (gap review A-1), change it here only.
 */
export const APP_PATHS = {
  assistant: "/home",
  settings: "/settings",
  security: "/security",
  login: "/login",
} as const;
