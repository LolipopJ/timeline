export const pascalToCamelCase = (str: string) => {
  return str.charAt(0).toLowerCase() + str.slice(1);
};

export const camelToPascalCase = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};
