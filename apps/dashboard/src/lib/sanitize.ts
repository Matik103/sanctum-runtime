// Strip leading/trailing whitespace and ASCII control characters from user input.
// Control chars (0x00-0x1F, 0x7F) have no place in tokens or API keys and can
// cause subtle bugs if pasted from terminals or password managers.
export function sanitizeInput(value: string): string {
  return value.trim().replace(/[\x00-\x1F\x7F]/g, '')
}
