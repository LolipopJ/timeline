export const getDateLocaleString = (date: Date) => {
  const today = new Date();
  const inputDate = new Date(date);

  today.setHours(0, 0, 0, 0);
  inputDate.setHours(0, 0, 0, 0);

  const timeDiff = today.getTime() - inputDate.getTime();
  const daysDiff = timeDiff / 86400000;

  if (daysDiff <= 7) {
    return `${
      [
        "今天",
        "昨天",
        "前天",
        "三天前",
        "四天前",
        "五天前",
        "六天前",
        "七天前",
      ][daysDiff]
    } ${date.toLocaleTimeString()}`;
  }

  return date.toLocaleString();
};
