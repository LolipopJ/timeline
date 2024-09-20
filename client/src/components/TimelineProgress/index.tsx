import { useEffect, useState } from "react";

export interface TimelineProgressProps {
  total: number;
  current: number;
  className?: string;
}

export default function TimelineProgress(props: TimelineProgressProps) {
  const { total, current, className = "", ...rest } = props;
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    setProgress(Number(((current / total) * 100).toFixed(1)));
  }, [current, total]);

  return (
    <div className={`select-none ${className}`}>
      <div
        className={`bg-background-light h-full overflow-hidden rounded-full`}
        {...rest}
      >
        <div
          className="bg-foreground w-2 transition-all"
          style={{ height: `${progress}%` }}
        />
      </div>
    </div>
  );
}
