import { describe, expect, test } from "bun:test";
import { createQuizHandler, QuizRateLimiter, type QuizQuestion } from "./quiz";

function request(body: unknown): Request {
  return new Request("http://localhost/api/quiz", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function providerResponse(questions: QuizQuestion[]): Response {
  return Response.json({
    object: "response",
    output: [{
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify({ questions }) }],
    }],
  });
}

function question(overrides: Partial<QuizQuestion> = {}): QuizQuestion {
  return {
    question: "Which planet is known as the Red Planet?",
    options: ["Mars", "Venus", "Earth", "Jupiter"],
    correctOptionIndex: 0,
    explanation: "Iron-rich dust makes Mars look red.",
    ...overrides,
  };
}

function validQuestions(count = 5): QuizQuestion[] {
  return Array.from({ length: count }, (_, index) => question({ question: `Quiz question ${index + 1}?` }));
}

describe("endless quiz API", () => {
  test("returns strict JSON and asks gpt-6-luna for structured output", async () => {
    let upstreamBody: Record<string, unknown> | undefined;
    const questions = validQuestions();
    const handler = createQuizHandler({
      apiKey: "test-key",
      fetcher: async (_input, init) => {
        upstreamBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return providerResponse(questions);
      },
    });

    const response = await handler(request({ age: 8, topic: "space", count: 5 }), "127.0.0.1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ questions });
    expect(upstreamBody?.model).toBe("gpt-6-luna");
    expect(upstreamBody?.reasoning).toEqual({ effort: "high" });
    expect(upstreamBody?.store).toBe(false);
    expect(upstreamBody?.instructions).toContain("vocabulary, reading level, and factual detail appropriate for this age");
    expect(upstreamBody?.input).toBe(JSON.stringify({ age: 8, topic: "space", count: 5 }));
    expect(upstreamBody?.text).toMatchObject({ format: { type: "json_schema", strict: true, name: "endless_quiz" } });
  });

  test("rejects invalid age, topic, and question count with JSON errors", async () => {
    const handler = createQuizHandler({ apiKey: "test-key", fetcher: async () => providerResponse([question()]) });
    for (const body of [
      { age: 3, topic: "space", count: 5 },
      { age: 10, topic: " ", count: 5 },
      { age: 10, topic: "space", count: 1 },
      { age: 10, topic: "space", count: 2 },
      { age: 10, topic: "space", count: 3 },
      { age: 10, topic: "space", count: 4 },
      { age: 10, topic: "space", count: 6 },
      { age: 10, topic: "space", count: 21 },
    ]) {
      const response = await handler(request(body), "client");
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
    }
  });

  test("rejects malformed JSON and oversized requests", async () => {
    const handler = createQuizHandler({ apiKey: "test-key" });
    const malformed = await handler(new Request("http://localhost/api/quiz", { method: "POST", body: "{" }));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: { code: "invalid_json" } });

    const oversized = await handler(new Request("http://localhost/api/quiz", {
      method: "POST",
      headers: { "content-length": "20000" },
      body: "{}",
    }));
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toMatchObject({ error: { code: "request_too_large" } });
  });

  test("uses JSON errors for unsupported methods", async () => {
    const handler = createQuizHandler({ apiKey: "test-key" });
    const response = await handler(new Request("http://localhost/api/quiz", { method: "GET" }));
    expect(response.status).toBe(405);
    expect(await response.json()).toMatchObject({ error: { code: "method_not_allowed" } });
  });

  test("rejects generated quizzes with the wrong count, option count, or answer index", async () => {
    const wrongCount = createQuizHandler({ apiKey: "test-key", fetcher: async () => providerResponse([question()]) });
    expect((await wrongCount(request({ age: 8, topic: "space", count: 5 }))).status).toBe(502);

    const wrongOptionCount = createQuizHandler({
      apiKey: "test-key",
      fetcher: async () => providerResponse([
        question({ options: ["Mars", "Venus", "Earth", "Jupiter", "Saturn"] as unknown as QuizQuestion["options"] }),
        ...validQuestions(4),
      ]),
    });
    expect((await wrongOptionCount(request({ age: 8, topic: "space", count: 5 }))).status).toBe(502);

    const wrongAnswerIndex = createQuizHandler({
      apiKey: "test-key",
      fetcher: async () => providerResponse([question({ correctOptionIndex: 4 }), ...validQuestions(4)]),
    });
    expect((await wrongAnswerIndex(request({ age: 8, topic: "space", count: 5 }))).status).toBe(502);

    const repeatedOptions = createQuizHandler({
      apiKey: "test-key",
      fetcher: async () => providerResponse([question({ options: ["Mars", "Venus", "Mars", "Jupiter"] }), ...validQuestions(4)]),
    });
    expect((await repeatedOptions(request({ age: 8, topic: "space", count: 5 }))).status).toBe(502);
  });

  test("reports missing credentials and upstream failures as JSON", async () => {
    const missingKey = createQuizHandler({ apiKey: "" });
    const unavailable = await missingKey(request({ age: 8, topic: "space", count: 5 }));
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ error: { code: "service_unavailable" } });

    const upstreamFailure = createQuizHandler({ apiKey: "test-key", fetcher: async () => new Response("no", { status: 429 }) });
    const failed = await upstreamFailure(request({ age: 8, topic: "space", count: 5 }));
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({ error: { code: "upstream_error" } });
  });

  test("limits generation attempts by client and resets after the window", () => {
    let time = 1_000;
    const limiter = new QuizRateLimiter(2, 100, 10, () => time);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    expect(limiter.allow("b")).toBe(true);
    time += 100;
    expect(limiter.allow("a")).toBe(true);
  });
});
