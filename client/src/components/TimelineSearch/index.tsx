import { mdiCloseThick, mdiCommentSearch } from "@mdi/js";
import Icon from "@mdi/react";

export interface TimelineSearchProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
}

export default function TimelineSearch(props: TimelineSearchProps) {
  const { className = "", value, onClear, ...rest } = props;

  return (
    <div className={`${className} relative`}>
      <input
        value={value}
        className={`h-8 w-full rounded-md bg-background-lighter pl-10`}
        {...rest}
      />
      <div className="absolute left-0 top-0 size-8 rounded-md bg-background-light">
        <Icon
          path={mdiCommentSearch}
          className="absolute left-1.5 top-1.5 size-5"
        />
      </div>
      {onClear && value && (
        <span
          onClick={onClear}
          className="absolute -right-1 top-1 flex size-6 translate-x-full cursor-pointer items-center justify-center"
        >
          <Icon path={mdiCloseThick} className="size-4 text-foreground-dark" />
        </span>
      )}
    </div>
  );
}
