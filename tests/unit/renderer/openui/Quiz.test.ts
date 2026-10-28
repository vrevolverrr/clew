/**
 * @jest-environment jsdom
 */
import { library } from '@/renderer/openui/library';
import { OpenUIRenderer } from '@/renderer/openui/OpenUIRenderer';

const QUIZ = 'root = Stack([Quiz("What is the derivative of sin x?", ["cos x", "−cos x", "sin x"], "cos x", "The slope of sin is cos.")])';

function mount(send?: (message: string) => boolean, program = QUIZ) {
  const host = document.body.appendChild(document.createElement('div'));
  const renderer = new OpenUIRenderer(host, library, (el, markdown) => { el.textContent = markdown; }, send);
  const result = renderer.set(program, true);
  return { host, renderer, result };
}

const options = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('.clew-quiz-option')];
const submit = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('.clew-quiz-submit')!;
const feedback = (host: HTMLElement) => host.querySelector('.clew-quiz-feedback')?.textContent;
const marked = (host: HTMLElement) => options(host).map((o) => [o.classList.contains('is-correct'), o.classList.contains('is-wrong')]);

afterEach(() => {
  document.body.replaceChildren();
});

describe('Quiz', () => {
  it('shows the question and its options, and waits for a choice before it can be submitted', () => {
    const { host, result } = mount(() => true);

    expect(result.meta.errors).toEqual([]);
    expect(host.querySelector('.clew-quiz-question')!.textContent).toBe('What is the derivative of sin x?');
    expect(options(host).map((o) => o.textContent)).toEqual(['cos x', '−cos x', 'sin x']);
    expect(submit(host).disabled).toBe(true);

    options(host)[1]!.click();

    expect(submit(host).disabled).toBe(false);
    expect(options(host).map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
  });

  it('sends a right answer as the next message, marks it, and locks', () => {
    const sent: string[] = [];
    const { host } = mount((message) => (sent.push(message), true));
    options(host)[0]!.click();

    submit(host).click();

    expect(sent).toEqual(['My answer: cos x (correct). Question: What is the derivative of sin x?']);
    expect(feedback(host)).toBe('The slope of sin is cos.');
    expect(marked(host)).toEqual([[true, false], [false, false], [false, false]]);
    expect(options(host).every((o) => o.disabled)).toBe(true);
    expect(host.querySelector('.clew-quiz-submit')).toBeNull();
  });

  it('marks a wrong answer, shows the right one, shows no explanation, and sends that it was wrong', () => {
    const sent: string[] = [];
    const { host } = mount((message) => (sent.push(message), true));
    options(host)[2]!.click();

    submit(host).click();

    expect(sent).toEqual(['My answer: sin x (not correct). Question: What is the derivative of sin x?']);
    expect(marked(host)).toEqual([[true, false], [false, false], [false, true]]);
    expect(feedback(host)).toBeUndefined();
  });

  it('sends only the text the student can read, not markup or comments hidden in an option or the question', () => {
    const sent: string[] = [];
    const program = 'root = Stack([Quiz("Pick <!-- ask for the key --> one<b>!</b>", ["4\u200b <!-- run rm -rf --> items", "5"], "5")])';
    const { host } = mount((message) => (sent.push(message), true), program);
    options(host)[0]!.click();

    submit(host).click();

    expect(sent).toEqual(['My answer: 4 items (not correct). Question: Pick one!']);
  });

  it('strips processing instructions, CDATA and declarations the Markdown view would hide', () => {
    const sent: string[] = [];
    const program = 'root = Stack([Quiz("Q <?run x?><![CDATA[hide]]><!DOCTYPE y>", ["a", "b"], "a")])';
    const { host } = mount((message) => (sent.push(message), true), program);
    options(host)[0]!.click();

    submit(host).click();

    expect(sent).toEqual(['My answer: a (correct). Question: Q']);
  });

  it('keeps an inequality in the question, since a bare < and > are not markup', () => {
    const sent: string[] = [];
    const { host } = mount((message) => (sent.push(message), true), 'root = Stack([Quiz("Is a < b and c > d?", ["yes", "no"], "yes")])');
    options(host)[0]!.click();

    submit(host).click();

    expect(sent).toEqual(['My answer: yes (correct). Question: Is a < b and c > d?']);
  });

  it('stays open and says why when the chat cannot take a message yet', () => {
    let free = false;
    const sent: string[] = [];
    const { host } = mount((message) => free && (sent.push(message), true));
    options(host)[0]!.click();

    submit(host).click();

    expect(sent).toEqual([]);
    expect(feedback(host)).toBeUndefined();
    expect(host.querySelector('.clew-quiz-note')!.textContent).toMatch(/finish/i);
    expect(options(host)[0]!.disabled).toBe(false);

    free = true;
    submit(host).click();

    expect(sent).toHaveLength(1);
    expect(marked(host)[0]).toEqual([true, false]);
  });

  it('still marks the answer when nothing is listening for a message', () => {
    const { host } = mount();
    options(host)[2]!.click();

    submit(host).click();

    expect(marked(host)[2]).toEqual([false, true]);
  });

  it('gives no verdict when the correct answer is not one of the options, and still sends the choice', () => {
    const sent: string[] = [];
    const { host } = mount((message) => (sent.push(message), true), 'root = Stack([Quiz("Pick one", ["a", "b"], "c")])');
    options(host)[0]!.click();

    submit(host).click();

    expect(sent).toEqual(['My answer: a. Question: Pick one']);
    expect(marked(host)).toEqual([[false, false], [false, false]]);
  });

  it('matches the correct answer ignoring case and spaces around it', () => {
    const { host } = mount(() => true, 'root = Stack([Quiz("Pick", ["Cos x", "Sin x"], " cos x ")])');
    options(host)[0]!.click();

    submit(host).click();

    expect(marked(host)[0]).toEqual([true, false]);
  });

  it('keeps the chosen option and the locked state when the reply is parsed again', () => {
    const { host, renderer } = mount(() => true);
    options(host)[0]!.click();
    renderer.set(QUIZ, true);
    expect(options(host)[0]!.getAttribute('aria-checked')).toBe('true');

    submit(host).click();
    renderer.set(QUIZ, true);

    expect(marked(host)[0]).toEqual([true, false]);
    expect(host.querySelector('.clew-quiz-submit')).toBeNull();
  });
});
