import pathToFfmpeg from "ffmpeg-static";
import Ffmpeg from "fluent-ffmpeg";

import { createPromiseQueue } from "./promise";

if (pathToFfmpeg) {
  Ffmpeg.setFfmpegPath(pathToFfmpeg);
}

const addToConvertQueue = createPromiseQueue();

export const convertVideoToM3u8 = (
  videoFilePath: string,
  outputFilePath: string = "",
  {
    onStart,
    onEnd,
    onError,
  }: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: Error) => void;
  } = {},
) => {
  const _outputFilePath = outputFilePath.endsWith(".m3u8")
    ? outputFilePath
    : `${outputFilePath || videoFilePath}.m3u8`;

  // 将 ffmpeg 转换任务添加到串行任务队列中依次执行，
  // 避免在小内存机器上出现强制中断的问题
  addToConvertQueue(
    () =>
      new Promise((resolve, reject) => {
        Ffmpeg(videoFilePath)
          .outputFormat("hls")
          .outputOptions(["-hls_list_size 0", "-hls_allow_cache 1"])
          .output(_outputFilePath)
          .on("start", () => {
            if (onStart) {
              onStart();
            } else {
              console.log(
                `Start to convert mp4 file \`${videoFilePath}\` to m3u8 file \`${_outputFilePath}\`...`,
              );
            }
          })
          .on("end", () => {
            if (onEnd) {
              onEnd();
            } else {
              console.log(
                `Convert mp4 file \`${videoFilePath}\` to m3u8 file \`${_outputFilePath}\` successfully!`,
              );
            }
            resolve();
          })
          .on("error", (error) => {
            if (onError) {
              onError(error);
            } else {
              console.error(
                `Convert mp4 file \`${videoFilePath}\` to m3u8 file \`${_outputFilePath}\` failed.`,
                String(error),
              );
            }
            reject(error);
          })
          .run();
      }),
  );
};
