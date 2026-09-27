import type { GameContext, GameInstance } from "../../platform/game";
import { QUESTION_COUNTS } from "./config";

interface QuizQuestion {
  question: string;
  options: [string, string, string, string];
  correctOptionIndex: number;
  explanation: string;
}

interface QuizPayload {
  questions: QuizQuestion[];
}

interface QuizErrorPayload {
  error?: { message?: string };
}

type Phase = "setup" | "loading" | "question" | "result";

export async function mount({ container, exit, kaplayReady, signal }: GameContext): Promise<GameInstance> {
  const { default: kaplay } = await (kaplayReady ?? import("kaplay"));
  if (signal?.aborted) return { destroy() {} };

  let phase: Phase = "setup";
  let questions: QuizQuestion[] = [];
  let questionIndex = 0;
  let selectedIndex: number | undefined;
  let score = 0;
  let errorMessage = "";
  let animationTime = 0;
  let destroyed = false;
  let activeRequest: AbortController | undefined;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  container.innerHTML = `
    <main class="game-page quiz-page">
      <header class="game-header">
        <button class="icon-button" type="button" data-quiz-action="exit" aria-label="Back to all games">←</button>
        <div class="game-heading">
          <span class="eyebrow quiz-eyebrow">Pick a topic, test your knowledge</span>
          <h1>Endless Quiz</h1>
        </div>
        <span class="quiz-header-mark" aria-hidden="true">✦</span>
      </header>

      <section class="quiz-game" aria-label="Endless Quiz">
        <div class="quiz-hero" aria-hidden="true"><canvas class="quiz-canvas" data-quiz-canvas width="960" height="190"></canvas></div>
        <div class="quiz-workspace" data-quiz-workspace></div>
      </section>
    </main>`;

  const canvas = container.querySelector<HTMLCanvasElement>("[data-quiz-canvas]");
  const workspace = container.querySelector<HTMLElement>("[data-quiz-workspace]");
  if (!canvas || !workspace) throw new Error("Endless Quiz UI could not be created");

  const k = kaplay({
    global: false,
    canvas,
    width: 960,
    height: 190,
    background: [111, 82, 226],
    crisp: true,
    debug: false,
    focus: false,
    touchToMouse: false,
  });

  function drawStars(): void {
    const stars = [
      [72, 45, 9], [158, 131, 5], [268, 57, 6], [372, 143, 8], [490, 39, 5],
      [604, 124, 6], [730, 52, 9], [844, 135, 5], [910, 40, 6],
    ] as const;
    for (const [x, y, size] of stars) {
      const pulse = reducedMotion ? 0 : Math.sin(animationTime * 2 + x) * 1.8;
      k.drawCircle({
        pos: k.vec2(x, y),
        radius: size + pulse,
        color: k.rgb(255, 232, 129),
        anchor: "center",
        opacity: 0.9,
      });
    }
    k.drawCircle({ pos: k.vec2(484, 184), radius: 104, color: k.rgb(141, 119, 255), opacity: 0.6 });
    k.drawCircle({ pos: k.vec2(484, 184), radius: 77, color: k.rgb(255, 202, 77), opacity: 0.94 });
    k.drawCircle({ pos: k.vec2(484, 184), radius: 59, color: k.rgb(255, 224, 125), opacity: 1 });
  }

  function renderSetup(): void {
    workspace!.innerHTML = `
      <form class="quiz-setup" data-quiz-form="setup">
        <div class="quiz-setup-copy">
          <span class="eyebrow quiz-eyebrow">Your quiz, your way</span>
          <h2>What would you like to explore?</h2>
          <p>Pick a topic and we’ll make a quiz that fits your age.</p>
        </div>
        <div class="quiz-fields">
          <label class="quiz-field" for="quiz-age">
            <span>How old are you?</span>
            <select id="quiz-age" name="age" required>
              ${Array.from({ length: 15 }, (_, index) => `<option value="${index + 4}"${index === 4 ? " selected" : ""}>${index + 4} years old</option>`).join("")}
            </select>
          </label>
          <label class="quiz-field" for="quiz-topic">
            <span>Choose a topic</span>
            <input id="quiz-topic" name="topic" type="text" minlength="2" maxlength="80" required placeholder="Space, animals, dinosaurs…" autocomplete="off">
          </label>
          <label class="quiz-field" for="quiz-count">
            <span>How many questions?</span>
            <select id="quiz-count" name="count" required>
              ${QUESTION_COUNTS.map((count) => `<option value="${count}"${count === 5 ? " selected" : ""}>${count} questions</option>`).join("")}
            </select>
          </label>
        </div>
        <p class="quiz-error" data-quiz-error role="alert" ${errorMessage ? "" : "hidden"}></p>
        <button class="check-button quiz-primary" type="submit">Make my quiz <span aria-hidden="true">✨</span></button>
        <p class="quiz-note">Questions are made just for this game and aren’t saved.</p>
      </form>`;
    const error = workspace!.querySelector<HTMLElement>("[data-quiz-error]");
    if (error) error.textContent = errorMessage;
  }

  function renderLoading(): void {
    workspace!.innerHTML = `
      <div class="quiz-loading" role="status" aria-live="polite">
        <span class="quiz-loading-icon" aria-hidden="true">✦</span>
        <h2>Building your quiz…</h2>
        <p>Finding some fun questions for you.</p>
        <button class="text-button" type="button" data-quiz-action="cancel">Cancel</button>
      </div>`;
  }

  function renderQuestion(): void {
    const question = questions[questionIndex];
    if (!question) return;
    const answered = selectedIndex !== undefined;
    workspace!.innerHTML = `
      <section class="quiz-question-card" aria-labelledby="quiz-question-title">
        <div class="quiz-progress-row">
          <span class="quiz-question-number">Question ${questionIndex + 1} of ${questions.length}</span>
          <span class="quiz-score">⭐ ${score} ${score === 1 ? "point" : "points"}</span>
        </div>
        <progress class="quiz-progress" value="${questionIndex + 1}" max="${questions.length}" aria-label="Question ${questionIndex + 1} of ${questions.length}"></progress>
        <h2 id="quiz-question-title" tabindex="-1"></h2>
        <form data-quiz-form="answer">
          <fieldset class="quiz-options" ${answered ? "disabled" : ""}>
            <legend class="visually-hidden">Choose one answer</legend>
          </fieldset>
          <div class="quiz-feedback" data-quiz-feedback tabindex="-1" aria-live="polite" ${answered ? "" : "hidden"}></div>
          ${answered
            ? `<button class="check-button quiz-primary" type="button" data-quiz-action="next">${questionIndex + 1 === questions.length ? "See my score" : "Next question"} <span aria-hidden="true">→</span></button>`
            : `<button class="check-button quiz-primary" type="submit" data-quiz-submit disabled>Submit answer <span aria-hidden="true">✓</span></button>`}
          <p class="quiz-error" data-quiz-error role="alert" ${errorMessage ? "" : "hidden"}></p>
        </form>
      </section>`;

    const title = workspace!.querySelector<HTMLElement>("#quiz-question-title");
    const options = workspace!.querySelector<HTMLElement>(".quiz-options");
    const feedback = workspace!.querySelector<HTMLElement>("[data-quiz-feedback]");
    if (!title || !options || !feedback) return;
    title.textContent = question.question;
    question.options.forEach((option, index) => {
      const label = document.createElement("label");
      label.className = "quiz-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "answer";
      input.value = String(index);
      input.checked = selectedIndex === index;
      const marker = document.createElement("span");
      marker.className = "quiz-option-marker";
      marker.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.className = "quiz-option-text";
      text.textContent = option;
      label.append(input, marker, text);
      options.append(label);
    });
    if (answered) {
      const correct = selectedIndex === question.correctOptionIndex;
      feedback.classList.add(correct ? "quiz-feedback--correct" : "quiz-feedback--incorrect");
      const heading = document.createElement("strong");
      heading.textContent = correct ? "That’s right!" : `The answer is ${question.options[question.correctOptionIndex]}.`;
      const explanation = document.createElement("span");
      explanation.textContent = question.explanation;
      feedback.append(heading, explanation);
    }
  }

  function renderResult(): void {
    const perfect = score === questions.length;
    workspace!.innerHTML = `
      <section class="quiz-result" aria-labelledby="quiz-result-title">
        <span class="quiz-result-icon" aria-hidden="true">${perfect ? "🏆" : "🎉"}</span>
        <span class="eyebrow quiz-eyebrow">Quiz complete</span>
        <h2 id="quiz-result-title">${perfect ? "Perfect score!" : "Great exploring!"}</h2>
        <p class="quiz-result-score">You got <strong>${score} out of ${questions.length}</strong> right.</p>
        <button class="check-button quiz-primary" type="button" data-quiz-action="again">Play another quiz <span aria-hidden="true">↻</span></button>
      </section>`;
    workspace!.querySelector<HTMLButtonElement>("[data-quiz-action='again']")?.focus();
  }

  function render(): void {
    if (phase === "setup") renderSetup();
    else if (phase === "loading") renderLoading();
    else if (phase === "question") renderQuestion();
    else renderResult();
  }

  function showError(message: string): void {
    errorMessage = message;
    const error = workspace!.querySelector<HTMLElement>("[data-quiz-error]");
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
  }

  async function startQuiz(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form);
    const age = Number(data.get("age"));
    const topic = String(data.get("topic") ?? "").trim();
    const count = Number(data.get("count"));
    phase = "loading";
    errorMessage = "";
    render();
    const controller = new AbortController();
    activeRequest = controller;
    const onAbort = (): void => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ age, topic, count }),
        signal: controller.signal,
      });
      const payload = await response.json() as QuizPayload & QuizErrorPayload;
      if (!response.ok) throw new Error(payload.error?.message ?? "Questions could not be generated. Please try again.");
      if (!Array.isArray(payload.questions) || payload.questions.length !== count) {
        throw new Error("The quiz came back in an unexpected format. Please try again.");
      }
      questions = payload.questions;
      questionIndex = 0;
      selectedIndex = undefined;
      score = 0;
      phase = "question";
      render();
      workspace!.querySelector<HTMLElement>("#quiz-question-title")?.focus();
    } catch (error) {
      if (controller.signal.aborted || destroyed) return;
      phase = "setup";
      render();
      showError(error instanceof Error ? error.message : "Questions could not be generated. Please try again.");
    } finally {
      signal?.removeEventListener("abort", onAbort);
      if (activeRequest === controller) activeRequest = undefined;
    }
  }

  function onSubmit(event: SubmitEvent): void {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.quizForm === "setup") {
      event.preventDefault();
      if (form.reportValidity()) void startQuiz(form);
      return;
    }
    if (form.dataset.quizForm !== "answer" || phase !== "question" || selectedIndex !== undefined) return;
    event.preventDefault();
    const checked = form.querySelector<HTMLInputElement>('input[name="answer"]:checked');
    if (!checked) return;
    selectedIndex = Number(checked.value);
    if (selectedIndex === questions[questionIndex]?.correctOptionIndex) score += 1;
    errorMessage = "";
    renderQuestion();
    workspace!.querySelector<HTMLElement>("[data-quiz-feedback]")?.focus();
  }

  function onChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== "answer") return;
    const submitButton = workspace!.querySelector<HTMLButtonElement>("[data-quiz-submit]");
    if (submitButton) submitButton.disabled = false;
  }

  function onClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-quiz-action]") : null;
    if (!target) return;
    const action = target.dataset.quizAction;
    if (action === "exit") exit();
    else if (action === "cancel") {
      activeRequest?.abort();
      phase = "setup";
      errorMessage = "";
      render();
    } else if (action === "next" && phase === "question" && selectedIndex !== undefined) {
      if (questionIndex + 1 >= questions.length) phase = "result";
      else {
        questionIndex += 1;
        selectedIndex = undefined;
      }
      render();
      workspace!.querySelector<HTMLElement>(phase === "result" ? "#quiz-result-title" : "#quiz-question-title")?.focus();
    } else if (action === "again") {
      questions = [];
      questionIndex = 0;
      selectedIndex = undefined;
      score = 0;
      phase = "setup";
      errorMessage = "";
      render();
      workspace!.querySelector<HTMLInputElement>("#quiz-topic")?.focus();
    }
  }

  function onGameAbort(): void {
    activeRequest?.abort();
  }

  k.onDraw(drawStars);
  k.onUpdate(() => {
    if (!reducedMotion) animationTime += Math.min(k.dt(), 1 / 20);
  });
  container.addEventListener("submit", onSubmit);
  container.addEventListener("change", onChange);
  container.addEventListener("click", onClick);
  signal?.addEventListener("abort", onGameAbort, { once: true });
  render();

  return {
    destroy(): void {
      destroyed = true;
      activeRequest?.abort();
      container.removeEventListener("submit", onSubmit);
      container.removeEventListener("change", onChange);
      container.removeEventListener("click", onClick);
      signal?.removeEventListener("abort", onGameAbort);
      k.quit();
      container.innerHTML = "";
    },
  };
}
