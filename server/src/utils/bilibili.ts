import fs from "fs";
import md5 from "md5";
import path from "path";

import { SERVER_TEMPORARY_DIR, USER_AGENT_DESKTOP } from "../constants";
import axios from "./axios";
import { checkupDir } from "./file";

const BILIBILI_SESSDATA_FILE_PATH = path.resolve(
  SERVER_TEMPORARY_DIR,
  "bilibili",
  "SESSDATA.txt",
);

export const saveBilibiliSessionData = (SESSDATA: string) => {
  checkupDir(path.dirname(BILIBILI_SESSDATA_FILE_PATH));
  fs.writeFileSync(BILIBILI_SESSDATA_FILE_PATH, SESSDATA);
};

const readBilibiliSessionData = () => {
  try {
    return fs.readFileSync(BILIBILI_SESSDATA_FILE_PATH).toString();
  } catch (error) {
    console.error(
      `Read Bilibili SESSDATA from file \`${BILIBILI_SESSDATA_FILE_PATH}\` failed.`,
      String(error),
    );
    return undefined;
  }
};

/**
 * 获取请求 Bilibili 部分接口所需的 WBI 签名
 * 相关文档：https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/misc/sign/wbi.md
 * 实现参考：https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/misc/sign/wbi.md#JavaScript
 * TODO: 验证是否可用
 */
export const getBilibiliApiSignedQueryParams = async (
  origQueryParams: Record<string, unknown>,
) => {
  const SESSDATA = readBilibiliSessionData();
  if (!SESSDATA) {
    throw new Error(
      `Query Bilibili APIs failed: SESSDATA is not exist. Visit \`/set?bilibiliSessdata=\${SESSDATA}\` to update SESSDATA.`,
    );
  }

  let getWbiKeysRes;
  try {
    getWbiKeysRes = await axios.get(
      "https://api.bilibili.com/x/web-interface/nav",
      {
        headers: {
          Cookie: `SESSDATA=${SESSDATA}`,
          "User-Agent": USER_AGENT_DESKTOP,
          Referer: "https://www.bilibili.com/",
        },
      },
    );
  } catch (error) {
    throw new Error(
      `Query Bilibili APIs failed: SESSDATA is not valid. Visit \`/set?bilibiliSessdata=\${SESSDATA}\` to update SESSDATA.\n${String(error)}`,
    );
  }

  const {
    data: {
      wbi_img: { img_url, sub_url },
    },
  } = getWbiKeysRes.data;
  const { img_key, sub_key } = {
    img_key: img_url.slice(
      img_url.lastIndexOf("/") + 1,
      img_url.lastIndexOf("."),
    ),
    sub_key: sub_url.slice(
      sub_url.lastIndexOf("/") + 1,
      sub_url.lastIndexOf("."),
    ),
  };

  const mixinKeyOrig = img_key + sub_key;
  const mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
  ];
  const mixin_key = mixinKeyEncTab
    .map((n) => mixinKeyOrig[n])
    .join("")
    .slice(0, 32);

  const queryParams: Record<string, string> = {
    ...origQueryParams,
    wts: String(Math.round(Date.now() / 1000)),
  };
  const queryString = Object.keys(queryParams)
    .sort()
    .map((key) => {
      // 过滤 value 中的 "!'()*" 字符
      const value = String(queryParams[key]).replace(/[!'()*]/g, "");
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join("&");
  const wbi_sign = md5(queryString + mixin_key);
  const queryStringWithSign = queryString + "&w_rid=" + wbi_sign;

  queryStringWithSign.split("&").forEach((queryString) => {
    const [key, value] = queryString.split("=");
    if (key === "w_rid") {
      queryParams[key] = value;
    }
  });

  return queryParams;
};
