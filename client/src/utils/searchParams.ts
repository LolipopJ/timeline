export const getSearchParamsFromObject = (object: Record<string, unknown>) => {
  const searchParams = new URLSearchParams();

  for (const key in object) {
    if (Object.hasOwn(object, key) && object[key] !== undefined) {
      searchParams.append(key, String(object[key]));
    }
  }

  return searchParams.toString();
};
