import type { FigureNode } from '@/renderer/figure/FigureData';
import { formatFigure } from '@/renderer/figure/formatFigure';

type Quiz = Extract<FigureNode, { type: 'Quiz' }>;

const SENT_LIMIT = 200;

/** Text as the student reads it, for a message sent in their name: no markup, comment or hidden character the Markdown view would not show. */
function plain(text: string): string {
  return text
    .replace(/<!--[\s\S]*?(?:-->|$)|<\?[\s\S]*?(?:\?>|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![A-Za-z][^>]*>|<\/?[a-zA-Z][^<>]*>/g, '')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SENT_LIMIT);
}

/**
 * A multiple-choice check: Submit marks the answer and sends it as the student's next message through `send`.
 * `answers` holds what was sent, by id or question, so a redraw shows the Quiz still answered.
 */
export function drawQuiz(parent: HTMLElement, quiz: Quiz, markdown: (el: HTMLElement, text: string | number) => void, answers: Map<string, number>, send?: (message: string) => boolean): void {
  const el = parent.appendChild(createDiv());
  el.className = 'clew-quiz';
  markdown(el.appendChild(Object.assign(createDiv(), { className: 'clew-quiz-question' })), quiz.question);
  const group = el.appendChild(createDiv());
  group.className = 'clew-quiz-options';
  group.setAttribute('role', 'radiogroup');
  const bar = el.appendChild(createDiv());
  bar.className = 'clew-quiz-bar';
  const note = bar.appendChild(createSpan());
  note.className = 'clew-quiz-note';
  const submit = bar.appendChild(createEl('button'));
  submit.type = 'button';
  submit.className = 'clew-quiz-submit mod-cta';
  submit.textContent = 'Submit';

  const right = quiz.options.indexOf(quiz.correct);
  // A param can change the question or its answer under the same id; a saved answer belongs only to the same quiz.
  const key = JSON.stringify([quiz.id, quiz.question, quiz.options, quiz.correct]);
  let chosen: number | null = answers.get(key) ?? null;
  let locked = chosen !== null;
  const buttons = quiz.options.map((option, index) => {
    const button = group.appendChild(createEl('button'));
    button.type = 'button';
    button.className = 'clew-quiz-option';
    button.setAttribute('role', 'radio');
    markdown(button.appendChild(createSpan()), option);
    button.addEventListener('click', () => {
      chosen = index;
      note.textContent = '';
      show();
    });
    return button;
  });

  const show = (): void => {
    buttons.forEach((button, index) => {
      button.setAttribute('aria-checked', String(chosen === index));
      button.disabled = locked;
      button.classList.toggle('is-correct', locked && right === index);
      button.classList.toggle('is-wrong', locked && chosen === index && right !== index);
    });
    submit.disabled = chosen === null;
    if (!locked) return;
    bar.remove();
    if (!quiz.explanation || chosen !== right) return;
    const feedback = el.appendChild(createDiv());
    feedback.className = 'clew-quiz-feedback';
    feedback.setAttribute('aria-live', 'polite');
    markdown(feedback, quiz.explanation);
  };

  submit.addEventListener('click', () => {
    if (chosen === null || locked) return;
    const verdict = chosen === right ? ' (correct)' : ' (not correct)';
    const message = `My answer: ${plain(formatFigure(quiz.options[chosen]))}${verdict}. Question: ${plain(quiz.question)}`;
    if (send && !send(message)) {
      note.textContent = 'Wait for the reply to finish, then submit.';
      return;
    }
    locked = true;
    answers.set(key, chosen);
    show();
  });
  show();
}
