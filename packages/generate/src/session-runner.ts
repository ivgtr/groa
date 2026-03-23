import type {
  Session,
  SessionTurn,
  SessionMode,
  Timestamp,
} from "@groa/types";
import { Timestamp as TimestampFactory, ModelIdString } from "@groa/types";
import type { LlmBackend, LlmRequest } from "@groa/llm-client";
import type { Embedder } from "@groa/embed";
import { retrieve } from "@groa/retrieve";
import type { RetrieveOptions } from "@groa/retrieve";
import type { SessionParams, PersonaContext } from "./types.js";
import { buildSystemPrompt } from "./prompt/system.js";
import { buildTurnPrompt } from "./prompt/turn.js";
import { shouldContinue } from "./prompt/continuation.js";

const MAX_TOKENS = 2048;
const MAX_RETRIES = 2;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_LENGTH = 280;
const DEFAULT_AUTO_TURN_LIMIT = 8;

export interface SessionCallbacks {
  onTurnComplete?: (turn: SessionTurn) => void;
  getUserInput?: () => Promise<string | null>;
}

function generateSessionId(mode: SessionMode): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(3));
  const hash = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${mode}-${date}-${hash}`;
}

function nowTimestamp(): Timestamp {
  return TimestampFactory(Date.now());
}

/**
 * 生成テキストのバリデーション。空でないトリム済みテキストを返す。
 */
function validateText(content: string): string | null {
  const trimmed = content.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * 1ターン分のテキスト生成（リトライ付き）。
 */
async function generateTurn(
  context: PersonaContext,
  backend: LlmBackend,
  embedder: Embedder,
  topic: string,
  turns: SessionTurn[],
  params: {
    mode: SessionMode;
    temperature: number;
    maxLength: number;
    styleHint: string | null;
    speakerName?: string;
    retrieveOptions?: RetrieveOptions;
  },
): Promise<SessionTurn> {
  // 1. Retrieve few-shot tweets
  const retrieveResult = await retrieve(
    topic,
    context.embeddingIndex,
    context.taggedTweets,
    embedder,
    params.retrieveOptions,
  );

  // 2. Build prompts
  const system = buildSystemPrompt(context.persona, topic, {
    mode: params.mode,
    maxLength: params.maxLength,
    styleHint: params.styleHint,
  });

  const user = buildTurnPrompt(topic, retrieveResult.forGeneration, {
    mode: params.mode,
    history: turns,
    speakerName: params.speakerName,
  });

  const request: LlmRequest = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: MAX_TOKENS,
    options: {
      temperature: params.temperature,
      useCache: backend.backendType() === "anthropic",
      useBatch: false,
    },
  };

  // 3. Generate with retries
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await backend.complete(request);
    const validated = validateText(response.content);

    if (validated !== null) {
      return {
        index: turns.length,
        speakerId: context.buildName,
        text: validated,
        fewShotIds: retrieveResult.forGeneration.map((t) => t.tweet.id),
        modelUsed: response.modelUsed,
        timestamp: nowTimestamp(),
      };
    }

    if (attempt < MAX_RETRIES) {
      console.warn(
        `テキスト生成のバリデーション失敗（${attempt + 1}/${MAX_RETRIES + 1}回目）。リトライします。`,
      );
    }
  }

  throw new Error(
    `テキスト生成が${MAX_RETRIES + 1}回すべて失敗しました。`,
  );
}

/**
 * 次の話者を決定する（multiモード: ラウンドロビン）。
 */
function getNextSpeaker(
  contexts: PersonaContext[],
  turnIndex: number,
): PersonaContext {
  return contexts[turnIndex % contexts.length]!;
}

/**
 * セッションのターン上限を決定する。
 */
function resolveMaxTurns(params: SessionParams): number | null {
  if (params.mode === "tweet") return 1;
  if (params.mode === "chat") return null; // ユーザー終了まで
  return params.maxTurns ?? null; // null = 自動判断
}

/**
 * 全モード共通のセッション実行エンジン。
 */
export async function runSession(
  contexts: PersonaContext[],
  backend: LlmBackend,
  embedder: Embedder,
  params: SessionParams,
  callbacks?: SessionCallbacks,
): Promise<Session> {
  if (params.mode === "multi" && contexts.length < 2) {
    throw new Error("multiモードには2つ以上のプロファイルが必要です。");
  }

  const temperature = params.temperature ?? DEFAULT_TEMPERATURE;
  const maxLength = params.maxLength ?? DEFAULT_MAX_LENGTH;
  const styleHint = params.styleHint ?? null;
  const autoTurnLimit = params.autoTurnLimit ?? DEFAULT_AUTO_TURN_LIMIT;
  const maxTurns = resolveMaxTurns(params);

  const session: Session = {
    id: generateSessionId(params.mode),
    mode: params.mode,
    topic: params.topic,
    participants: contexts.map((c) => ({
      buildName: c.buildName,
      role: "persona" as const,
    })),
    turns: [],
    evaluation: null,
    createdAt: nowTimestamp(),
    completedAt: null,
  };

  // chatモードではhumanを参加者に追加
  if (params.mode === "chat") {
    session.participants.push({
      buildName: "__user__",
      role: "human",
    });
  }

  let turnIndex = 0;

  while (true) {
    // ターン数上限チェック
    if (maxTurns !== null && turnIndex >= maxTurns) break;

    // chatモード: ユーザー入力を取得
    if (params.mode === "chat") {
      if (!callbacks?.getUserInput) {
        throw new Error("chatモードには getUserInput コールバックが必要です。");
      }
      const userInput = await callbacks.getUserInput();
      if (userInput === null) break; // ユーザーが終了を要求

      const userTurn: SessionTurn = {
        index: turnIndex,
        speakerId: "__user__",
        text: userInput,
        fewShotIds: [],
        modelUsed: ModelIdString(""),
        timestamp: nowTimestamp(),
      };
      session.turns.push(userTurn);
      callbacks.onTurnComplete?.(userTurn);
      turnIndex++;
    }

    // 話者を決定
    const context =
      params.mode === "multi"
        ? getNextSpeaker(contexts, turnIndex)
        : contexts[0]!;

    // ターン生成
    const turn = await generateTurn(
      context,
      backend,
      embedder,
      params.topic,
      session.turns,
      {
        mode: params.mode,
        temperature,
        maxLength,
        styleHint,
        speakerName: context.buildName,
      },
    );

    session.turns.push(turn);
    callbacks?.onTurnComplete?.(turn);
    turnIndex++;

    // tweetモード: 1ターンで終了
    if (params.mode === "tweet") break;

    // 自動継続判断（maxTurns未指定のconverse/multiモード）
    if (maxTurns === null && params.mode !== "chat") {
      const continueConversation = await shouldContinue(
        session.turns,
        backend,
        { currentTurn: turnIndex, autoTurnLimit },
      );
      if (!continueConversation) break;
    }
  }

  session.completedAt = nowTimestamp();
  return session;
}
