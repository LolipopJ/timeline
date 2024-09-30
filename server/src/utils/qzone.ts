import type { AxiosError, AxiosRequestConfig } from "axios";
import fs from "fs";
import path from "path";

import {
  SEC_CH_UA_DESKTOP,
  SERVER_TEMPORARY_DIR,
  USER_AGENT_DESKTOP,
} from "../constants";
import type { CookieParam } from "./axios";
import axios, { parseSetCookieToCookie } from "./axios";
import { checkupDir } from "./file";

const AXIOS_HEADERS_QZONE: AxiosRequestConfig["headers"] = {
  authority: "user.qzone.qq.com",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "sec-ch-ua": SEC_CH_UA_DESKTOP,
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
  "user-agent": USER_AGENT_DESKTOP,
};

//#region Step 1: 调用生成登录二维码的接口，获取二维码的签名，并将得到的二维码保存到本地
export const getQZoneQRCodeFilePath = (qqNumber: string) => {
  return path.resolve(
    SERVER_TEMPORARY_DIR,
    "qzone",
    `${qqNumber}-login-qr-code.png`,
  );
};

export const generateQZoneLoginQRCode = async (qqNumber: string) => {
  try {
    const response = await axios.get(
      "https://ssl.ptlogin2.qq.com/ptqrshow?appid=549000912&e=2&l=M&s=3&d=72&v=4&t=0.798645184914162&daid=5&pt_3rd_aid=0",
      { headers: AXIOS_HEADERS_QZONE, responseType: "arraybuffer" },
    );

    const savePath = getQZoneQRCodeFilePath(qqNumber);
    checkupDir(path.dirname(savePath));
    fs.writeFileSync(savePath, response.data, { encoding: "utf-8" });

    const qrsig = response.headers["set-cookie"]
      ?.map((item) => parseSetCookieToCookie(item))
      .find((cookie) => cookie.name === "qrsig")?.value;
    if (!qrsig)
      throw new Error("Get `qrsig` from show QR code response failed.");

    return qrsig;
  } catch (error) {
    console.error(`Generate QQ Zone login QR code failed:`, String(error));
    return undefined;
  }
};
//#endregion

//#region Step 2: 轮询二维码扫描结果接口，将鉴权需要的 Cookies 保存到本地
const getPtqrToken = (qrSig: string) => {
  let ptqrToken = 0;

  for (let i = 0; i < qrSig.length; i += 1) {
    ptqrToken += (ptqrToken << 5) + qrSig.charCodeAt(i);
  }

  return 2147483647 & ptqrToken;
};

const getQZoneCookiesFilePath = (qqNumber: string) => {
  return path.resolve(
    SERVER_TEMPORARY_DIR,
    "qzone",
    `${qqNumber}-cookies.json`,
  );
};

