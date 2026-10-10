/** What an audio file holds. `decode` is injected (AudioContext.decodeAudioData in the editor). */
export type AudioInfo = { duration: number; channels: number; sampleRate: number };
export type Decoder = (
  bytes: ArrayBuffer,
) => Promise<{ duration: number; numberOfChannels: number; sampleRate: number }>;

/** Probes duration/channels by decoding; the decoded buffer is discarded (plan P5.2 step 2). */
export async function probeAudio(bytes: Uint8Array, decode: Decoder): Promise<AudioInfo> {
  const copy = bytes.slice().buffer as ArrayBuffer;
  const b = await decode(copy);
  return { duration: b.duration, channels: b.numberOfChannels, sampleRate: b.sampleRate };
}
