import { FIGMA_VOICE_WAVEFORM_BAR, FIGMA_VOICE_WAVEFORM_ROW } from './figmaVoiceClasses';

const BAR_HEIGHTS = [0.5, 1, 0.7, 0.9, 0.6];

/** Mini waveform khi đang nói — khớp Figma VoicePage ParticipantTile */
export default function VoiceSpeakingWaveform({ color = 'var(--success)' }) {
  return (
    <div className={FIGMA_VOICE_WAVEFORM_ROW} aria-hidden>
      {BAR_HEIGHTS.map((h, i) => (
        <div
          key={i}
          className={FIGMA_VOICE_WAVEFORM_BAR}
          style={{
            height: `${h * 16}px`,
            backgroundColor: color,
            animation: `vh-voice-wave ${0.3 + i * 0.08}s ease infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}
