import { TIMELINE_VIEW_HEADER } from "@timeline/contracts";
import axios from "axios";

import clientConfig from "@/config";

export const AUTH_EXPIRED_EVENT = "auth-expired";

const notifyAuthExpired = () => {
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
};

export const instance = axios.create({
  timeout: 3000,
  withCredentials: true,
  baseURL: clientConfig.apiBaseURL,
});

instance.interceptors.response.use(
  (response) => {
    if (response.headers[TIMELINE_VIEW_HEADER] === "public") {
      notifyAuthExpired();
    }
    return response;
  },
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      notifyAuthExpired();
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
