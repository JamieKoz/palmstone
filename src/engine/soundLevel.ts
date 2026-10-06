import { getSharedAudio } from "./audio";
import { getMuted, getMusicMuted, getSoundLevel, setSoundLevel, type SoundLevel } from "./storage";

const SOFT_SFX = 0.55;
const SOFT_MUSIC = 0.42;

export function applySoundLevel(level?: SoundLevel) {
  const resolved = level ?? resolveSoundLevel();
  const audio = getSharedAudio();

  if (resolved === "off") {
    audio.setMuted(true);
    audio.setMusicMuted(true);
    return;
  }

  audio.setMuted(false);
  audio.setMusicMuted(false);

  if (resolved === "soft") {
    audio.setGainMultipliers(SOFT_SFX, SOFT_MUSIC);
  } else {
    audio.setGainMultipliers(1, 1);
  }
}

/** Migrate legacy mute prefs into sound level on first read. */
export function resolveSoundLevel(): SoundLevel {
  const stored = getSoundLevel();
  if (stored !== null) return stored;
  if (getMuted() && getMusicMuted()) return "off";
  if (getMuted() || getMusicMuted()) return "soft";
  return "immersive";
}

export function cycleSoundLevel(): SoundLevel {
  const current = resolveSoundLevel();
  const next: SoundLevel =
    current === "off" ? "soft" : current === "soft" ? "immersive" : "off";
  setSoundLevel(next);
  applySoundLevel(next);
  return next;
}

export const SOUND_LEVEL_LABELS: Record<SoundLevel, string> = {
  off: "Off",
  soft: "Soft",
  immersive: "Immersive",
};
