import type { RealtimeChannel } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/client";
import { isDisplayGalleryImageUrl, isDisplayGalleryKind, isDisplayGalleryOverlayPosition, type DisplayGalleryItem } from "@/lib/display-gallery";
import { isPosThemeId, type PosThemeId } from "@/lib/pos-theme";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export const DISPLAY_PAIRING_STORAGE_KEY = "pos.display.pairing.v1";

export type DisplayLinkTransport = "webrtc" | "realtime" | "broadcast";
export type DisplayConnectionStatus = "connecting" | "connected" | "disconnected";

export type DisplayBranding = {
  storeName: string;
  logoUrl: string | null;
};

export type DisplayPromotion = {
  id: string;
  eyebrow: string;
  title: string;
  detail: string;
  tagline: string;
  imageUrl: string | null;
};

export type { DisplayGalleryItem } from "@/lib/display-gallery";

export type DisplaySettings = {
  showPromotions: boolean;
  showGallery: boolean;
  showMarketingGallery: boolean;
  showMenuGallery: boolean;
  showQuantity: boolean;
  showDiscount: boolean;
  showSubtotal: boolean;
  showOrderNumber: boolean;
  rotationSeconds: number;
  idleTitle: string;
  idleSubtitle: string;
  completedOrderTitle: string;
  completedOrderMessage: string;
};

export type DisplayCartLine = {
  id: string;
  name: string;
  qty: number;
  weightKg: number | null;
  lineTotal: number;
};

export type DisplayState =
  | {
      kind: "idle";
      branding: DisplayBranding;
      promotions?: DisplayPromotion[];
      gallery?: DisplayGalleryItem[];
      settings?: DisplaySettings;
      theme?: PosThemeId;
    }
  | {
      kind: "active";
      branding: DisplayBranding;
      lines: DisplayCartLine[];
      subtotal: number;
      discount: number;
      total: number;
      promotions?: DisplayPromotion[];
      gallery?: DisplayGalleryItem[];
      settings?: DisplaySettings;
      theme?: PosThemeId;
    }
  | {
      kind: "payment";
      branding: DisplayBranding;
      total: number;
      tendered: number | null;
      changeDue: number | null;
      paymentMethod: string;
      promotions?: DisplayPromotion[];
      gallery?: DisplayGalleryItem[];
      settings?: DisplaySettings;
      theme?: PosThemeId;
    }
  | {
      kind: "thankyou";
      branding: DisplayBranding;
      orderNo: string;
      changeDue: number | null;
      promotions?: DisplayPromotion[];
      gallery?: DisplayGalleryItem[];
      settings?: DisplaySettings;
      theme?: PosThemeId;
    };

type DisplayStateMessage = {
  kind: "state";
  senderId: string;
  sequence: number;
  sentAt: number;
  state: DisplayState;
};

type DisplaySignalName = "hello" | "offer" | "answer" | "candidate";

type DisplaySignalMessage = {
  kind: "signal";
  senderId: string;
  signal: DisplaySignalName;
  from: string;
  to?: string;
  role?: "publisher" | "display";
  payload?: unknown;
};

type DisplayMessage = DisplayStateMessage | DisplaySignalMessage;

type DisplayRole = "publisher" | "display";

export type DisplayLink = {
  readonly transport: DisplayLinkTransport;
  pair(token: string): Promise<void>;
  push(state: DisplayState): void;
  subscribe(listener: (state: DisplayState) => void): () => void;
  onStatus(listener: (status: DisplayConnectionStatus) => void): () => void;
  isConnected(): boolean;
  disconnect(): Promise<void>;
};

