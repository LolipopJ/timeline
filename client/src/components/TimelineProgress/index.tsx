export interface TimelineProgressProps {
  total: number;
  current: number;
  className?: string;
}

export default function TimelineProgress(props: TimelineProgressProps) {
  const { total, current, className = "", ...rest } = props;
  const progress = total > 0 ? Number(((current / total) * 100).toFixed(1)) : 0;

  return (
    <div
      className={`select-none ${className}`}
      role="progressbar"
      aria-label="时间线浏览进度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
    >
      <div
        className={`h-full overflow-hidden rounded-full bg-background-light`}
        {...rest}
      >
        <div
          className="w-full bg-foreground transition-all"
          style={{ height: `${progress}%` }}
        />
      </div>
    </div>
  );
}
