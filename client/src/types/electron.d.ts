export interface EleanorDesktopBridge {
  platform: 'win32' | 'darwin' | 'linux';
  isDesktop: true;
  versions: {
    electron: string;
    chrome: string;
    node: string;
  };
}

export interface Window {
  eleanor?: EleanorDesktopBridge;
}
