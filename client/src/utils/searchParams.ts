export const getSearchParamsFromObject = (object: Record<string, unknown>) => {
  const searchParams = new URLSearchParams();

  for (const key in object) {
    if (object.hasOwnProperty(key)) {
      searchParams.append(key, String(object[key]));
    }
  }

  return searchParams.toString();
};
