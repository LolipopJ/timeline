import pathToFfmpeg from "ffmpeg-static";
import Ffmpeg from "fluent-ffmpeg";

if (pathToFfmpeg) {
  Ffmpeg.setFfmpegPath(pathToFfmpeg);
}

export const convertVideoToM3u8 = (
  videoFilePath: string,
  outputFilePath: string = "",
  {
    onEnd,
    onError,
  }: { onEnd?: () => void; onError?: (error: Error) => void } = {},
) => {
  const _outputFilePath = outputFilePath.endsWith(".m3u8")
    ? outputFilePath
    : `${outputFilePath || videoFilePath}.m3u8`;

  Ffmpeg(videoFilePath)
    .outputFormat("hls")
    .outputOptions(["-hls_list_size 0", "-hls_time 3"])
    .output(_outputFilePath)
    .on("end", () => {
      if (onEnd) {
        onEnd();
      } else {
        console.log(
          `Convert mp4 file \`${videoFilePath}\` to m3u8 file \`${_outputFilePath}\` successfully!`,
        );
      }
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
    })
    .run();
};
