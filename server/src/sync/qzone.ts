import type { SyncServiceQzoneTalk } from "../../../interfaces/server";
import { SEC_CH_UA_DESKTOP, USER_AGENT_DESKTOP } from "../constants";
import {
  getSyncTaskLastExecuteTime,
  insertOrUpdateTimelineItems,
} from "../database/controller/timeline-item";
import axios from "../utils/axios";
import { getGTk, getQZoneCookies } from "../utils/qzone";

interface QZoneInfo {
  logininfo: {
    /** 用户名 */
    name: string;
    /** QQ 号 */
    uin: number;
  };
  /** 说说列表 */
  msglist: QZoneTalk[];
  /** 说说总数 */
  total: number;
}

interface QZoneTalk {
  /** 评论列表 */
  commentlist?: QZoneTalkComment[];
  /** 说说内容 */
  content: string;
  /** 创建时间(s) */
  created_time: number;
  /** 上次修改时间(s)。默认值为 0 */
  lastmodify: number;
  /** 定位信息 */
  lbs: {
    name: string;
    pos_x: string;
    pos_y: string;
  };
  name: string;
  /** 说说附件 */
  pic?: QZoneTalkPic[];
  /** 是否私密 */
  secret: 0 | 1;
  /** 说说 ID */
  tid: string;
  uin: number;
}

interface QZoneTalkComment
  extends Pick<QZoneTalk, "content" | "created_time" | "name" | "tid" | "uin"> {
  /** 二级评论列表 */
  list_3?: Pick<
    QZoneTalk,
    "content" | "created_time" | "name" | "tid" | "uin"
  >[];
  /** 评论附件 */
  rich_info?: { burl: string }[];
}

interface QZoneTalkPic {
  height: number;
  width: number;
  /** 图片地址或视频封面地址 */
  url1: string;
  is_video?: 1;
  video_info?: {
    cover_height: number;
    cover_width: number;
    /** 视频封面链接 */
    url1: string;
    /** 视频链接 */
    url3: string;
    /** ms */
    video_time: string;
  };
}

export const syncQQZoneTalks = async (service: SyncServiceQzoneTalk) => {
  const { id, type, from, secret, qqNumber } = service;

  const cookies = getQZoneCookies(qqNumber);
  if (!cookies?.length) {
    console.error(
      "Sync QQ Zone talks failed: cookies are not exist. Visit `/qzone-login`, scan QR code and confirm login to refresh cookies.",
    );
    return;
  }

  const [skey, p_uin, pt4_token, p_skey] = [
    cookies.find((cookie) => cookie.name === "skey")?.value,
    cookies.find((cookie) => cookie.name === "p_uin")?.value,
    cookies.find((cookie) => cookie.name === "pt4_token")?.value,
    cookies.find((cookie) => cookie.name === "p_skey")?.value,
  ];
  if (!skey || !p_uin || !pt4_token || !p_skey) {
    console.error(
      "Sync QQ Zone talks failed: cookies are not valid. Visit `/qzone-login`, scan QR code and confirm login to refresh cookies.",
    );
    return;
  }
  const g_tk = getGTk(p_skey);

  const lastExecuteDate = await getSyncTaskLastExecuteTime({
    id,
    from,
  });
  const lastExecuteDateTime = lastExecuteDate.getTime();
  console.log(
    `Syncing QQ Zone talks for ${qqNumber} since ${lastExecuteDate.toISOString()}...`,
  );

  const talks: QZoneTalk[] = [];
  let page = 0;
  const pageSize = 30;
  let queryFinished = false;
  while (!queryFinished) {
    const offset = page * pageSize;
    const getQZoneInfoResponse = await axios.get(
      "https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6",
      {
        params: {
          uin: qqNumber,
          ftype: "0",
          sort: "0",
          pos: offset,
          num: pageSize,
          replynum: "100",
          g_tk,
          callback: "_preloadCallback",
          code_version: "1",
          format: "jsonp",
          need_private_comment: "1",
        },
        headers: {
          accept: "*/*",
          "accept-language": "en-US,en;q=0.9",
          cookie: `uin=${p_uin};skey=${skey};p_uin=${p_uin};pt4_token=${pt4_token};p_skey=${p_skey}`,
          priority: "u=1, i",
          referer: `https://user.qzone.qq.com/${qqNumber}/main`,
          "sec-ch-ua": SEC_CH_UA_DESKTOP,
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "user-agent": USER_AGENT_DESKTOP,
        },
      },
    );
    const qZoneInfoRawText = (getQZoneInfoResponse.data as string).replace(
      /^_preloadCallback\((.*?)\);?$/,
      "$1",
    );
    const qZoneInfo = JSON.parse(qZoneInfoRawText) as QZoneInfo;

    // const savePath = path.resolve(
    //   SERVER_TEMPORARY_DIR,
    //   "qzone",
    //   `${qqNumber}-talks-p${page}`,
    // );
    // checkupDir(path.dirname(savePath));
    // fs.writeFileSync(savePath, JSON.stringify(qZoneInfo, null, 2));

    const filteredTalks = qZoneInfo.msglist.filter(
      (talk) =>
        (talk.lastmodify || talk.created_time) * 1000 > lastExecuteDateTime,
    );
    talks.push(...filteredTalks);

    if (filteredTalks.length > 0) {
      page += 1;
    } else {
      queryFinished = true;
    }
  }
  console.log(`Synced ${talks.length} QQ Zone talks for ${qqNumber}.`);

  await insertOrUpdateTimelineItems(
    talks.map((talk) => ({
      sync_service_id: id,
      sync_service_type: type,
      content_id: talk.tid,
      content: talk.content,
      attachments: talk.pic?.map((item) => {
        const isVideo = !!item.is_video;
        const url =
          isVideo && item.video_info ? item.video_info.url3 : item.url1;
        return {
          filename: url,
          url,
        };
      }),
      metadata: JSON.stringify(talk),
      is_secret: secret || talk.secret !== 0,
      created_at: new Date(talk.created_time * 1000),
      updated_at: new Date((talk.lastmodify || talk.created_time) * 1000),
    })),
  );
  console.log(
    `Insert or update ${talks.length} timeline items of QQ Zone talks for ${qqNumber} successfully!`,
  );
};
