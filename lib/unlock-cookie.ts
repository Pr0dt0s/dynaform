// One cookie per record id, not one shared cookie — so unlocking one link never grants
// access to another, even though every link from the same skill install shares one PIN.
export function unlockCookieName(id: string): string {
  return `df_unlock_${id}`;
}
