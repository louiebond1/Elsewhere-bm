/** After the gate, a login or an account switch: go back to a pending AI-assistant connection, if there is one. */
export function takeReturnPath(): string | null {
  try {
    const v = sessionStorage.getItem('bm_return');
    sessionStorage.removeItem('bm_return');
    return v && v.startsWith('/oauth/authorize?') ? v : null;
  } catch { return null; }
}
export function peekReturnPath(): string | null {
  try { const v = sessionStorage.getItem('bm_return'); return v && v.startsWith('/oauth/authorize?') ? v : null; } catch { return null; }
}
