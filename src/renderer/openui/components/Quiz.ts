import { defineComponent } from '@openuidev/lang-core';
import { z } from 'zod/v4';

import type { ComponentFactory } from '../OpenUIRenderer';

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

/** The option `correct` names, ignoring case and spaces around it; -1 when the model named none of them. */
function correctIndex(options: readonly string[], correct: string): number {
  const exact = options.indexOf(correct);
  if (exact >= 0) return exact;
  const wanted = correct.trim().toLowerCase();
  return options.findIndex((option) => option.trim().toLowerCase() === wanted);
}

export const Quiz = defineComponent({
  name: 'Quiz',
  description:
    'A multiple-choice question to check understanding. correct is the right option, written as in options. Submitting marks it and sends the answer as the next message, so ask one and wait.',
  props: z.object({
    question: z.string(),
    options: z.array(z.string()),
    correct: z.string(),
    explanation: z.string().optional(),
  }),
  component: ((ctx) => {
    const el = document.createElement('div');
    el.className = 'clew-quiz';
    const questionEl = el.appendChild(document.createElement('div'));
    questionEl.className = 'clew-quiz-question';
    const group = el.appendChild(document.createElement('div'));
    group.className = 'clew-quiz-options';
    group.setAttribute('role', 'radiogroup');
    const bar = el.appendChild(document.createElement('div'));
    bar.className = 'clew-quiz-bar';
    const note = bar.appendChild(document.createElement('span'));
    note.className = 'clew-quiz-note';
    const submit = bar.appendChild(document.createElement('button'));
    submit.type = 'button';
    submit.className = 'clew-quiz-submit mod-cta';
    submit.textContent = 'Submit';

    let latest: Record<string, unknown> = {};
    let shownQuestion: string | null = null;
    let listed: string[] = [];
    let chosen: number | null = null;
    let locked = false;
    let feedbackEl: HTMLElement | null = null;
    let shownExplanation = '';

    const options = () => ((latest.options as unknown[] | undefined) ?? []).map(String);
    const answer = () => {
      const names = options();
      return { names, right: correctIndex(names, String(latest.correct ?? '')) };
    };

    const show = () => {
      const { right } = answer();
      [...group.children].forEach((button, index) => {
        const option = button as HTMLButtonElement;
        option.setAttribute('aria-checked', String(chosen === index));
        option.disabled = locked;
        option.classList.toggle('is-correct', locked && right === index);
        option.classList.toggle('is-wrong', locked && chosen === index && right >= 0 && right !== index);
      });
      submit.disabled = chosen === null;
      if (!locked) return;
      bar.remove();
      const explanation = latest.explanation ? String(latest.explanation) : '';
      if (!explanation || (right >= 0 && chosen !== right)) return;
      if (!feedbackEl) {
        feedbackEl = el.appendChild(document.createElement('div'));
        feedbackEl.className = 'clew-quiz-feedback';
        feedbackEl.setAttribute('aria-live', 'polite');
      }
      if (explanation !== shownExplanation) {
        shownExplanation = explanation;
        ctx.renderMarkdown(feedbackEl, explanation);
      }
    };

    submit.addEventListener('click', () => {
      if (chosen === null || locked) return;
      const { names, right } = answer();
      const verdict = right < 0 ? '' : chosen === right ? ' (correct)' : ' (not correct)';
      const message = `My answer: ${plain(names[chosen]!)}${verdict}. Question: ${plain(String(latest.question))}`;
      if (ctx.canSend && !ctx.send(message)) {
        note.textContent = 'Wait for the reply to finish, then submit.';
        return;
      }
      locked = true;
      show();
    });

    return {
      el,
      update: (props) => {
        latest = props;
        const question = String(props.question);
        if (question !== shownQuestion) {
          shownQuestion = question;
          ctx.renderMarkdown(questionEl, question);
        }
        const names = options();
        // Rebuilt only when the options change, so the student's choice and focus survive a re-parse.
        if (names.join('\u0000') !== listed.join('\u0000')) {
          listed = names;
          if (!locked) chosen = null;
          group.replaceChildren(
            ...names.map((name, index) => {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'clew-quiz-option';
              button.setAttribute('role', 'radio');
              ctx.renderMarkdown(button.appendChild(document.createElement('span')), name);
              button.addEventListener('click', () => {
                chosen = index;
                note.textContent = '';
                show();
              });
              return button;
            }),
          );
        }
        show();
      },
    };
  }) satisfies ComponentFactory,
});
