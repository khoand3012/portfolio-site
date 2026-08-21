export function isAllowedEmail(
  email: string | null | undefined,
  allowedEmailsEnv: string | undefined,
): boolean {
  if (!email || !allowedEmailsEnv) return false;
  const allowed = allowedEmailsEnv
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
