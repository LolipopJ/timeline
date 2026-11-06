import type { ComponentProps } from "react";
import { useRef, useState } from "react";
import { CSSTransition, TransitionGroup } from "react-transition-group";

const YEAR_DIGITS = [
  "〇",
  "壹",
  "貳",
  "叁",
  "肆",
  "伍",
  "陸",
  "柒",
  "捌",
  "玖",
];
const MONTHS = [
  ["寒至元月", "text-neutral-100 paper:text-stone-700"],
  ["融冬二月", "text-lime-100 paper:text-lime-800"],
  ["陽春三月", "text-lime-300 paper:text-lime-900"],
  ["春和四月", "text-green-300 paper:text-green-800"],
  ["暖春五月", "text-emerald-200 paper:text-emerald-800"],
  ["初夏六月", "text-teal-300 paper:text-teal-800"],
  ["暑至七月", "text-cyan-300 paper:text-cyan-800"],
  ["風清八月", "text-sky-300 paper:text-sky-800"],
  ["秋高九月", "text-orange-200 paper:text-orange-800"],
  ["金秋十月", "text-amber-300 paper:text-amber-800"],
  ["悲秋十一", "text-amber-100 paper:text-amber-900"],
  ["歲末十二", "text-yellow-50 paper:text-yellow-900"],
];

function DateFlipText({
  className,
  children,
  ...transition
}: Pick<
  ComponentProps<typeof CSSTransition<HTMLSpanElement>>,
  "in" | "onExited"
> & {
  className: string;
  children: string;
}) {
  const nodeRef = useRef<HTMLSpanElement>(null);
  return (
    <CSSTransition
      {...transition}
      nodeRef={nodeRef}
      classNames="fade-y"
      timeout={150}
    >
      <span ref={nodeRef} className={`col-start-1 row-start-1 ${className}`}>
        {children}
      </span>
    </CSSTransition>
  );
}

export default function TimelineCurrentDate({
  month,
  isLoading,
}: {
  month?: string;
  isLoading: boolean;
}) {
  const [displayedMonth, setDisplayedMonth] = useState(month);
  if (!isLoading && displayedMonth !== month) setDisplayedMonth(month);

  const [year, number] = (displayedMonth ?? "").split("-");
  const details = MONTHS[Number(number) - 1];
  const yearLabel = Array.from(
    year,
    (digit) => YEAR_DIGITS[Number(digit)],
  ).join("");

  return (
    <div
      role="group"
      aria-label="当前阅读年月"
      className="min-w-16 shrink-0 whitespace-nowrap select-none"
    >
      {displayedMonth && details && (
        <time dateTime={displayedMonth} className="block">
          <span className="sr-only">
            {year} 年 {number} 月
          </span>
          <TransitionGroup
            component="span"
            aria-hidden="true"
            className="grid overflow-clip"
          >
            <DateFlipText
              key={year}
              className="text-sm font-bold text-foreground lg:text-2xl"
            >
              {yearLabel}
            </DateFlipText>
          </TransitionGroup>
          <TransitionGroup
            component="span"
            aria-hidden="true"
            className="grid overflow-clip"
          >
            <DateFlipText
              key={displayedMonth}
              className={`text-xl font-black lg:text-4xl ${details[1]}`}
            >
              {details[0]}
            </DateFlipText>
          </TransitionGroup>
        </time>
      )}
    </div>
  );
}
