import type { SignalSample } from "./types";

export class BaselineRecorder {
  private samples: SignalSample[] = [];
  private startTime: number | null = null;
  private durationMs = 10000;

  start(durationMs = 10000) {
    this.samples = [];
    this.startTime = performance.now();
    this.durationMs = durationMs;
  }

  addSample(signals: Record<string, number>) {
    if (this.startTime === null) return;

    this.samples.push({
      timestamp: performance.now(),
      signals: { ...signals },
    });
  }

  isRecording() {
    if (this.startTime === null) return false;

    return performance.now() - this.startTime < this.durationMs;
  }

  getProgress() {
    if (this.startTime === null) return 0;

    return Math.min(
      (performance.now() - this.startTime) / this.durationMs,
      1
    );
  }

  getSamples() {
    return [...this.samples];
  }

  stop() {
    const result = [...this.samples];
    this.startTime = null;
    return result;
  }

  reset() {
    this.samples = [];
    this.startTime = null;
  }
}

export class MovementRecorder {
  private samples: SignalSample[] = [];
  private recording = false;

  start() {
    this.samples = [];
    this.recording = true;
  }

  addSample(signals: Record<string, number>) {
    if (!this.recording) return;

    this.samples.push({
      timestamp: performance.now(),
      signals: { ...signals },
    });
  }

  stop() {
    this.recording = false;
    return [...this.samples];
  }

  isRecording() {
    return this.recording;
  }

  getSamples() {
    return [...this.samples];
  }

  reset() {
    this.samples = [];
    this.recording = false;
  }
}
