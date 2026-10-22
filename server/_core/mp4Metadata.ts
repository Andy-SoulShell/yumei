/** 从 MP4 视频轨道读取尺寸和时长，不执行外部解码器或信任文件名。 */
type Box = { type: string; start: number; end: number };
function boxes(data: Buffer, start: number, end: number) {
  const result: Box[] = [];
  while (start + 8 <= end && result.length < 10000) {
    let size = data.readUInt32BE(start);
    let header = 8;
    if (size === 1) {
      if (start + 16 > end) break;
      size = Number(data.readBigUInt64BE(start + 8));
      header = 16;
    } else if (size === 0) size = end - start;
    if (!Number.isSafeInteger(size) || size < header || start + size > end)
      break;
    result.push({
      type: data.toString("ascii", start + 4, start + 8),
      start: start + header,
      end: start + size,
    });
    start += size;
  }
  return result;
}

/** 返回视频轨道的显示尺寸和实际时长；缺失或不完整的元数据返回 null。 */
export function inspectMp4(data: Buffer): {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  sizeBytes: number;
} {
  const empty = {
    width: null,
    height: null,
    durationSeconds: null,
    sizeBytes: data.length,
  };
  const movie = boxes(data, 0, data.length).find(box => box.type === "moov");
  if (!movie) return empty;
  const movieChildren = boxes(data, movie.start, movie.end);
  const clock = movieChildren.find(box => box.type === "mvhd");
  const clockOffset =
    clock &&
    (data[clock.start] === 0 ? 12 : data[clock.start] === 1 ? 20 : null);
  const movieScale =
    clock &&
    clockOffset !== null &&
    clockOffset !== undefined &&
    clock.start + clockOffset + 4 <= clock.end
      ? data.readUInt32BE(clock.start + clockOffset)
      : 0;
  for (const track of movieChildren.filter(box => box.type === "trak")) {
    const children = boxes(data, track.start, track.end);
    const header = children.find(box => box.type === "tkhd");
    if (!header || header.end - header.start < 84) continue;
    const trackVersion = data[header.start];
    if (
      trackVersion !== 0 &&
      (trackVersion !== 1 || header.end - header.start < 96)
    )
      continue;
    const width = data.readUInt32BE(header.end - 8) / 65536;
    const height = data.readUInt32BE(header.end - 4) / 65536;
    if (width <= 0 || height <= 0) continue;
    const media = children.find(box => box.type === "mdia");
    const timing =
      media &&
      boxes(data, media.start, media.end).find(box => box.type === "mdhd");
    let durationSeconds: number | null = null;
    if (timing && timing.end - timing.start >= 24) {
      const version = data[timing.start];
      if (version === 0 || (version === 1 && timing.end - timing.start >= 36)) {
        const scale = data.readUInt32BE(
          timing.start + (version === 0 ? 12 : 20)
        );
        const duration =
          version === 0
            ? data.readUInt32BE(timing.start + 16)
            : Number(data.readBigUInt64BE(timing.start + 24));
        if (scale > 0 && duration > 0 && Number.isSafeInteger(duration))
          durationSeconds = duration / scale;
      }
    }
    // tkhd 使用容器播放时钟，已包含编辑与编码重排偏移；mdhd 可能包含不可见的预滚帧。
    const presented =
      trackVersion === 0
        ? data.readUInt32BE(header.start + 20)
        : Number(data.readBigUInt64BE(header.start + 28));
    if (movieScale > 0 && presented > 0 && Number.isSafeInteger(presented))
      durationSeconds = presented / movieScale;
    return { width, height, durationSeconds, sizeBytes: data.length };
  }
  return empty;
}
