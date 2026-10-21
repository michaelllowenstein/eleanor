import { expect, test } from "@playwright/test";

test(
  "fake microphone traverses a real local WebRTC connection",
  async ({ page }) => {
    await page.route(
      "**/api/auth/session",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            authenticated: false,
            user: null,
            csrfToken: "test-csrf",
          }),
        });
      },
    );

    await page.goto("/login");

    const result = await page.evaluate(async () => {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      const track = stream.getAudioTracks()[0];

      if (!track) {
        throw new Error("No audio track.");
      }

      const sender = new RTCPeerConnection();
      const receiver = new RTCPeerConnection();

      sender.addEventListener(
        "icecandidate",
        (event) => {
          if (event.candidate) {
            void receiver.addIceCandidate(event.candidate);
          }
        },
      );

      receiver.addEventListener(
        "icecandidate",
        (event) => {
          if (event.candidate) {
            void sender.addIceCandidate(event.candidate);
          }
        },
      );

      const remoteTrack =
        new Promise<MediaStreamTrack>((resolve) => {
          receiver.addEventListener(
            "track",
            (event) => resolve(event.track),
            { once: true },
          );
        });

      sender.addTrack(track, stream);

      const offer = await sender.createOffer();
      await sender.setLocalDescription(offer);
      await receiver.setRemoteDescription(offer);

      const answer = await receiver.createAnswer();
      await receiver.setLocalDescription(answer);
      await sender.setRemoteDescription(answer);

      const received = await remoteTrack;

      const result = {
        localKind: track.kind,
        remoteKind: received.kind,
      };

      sender.close();
      receiver.close();

      stream
        .getTracks()
        .forEach((item) => item.stop());

      return result;
    });

    expect(result.localKind).toBe("audio");
    expect(result.remoteKind).toBe("audio");
  },
);
