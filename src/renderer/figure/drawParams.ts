import type { Param } from '@/renderer/figure/FigureData';
import { formatFigure } from '@/renderer/figure/formatFigure';

/** The controls for a figure's params; each change reports the param's new value. */
export function drawParams(parent: HTMLElement, params: readonly Param[], values: ReadonlyMap<string, unknown>, change: (key: string, value: unknown) => void): void {
  for (const param of params) {
    const value = values.has(param.key) ? values.get(param.key) : param.value;
    if (param.kind === 'slider') {
      const el = parent.appendChild(createEl('label'));
      el.className = 'clew-slider';
      const row = el.appendChild(createSpan());
      row.className = 'clew-control-row';
      row.appendChild(createSpan()).textContent = param.label;
      const out = row.appendChild(createEl('output'));
      const input = el.appendChild(createEl('input'));
      input.type = 'range';
      input.min = String(param.min);
      input.max = String(param.max);
      input.step = String(param.step);
      const show = (shown: number): void => {
        out.textContent = `${formatFigure(shown)}${param.unit ? ` ${param.unit}` : ''}`;
        input.style.setProperty('--clew-progress', `${((shown - param.min) / (param.max - param.min)) * 100}%`);
      };
      input.value = String(value);
      show(Number(input.value));
      input.addEventListener('input', () => {
        show(Number(input.value));
        change(param.key, Number(input.value));
      });
    } else if (param.kind === 'choice') {
      const el = parent.appendChild(createDiv());
      el.className = 'clew-choice';
      const name = el.appendChild(createSpan());
      name.className = 'clew-control-row';
      name.textContent = param.label;
      const group = el.appendChild(createDiv());
      group.className = 'clew-choice-options';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', param.label);
      const buttons = param.options.map((option) => {
        const button = group.appendChild(createEl('button'));
        button.type = 'button';
        button.className = 'clew-choice-option';
        button.textContent = formatFigure(option);
        button.addEventListener('click', () => {
          press(option);
          change(param.key, option);
        });
        return button;
      });
      const press = (chosen: unknown): void => buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(param.options[i] === chosen)));
      press(value);
    } else {
      const el = parent.appendChild(createEl('label'));
      el.className = 'clew-text-input';
      const name = el.appendChild(createSpan());
      name.className = 'clew-control-row';
      name.textContent = param.label;
      const input = el.appendChild(createEl('input'));
      input.type = 'text';
      input.spellcheck = false;
      input.autocomplete = 'off';
      input.value = String(value);
      input.addEventListener('input', () => change(param.key, input.value));
    }
  }
}
