const AUTH_TIMEOUT_MS = 15_000;

export function withAuthTimeout<T>(
  operation: Promise<T>,
  message = 'Authentication timed out. Check your connection and try again.',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS);
  });

  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
