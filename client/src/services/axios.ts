import axios from "axios";

import clientConfig from "../../../configs/client";

export const AUTH_EXPIRED_EVENT = "auth-expired";

export const instance = axios.create({
  timeout: 3000,
  withCredentials: true,
  ...clientConfig.server,
});

instance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  },
);

export const fetcherGET = (url: string) =>
  instance.get(url).then((res) => res.data);

export const fetcherPOST = (url: string, data?: unknown) =>
  instance.post(url, data).then((res) => res.data);

export const fetcherPATCH = (url: string, data?: unknown) =>
  instance.patch(url, data).then((res) => res.data);

export const fetcherDELETE = (url: string) =>
  instance.delete(url).then((res) => res.data);

export default instance;
