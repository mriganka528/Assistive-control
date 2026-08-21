// Renderer-side global augmentation for the preload bridge.
import type { ElectronAPI } from "../../shared/ipc";

declare global {
  interface Window {
    // Optional: undefined if the preload bridge failed to load (defensive).
    electronAPI?: ElectronAPI;
  }
}

export {};
