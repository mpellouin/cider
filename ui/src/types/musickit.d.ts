/**
 * Minimal ambient typings for MusicKit JS v3.
 * Only the surface Cider actually touches is typed; everything else is `any`.
 */

declare namespace MusicKit {
  interface MKConfig {
    developerToken: string;
    app: { name: string; build: string; version?: string };
    sourceType?: number;
    suppressErrorDialog?: boolean;
    bitrate?: number;
  }

  interface Artwork {
    url: string;
    width?: number;
    height?: number;
    bgColor?: string;
    textColor1?: string;
  }

  interface MediaItemAttributes {
    name: string;
    artistName?: string;
    albumName?: string;
    artwork?: Artwork;
    durationInMillis?: number;
    playParams?: Record<string, any>;
    url?: string;
    releaseDate?: string;
    genreNames?: string[];
    trackNumber?: number;
    contentRating?: string;
    [key: string]: any;
  }

  interface MediaItem {
    id: string;
    type: string;
    container?: { id: string; type?: string };
    attributes: MediaItemAttributes;
    relationships?: Record<string, any>;
    [key: string]: any;
  }

  interface Queue {
    items: MediaItem[];
    position: number;
    length: number;
    [key: string]: any;
  }

  interface API {
    music(
      path: string,
      params?: Record<string, any>,
      options?: Record<string, any>
    ): Promise<{ data: any }>;
  }

  interface MusicKitInstance {
    api: API;
    isAuthorized: boolean;
    developerToken: string;
    musicUserToken?: string;
    storefrontId: string;
    storefrontCountryCode?: string;
    queue: Queue;
    nowPlayingItem?: MediaItem;
    nowPlayingItemIndex?: number;
    playbackState: number;
    currentPlaybackTime: number;
    currentPlaybackDuration: number;
    currentPlaybackProgress: number;
    isPlaying: boolean;
    volume: number;
    repeatMode: number;
    shuffleMode: number;
    autoplayEnabled?: boolean;
    previewOnly?: boolean;

    authorize(): Promise<string | void>;
    unauthorize(): Promise<void>;
    setQueue(options: Record<string, any>): Promise<Queue | void>;
    playLater(options: Record<string, any>): Promise<void>;
    playNext(options: Record<string, any>): Promise<void>;
    changeToMediaAtIndex(index: number): Promise<void>;
    changeToMediaItem(item: MediaItem | string): Promise<void>;
    clearQueue(): Promise<void>;
    play(): Promise<void>;
    pause(): Promise<void>;
    stop(): Promise<void>;
    skipToNextItem(): Promise<void>;
    skipToPreviousItem(): Promise<void>;
    seekToTime(seconds: number): Promise<void>;
    addEventListener(event: string, cb: (...args: any[]) => void): void;
    removeEventListener(event: string, cb: (...args: any[]) => void): void;
  }

  const Events: Record<string, string>;
  const PlaybackStates: Record<string, number>;

  function configure(config: MKConfig): Promise<MusicKitInstance>;
  function getInstance(): MusicKitInstance;
  function formatArtworkURL(artwork: Artwork, width?: number, height?: number): string;
}

interface Window {
  MusicKit: typeof MusicKit;
  __CIDER_AUTH_STUB__?: {
    closed: boolean;
    close: () => void;
    focus: () => void;
    postMessage: () => void;
    location: Record<string, unknown>;
  };
}
