/**
 * lib/emotion/index.ts — Barrel for the Emotion-Responsive UI subsystem.
 */
export {
  EmotionDetectionService,
  getEmotionDetectionService,
  ALL_EMOTIONS,
  scoreSentiment,
  scoreEmoji,
} from "./EmotionDetectionService";
export type {
  Emotion,
  EmotionEstimate,
  EmotionFeatures,
  EmotionDetectionOptions,
  Unsubscribe,
  Listener,
} from "./EmotionDetectionService";

export {
  AdaptiveThemeEngine,
  getAdaptiveThemeEngine,
  paletteFor,
  initialRootCss,
  PALETTES,
} from "./AdaptiveThemeEngine";
export type {
  EmotionPalette,
  AdaptiveThemeEngineOptions,
  ThemeSource,
} from "./AdaptiveThemeEngine";

export {
  MicroAnimationLibrary,
  getMicroAnimationLibrary,
  specFor,
  biasFor,
} from "./MicroAnimationLibrary";
export type {
  AnimationPrimitive,
  AnimationIntent,
  KeyframeSpec,
  MicroAnimationOptions,
} from "./MicroAnimationLibrary";
