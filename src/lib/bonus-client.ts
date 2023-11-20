export interface ParticipantAuthorizeRequest {
  public_key: string
  phone_number: string
}

export interface ParticipantVerifyRequest {
  phone_number: string
  access_code: number
}

export interface ParticipantVerifyResponse {
  token: string
}

export interface ParticipantBalanceResponse {
  balance: number
}

export interface VoucherInfoResponse {
  id: string
  claims_remaining: number
  reward: number
}

export interface PaymentRequest {
  type: string
  reference: string
  destination: string
}

export interface PaymentResponse {
  valid: boolean
  reason: string
  cashback: {
    percentage: number
    amount_in_luna: number
  }
}

export interface TaskClaimRequest {
  proof: any
}

export interface TaskClaimResponse {
  created_at: string
  id: string
  participant_id: string
  task_id: string
  task_proof: string
  task_status: 'in-progress' | 'completed' | 'rejected'
  updated_at: string
}

export class BonusClient {
  endpoint: string = 'https://bonus-nim.zeromox.com/api'

  private async fetchJson(path: string, options: RequestInit = {}): Promise<any | null> {
    try {
      const response = await fetch(this.endpoint + path, options)
      if (response.status === 404)
        return null
      if (!response.ok)
        throw new Error(`${response.status}: ${response.statusText}`)
      if (response.status === 204)
        return null
      return await response.json()
    }
    catch (e: any) {
      throw new Error(`Request to ${path} failed: ${e.message}`, { cause: e })
    }
  }

  async authorizeParticipant(publicKey: Nimiq.PublicKey, phoneNumber: string): Promise<any> {
    const request: ParticipantAuthorizeRequest = { public_key: publicKey.toHex(), phone_number: phoneNumber }
    return (await this.fetchJson(`/participant/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }))
  }

  async verifyParticipant(phoneNumber: string, accessCode: number): Promise<ParticipantVerifyResponse> {
    const request: ParticipantVerifyRequest = { phone_number: phoneNumber, access_code: accessCode }
    return (await this.fetchJson(`/participant/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })) as ParticipantVerifyResponse
  }

  async getParticipantBalance(token: string): Promise<number> {
    return ((await this.fetchJson(`/participant/balance`, { headers: { token } })) as ParticipantBalanceResponse).balance
  }

  async getParticipantVoucher(token: string): Promise<VoucherInfoResponse> {
    return (await this.fetchJson(`/participant/voucher`, { headers: { token } })) as VoucherInfoResponse
  }

  async doPayment(token: string, type: string, reference: string, destination: string): Promise<void> {
    const request: PaymentRequest = { type, reference, destination }
    await this.fetchJson(`/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify(request),
    })
  }

  async verifyPayment(token: string, type: string, reference: string, destination: string): Promise<PaymentResponse> {
    const request: PaymentRequest = { type, reference, destination }
    return await this.fetchJson(`/payment/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify(request),
    })
  }

  async getTasks(token: string): Promise<any[]> {
    return (await this.fetchJson(`/task`, { headers: { token } }))
  }

  async getTask(token: string, id: string): Promise<any> {
    return (await this.fetchJson(`/task/${id}`, { headers: { token } }))
  }

  async claimTask(token: string, id: string, proof: any): Promise<TaskClaimResponse> {
    const request: TaskClaimRequest = { proof }
    return await this.fetchJson(`/task/${id}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify(request),
    })
  }

  async getVoucher(id: string): Promise<VoucherInfoResponse> {
    return (await this.fetchJson(`/voucher/${id}`))
  }

  async claimVoucher(token: string, id: string): Promise<void> {
    return await this.fetchJson(`/voucher/${id}/claim`, { headers: { token } })
  }
}
