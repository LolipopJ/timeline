import axios from "axios";
import type { CookieParam } from "puppeteer";

import { USER_AGENT_DESKTOP } from "../constants";
import { camelToPascalCase, pascalToCamelCase } from "./string";

export const instance = axios.create({
  timeout: 3000,
  withCredentials: true,
  headers: {
    "User-Agent": USER_AGENT_DESKTOP,
  },
});

export const parseSetCookieToCookie = (setCookie: string) => {
  const cookie: CookieParam = {
    name: "",
    value: "",
  };
  setCookie.split(";").forEach((item, index) => {
    const [key, value] = item.split("=");
    const parsedKey = key.trim();
    const parsedValue = value?.trim();

    if (index === 0) {
      cookie.name = parsedKey;
      cookie.value = value;
    } else {
      if (parsedKey) {
        // @ts-expect-error: parsed key would be one of the CookieParam keys
        cookie[pascalToCamelCase(parsedKey)] = parsedValue ?? true;
      }
    }
  });
  return cookie;
};

export const parseCookieToSetCookie = (cookie: CookieParam) => {
  const { name: cookieName, value: cookieValue, ...rest } = cookie;
  return `${cookieName}=${cookieValue};${Object.entries(rest)
    .map(
      ([key, value]) =>
        `${camelToPascalCase(key)}${value === true ? "" : `=${value}`}`,
    )
    .join(";")};`;
};

export default instance;
