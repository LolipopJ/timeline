import { useRef } from "react";
import { CSSTransition, SwitchTransition } from "react-transition-group";

interface TimelineCurrentDateProps {
  date: Date;
  className?: string;
}

const NUMBER_ZH = ["〇", "壹", "貳", "叁", "肆", "伍", "陸", "柒", "捌", "玖"];
const MONTH_ZH = [
  "寒至元月",
  "暖冬二月",
  "陽春三月",
  "春和四月",
  "暖春五月",
  "初夏六月",
  "暑至七月",
  "風清八月",
  "秋高九月",
  "金秋十月",
  "寒秋十一",
  "歲末十二",
];
const MONTH_COLOR = [
  "text-neutral-100",
  "text-lime-100",
  "text-lime-300",
  "text-green-300",
  "text-emerald-200",
  "text-teal-300",
  "text-cyan-300",
  "text-sky-300",
  "text-orange-200",
  "text-amber-300",
  "text-amber-100",
  "text-yellow-50",
];

const getYearZh = (year: number) => {
  return Array.from(String(year))
    .map((str) => NUMBER_ZH[Number(str)])
    .join("");
};

export function TimelineCurrentDate(props: TimelineCurrentDateProps) {
  const { date, className = "" } = props;
  const monthNodeRef = useRef<HTMLDivElement>(null);

  const fullYear = date.getFullYear();
  const month = date.getMonth();

  const yearZh = getYearZh(fullYear);
  const monthZh = MONTH_ZH[month];
  const monthColor = MONTH_COLOR[month];

  return (
    <div className={`select-none ${className}`}>
      <div className="text-lg font-bold md:text-xl">{yearZh}</div>
      <SwitchTransition>
        <CSSTransition
          key={month}
          nodeRef={monthNodeRef}
          addEndListener={(done) => {
            monthNodeRef?.current?.addEventListener(
              "transitionend",
              done,
              false,
            );
          }}
          classNames="fade-y"
        >
          <div
            ref={monthNodeRef}
            className={`${monthColor} text-2xl font-black md:text-3xl`}
          >
            {monthZh}
          </div>
        </CSSTransition>
      </SwitchTransition>
    </div>
  );
}
