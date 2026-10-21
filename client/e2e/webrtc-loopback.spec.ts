import { expect, test } from "@playwright/test";

import { mockApi } from "./support/mock-api";

/**
 * Proves the browser media path works (fake microphone -> RTCPeerConnection ->
 * remote track) without contacting the realtime provider.
 */
test("fake microphone audio traverses a local WebRTC connection", async ({ page }) => {
  await mockApi(page, { authenticated: false });
  await page.goto("/login");

  const result = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error("No audio track.");

    const sender = new RTCPeerConnection();
    const receiver = new RTCPeerConnection();
    sender.onicecandidate = (e) => e.candidate && void receiver.addIceCandidate(e.candidate);
    receiver.onicecandidate = (e) => e.candidate && void sender.addIceCandidate(e.candidate);

    const remote = new Promise<MediaStreamTrack>((resolve) =>
      receiver.addEventListener("track", (e) => resolve(e.track), { once: true }),
    );

    sender.addTrack(track, stream);
    const offer = await sender.createOffer();
    await sender.setLocalDescription(offer);
    await receiver.setRemoteDescription(offer);
    const answer = await receiver.createAnswer();
    await receiver.setLocalDescription(answer);
    await sender.setRemoteDescription(answer);

    const received = await remote;
    const out = { local: track.kind, remote: received.kind };
    sender.close();
    receiver.close();
    stream.getTracks().forEach((t) => t.stop());
    return out;
  });

  expect(result).toEqual({ local: "audio", remote: "audio" });
});
