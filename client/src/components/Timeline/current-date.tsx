interface TimelineCurrentDateProps {
  date: Date;
  className?: string;
}

const NUMBER_ZH = ["〇", "壹", "貳", "叁", "肆", "伍", "陸", "柒", "捌", "玖"];
const MONTH_ZH = [
  "冬至元月",
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

const getYearZh = (year: number) => {
  return Array.from(String(year))
    .map((str) => NUMBER_ZH[Number(str)])
    .join("");
};

const getMonthZh = (month: number) => MONTH_ZH[month];

export function TimelineCurrentDate(props: TimelineCurrentDateProps) {
  const { date, className = "" } = props;

  const yearZh = getYearZh(date.getFullYear());
  const monthZh = getMonthZh(date.getMonth());

  return (
    <div
      className={`fixed hidden -translate-x-full select-none pr-4 lg:block ${className}`}
    >
      <div className="text-xl font-bold">{yearZh}</div>
      <div className="text-primary text-3xl font-black">{monthZh}</div>
    </div>
  );
}