const getQZoneLoginQRCodeScanResult = async (
  qqNumber: string,
  qrsig: string,
) => {
  try {
    const ptqrToken = getPtqrToken(qrsig);
    const qrsigCookie = `qrsig=${qrsig}`;
    const response = await axios.get(
      `https://ssl.ptlogin2.qq.com/ptqrlogin?u1=https%3A%2F%2Fqzs.qq.com%2Fqzone%2Fv5%2Floginsucc.html%3Fpara%3Dizone&ptqrtoken=${ptqrToken}&ptredirect=0&h=1&t=1&g=1&from_ui=1&ptlang=2052&action=0-0-${new Date().getTime()}&js_ver=24091915&js_type=1&login_sig=&pt_uistyle=40&aid=549000912&daid=5&`,
      {
        headers: {
          ...AXIOS_HEADERS_QZONE,
          Cookie: qrsigCookie,
        },
      },
    );
    const responseText = response.data as string;

    if (responseText.includes("登录成功")) {
      console.log(
        `QQ Zone login QR code is scanned and confirm logged. ${responseText}`,
      );
      const cookies = response.headers["set-cookie"]?.map((item) =>
        parseSetCookieToCookie(item),
      );
      if (!cookies)
        throw new Error("Parse cookies from QR code login response failed.");

      const uin = cookies.find((cookie) => cookie.name === "uin")?.value;
      if (!uin) throw new Error("Get uin from cookies failed.");

      const ptsigxRegex = /ptsigx=(.*?)&/;
      const ptsigx = ptsigxRegex.exec(responseText)?.[1];
      if (!ptsigx) throw new Error("Get ptsigx from response failed.");

      try {
        const checkSigUrl = `https://ptlogin2.qzone.qq.com/check_sig?pttype=1&uin=${uin}&service=ptqrlogin&nodirect=0&ptsigx=${ptsigx}&s_url=https%3A%2F%2Fqzs.qq.com%2Fqzone%2Fv5%2Floginsucc.html%3Fpara%3Dizone&f_url=&ptlang=2052&ptredirect=100&aid=549000912&daid=5&j_later=0&low_login_hour=0&regmaster=0&pt_login_type=3&pt_aid=0&pt_aaid=16&pt_light=0&pt_3rd_aid=0`;
        await axios.get(checkSigUrl, {
          headers: {
            ...AXIOS_HEADERS_QZONE,
            Cookie: qrsigCookie,
          },
          maxRedirects: 0,
        });
      } catch (error) {
        // 验证成功后，响应为 302 状态码。提取响应包含的 Set-Cookies 即可
        const checkSigResponse = (error as AxiosError).response;
        if (!checkSigResponse || checkSigResponse.status !== 302)
          throw new Error(String(error));

        const resultCookies = checkSigResponse.headers["set-cookie"]?.map(
          (item) => parseSetCookieToCookie(item),
        );
        if (!resultCookies)
          throw new Error("Parse cookies from check sig response failed");

        const savePath = getQZoneCookiesFilePath(qqNumber);
        checkupDir(path.dirname(savePath));
        fs.writeFileSync(savePath, JSON.stringify(resultCookies, null, 2));
        console.log(
          `QQ Zone cookies are saved to \`${savePath}\` successfully!`,
        );

        return resultCookies;
      }
    } else {
      console.log(
        `Getting QQ Zone login QR code scan result... ${responseText}`,
      );
      return undefined;
    }
  } catch (error) {
    console.error(
      `Get QQ Zone login QR code scan result failed:`,
      String(error),
    );
    return undefined;
  }
};

const getQZoneLoginQRCodeScanResultIntervals: Record<string, Timer> = {};
const clearGetQZoneLoginQRCodeScanResultTimeouts: Record<string, Timer> = {};
export const pollGetQZoneLoginQRCodeScanResult = (
  qqNumber: string,
  qrsig: string,
) => {
  clearInterval(getQZoneLoginQRCodeScanResultIntervals[qqNumber]);
  clearTimeout(clearGetQZoneLoginQRCodeScanResultTimeouts[qqNumber]);

  getQZoneLoginQRCodeScanResultIntervals[qqNumber] = setInterval(async () => {
    const cookies = await getQZoneLoginQRCodeScanResult(qqNumber, qrsig);
    if (cookies)
      clearInterval(getQZoneLoginQRCodeScanResultIntervals[qqNumber]);
  }, 5000);
  clearGetQZoneLoginQRCodeScanResultTimeouts[qqNumber] = setTimeout(
    () => clearInterval(getQZoneLoginQRCodeScanResultIntervals[qqNumber]),
    1000 * 60 * 2, // 登录二维码的有效时间为 2 分钟，因此 2 分钟后结束轮询
  );
};
//#endregion

//#region Step 3: 通过 Cookies 中的值计算得到 bkn，在需要时使用
export const getQZoneCookies = (qqNumber: string) => {
  const cookiesFilePath = getQZoneCookiesFilePath(qqNumber);
  try {
    const cookiesFileContent = fs.readFileSync(cookiesFilePath).toString();
    return JSON.parse(cookiesFileContent) as CookieParam[];
  } catch (error) {
    console.error(
      `Read QQ Zone cookies from file \`${cookiesFilePath}\` failed.`,
      String(error),
    );
    return undefined;
  }
};

export const getGTk = (pSkey: string) => {
  let gTk = 5381;

  for (let i = 0; i < pSkey.length; i += 1) {
    gTk += (gTk << 5) + pSkey.charCodeAt(i);
  }

  return gTk & 2147483647;
};
//#endregion
