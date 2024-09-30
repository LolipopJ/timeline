import axios from "axios";

import { USER_AGENT_DESKTOP } from "../constants";
import { camelToPascalCase, pascalToCamelCase } from "./string";

export interface CookieParam {
  /**
   * Cookie name.
   */
  name: string;
  /**
   * Cookie value.
   */
  value: string;
  /**
   * The request-URI to associate with the setting of the cookie. This value can affect
   * the default domain, path, and source scheme values of the created cookie.
   */
  url?: string;
  /**
   * Cookie domain.
   */
  domain?: string;
  /**
   * Cookie path.
   */
  path?: string;
  /**
   * True if cookie is secure.
   */
  secure?: boolean;
  /**
   * True if cookie is http-only.
   */
  httpOnly?: boolean;
  /**
   * Cookie SameSite type.
   */
  sameSite?: "Strict" | "Lax" | "None";
  /**
   * Cookie expiration date, session cookie if not set
   */
  expires?: number;
  /**
   * Cookie Priority. Supported only in Chrome.
   */
  priority?: "Low" | "Medium" | "High";
  /**
   * True if cookie is SameParty. Supported only in Chrome.
   */
  sameParty?: boolean;
  /**
   * Cookie source scheme type. Supported only in Chrome.
   */
  sourceScheme?: "Unset" | "NonSecure" | "Secure";
  /**
   * Cookie partition key. In Chrome, it matches the top-level site the
   * partitioned cookie is available in. In Firefox, it matches the
   * source origin
   * (https://w3c.github.io/webdriver-bidi/#type-storage-PartitionKey).
   */
  partitionKey?: string;
}

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
