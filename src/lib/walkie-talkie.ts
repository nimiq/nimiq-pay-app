export interface WtMessage {
  id: string
  sender: string // "user" | "agent:<name>"
  content: string
  timestamp: string
}

export interface UserStatus {
  session_id: string | null
  online: boolean
}

const BASE_URL = __WALKIE_TALKIE_URL__
const API_KEY = __WALKIE_TALKIE_API_KEY__
const headers = () => ({ 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' })

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: headers(), ...options })
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

export async function getHistory(userId: string, sessionId: string, fromId: string): Promise<WtMessage[]> {
  return request<WtMessage[]>(`${BASE_URL}/user/${encodeURIComponent(userId)}/session/${encodeURIComponent(sessionId)}/history/${encodeURIComponent(fromId)}`)
}

export async function closeSession(userId: string, sessionId: string): Promise<{ status: string }> {
  return request<{ status: string }>(`${BASE_URL}/user/${encodeURIComponent(userId)}/session/${encodeURIComponent(sessionId)}/close`, {
    method: 'POST',
  })
}
