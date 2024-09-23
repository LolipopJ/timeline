import axios from "axios";

import clientConfig from "../../../configs/client";

export const instance = axios.create({
  timeout: 3000,
  withCredentials: true,
  ...clientConfig.server,
});

export const fetcherGET = (url: string) =>
  instance.get(url).then((res) => res.data);

export const fetcherPOST = (url: string) =>
  instance.post(url).then((res) => res.data);

export default instance;
