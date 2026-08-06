export function canDelegate(allowedTargets: string[], toAgentId: string) {
  return allowedTargets.includes(toAgentId);
}