export type CreateDisplayLinkOptions = {
  token: string;
  role: DisplayRole;
  supabase?: BrowserSupabaseClient;
  onState?: (state: DisplayState) => void;
  onStatus?: (status: DisplayConnectionStatus) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

export function isDisplayPromotion(value: unknown): value is DisplayPromotion {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" &&
    typeof value.eyebrow === "string" &&
    typeof value.title === "string" &&
    typeof value.detail === "string" &&
    typeof value.tagline === "string" &&
    (value.imageUrl === null || typeof value.imageUrl === "string");
}

export function isDisplayGalleryItem(value: unknown): value is DisplayGalleryItem {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" &&
    isDisplayGalleryKind(value.kind) &&
    typeof value.title === "string" &&
    isDisplayGalleryImageUrl(value.imageUrl) &&
    isDisplayGalleryOverlayPosition(value.overlayPosition);
}

export function isDisplaySettings(value: unknown): value is DisplaySettings {
  if (!isRecord(value)) return false;
  return typeof value.showPromotions === "boolean" &&
    typeof value.showGallery === "boolean" &&
    typeof value.showMarketingGallery === "boolean" &&
    typeof value.showMenuGallery === "boolean" &&
    typeof value.showQuantity === "boolean" &&
    typeof value.showDiscount === "boolean" &&
    typeof value.showSubtotal === "boolean" &&
    typeof value.showOrderNumber === "boolean" &&
    isFiniteNumber(value.rotationSeconds) &&
    value.rotationSeconds >= 3 &&
    value.rotationSeconds <= 60 &&
    typeof value.idleTitle === "string" &&
    typeof value.idleSubtitle === "string" &&
    typeof value.completedOrderTitle === "string" &&
    typeof value.completedOrderMessage === "string";
}

function isDisplayBranding(value: unknown): value is DisplayBranding {
  if (!isRecord(value)) return false;
  return typeof value.storeName === "string" &&
    (value.logoUrl === null || typeof value.logoUrl === "string");
}

function isDisplayCartLine(value: unknown): value is DisplayCartLine {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" &&
    typeof value.name === "string" &&
    isFiniteNumber(value.qty) &&
    isNullableNumber(value.weightKg) &&
    isFiniteNumber(value.lineTotal);
}

function isDisplayPresentation(value: Record<string, unknown>) {
  return (value.promotions === undefined || (Array.isArray(value.promotions) && value.promotions.every(isDisplayPromotion))) &&
    (value.gallery === undefined || (Array.isArray(value.gallery) && value.gallery.every(isDisplayGalleryItem))) &&
    (value.settings === undefined || isDisplaySettings(value.settings)) &&
    (value.theme === undefined || isPosThemeId(value.theme));
}

export function isDisplayState(value: unknown): value is DisplayState {
  if (!isRecord(value) || !isDisplayBranding(value.branding) || typeof value.kind !== "string") return false;
  if (!isDisplayPresentation(value)) return false;
  if (value.kind === "idle") return true;
  if (value.kind === "active") {
    return Array.isArray(value.lines) &&
      value.lines.every(isDisplayCartLine) &&
      isFiniteNumber(value.subtotal) &&
      isFiniteNumber(value.discount) &&
      isFiniteNumber(value.total);
  }
  if (value.kind === "payment") {
    return isFiniteNumber(value.total) &&
      isNullableNumber(value.tendered) &&
      isNullableNumber(value.changeDue) &&
      typeof value.paymentMethod === "string";
  }
  if (value.kind === "thankyou") {
    return typeof value.orderNo === "string" && isNullableNumber(value.changeDue);
  }
  return false;
}

function isDisplayMessage(value: unknown): value is DisplayMessage {
  if (!isRecord(value) || typeof value.kind !== "string" || typeof value.senderId !== "string") return false;
  if (value.kind === "state") {
    return Number.isInteger(value.sequence) &&
      isFiniteNumber(value.sentAt) &&
      isDisplayState(value.state);
  }
  if (value.kind === "signal") {
    return typeof value.from === "string" &&
      (value.signal === "hello" || value.signal === "offer" || value.signal === "answer" || value.signal === "candidate");
  }
  return false;
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeDisplayPairingToken(value: string | null | undefined) {
  const token = value?.trim() ?? "";
  return /^[a-zA-Z0-9_-]{8,128}$/.test(token) ? token : null;
}

export function generateDisplayPairingToken() {
  return createId().replace(/-/g, "").slice(0, 24);
}

export function loadDisplayPairingToken() {
  if (typeof window === "undefined") return null;
  try {
    return normalizeDisplayPairingToken(window.localStorage.getItem(DISPLAY_PAIRING_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveDisplayPairingToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(DISPLAY_PAIRING_STORAGE_KEY, token);
    else window.localStorage.removeItem(DISPLAY_PAIRING_STORAGE_KEY);
  } catch {
    // Pairing remains best-effort on browsers that block local storage.
  }
}

export function displayPairingUrl(token: string, origin?: string) {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/display?pair=${encodeURIComponent(token)}`;
}

class DisplayLinkImpl implements DisplayLink {
  private token: string;
  private readonly role: DisplayRole;
  private readonly supabase?: BrowserSupabaseClient;
  private readonly senderId = createId();
  private readonly stateListeners = new Set<(state: DisplayState) => void>();
  private readonly statusListeners = new Set<(status: DisplayConnectionStatus) => void>();
  private readonly seenSequences = new Map<string, number>();
  private broadcastChannel: BroadcastChannel | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private realtimeConnected = false;
  private broadcastConnected = false;
  private status: DisplayConnectionStatus = "connecting";
  private lastState: DisplayState | null = null;
  private sequence = 0;
  private peer: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private peerId: string | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private closed = false;

  constructor(options: CreateDisplayLinkOptions) {
    this.token = normalizeDisplayPairingToken(options.token) ?? "";
    this.role = options.role;
    this.supabase = options.supabase;
    if (options.onState) this.stateListeners.add(options.onState);
    if (options.onStatus) this.statusListeners.add(options.onStatus);
  }

  get transport(): DisplayLinkTransport {
    if (this.dataChannel?.readyState === "open") return "webrtc";
    if (this.realtimeConnected) return "realtime";
    return "broadcast";
  }

  async pair(token: string) {
    await this.disconnect();
    this.closed = false;
    this.token = normalizeDisplayPairingToken(token) ?? "";
    await this.start();
  }

  subscribe(listener: (state: DisplayState) => void) {
    this.stateListeners.add(listener);
    if (this.lastState) listener(this.lastState);
    return () => this.stateListeners.delete(listener);
  }

  onStatus(listener: (status: DisplayConnectionStatus) => void) {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  isConnected() {
    return this.status === "connected";
  }

  push(state: DisplayState) {
    if (this.closed || !isDisplayState(state)) return;
    const message: DisplayStateMessage = {
      kind: "state",
      senderId: this.senderId,
      sequence: ++this.sequence,
      sentAt: Date.now(),
      state,
    };
    this.lastState = state;
    this.sendMessage(message);
    this.sendDataChannel(message);
  }

  async disconnect() {
    this.closed = true;
    this.closePeer();
    this.broadcastChannel?.close();
    this.broadcastChannel = null;
    this.broadcastConnected = false;
    if (this.realtimeChannel && this.supabase) {
      await this.supabase.removeChannel(this.realtimeChannel);
    }
    this.realtimeChannel = null;
    this.realtimeConnected = false;
    this.setStatus("disconnected");
  }

  async start() {
    if (typeof window === "undefined" || !this.token || this.closed) {
      this.setStatus("disconnected");
      return;
    }

    this.setupBroadcastChannel();
    if (this.supabase) this.setupRealtimeChannel();
    if (!this.broadcastChannel && !this.supabase) this.setStatus("disconnected");
  }

  private setupBroadcastChannel() {
    if (typeof BroadcastChannel === "undefined") return;
    try {
      const channel = new BroadcastChannel(`dumala-display:${this.token}`);
      channel.onmessage = (event) => this.handleMessage(event.data);
      this.broadcastChannel = channel;
      this.broadcastConnected = true;
      this.setStatus("connected");
      this.sendSignal({ signal: "hello", role: this.role });
    } catch {
      this.broadcastChannel = null;
    }
  }

  private setupRealtimeChannel() {
    if (!this.supabase) return;
    const channel = this.supabase.channel(`display:${this.token}`, {
      config: { broadcast: { ack: false, self: false } },
    });
    channel.on("broadcast", { event: "display" }, ({ payload }) => this.handleMessage(payload));
    this.realtimeChannel = channel;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        this.realtimeConnected = true;
        this.setStatus("connected");
        this.sendSignal({ signal: "hello", role: this.role });
        this.sendLastState();
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        this.realtimeConnected = false;
        if (!this.broadcastConnected) this.setStatus("disconnected");
      }
    });
  }

  private setStatus(status: DisplayConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }

  private sendMessage(message: DisplayMessage) {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(message);
      } catch {
        // The realtime channel remains available if BroadcastChannel closes.
      }
    }
    if (this.realtimeChannel && this.realtimeConnected) {
      void this.realtimeChannel.send({ type: "broadcast", event: "display", payload: message });
    }
  }

  private sendSignal({ signal, role, payload }: { signal: DisplaySignalName; role?: DisplayRole; payload?: unknown }) {
    const message: DisplaySignalMessage = {
      kind: "signal",
      senderId: this.senderId,
      signal,
      from: this.senderId,
      role,
      payload,
    };
    this.sendMessage(message);
  }

  private sendDataChannel(message: DisplayMessage) {
    if (this.dataChannel?.readyState !== "open") return;
    try {
      this.dataChannel.send(JSON.stringify(message));
    } catch {
      // State is already sent through the fallback transports.
    }
  }

  private handleMessage(value: unknown) {
    if (!isDisplayMessage(value) || value.senderId === this.senderId) return;
    if (value.kind === "state") {
      const lastSequence = this.seenSequences.get(value.senderId) ?? 0;
      if (value.sequence <= lastSequence) return;
      this.seenSequences.set(value.senderId, value.sequence);
      this.lastState = value.state;
      for (const listener of this.stateListeners) listener(value.state);
      return;
    }
    if (value.to && value.to !== this.senderId) return;
    void this.handleSignal(value).catch(() => {
      this.closePeer();
      if (!this.realtimeConnected && !this.broadcastConnected) this.setStatus("disconnected");
    });
  }

  private async handleSignal(message: DisplaySignalMessage) {
    if (message.signal === "hello") {
      if (this.role === "publisher" && message.role === "display") {
        if (this.peerId !== message.from) this.closePeer();
        this.peerId = message.from;
        await this.createOffer(message.from);
        this.sendLastState();
      }
      return;
    }

    if (message.signal === "offer" && this.role === "display") {
      const peer = this.ensurePeer(message.from);
      const offer = this.readSessionDescription(message.payload);
      if (!offer) return;
      await peer.setRemoteDescription(offer);
      await this.flushPendingCandidates(peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      this.sendSignalTo(message.from, "answer", this.sessionDescriptionPayload(peer.localDescription));
      return;
    }

    if (message.signal === "answer" && this.role === "publisher") {
      const peer = this.peer;
      const answer = this.readSessionDescription(message.payload);
      if (!peer || !answer) return;
      await peer.setRemoteDescription(answer);
      await this.flushPendingCandidates(peer);
      return;
    }

    if (message.signal === "candidate") {
      const candidate = this.readCandidate(message.payload);
      if (!candidate) return;
      const peer = this.ensurePeer(message.from);
      if (peer.remoteDescription) await peer.addIceCandidate(candidate);
      else this.pendingCandidates.push(candidate);
    }
  }

  private sendSignalTo(to: string, signal: DisplaySignalName, payload?: unknown) {
    const message: DisplaySignalMessage = {
      kind: "signal",
      senderId: this.senderId,
      signal,
      from: this.senderId,
      to,
      payload,
    };
    this.sendMessage(message);
  }

  private ensurePeer(remoteId: string) {
    if (this.peer && this.peerId === remoteId) return this.peer;
    this.closePeer();
    this.peerId = remoteId;
    if (typeof RTCPeerConnection === "undefined") throw new Error("WebRTC is not supported in this browser.");

    const peer = new RTCPeerConnection({ iceServers: [] });
    peer.onicecandidate = (event) => {
      if (event.candidate) this.sendSignalTo(remoteId, "candidate", event.candidate.toJSON());
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") this.setStatus("connected");
      if (peer.connectionState === "failed" || peer.connectionState === "closed") {
        this.dataChannel = null;
        if (!this.realtimeConnected && !this.broadcastConnected) this.setStatus("disconnected");
      }
    };
    if (this.role === "publisher") {
      this.bindDataChannel(peer.createDataChannel("display-state"));
    } else {
      peer.ondatachannel = (event) => this.bindDataChannel(event.channel);
    }
    this.peer = peer;
    return peer;
  }

  private async createOffer(remoteId: string) {
    try {
      const peer = this.ensurePeer(remoteId);
      if (peer.signalingState !== "stable") return;
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      this.sendSignalTo(remoteId, "offer", this.sessionDescriptionPayload(peer.localDescription));
    } catch {
      this.closePeer();
      if (!this.realtimeConnected && !this.broadcastConnected) this.setStatus("disconnected");
    }
  }

  private sendLastState() {
    if (this.lastState) this.push(this.lastState);
  }

  private bindDataChannel(channel: RTCDataChannel) {
    this.dataChannel = channel;
    channel.onopen = () => {
      this.setStatus("connected");
      if (this.lastState) {
        const message: DisplayStateMessage = {
          kind: "state",
          senderId: this.senderId,
          sequence: ++this.sequence,
          sentAt: Date.now(),
          state: this.lastState,
        };
        this.sendDataChannel(message);
      }
    };
    channel.onmessage = (event) => {
      try {
        const value: unknown = JSON.parse(String(event.data));
        this.handleMessage(value);
      } catch {
        // Ignore malformed data from a stale or incompatible display.
      }
    };
    channel.onclose = () => {
      if (this.dataChannel === channel) this.dataChannel = null;
    };
  }

  private async flushPendingCandidates(peer: RTCPeerConnection) {
    const pending = this.pendingCandidates.splice(0);
    for (const candidate of pending) await peer.addIceCandidate(candidate);
  }

  private closePeer() {
    this.dataChannel?.close();
    this.dataChannel = null;
    this.peer?.close();
    this.peer = null;
    this.peerId = null;
    this.pendingCandidates = [];
  }

  private sessionDescriptionPayload(description: RTCSessionDescription | null) {
    return description ? { type: description.type, sdp: description.sdp } : null;
  }

  private readSessionDescription(value: unknown): RTCSessionDescriptionInit | null {
    if (!isRecord(value) || (value.type !== "offer" && value.type !== "answer") || typeof value.sdp !== "string") return null;
    return { type: value.type, sdp: value.sdp };
  }

  private readCandidate(value: unknown): RTCIceCandidateInit | null {
    if (!isRecord(value) || typeof value.candidate !== "string") return null;
    return {
      candidate: value.candidate,
      sdpMid: typeof value.sdpMid === "string" ? value.sdpMid : null,
      sdpMLineIndex: typeof value.sdpMLineIndex === "number" ? value.sdpMLineIndex : null,
      usernameFragment: typeof value.usernameFragment === "string" ? value.usernameFragment : null,
    };
  }
}

export function createDisplayLink(options: CreateDisplayLinkOptions): DisplayLink {
  const link = new DisplayLinkImpl(options);
  void link.start();
  return link;
}
