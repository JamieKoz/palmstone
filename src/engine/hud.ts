type HudHandle = {
  el: HTMLDivElement;
  button(label: string, onClick: () => void, opts?: { active?: () => boolean }): HTMLButtonElement;
  toggle(
    labelOn: string,
    labelOff: string,
    initial: boolean,
    onChange: (on: boolean) => void,
  ): { set(on: boolean): void; el: HTMLButtonElement };
  slider(
    label: string,
    min: number,
    max: number,
    value: number,
    onChange: (v: number) => void,
  ): { set(v: number): void; el: HTMLDivElement };
  destroy(): void;
};

/** Quiet in-experience HUD anchored bottom-left of the play host. */
export function createHud(host: HTMLElement): HudHandle {
  const el = document.createElement("div");
  el.className = "experience-hud";
  host.appendChild(el);

  return {
    el,
    button(label, onClick, opts) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "experience-hud__btn";
      btn.textContent = label;
      btn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
      });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        onClick();
        if (opts?.active) {
          btn.classList.toggle("is-active", opts.active());
        }
      });
      if (opts?.active) btn.classList.toggle("is-active", opts.active());
      el.appendChild(btn);
      return btn;
    },
    toggle(labelOn, labelOff, initial, onChange) {
      let on = initial;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "experience-hud__btn";
      const sync = () => {
        btn.textContent = on ? labelOn : labelOff;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      };
      sync();
      btn.addEventListener("pointerdown", (e) => e.stopPropagation());
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        on = !on;
        sync();
        onChange(on);
      });
      el.appendChild(btn);
      return {
        set(v: boolean) {
          on = v;
          sync();
        },
        el: btn,
      };
    },
    slider(label, min, max, value, onChange) {
      const wrap = document.createElement("div");
      wrap.className = "experience-hud__slider";
      const lab = document.createElement("span");
      lab.textContent = label;
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.step = "0.01";
      input.value = String(value);
      input.setAttribute("aria-label", label);
      input.addEventListener("pointerdown", (e) => e.stopPropagation());
      input.addEventListener("pointermove", (e) => e.stopPropagation());
      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("input", () => onChange(Number(input.value)));
      wrap.appendChild(lab);
      wrap.appendChild(input);
      el.appendChild(wrap);
      return {
        set(v: number) {
          input.value = String(v);
        },
        el: wrap,
      };
    },
    destroy() {
      el.remove();
    },
  };
}
