// What counts as a login PIN. Enforced here because the CRM form is a
// convenience, not a gate: the create-user endpoint is reachable directly,
// and a 3-character PIN accepted by the server is a 3-character PIN however
// well the form behaves.
//
// Mirrored in mellow-play-crm-portal/src/pages/UserManagement.tsx so the form
// can say what is wrong before submitting. Change both together.
export const PIN_LENGTH = 6;

export const isValidPin = (pin: unknown): pin is string =>
  typeof pin === 'string' && new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin);

export const PIN_ERROR = 'PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น';
