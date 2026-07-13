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

  generateMockResponse(data: { birthdate: string; birthtime?: string }): HDAPIResponse {
    const day = parseInt(data.birthdate.split('-')[2]) || 1;
    const typeMod = day % 4;

    let type = 'Generator';
    let profile = '6/2';
    let strategy = 'To Respond';
    let authority = 'Sacral';
    let incarnationCross = 'Right Angle Cross of Sphinx';
    let definition = 'Single Definition';
    let signature = 'Satisfaction';
    let notSelfTheme = 'Frustration';
    let cognition = 'Smell';
    let determination = 'Indirect';
    let variables = 'PRR LLL';
    let motivation = 'Hope';
    let transference = 'Fear';
    let perspective = 'Survival';
    let distraction = 'Power';
    let environment = 'Caves';
    let circuitries = 'Individual';
    let centersList = ['ajna', 'sacral']; // defined centers list

    if (typeMod === 0) {
      type = 'Generator';
      profile = '6/2';
      centersList = ['ajna', 'sacral'];
    } else if (typeMod === 1) {
      type = 'Projector';
      profile = '1/3';
      strategy = 'Wait for the Invitation';
      authority = 'Self-Projected';
      signature = 'Success';
      notSelfTheme = 'Bitterness';
      centersList = ['ajna'];
    } else if (typeMod === 2) {
      type = 'Manifestor';
      profile = '4/6';
      strategy = 'To Inform';
      authority = 'Splenic';
      signature = 'Peace';
      notSelfTheme = 'Anger';
      centersList = ['ego'];
    } else {
      type = 'Reflector';
      profile = '6/2';
      strategy = 'Wait a Lunar Cycle';
      authority = 'None';
      signature = 'Surprise';
      notSelfTheme = 'Disappointment';
      centersList = [];
    }

    return {
      timestamp: new Date().toISOString(),
      success: true,
      message: 'Mock human design profile generated successfully',
      errorCode: '0',
      type: type,
      data: {
        type: type,
        profile: profile,
        channelsShort: ['1-8', '2-14'],
        centers: centersList,
        strategy,
        authority,
        incarnationCross,
        definition,
        signature,
        notSelfTheme,
        cognition,
        determination,
        variables,
        motivation,
        transference,
        perspective,
        distraction,
        environment,
        circuitries,
        channelsLong: ['1-8', '2-14'],
        gates: ['1', '2'],
        activations: {
          design: { sun: '1.1' },
          personality: { sun: '2.2' }
        },
        birthDateUtc: `${data.birthdate}T${data.birthtime || '12:00'}:00.000Z`
      }
    };
  }

  async calculateChart(data: {
    birthdate: string
    birthtime: string
    lat: number
    lng: number
  }): Promise<HDAPIResponse> {
    const isMock = !this.apiKey || this.apiKey.includes('your_local') || this.apiKey === 'hash';
    if (isMock) {
      return this.generateMockResponse(data);
    }

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
    const isMock = !this.apiKey || this.apiKey.includes('your_local') || this.apiKey === 'hash';
    if (isMock) {
      return this.generateMockResponse(data);
    }

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
