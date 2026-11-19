import { randomInt } from 'node:crypto'
import { sha256 } from './crypto.js'

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export function normalizeClaimCode(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
}

export function formatClaimCode(sixChars) {
  const s = sixChars.slice(0, 3) + '-' + sixChars.slice(3, 6)
  return s
}

export function generateClaimCode() {
  let raw = ''
  for (let i = 0; i < 6; i += 1) {
    raw += ALPHABET[randomInt(0, ALPHABET.length)]
  }
  return {
    plain: formatClaimCode(raw),
    normalized: raw,
    hash: sha256(raw),
  }
}

export function hashClaimCode(normalized) {
  return sha256(normalized)
}