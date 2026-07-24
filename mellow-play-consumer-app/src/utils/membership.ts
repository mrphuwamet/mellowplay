// Premium status is per-child (Children.membership_type/membership_expires_at),
// not per-parent-account — mirrors the CRM's per-child membership chip logic
// in UserManagement.tsx.
export function isPremiumChild(child?: { membershipType?: string; membershipExpiresAt?: string; [key: string]: any } | null): boolean {
  if (!child || child.membershipType !== 'premium') return false;
  if (!child.membershipExpiresAt) return true;
  return new Date(child.membershipExpiresAt) > new Date();
}
