import type {
  RealtimeServerEvent,
} from "../schema/models/realtime";
import type {
  RealtimeTransport,
  RealtimeTransportHandlers,
} from './realtime';

/**
 * The production transport: WebRTC to the OpenAI Realtime API.
 * Moved unchanged in behaviour from RealtimeVoiceService.
 */
export class WebRTCRealtimeTransport implements RealtimeTransport {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
 
  async connect(
    microphone: MediaStream,
    exchangeSdp: (offer: string) => Promise<string>,
    handlers: RealtimeTransportHandlers,
  ): Promise<void> {
    const peerConnection = new RTCPeerConnection();
    this.peerConnection = peerConnection;
 
    peerConnection.addEventListener("track", (event: RTCTrackEvent) => {
      handlers.onRemoteAudio(event.streams[0] ?? new MediaStream([event.track]));
    });
 
    for (const track of microphone.getAudioTracks()) {
      peerConnection.addTrack(track, microphone);
    }
 
    const dataChannel = peerConnection.createDataChannel("oai-events");
    this.dataChannel = dataChannel;
 
    dataChannel.addEventListener("open", () => handlers.onChannelOpen());
 
    dataChannel.addEventListener("message", (event: MessageEvent<string>) => {
      let parsed: RealtimeServerEvent;
 
      try {
        parsed = JSON.parse(event.data) as RealtimeServerEvent;
      } catch {
        console.warn("Ignoring malformed realtime event:", event.data);
        return;
      }
 
      handlers.onEvent(parsed);
    });
 
    dataChannel.addEventListener("error", (event) => {
      console.error("Realtime data channel error:", event);
    });
 
    peerConnection.addEventListener("connectionstatechange", () => {
      const connectionState = peerConnection.connectionState;
 
      switch (connectionState) {
        case "connected":
        case "failed":
        case "closed":
          handlers.onConnectionState(connectionState);
          break;
 
        default:
          break;
      }
    });
 
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
 
    if (!offer.sdp) {
      throw new Error("Browser failed to create a WebRTC SDP offer.");
    }
 
    const answerSdp = await exchangeSdp(offer.sdp);
 
    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: answerSdp,
    });
  }
 
  isOpen(): boolean {
    return this.dataChannel?.readyState === "open";
  }
 
  send(event: object): void {
    if (this.isOpen()) {
      this.dataChannel!.send(JSON.stringify(event));
    }
  }
 
  close(): void {
    this.dataChannel?.close();
    this.peerConnection?.close();
 
    this.dataChannel = null;
    this.peerConnection = null;
  }
}