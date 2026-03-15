export function wavDurationSeconds(buffer: Buffer): number | null {
  if (buffer.length < 44) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;

  let offset = 12;
  let byteRate: number | null = null;
  let dataSize: number | null = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;

    if (chunkId === "fmt ") {
      if (dataStart + 12 > buffer.length) break;
      byteRate = buffer.readUInt32LE(dataStart + 8);
    } else if (chunkId === "data") {
      dataSize = chunkSize;
    }

    offset = dataStart + chunkSize;
    if (chunkSize % 2 === 1) offset += 1; // word alignment padding

    if (byteRate && dataSize !== null) break;
  }

  if (!byteRate || byteRate <= 0 || dataSize === null) return null;
  return dataSize / byteRate;
}

