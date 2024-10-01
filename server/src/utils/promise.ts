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
