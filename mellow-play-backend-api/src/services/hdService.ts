import { HDAPIResponse, HDProfile } from '../types/hd'

export class HDService {
  private apiKey: string
  private geocodeKey?: string
  private apiUrl = 'https://api.humandesignapi.nl/v2/charts/coordinates'
  private simpleApiUrl = 'https://api.humandesignapi.nl/v2/charts/simple'

  constructor(apiKey: string, geocodeKey?: string) {
    this.apiKey = apiKey
    this.geocodeKey = geocodeKey
  }

  async calculateChart(data: {
    birthdate: string
    birthtime: string
    lat: number
    lng: number
  }): Promise<HDAPIResponse> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    }

    if (this.geocodeKey) {
      headers['HD-Geocode-Key'] = this.geocodeKey
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      const errorData = await response.json() as any
      throw new Error(errorData.message || 'Failed to calculate chart')
    }

    return await response.json() as HDAPIResponse
  }

  async calculateSimple(data: {
    birthdate: string
    birthtime: string
    location: string
  }): Promise<HDAPIResponse> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    }

    if (this.geocodeKey) {
      headers['HD-Geocode-Key'] = this.geocodeKey
    }

    const response = await fetch(this.simpleApiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      const errorData = await response.json() as any
      throw new Error(errorData.message || 'Failed to calculate simple chart')
    }

    return await response.json() as HDAPIResponse
  }

  mapResponseToProfile(
    userId: number,
    name: string,
    relation: string,
    birthInfo: { date: string; time: string; place: string; lat: number; lng: number },
    apiResponse: HDAPIResponse
  ): Partial<HDProfile> {
    const d = apiResponse.data
    return {
      user_id: userId,
      name: name,
      relation: relation,
      birth_date: birthInfo.date,
      birth_time: birthInfo.time,
      birth_place: birthInfo.place,
      birth_lat: birthInfo.lat,
      birth_lng: birthInfo.lng,
      birth_date_utc: d.birthDateUtc,
      hd_type: d.type,
      hd_profile: d.profile,
      hd_strategy: d.strategy,
      hd_authority: d.authority,
      hd_incarnation_cross: d.incarnationCross,
      hd_definition: d.definition,
      hd_signature: d.signature,
      hd_not_self_theme: d.notSelfTheme,
      hd_cognition: d.cognition,
      hd_determination: d.determination,
      hd_variables: d.variables,
      hd_motivation: d.motivation,
      hd_transference: d.transference,
      hd_perspective: d.perspective,
      hd_distraction: d.distraction,
      hd_environment: d.environment,
      hd_circuitries: d.circuitries,
      centers_json: JSON.stringify(d.centers),
      channels_short_json: JSON.stringify(d.channelsShort),
      channels_long_json: JSON.stringify(d.channelsLong),
      gates_json: JSON.stringify(d.gates),
      activations_design_json: JSON.stringify(d.activations.design),
      activations_personality_json: JSON.stringify(d.activations.personality)
    }
  }
}
