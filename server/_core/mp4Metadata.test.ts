/** 覆盖视频与音频轨道区分、64 位时长以及损坏容器的有界解析。 */
import { expect, it } from "vitest";
import { inspectMp4 } from "./mp4Metadata";
function box(type: string, body: Buffer) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(body.length + 8);
  header.write(type, 4);
  return Buffer.concat([header, body]);
}
function track(
  width: number,
  height: number,
  version: number,
  mediaFrames = 124
) {
  const header = Buffer.alloc(version === 0 ? 84 : 96);
  header[0] = version;
  header.writeUInt32BE(width * 65536, header.length - 8);
  header.writeUInt32BE(height * 65536, header.length - 4);
  if (version === 0) header.writeUInt32BE(5167, 20);
  else header.writeBigUInt64BE(BigInt(5167), 28);
  const timing = Buffer.alloc(version === 1 ? 36 : 24);
  timing[0] = version;
  timing.writeUInt32BE(24, version === 1 ? 20 : 12);
  if (version === 1) timing.writeBigUInt64BE(BigInt(mediaFrames), 24);
  else timing.writeUInt32BE(mediaFrames, 16);
  return box(
    "trak",
    Buffer.concat([box("tkhd", header), box("mdia", box("mdhd", timing))])
  );
}
it("reads the video track and skips audio tracks for both time header versions", () => {
  for (const version of [0, 1]) {
    const buffer = Buffer.concat([
      box("ftyp", Buffer.from("isom0000")),
      box(
        "moov",
        Buffer.concat([track(0, 0, version), track(640, 360, version)])
      ),
    ]);
    expect(inspectMp4(buffer)).toEqual({
      width: 640,
      height: 360,
      durationSeconds: 124 / 24,
      sizeBytes: buffer.length,
    });
  }
});
it("does not read outside truncated or oversized boxes", () => {
  for (const data of [
    Buffer.alloc(0),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from([
      0, 0, 0, 1, 109, 111, 111, 118, 255, 255, 255, 255, 255, 255, 255, 255,
    ]),
  ])
    expect(inspectMp4(data)).toEqual({
      width: null,
      height: null,
      durationSeconds: null,
      sizeBytes: data.length,
    });
});
it("uses presentation time instead of counting encoder pre-roll frames in media time", () => {
  for (const version of [0, 1]) {
    const movieHeader = Buffer.alloc(version === 0 ? 100 : 112);
    movieHeader[0] = version;
    movieHeader.writeUInt32BE(1000, version === 0 ? 12 : 20);
    const data = box(
      "moov",
      Buffer.concat([box("mvhd", movieHeader), track(640, 640, version, 125)])
    );
    expect(inspectMp4(data).durationSeconds).toBe(5.167);
  }
});
