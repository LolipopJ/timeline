import { createRef, useState } from "react";
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

export default function TimelineCurrentDate({
  month,
  isLoading,
}: {
  month?: string;
  isLoading: boolean;
}) {
  const [displayedMonth, setDisplayedMonth] = useState(month);
  if (!isLoading && displayedMonth !== month) setDisplayedMonth(month);

  const [monthRefs] = useState(() =>
    MONTHS.map(() => createRef<HTMLSpanElement>()),
  );
  const [year, number] = (displayedMonth ?? "").split("-");
  const index = Number(number) - 1;
  const details = MONTHS[index];
  const monthRef = monthRefs[index];

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
          <span
            aria-hidden="true"
            className="block text-sm font-bold text-foreground lg:text-2xl"
          >
            {Array.from(year, (digit) => YEAR_DIGITS[Number(digit)]).join("")}
          </span>
          <TransitionGroup
            component="span"
            aria-hidden="true"
            className="grid overflow-clip"
          >
            <CSSTransition
              key={number}
              nodeRef={monthRef}
              classNames="fade-y"
              timeout={300}
            >
              <span
                ref={monthRef}
                className={`col-start-1 row-start-1 text-xl font-black motion-reduce:transition-none lg:text-4xl motion-reduce:[&.fade-y-exit]:hidden ${details[1]}`}
              >
                {details[0]}
              </span>
            </CSSTransition>
          </TransitionGroup>
        </time>
      )}
    </div>
  );
}
