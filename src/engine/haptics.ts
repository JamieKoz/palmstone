import type { HapticsBus } from "./types";

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** [major, minor] from an iPhone/iPad OS token such as `OS 18_4`. */
function iosVersion(): [number, number] | null {
  if (typeof navigator === "undefined") return null;
  const match = navigator.userAgent.match(/(?:iPhone|CPU) OS (\d+)[_.](\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

/**
 * iOS 26.5 stopped buzzing when script clicks a switch. A real finger on the
 * switch still ticks, so the play surface uses that path.
 */
export function needsDirectIosSurface() {
  const version = iosVersion();
  if (!version) return false;
  return version[0] > 26 || (version[0] === 26 && version[1] >= 5);
}

let switchLabel: HTMLLabelElement | null = null;
let lastIosTick = 0;

function tickIosSwitch() {
  if (typeof document === "undefined") return;
  const now = performance.now();
  if (now - lastIosTick < 70) return;
  lastIosTick = now;
  if (!switchLabel) {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.position = "fixed";
    label.style.width = "1px";
    label.style.height = "1px";
    label.style.overflow = "hidden";
    label.style.opacity = "0";
    label.style.pointerEvents = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.append(input);
    (document.body ?? document.documentElement).append(label);
    switchLabel = label;
  }
  switchLabel.click();
}

/** One pulse. Android uses the Vibration API. iPhone toggles a system switch. */
export function fireHaptic(pattern: number | number[] = 12) {
  if (typeof navigator === "undefined") return;
  if (isIOS()) {
    tickIosSwitch();
    return;
  }
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* unsupported */
  }
}

export function createHapticsBus(initialEnabled = true): HapticsBus {
  let enabled = initialEnabled;

  return {
    setEnabled(v: boolean) {
      enabled = v;
    },
    isEnabled() {
      return enabled;
    },
    tap(ms = 12) {
      if (!enabled) return;
      fireHaptic(ms);
    },
    pattern(pattern: number[]) {
      if (!enabled) return;
      fireHaptic(pattern);
    },
  };
}

/**
 * Cover the play area with a native switch so iOS 26.5+ can tick. Pointers are
 * copied onto the canvas so dragging still reaches the experience.
 */
export function attachDirectIosSurface(host: HTMLElement, canvas: HTMLCanvasElement) {
  if (!needsDirectIosSurface()) return () => {};

  const label = document.createElement("label");
  label.className = "ios-haptic-surface";
  label.setAttribute("aria-hidden", "true");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  label.append(input);
  host.append(label);

  const forward = (event: PointerEvent) => {
    if (event.target !== input) return;
    canvas.dispatchEvent(
      new PointerEvent(event.type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        button: event.button,
        buttons: event.buttons,
        isPrimary: event.isPrimary,
        pressure: event.pressure,
      }),
    );
  };

  input.addEventListener("pointerdown", forward);
  input.addEventListener("pointermove", forward);
  input.addEventListener("focus", () => input.blur());

  return () => {
    input.removeEventListener("pointerdown", forward);
    input.removeEventListener("pointermove", forward);
    label.remove();
  };
}
