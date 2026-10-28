import type { SkillOption } from '@/agents/types';

/** Names that start with the query first, then those that only contain it or match in the description. */
export function filterSkills(skills: SkillOption[], query: string): SkillOption[] {
  const needle = query.toLowerCase();
  const rank = (skill: SkillOption): number => {
    const name = skill.name.toLowerCase();
    if (name.startsWith(needle)) return 0;
    if (name.includes(needle)) return 1;
    return skill.description.toLowerCase().includes(needle) ? 2 : 3;
  };
  return skills
    .filter((skill) => rank(skill) < 3)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The list above the input while a skill name (or a file name, after `@`) is typed; the input keeps focus and forwards the arrow keys. */
export class SkillMenu<T extends SkillOption = SkillOption> {
  private readonly el: HTMLElement;
  private items: T[] = [];
  private active = 0;

  constructor(
    container: HTMLElement,
    private readonly onPick: (item: T) => void,
    label = 'Skills',
  ) {
    this.el = container.createDiv({ cls: 'clew-skill-menu', attr: { role: 'listbox', 'aria-label': label } });
    this.el.hide();
  }

  get isOpen(): boolean {
    return this.el.isShown();
  }

  show(items: T[], query: string, prefix: string): void {
    this.items = items;
    this.el.empty();
    if (items.length === 0) {
      this.hide();
      return;
    }
    items.forEach((skill, index) => {
      const row = this.el.createDiv({ cls: 'clew-skill-option', attr: { role: 'option' } });
      const name = row.createSpan({ cls: 'clew-skill-name', text: prefix });
      const at = query ? skill.name.toLowerCase().indexOf(query.toLowerCase()) : -1;
      if (at < 0) {
        name.appendText(skill.name);
      } else {
        name.appendText(skill.name.slice(0, at));
        name.createSpan({ cls: 'clew-skill-match', text: skill.name.slice(at, at + query.length) });
        name.appendText(skill.name.slice(at + query.length));
      }
      if (skill.argumentHint) name.createSpan({ cls: 'clew-skill-hint', text: ` ${skill.argumentHint}` });
      row.createDiv({ cls: 'clew-skill-description', text: skill.description });
      // Keep focus in the input; a click picks without blurring it.
      row.addEventListener('mousedown', (event) => {
        event.preventDefault();
        this.onPick(skill);
      });
      row.addEventListener('mousemove', () => index !== this.active && this.setActive(index));
    });
    this.el.show();
    this.setActive(0);
  }

  hide(): void {
    this.el.hide();
  }

  move(step: number): void {
    this.setActive((this.active + step + this.items.length) % this.items.length);
  }

  pickActive(): void {
    const skill = this.items[this.active];
    if (skill) this.onPick(skill);
  }

  private setActive(index: number): void {
    this.active = index;
    Array.from(this.el.children).forEach((row, i) => {
      row.toggleClass('is-active', i === index);
      row.setAttr('aria-selected', String(i === index));
    });
    this.el.children[index]?.scrollIntoView({ block: 'nearest' });
  }
}
