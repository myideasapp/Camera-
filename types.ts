export interface TimeFrame {
  id: string;
  timestamp: number;
  imageData: string; // Base64 data URL
}

export enum PlaybackState {
  LIVE = 'LIVE',
  PAUSED = 'PAUSED', // Viewing history (Time Travel)
}

export interface AnalysisResult {
  text: string;
  timestamp: number;
}
