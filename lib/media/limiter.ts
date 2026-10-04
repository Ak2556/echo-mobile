/** Run async jobs at most `max` at a time; the rest wait their turn in order. */
export function createLimiter(max: number) {
  let running = 0;
  const waiting: (() => void)[] = [];

  const next = () => {
    running--;
    waiting.shift()?.();
  };

  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (running >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    running++;
    try {
      return await job();
    } finally {
      next();
    }
  };
}
