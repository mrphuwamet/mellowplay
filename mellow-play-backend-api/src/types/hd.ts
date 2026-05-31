// Types for Human Design API and Internal Profiles

export interface HDAPIResponse {
  timestamp: string;
  success: boolean;
  message: string;
  errorCode: string;
  type: string;
  data: {
    type: string;
    profile: string;
    channelsShort: string[];
    centers: string[];
    strategy: string;
    authority: string;
    incarnationCross: string;
    definition: string;
    signature: string;
    notSelfTheme: string;
    cognition: string;
    determination: string;
    variables: string;
    motivation: string;
    transference: string;
    perspective: string;
    distraction: string;
    environment: string;
    circuitries: string;
    channelsLong: string[];
    gates: string[];
    activations: {
      design: Record<string, string>;
      personality: Record<string, string>;
    };
    birthDateUtc: string;
  };
}

export interface HDProfile {
  id: number;
  user_id: number;
  name: string;
  relation: string;
  birth_date: string;
  birth_time: string;
  birth_place: string;
  birth_lat: number;
  birth_lng: number;
  birth_date_utc?: string;
  hd_type?: string;
  hd_profile?: string;
  hd_strategy?: string;
  hd_authority?: string;
  hd_incarnation_cross?: string;
  hd_definition?: string;
  hd_signature?: string;
  hd_not_self_theme?: string;
  hd_cognition?: string;
  hd_determination?: string;
  hd_variables?: string;
  hd_motivation?: string;
  hd_transference?: string;
  hd_perspective?: string;
  hd_distraction?: string;
  hd_environment?: string;
  hd_circuitries?: string;
  centers_json?: string;
  channels_short_json?: string;
  channels_long_json?: string;
  gates_json?: string;
  activations_design_json?: string;
  activations_personality_json?: string;
}
