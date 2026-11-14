/**
 * Browser twin of api/src/modules/realtime/sdp.ts: the media layout of an SDP
 * blob with no addresses, ICE credentials or fingerprints.
 */
export interface SdpShape {
  readonly bytes: number;
  readonly session: string;
  readonly media: readonly string[];
  readonly directions: readonly string[];
  readonly audioCodecs: readonly string[];
  readonly candidates: number;
  readonly hasDataChannel: boolean;
}

export function summarizeSdp(sdp: string | undefined | null): SdpShape {
  const text = sdp ?? "";
  const media: string[] = [];
  const directions: string[] = [];
  const codecs = new Set<string>();
  let session = "";
  let candidates = 0;

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("s=") && !session) session = line.slice(2).trim().slice(0, 40);
    else if (line.startsWith("m=")) {
      media.push(line.slice(2).split(" ")[0] ?? "?");
      directions.push("-");
    } else if (/^a=(sendrecv|sendonly|recvonly|inactive)$/.test(line) && directions.length) {
      directions[directions.length - 1] = line.slice(2);
    } else if (line.startsWith("a=candidate:")) candidates += 1;
    else if (line.startsWith("a=rtpmap:") && codecs.size < 6) {
      const codec = line.split(" ")[1]?.split("/")[0];
      if (codec) codecs.add(codec.toLowerCase());
    }
  }

  return {
    bytes: new TextEncoder().encode(text).byteLength,
    session,
    media,
    directions,
    audioCodecs: [...codecs],
    candidates,
    hasDataChannel: media.includes("application"),
  };
}
