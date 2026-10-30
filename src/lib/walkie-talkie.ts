import { nativeFetch } from './nativeFetch'

export interface WtMessage {
  id: string
  sender: string // "user" | "agent:<name>" | "system"
  event?: string // Only on "system" entries, e.g. "session_closed"
  content: string
  timestamp: string
  failed?: boolean // Client-side only: true if the message failed to send
}

/** Whether the history contains the entry the backend adds when support closes the session */
export function isSessionClosed(messages: WtMessage[]) {
  return messages.some(m => m.sender === 'system' && m.event === 'session_closed')
}

export interface UserStatus {
  session_id: string | null
  online: boolean
}

const BASE_URL = __WALKIE_TALKIE_URL__
const API_KEY = __WALKIE_TALKIE_API_KEY__
const headers = () => ({ 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' })

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await nativeFetch(url, { headers: headers(), ...options })
  if (!res.ok) {
    throw new Error(`Walkie-Talkie API error ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

export async function getStatus(userId: string): Promise<UserStatus> {
  return request<UserStatus>(`${BASE_URL}/user/${encodeURIComponent(userId)}/status`)
}

export async function startSession(userId: string, message: string): Promise<{ session_id: string }> {
  return request<{ session_id: string }>(`${BASE_URL}/user/${encodeURIComponent(userId)}/session`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

export async function sendMessage(userId: string, sessionId: string, message: string): Promise<{ message_id: string }> {
  return request<{ message_id: string }>(`${BASE_URL}/user/${encodeURIComponent(userId)}/session/${encodeURIComponent(sessionId)}/message`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

// Backend rejects decoded files over 10 MiB
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024

export async function uploadAttachment(userId: string, sessionId: string, filename: string, contentBase64: string): Promise<{ file_id: string }> {
  return request<{ file_id: string }>(`${BASE_URL}/user/${encodeURIComponent(userId)}/session/${encodeURIComponent(sessionId)}/attachment`, {
    method: 'POST',
    body: JSON.stringify({ filename, content_base64: contentBase64 }),
  })
}

export async function getHistory(userId: string, sessionId: string, fromId: string): Promise<WtMessage[]> {
  return request<WtMessage[]>(`${BASE_URL}/user/${encodeURIComponent(userId)}/session/${encodeURIComponent(sessionId)}/history/${encodeURIComponent(fromId)}`)
}

export async function closeSession(userId: string, sessionId: string): Promise<{ status: string }> {
  return request<{ status: string }>(`${BASE_URL}/user/${encodeURIComponent(userId)}/session/${encodeURIComponent(sessionId)}/close`, {
    method: 'POST',
  })
}
