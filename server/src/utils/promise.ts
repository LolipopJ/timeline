import { sleep } from "bun";

export const createPromiseQueue = () => {
  const queue: (() => Promise<void>)[] = [];
  let isProcessing = false;

  const processQueue = async () => {
    if (isProcessing) return;
    isProcessing = true;

    while (queue.length > 0) {
      const task = queue.shift();
      try {
        await task?.(); // 执行任务
      } catch (error) {
        console.error("Queue task failed:", error);
      }
    }

    isProcessing = false; // 处理完成
  };

  return (promiseFunction: () => Promise<void>) => {
    queue.push(promiseFunction);
    processQueue();
  };
};

export const withRetry = async <T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    baseDelayMs?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  },
): Promise<T> => {
  const { maxRetries = 3, baseDelayMs = 2000, onRetry } = options ?? {};

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        onRetry?.(attempt + 1, err);
        // 指数退避: 2s → 4s → 8s
        await sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }
  throw lastError;
};
