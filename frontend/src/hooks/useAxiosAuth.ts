// No-op mientras la auth está bypasseada. Se re-implementa cuando entre Clerk.
export function useAxiosAuth() {
  // En dev el backend acepta requests sin token (DEV_BYPASS_AUTH=true).
}
