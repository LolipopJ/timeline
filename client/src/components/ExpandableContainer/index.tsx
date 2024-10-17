import { mdiArrowDownThick } from "@mdi/js";
import Icon from "@mdi/react";
import { useEffect, useRef, useState } from "react";

export interface ExpandableContainerProps
  extends React.PropsWithChildren,
    React.HTMLAttributes<HTMLDivElement> {
  expandableHeightThresholdRatio: number;
}

export default function ExpandableContainer(props: ExpandableContainerProps) {
  const {
    children,
    expandableHeightThresholdRatio,
    className,
    style,
    ...rest
  } = props;
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const [expandable, setExpandable] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const showExpandButton = expandable && !expanded;

  useEffect(() => {
    const containerDom = containerRef.current;

    if (!expanded && !expandable && containerDom) {
      const expandableHeightThreshold =
        window.innerHeight * expandableHeightThresholdRatio;
      const domHeightObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const entryHeight = entry.contentRect.height;
          if (entryHeight > expandableHeightThreshold) {
            setExpandable(true);
            setMaxHeight(expandableHeightThreshold);
            domHeightObserver.unobserve(containerDom);
          }
        }
      });
      domHeightObserver.observe(containerDom);
      return () => domHeightObserver.unobserve(containerDom);
    }
  }, [expandable, expandableHeightThresholdRatio, expanded]);

  const onExpand = () => {
    setMaxHeight(undefined);
    setExpanded(true);
  };

  return (
    <div
      ref={containerRef}
      className={`${className} relative overflow-hidden`}
      style={{ ...style, maxHeight }}
      {...rest}
    >
      {children}
      {showExpandButton && (
        <div
          className="hover:text-foreground-light absolute inset-x-0 bottom-0 flex cursor-pointer items-center justify-center py-2.5 transition-colors lg:py-3"
          style={{
            background:
              "linear-gradient(rgb(10 10 10 / 0.3), rgb(10 10 10 / 0.9))",
          }}
          onClick={onExpand}
        >
          <Icon path={mdiArrowDownThick} className="size-5 lg:size-6" />
        </div>
      )}
    </div>
  );
}
