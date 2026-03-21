# groa 設計仕様書

> 本文書は groa の「どう実装するか (How)」を定義する。
> 「何を実現するか (What)」は [要件定義書 (spec.md)](./spec.md) を参照。
> 各工程の学術的根拠は [設計根拠書 (design-rationale.md)](./design-rationale.md) を参照。

**対応する要件定義書**: spec.md
**Last Updated**: 2026-03-22

---

## 0. 設計原則とコーディング規約

> 対応する要件: spec.md §0

本プロジェクトでは以下の原則を厳守する。判断に迷った場合はこの順序で優先する。

1. **Single Responsibility Principle (SRP)**: 1つの関数・モジュールは1つの責務のみを持つ。「この関数は何をするか」を一文で説明できなければ分割する。
2. **DRY (Don't Repeat Yourself)**: 知識の重複を排除する。ただし、偶然の一致による見かけ上の重複は統合しない。「変更理由が同じか」で判断する。
3. **Simple, not Easy**: 抽象化は必要十分に留める。将来の可能性のための過剰な汎化は行わない。必要になった時点で拡張する。
4. **Explicit over Implicit**: 型で意図を表現する。`string` の代わりにbranded typeを使い、union typeで状態を網羅する。

### 命名規則

- ディレクトリ名・ファイル名: `kebab-case`
- 型名・インターフェース名: `PascalCase`
- 関数名・変数名: `camelCase`
- 定数: `SCREAMING_SNAKE_CASE`

### TypeScript固有の方針

- `strict: true` を前提とする。`any` の使用は禁止。やむを得ない場合は `unknown` + 型ガードで処理する。
- ランタイムバリデーションには [Zod](https://zod.dev) を使用し、型定義とバリデーションスキーマを一体化する。
- 副作用を持つ処理（LLM呼び出し、ファイルI/O）は必ず `async` 関数とし、`Promise` で返す。

---

## 1. システム構造

> 対応する要件: spec.md §1

### 1.1 ディレクトリ構成

```
groa/
├── package.json
├── tsconfig.json
├── packages/
│   ├── types/              # 共有型定義・Zodスキーマ
│   ├── preprocess/         # Step 0: テキスト前処理
│   ├── stats/              # Step 1: 統計的文体分析（ローカル、LLM不使用）
│   ├── classify/           # Step 2: ツイート分類・タグ付け
│   ├── analyze/            # Step 3: クラスタ分析
│   ├── synthesize/         # Step 4: ペルソナ文書合成
│   ├── embed/              # Step 5: Embedding生成
│   ├── retrieve/           # Step 6: 類似検索
│   ├── generate/           # Step 7: テキスト生成
│   ├── evaluate/           # Step 8: 品質評価
│   ├── llm-client/         # LLM API抽象層（デュアルバックエンド）
│   ├── pipeline/           # パイプラインオーケストレーション
│   ├── config/             # 設定管理
│   ├── cli/                # CLIエントリポイント
│   └── web/                # Webエントリポイント
└── vitest.config.ts
```

モノレポ構成とし、pnpm workspace で管理する。各パッケージ間の依存関係は **一方向** とし、循環依存を禁止する（ESLint の `import/no-cycle` ルールで強制する）。`types` は全パッケージから参照されるが、`types` は他のパッケージに依存しない。

### 1.2 パッケージ依存グラフ（完全版）

矢印は「依存する方向」を示す（A → B は「AがBに依存する」を意味する）。

```
                        ┌─────────┐
                        │  types  │  ← 全パッケージが依存
                        └────┬────┘
                             │
                        ┌────┴────┐
                        │ config  │  → types
                        └────┬────┘
                             │
                      ┌──────┴──────┐
                      │ llm-client  │  → types, config
                      └──┬──┬──┬───┘
                         │  │  │
          ┌──────────────┘  │  └──────────────┐
          ▼                 ▼                  ▼
    ┌──────────┐    ┌───────────┐  ┌──────────┐
    │ generate │    │ evaluate  │  │ classify │
    └──────────┘    └───────────┘  └──────────┘

    ┌──────────┐
    │  embed   │  → types（ローカル推論、llm-client不使用）
    └────┬─────┘
         │
         ▼
    ┌──────────┐
    │ retrieve │
    └──────────┘

    preprocess → stats → classify → analyze → synthesize
                   │        ↑ stats結果を     ↑ stats結果を
                   │          コンテキスト       文体ルールに反映
                   │
                   └── LLM不使用（ローカル処理）

    stats     → types（LLM不使用、kuromoji.jsのみ依存）
    analyze   → types, llm-client, stats（StyleStats参照）
    synthesize→ types, llm-client, stats（StyleStats参照）

                               pipeline → cli / web
```

> D-10対応: stats, analyze, synthesize の依存関係を明示。analyze と synthesize は stats パッケージの StyleStats を参照するが、stats 自体は LLM を使用しないローカル処理パッケージ。

### 1.3 実行環境

| 環境 | ランタイム | エントリポイント |
|------|----------|----------------|
| CLI | Node.js >= 22 | `packages/cli` |
| Web | モダンブラウザ (ES2022+) | `packages/web` (Vite でバンドル) |

CLI版とWeb版は `llm-client`, `pipeline`, `config` 以下の共通コアを共有する。環境固有のI/O（ファイルシステム / IndexedDB、サブプロセス起動）は抽象インターフェースで注入する。

### 1.4 pnpm workspace の管理方針

- 各パッケージ間の依存関係は一方向とし、循環依存を禁止する（ESLint の `import/no-cycle` ルールで強制する）
- `types` は全パッケージから参照されるが、`types` は他のパッケージに依存しない

---

## 2. 型定義とスキーマ

> 対応する要件: spec.md §2

このパッケージ（`packages/types/`）は型定義と Zod スキーマのみを提供する。振る舞い（ビジネスロジック）は一切含めない。

### 2.1 Branded Type

プリミティブ型の混同を防ぐため、branded type を使用する。

```typescript
type Brand<T, B extends string> = T & { readonly __brand: B };

type TweetId = Brand<string, "TweetId">;
type Timestamp = Brand<number, "Timestamp">; // Unix epoch ms
type ModelIdString = Brand<string, "ModelIdString">;
```

#### Branded Type の実装パターン

ファクトリ関数パターンにより、branded type のインスタンスを生成する:

```typescript
const TweetId = (s: string): TweetId => s as TweetId;
const Timestamp = (n: number): Timestamp => n as Timestamp;
const ModelIdString = (s: string): ModelIdString => s as ModelIdString;
```

Zod スキーマでの扱い:

```typescript
const TweetIdSchema = z.string().transform((s) => s as TweetId);
const TimestampSchema = z.number().transform((n) => n as Timestamp);
const ModelIdStringSchema = z.string().transform((s) => s as ModelIdString);
```

### 2.2 入力データ型

```typescript
interface Tweet {
  id: TweetId;
  text: string;
  timestamp: Timestamp;
  isRetweet: boolean;
  hasMedia: boolean;
  replyTo: TweetId | null;
}

interface TweetCorpus {
  tweets: Tweet[];
  metadata: CorpusMetadata;
}

interface CorpusMetadata {
  totalCount: number;
  dateRange: DateRange;
  filteredCount: number;
}

interface DateRange {
  start: Timestamp;
  end: Timestamp;
}
```

### 2.3 統計分析データ型

Step 1のローカル統計分析で生成される、確定的かつ再現可能なデータ。LLMは一切使用しない。

```typescript
interface StyleStats {
  /** 文字数の統計 */
  lengthDistribution: {
    mean: number;
    median: number;
    stdDev: number;
    percentiles: { p10: number; p25: number; p75: number; p90: number };
  };

  /** 句読点・記号の使用パターン */
  punctuation: {
    /** 文末記号の分布（"。" → 0.35, "" (なし) → 0.40, "！" → 0.12, ...） */
    sentenceEnders: Record<string, number>;
    /** 読点の種類と頻度（"、" vs "," 等） */
    commaStyle: Record<string, number>;
    /** 括弧の種類と頻度 */
    bracketStyles: Record<string, number>;
  };

  /** 語尾パターン（形態素解析ベース、上位20件） */
  sentenceEndings: { ending: string; frequency: number; exampleTweetIds: TweetId[] }[];

  /** 文字種比率 */
  charTypeRatio: {
    hiragana: number;
    katakana: number;
    kanji: number;
    ascii: number;
    emoji: number;
  };

  /** 絵文字の使用（上位10件） */
  topEmoji: { emoji: string; count: number }[];

  /** 頻出単語・表現（形態素解析ベース、上位50件） */
  topTokens: { token: string; count: number; isNoun: boolean }[];

  /** 頻出n-gram（2-gram, 3-gram、上位20件ずつ） */
  topNgrams: {
    bigrams: { ngram: string; count: number }[];
    trigrams: { ngram: string; count: number }[];
  };

  /** 投稿時間帯分布（0-23時、各時間帯の投稿割合） */
  hourlyDistribution: number[]; // length: 24

  /** 改行の使い方 */
  lineBreaks: {
    /** 改行を含むツイートの割合 */
    tweetsWithBreaks: number;
    /** 改行を含むツイートの平均改行数 */
    avgBreaksPerTweet: number;
  };

  /** URL/メディア共有率 */
  sharingRate: { urlRate: number; mediaRate: number };

  /** リプライ率 */
  replyRate: number;

  /** 分析元データの統計 */
  sampleSize: number;
  analyzedAt: Timestamp;
}
```

### 2.4 中間データ型

```typescript
type Category = "tech" | "daily" | "opinion" | "emotion" | "creative" | "other";
type Sentiment = "positive" | "negative" | "neutral" | "mixed";

interface TaggedTweet {
  tweet: Tweet;
  category: Category;
  sentiment: Sentiment;
  topics: string[]; // 最大5件
}
```

#### トピッククラスタ

Step 2の分類結果を用いて、ツイートをカテゴリ別にグルーピングした中間データ。Step 3のクラスタ別分析の入力となる。

```typescript
interface TopicCluster {
  category: Category;
  tweets: TaggedTweet[];
  tweetCount: number;
}
```

#### クラスタ分析結果

各トピッククラスタから抽出された、そのモード（話題領域）における人格特徴。旧来の構造化プロファイル（`StyleProfile` 等）に代わり、**自然言語による記述** + **代表ツイート**の形式を取る。

```typescript
interface ClusterAnalysis {
  category: Category;
  tweetCount: number;
  /** このモードにおける人物の振る舞いを自然言語で記述（Markdown形式、500-1500字程度） */
  portrait: string;
  /** このクラスタを代表するツイート（最大10件）。人物らしさが特に強く出ているものを選定 */
  representativeTweets: TaggedTweet[];
  /** このモードでよく取る態度パターン */
  attitudePatterns: AttitudePattern[];
}

interface AttitudePattern {
  /** パターン名（例: "断言してから留保を入れる", "比喩で本質を突く"） */
  name: string;
  /** パターンの説明 */
  description: string;
  /** このパターンが現れている実際のツイートID */
  exampleTweetIds: TweetId[];
  /** このパターンが出現するカテゴリ群（B-12対応） */
  sourceCategories: Category[];
}
```

> B-12対応: `AttitudePattern` に `sourceCategories: Category[]` フィールドを追加。Step 4（合成）でモード共通/モード固有の態度パターンを区別するために使用する。

### 2.5 出力データ型

#### PersonaDocument

groa の最終成果物。構造化JSONではなく、**LLMがシステムプロンプトとして直接使用できる自然言語文書**として出力する。

```typescript
interface PersonaDocument {
  /** ドキュメントバージョン */
  version: string;
  createdAt: Timestamp;

  /**
   * ペルソナ記述本文（Markdown形式）。
   * LLMのシステムプロンプトにそのまま載せることを前提とした自然言語文書。
   *
   * 構成:
   * 1. 人物像サマリ（1-2段落）
   * 2. 文体ルール（具体例付き、「〜のように書く」「〜とは書かない」）
   * 3. トピック別モード記述（技術/日常/意見等、各モードごとの態度・トーン）
   * 4. 思考の癖（論理展開パターン、好む比喩、ユーモアの種類）
   * 5. 感情表現の特徴（頻度、引き金、表現の幅）
   * 6. 語彙の特徴（口癖、好む表現、避ける表現）
   */
  body: string;

  /** ボイスバンク: 人物らしさが凝縮された代表ツイート20-30件 */
  voiceBank: VoiceBankEntry[];

  /** 態度パターン一覧（全クラスタから統合） */
  attitudePatterns: AttitudePattern[];

  /** 合成時に検出・解消した矛盾の記録 */
  contradictions: string[];

  /** 元データの統計情報 */
  sourceStats: CorpusMetadata;
}

interface VoiceBankEntry {
  tweet: TaggedTweet;
  /** この代表ツイートを選んだ理由（「技術的皮肉の典型例」等） */
  selectionReason: string;
}
```

#### GeneratedText / EvaluationResult

```typescript
interface GeneratedText {
  text: string;
  topic: string;
  evaluation: EvaluationResult | null; // 評価済みの場合
  fewShotIds: TweetId[];
  modelUsed: ModelIdString;
}

interface EvaluationResult {
  /** 「同一人物が書いたように読めるか」の総合スコア (0.0-10.0) */
  authenticity: number;
  /** 文体の自然さ (0.0-10.0) */
  styleNaturalness: number;
  /** 態度・トーンの一致度 (0.0-10.0) */
  attitudeConsistency: number;
  /** 評価の根拠（自然言語） */
  rationale: string;
}
```

### 2.6 Embedding型

```typescript
interface TweetEmbedding {
  tweetId: TweetId;
  vector: Float32Array;
  dimensions: number;
}

interface EmbeddingIndex {
  embeddings: TweetEmbedding[];
  model: ModelIdString;
}
```

> B-3対応: `vector` の型を `Float64Array` → `Float32Array` に変更。Embedding ベクトルは通常 float32 精度で十分であり、メモリ使用量が半減する（384次元 × 8,000件 × 4bytes ≒ 約12MB）。JSON永続化時は `number[]` に変換し、読み込み時に `Float32Array` に復元する。Web版のIndexedDBでは `Float32Array` をそのまま保存できる（Structured Clone Algorithm対応）。

> D-2対応: `EmbeddingIndex.model` の型を `string` → `ModelIdString` に変更。Branded Type の一貫性を確保する。

### 2.7 Zodスキーマとの一体化方針

型定義と Zod スキーマの使い分けは以下の基準に従う:

| 分類 | 方針 | 例 |
|------|------|-----|
| 外部入力型 | Zod スキーマを正とし `z.infer` で型導出 | `Tweet`, 設定ファイル, LLM レスポンス |
| 内部データ型 | `interface` + 必要箇所で Zod バリデーション | `StyleStats`, `ClusterAnalysis` 等 |

外部入力型は信頼できないデータ（ユーザー入力、API応答）を扱うため、Zod によるランタイムバリデーションを必須とする。内部データ型は TypeScript の型チェックで十分なケースが多いが、永続化時の読み込みなど境界をまたぐ箇所では Zod バリデーションを適用する。

---

## 3. LLM抽象層の実装

> 対応する要件: spec.md §6

### 3.1 モデル定義

```typescript
type ModelTier = "haiku" | "sonnet" | "opus";

type ModelId =
  | "claude-haiku-4-5-20251001"
  | "claude-sonnet-4-6-20250227"
  | "claude-opus-4-6-20250313"
  | ModelIdString; // ユーザー指定の任意モデルID
```

> B-1対応: `ModelTier` → `ModelIdString` の解決（例: `"sonnet"` → `"claude-sonnet-4-6-20250227"`）は `LlmBackend` の各実装内で行う。呼び出し側（各パイプラインステップ）は `ModelTier` のみを指定し、具体的なモデルIDを知らない。解決に使用するマッピングは `config` パッケージの `models` 設定から取得する。

### 3.2 LlmBackend / LlmRequest / LlmResponse インターフェース

呼び出し側（各パイプラインステップ）はバックエンドの実装詳細を知らない。以下の共通インターフェースを介してLLMにアクセスする:

```typescript
type BackendType = "api" | "claude-code";

interface LlmBackend {
  complete(request: LlmRequest): Promise<LlmResponse>;
  backendType(): BackendType;
}

interface LlmRequest {
  model: ModelTier;
  messages: Message[];
  maxTokens: number;
  options: RequestOptions;
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface RequestOptions {
  temperature: number;    // default: 0.0 (分析系) or 0.7 (生成系)
  useCache: boolean;      // Prompt Caching使用の有無（apiのみ有効）
  useBatch: boolean;      // Batch API使用の有無（apiのみ有効）
}

interface LlmResponse {
  content: string;
  inputTokens: number | null;    // claude-codeでは取得不能な場合あり
  outputTokens: number | null;
  modelUsed: ModelIdString;
  cachedTokens: number;          // claude-codeでは常に0
  costUsd: number | null;        // 推計コスト（取得可能な場合）
}
```

### 3.3 APIバックエンド (`api`)

Anthropic Messages API に `fetch` でHTTPリクエストを発行する実装。Node.js / ブラウザの両方で動作する（`fetch` はNode.js 22でネイティブ対応済み）。

#### リトライ

レート制限 (429) に対し、exponential backoff で最大3回リトライする:

- 初回待機: 1秒
- 倍率: 2x（1秒 → 2秒 → 4秒）
- `Retry-After` ヘッダがあればそれに従う

#### タイムアウト

`AbortController` を使用し、1リクエストあたり120秒。

#### Batch API 実装仕様

`useBatch: true` の場合、リクエストをキューに蓄積し一括送信する。

- **ポーリング間隔**: 30秒
- **最大待機時間**: 60分
- **状態遷移**: `in_progress` → `ended` / `errored` / `expired` / `canceled`
- **custom_id設計**: `{stepName}-{batchIndex}-{itemIndex}` 形式で一意に識別する
- **B-9対応（部分失敗リトライ）**: バッチ内で一部のリクエストが失敗した場合、失敗分のみを新たなバッチとして再送信する。`custom_id` により失敗リクエストを特定し、最大1回の再送を行う。全件失敗の場合は `PipelineError` を throw する

#### Prompt Caching 実装仕様

`useCache: true` の場合、`cache_control` フィールドをリクエストに付与する。

- **B-10対応**: `cache_control` の配置位置は system prompt の末尾ブロックとする。これにより system prompt 全体がキャッシュ対象となる
- **TTL選択基準**: 連続生成時（Step 7 で複数件のテキストを生成する場合）は ephemeral（5分）ではなく 1h を推奨する。生成間隔が5分を超える可能性があるため

### 3.4 Claude Code CLIバックエンド (`claude-code`)

`child_process.execFile` で `claude -p` を実行し、プロンプトをstdin経由で送信、レスポンスをstdoutから読み取る実装。

#### 呼び出しパターン

```typescript
import { execFile } from "node:child_process";

const result = await execFileAsync("claude", [
  "-p",
  "--model", modelFlag,           // "haiku" | "sonnet" | "opus"
  "--system-prompt", systemPrompt,
  "--output-format", "json",
  "--max-turns", "1",
], {
  input: userPrompt,
  timeout: 180_000,
});
```

> A-3対応: `--tools ""` オプションは存在しないため削除。`-p` + `--max-turns 1` の組み合わせのみで記載する。

#### `--output-format json` のレスポンス構造

Claude Code CLI は `--output-format json` を指定した場合、以下の構造の JSON をstdoutに出力する:

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "result": "LLMの応答テキスト",
  "session_id": "...",
  "cost_usd": 0.123,
  "duration_ms": 4567,
  "duration_api_ms": 3456,
  "num_turns": 1,
  "usage": {
    "input_tokens": 100,
    "output_tokens": 200,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  }
}
```

#### 設計制約

- **Batch API非対応**: `useBatch: true` は無視する。ログに `warn` で通知し、逐次実行にフォールバック
- **Prompt Caching非対応（明示的制御）**: Claude Codeは内部的にPrompt Cachingを管理するが、groa側からは制御できない
- **temperature非対応**: `claude -p` にtemperatureフラグはない。ログに `info` で通知し無視する
- **リトライ**: 非ゼロ終了コード時、最大3回リトライ。stderrからエラー種別を推定する
- **タイムアウト**: `execFile` の `timeout` オプションで180秒。Claude Codeの初期化オーバーヘッドを考慮しAPIバックエンドより長い
- **コスト追跡**: `--output-format json` のレスポンスからトークン数を取得し、モデル別の単価テーブルからコストを推計する。取得不能な場合は `costUsd: null` とする
- **前提条件**: `claude` コマンドがPATH上に存在すること。`which claude` で事前チェックし、見つからなければインストール手順を案内するエラーを返す
- **Node.js CLIでのみ使用可能**。Web版では利用不可

### 3.5 Embedder インターフェース

Embeddingは Transformers.js を用いてローカルで実行する。外部APIへの依存はない。Node.js / ブラウザの両環境で同一の実装が動作する。

```typescript
interface Embedder {
  embed(texts: string[]): Promise<Float32Array[]>;
}
```

> B-3対応: 戻り値の型を `Float64Array[]` → `Float32Array[]` に変更。

#### 実装方針

- Transformers.js の `pipeline('feature-extraction', 'Xenova/multilingual-e5-small')` を使用
- ONNX INT8量子化モデル（約118MB）
- Node.js / ブラウザ共通の実装
- 入力テキストには multilingual-e5 の仕様に従い、用途に応じたプレフィックスを付与する:
  - インデックス構築時（Step 5）: `"passage: "` プレフィックス
  - クエリ時（Step 6）: `"query: "` プレフィックス
- バッチ処理: 一度に複数テキストを処理可能。メモリ効率のため128件ずつバッチ処理する
- 出力次元数: 384次元（Float32Array）

---

## 4. 各ステップの実装仕様

> 対応する要件: spec.md §4

### 4.0 Step 0: 前処理 (`packages/preprocess/`)

> 対応する要件: spec.md §4.0

#### フィルタ関数の合成パターン

以下の条件に合致するツイートを除外する。各ルールは独立した述語関数として実装する。

```typescript
type TweetFilter = (tweet: Tweet) => boolean;

const isRetweet: TweetFilter = (t) => t.isRetweet;
const isUrlOnly: TweetFilter = (t) => /* テキストがURLのみで構成 */;
const isTooShort = (minLen: number): TweetFilter => (t) => normalize(t.text).length < minLen;
const isBoilerplate = (patterns: RegExp[]): TweetFilter => (t) => patterns.some(p => p.test(t.text));
```

#### テキスト正規化

```typescript
type TextNormalizer = (text: string) => string;

const normalizers: TextNormalizer[] = [
  (text) => text.replace(/https?:\/\/\S+/g, "[URL]"),
  (text) => text.replace(/@\w+/g, ""),
  (text) => text.replace(/\s+/g, " ").trim(),
];
```

#### 正規表現パターン

- URL除去: `/https?:\/\/\S+/g`
- メンション除去: `/@\w+/g`
- 空白正規化: `/\s+/g`
- ボイラーパターンはユーザー設定で追加可能（`groa.json` の `steps.preprocess.boilerplatePatterns`）

#### preprocess 関数シグネチャ

フィルタ関数群を `TweetFilter[]` として合成し、`preprocess` 関数に渡す設計とする。新しいフィルタの追加が既存コードの変更を要さないこと（Open-Closed Principle）。

```typescript
function preprocess(
  tweets: Tweet[],
  filters: TweetFilter[],
  normalizers: TextNormalizer[],
): TweetCorpus;
```

### 4.1 Step 1: 統計的文体分析 (`packages/stats/`)

> 対応する要件: spec.md §4.1

#### kuromoji.js利用方針

- **辞書ロード**: kuromoji.js の辞書ファイル（約20MB gzip）を非同期ロードする。CLI版ではnode_modules内の辞書を直接参照、Web版ではCDNから非同期ロードしIndexedDBにキャッシュする
- **Web Worker実装方針**: 形態素解析は10,000件で数秒を要するため、Web版ではWeb Workerで実行し、UIスレッドのブロッキングを防ぐ

#### 形態素解析の具体的手順

1. **形態素解析**: 全ツイートを kuromoji.js でトークナイズ。品詞情報・読み・原形を取得する
2. **文字数統計**: 平均・中央値・標準偏差・パーセンタイルを算出
3. **句読点分析**: 文末記号・読点・括弧の種類と出現頻度を集計
4. **語尾抽出**: 各文の末尾トークン（助詞・助動詞・終助詞）をパターン化し、出現頻度でランキング。各パターンに実例ツイートIDを3件ずつ紐づけ
5. **文字種比率**: ひらがな/カタカナ/漢字/ASCII/絵文字の比率を算出
6. **頻出語彙**: 名詞・動詞・形容詞を抽出し、出現頻度でランキング（ストップワード除外）
7. **n-gram**: 2-gram / 3-gram を集計し、口癖や定型フレーズを検出
8. **時間帯分布**: `timestamp` から投稿時刻を抽出し、24時間分布を算出
9. **構造分析**: 改行頻度、URL/メディア共有率、リプライ率

#### 性能特性

| 指標 | 値 |
|------|-----|
| 処理時間（10,000件） | 数秒（形態素解析がボトルネック） |
| コスト | $0 |
| 再現性 | 完全（同一入力→同一出力） |
| Web版での動作 | kuromoji.jsはブラウザ対応。辞書ファイルのロードに約20MB必要 |

### 4.2 Step 2: 分類・タグ付け (`packages/classify/`)

> 対応する要件: spec.md §4.2

#### プロンプト設計

- 1回のリクエストに**50件**ずつ含める
- 出力フォーマットは **JSON Array** を強制
- カテゴリとセンチメントはリテラル型の値そのものを文字列として出力させる
- レスポンスは Zod スキーマでバリデーションする

#### バッチ構成

- **`api` バックエンド**: Batch APIで一括投入。50%割引が適用される
- **`claude-code` バックエンド**: 逐次実行。コストは約2倍、実行時間も大幅に増加する

#### 失敗ハンドリング詳細

- JSONパースまたはZodバリデーションに失敗したツイートには `category: "other"`, `sentiment: "neutral"` をフォールバック
- フォールバック発生時はログに警告を出力する
- 失敗率が10%を超えた場合はバッチ全体をリトライ（最大1回）

### 4.3 Step 3: クラスタ分析 (`packages/analyze/`)

> 対応する要件: spec.md §4.3

#### クラスタ分割実装

```typescript
function buildClusters(tagged: TaggedTweet[]): TopicCluster[] {
  // Category別にグルーピング
  // 件数が少ないカテゴリ（50件未満）は "other" に統合
  // 件数が多いカテゴリ（3000件超）は時系列で分割し、複数のClusterAnalysisを生成後に統合
}
```

| カテゴリ | 分割基準 | 分析観点 |
|---------|---------|---------|
| `tech` | そのまま1クラスタ | 技術に対する態度、説明の仕方、深掘り度 |
| `daily` | そのまま1クラスタ | 日常のトーン、自己開示の程度、雑談スタイル |
| `opinion` | そのまま1クラスタ | 主張の仕方、根拠の示し方、反論への態度 |
| `emotion` | そのまま1クラスタ | 感情表現の幅、引き金、表出スタイル |
| `creative` | そのまま1クラスタ | 創造性の発揮パターン、比喩・言葉遊び |
| `other` | 統合先 | — |

#### 分析プロンプト設計

各クラスタに対し、以下のコンテキストとともにLLMに分析を依頼する。

**LLMに渡すコンテキスト（ローカル分析結果）:**
- `StyleStats` から抽出した、このクラスタ固有の統計サマリ（クラスタ内ツイートに限定して再集計）
- 語尾パターン上位5件と実例
- 頻出表現上位10件

**LLMに要求する出力（意味理解が必要なもののみ）:**
1. **portrait**: このモードでの人物像を自然言語で記述（500-1500字）。統計値の羅列ではなく、「この人は技術の話をするとき、まず結論を短く断言し、その後に"まあ"で留保を入れる傾向がある」のような行動描写
2. **representativeTweets**: 人物らしさが凝縮されたツイートを最大10件選定。選定理由を含む
3. **attitudePatterns**: この人がこのモードで取る典型的な態度パターンを3-5件抽出。各パターンに名前・説明・実例ツイートIDを紐づけ

#### temperature: `0.0`

### 4.4 Step 4: ペルソナ文書合成 (`packages/synthesize/`)

> 対応する要件: spec.md §4.4

#### 合成処理フロー

1. **ペルソナ本文 (`body`) の生成**: 全クラスタの `portrait` と `StyleStats` を読み込み、§2.5で定義した6セクション構造に従って自然言語文書を生成する
   - **文体ルールセクション**では、`StyleStats` の確定的データを人間可読な記述に変換して埋め込む（例: `sentenceEndings[0].ending === "な"` → 「体言止めや語尾"な"を多用する（全文の約12%）。例: "フロントエンド、結局バンドラの問題な"」）
   - モード横断で一貫する特徴とモード固有の特徴を整理する
2. **ボイスバンクの選定**: 各クラスタの `representativeTweets` から20-30件を選定。カテゴリの多様性を確保する
3. **態度パターンの統合**: クラスタ間で重複するパターンを統合し、モード共通/モード固有を区別する
4. **矛盾の検出と記録**: モード依存の振る舞いは矛盾として解消せず保持する。本質的な矛盾（同一モード内の不整合等）のみ解消し `contradictions` に記録する

#### ペルソナ本文のクオリティ基準

`body` は以下の基準を満たすこと:
- LLMがシステムプロンプトとして直接使用可能な自然言語であること
- 「〜な傾向がある」のような抽象記述には必ず具体例を併記すること
- 「〜のように書く」「〜とは書かない」の形式で文体ルールを明示すること
- ボイスバンクのツイートを参照し、「例えばボイスバンク#3のように」の形で具体的な実例を紐づけること
- 全体で**3000-6000字程度**

#### ボイスバンク選定ロジック

各クラスタの `representativeTweets` から以下の基準で20-30件を選定する:
- **カテゴリの多様性**: 各カテゴリから最低2件ずつ選定（件数が十分な場合）
- **態度の多様性**: 同一カテゴリ内でも異なる `sentiment` のツイートを含める
- **選定理由の明確性**: 各 `VoiceBankEntry.selectionReason` に具体的な理由を記載する

#### temperature: `0.2`

### 4.5 Step 5: Embedding 生成 (`packages/embed/`)

> 対応する要件: spec.md §4.5

#### Transformers.js によるローカル推論

Transformers.js の `pipeline('feature-extraction', 'Xenova/multilingual-e5-small')` を用いてローカルでEmbeddingを生成する。

**推論パイプライン構築手順**:

1. `@xenova/transformers` パッケージをインポート
2. `pipeline('feature-extraction', 'Xenova/multilingual-e5-small')` でパイプラインを初期化
3. 入力テキストに `"passage: "` プレフィックスを付与（multilingual-e5の仕様）
4. バッチ単位（128件ずつ）で推論を実行し、384次元のFloat32Arrayを取得

**モデルのダウンロードとキャッシュ**:

- 初回実行時にONNX INT8量子化モデル（約118MB）を自動ダウンロード
- Node.js: ファイルシステムキャッシュ（`~/.cache/huggingface/` 配下）
- ブラウザ: Cache API / IndexedDB によるキャッシュ
- 2回目以降はキャッシュからロードされ、ネットワークアクセスは不要

**バッチ推論の方針**:

- メモリ効率のため128件ずつバッチ処理する
- 8,000件は約63バッチで完了する

#### 永続化形式

`EmbeddingIndex` はJSONとしてファイルに保存する。2回目以降の実行ではファイルが存在すれば読み込み、再計算をスキップする。

**JSON ↔ Float32Array 変換**:
- 保存時: `Float32Array` → `number[]` に変換してJSONシリアライズ
- 読み込み時: `number[]` → `new Float32Array(arr)` で復元

#### サイズ見積

384次元 × 8,000件 × 4bytes ≒ **約12MB**。JSON形式では約18-25MB。Web版のIndexedDBでも十分な容量内に収まる。

### 4.6 Step 6: 類似検索 (`packages/retrieve/`)

> 対応する要件: spec.md §5.1

#### 検索アルゴリズム

**Phase 1: 意味的類似検索（cosine similarity）**

クエリテキストを Transformers.js（multilingual-e5-small）でEmbedding化する。クエリには `"query: "` プレフィックスを付与する（インデックス構築時の `"passage: "` とは異なる）。Cosine similarity による全件スキャンで上位 `topK * 6` 件の候補を取得する。

**Phase 2: 多様性フィルタリング**

候補群から最終的な `k` 件を選定する。その際、以下の条件で多様性を確保する。

#### RetrieveOptions

```typescript
interface RetrieveOptions {
  topK: number;                    // default: 5
  sentimentDiversity: boolean;     // default: true
  categoryDiversity: boolean;      // default: true
}
```

- `sentimentDiversity: true` の場合、可能な限り異なる `sentiment` のツイートを含める。同一 sentiment に偏った候補セットを避ける
- `categoryDiversity: true` の場合、トピックに直接関連するカテゴリだけでなく、隣接カテゴリのツイートも1-2件含める

### 4.7 Step 7: テキスト生成 (`packages/generate/`)

> 対応する要件: spec.md §5.2

#### プロンプト構成（System + User の構造）

```
[System Prompt] ← Prompt Cache対象
  PersonaDocument.body（ペルソナ記述本文そのまま）
  ボイスバンクから5-10件（トピックに関連するものを優先選定）
  生成ルール（文字数制限、禁止表現等）

[User Message]
  トピック/指示
  few-shotツイート（Step 6のretrieve結果）
```

#### Prompt Caching配置

`PersonaDocument.body` + ボイスバンク部分は毎回同一であるため、`api` バックエンドではPrompt Cachingにより2回目以降のコストを90%削減できる。`claude-code` バックエンドではClaude Code内部のキャッシュ機構に依存する。

`cache_control` は system prompt の末尾ブロック（生成ルールの後）に配置する。

#### GenerateParams

```typescript
interface GenerateParams {
  topic: string;
  temperature: number;      // default: 0.7
  maxLength: number;         // default: 280
  numVariants: number;       // default: 1
  styleHint: string | null;  // 「皮肉っぽく」等の追加指示
}
```

#### temperature: `0.7`（`0.3`〜`1.0` で調整可能）

### 4.8 Step 8: 品質評価 (`packages/evaluate/`)

> 対応する要件: spec.md §5.3

#### 評価プロンプト構成

参照ツイート群 + ボイスバンク + 評価対象テキストを並べて「同一人物が書いたように読めるか」を直接判定する:

```
[System Prompt]
  あなたは文体分析の専門家です。以下の「参照ツイート群」と「評価対象テキスト」が
  同一人物によって書かれたものかどうかを評価してください。

[User Message]
  ## 参照ツイート群（この人物の実際のツイート）
  {Step 6で検索した関連ツイート5-10件}

  ## ボイスバンク（この人物の代表的なツイート）
  {PersonaDocument.voiceBankから5件}

  ## 評価対象テキスト
  {生成されたテキスト}

  ## 評価基準
  1. authenticity: 同一人物が書いたように読めるか (0-10)
  2. styleNaturalness: 文体が自然か、わざとらしくないか (0-10)
  3. attitudeConsistency: このトピックに対するこの人の態度として妥当か (0-10)
  4. rationale: 上記スコアの根拠を具体的に述べよ
```

#### 合格判定ロジック

- `authenticity >= 6.0` を合格とし、それ未満は再生成候補としてマークする
- しきい値は `groa.json` の `steps.evaluate.threshold` で変更可能

#### 評価用ツイートの選定

評価時のfew-shot元ツイートは、生成時のfew-shotとは**異なるセット**を使用する。Step 6の検索で `topK * 2` 件を取得し、前半を生成用、後半を評価用に分割する。これにより、生成時に直接参照されたツイートで評価するという循環を避ける。

---

## 5. パイプラインオーケストレーション

> 対応する要件: spec.md §3

### 5.1 実行関数シグネチャ

```typescript
async function runBuild(config: PipelineConfig, input: Tweet[]): Promise<PersonaDocument>;
async function runStep(config: PipelineConfig, step: BuildStepId): Promise<void>;
async function runGenerate(config: PipelineConfig, persona: PersonaDocument, params: GenerateParams): Promise<GeneratedText>;

type BuildStepId = "preprocess" | "stats" | "classify" | "analyze" | "synthesize" | "embed";
```

`Retrieve`, `Generate`, `Evaluate` は `BuildStepId` に含めない。これらはプロファイル構築後の「生成フェーズ」に属し、`runGenerate` 内で連鎖的に実行される。

### 5.2 StepCache

各ステップの出力はJSONファイルとして保存する。ファイル名規則: `{projectDir}/.groa/{stepName}.json`

```typescript
interface StepCache {
  inputHash: string;     // SHA-256
  output: unknown;       // ステップの出力（JSON-serializable）
  timestamp: Timestamp;
  cost: CostRecord;
}
```

### 5.3 キャッシュ無効化ルール

- 再実行時、既存の中間ファイルが存在し、入力のハッシュが一致すれば、そのステップをスキップする
- `--force` フラグが指定された場合はキャッシュを無視して再実行する
- あるステップを `--force` で再実行した場合、そのステップ以降のキャッシュは無効化される
- 依存ステップが再実行された場合、下流ステップのキャッシュも連鎖的に無効化される

### 5.4 コスト追跡

```typescript
interface CostRecord {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  model: ModelIdString;
  estimatedUsd: number;
}

interface PipelineCostSummary {
  steps: { stepName: string; cost: CostRecord }[];
  totalUsd: number;
}
```

各ステップ完了時にコストを表示し、パイプライン完了時に合計を表示する。

---

## 6. 設定管理の実装

> 対応する要件: spec.md §8

### 6.1 groa.json の完全スキーマ

```json
{
  "backend": "api",

  "apiKeys": {
    "anthropic": "${ANTHROPIC_API_KEY}"
  },

  "claudeCode": {
    "path": "claude",
    "maxTurns": 1,
    "maxBudgetUsd": null
  },

  "models": {
    "haiku": "claude-haiku-4-5-20251001",
    "sonnet": "claude-sonnet-4-6-20250227",
    "opus": "claude-opus-4-6-20250313",
    "embedding": "multilingual-e5-small"
  },

  "steps": {
    "preprocess": {
      "minTweetLength": 5,
      "boilerplatePatterns": ["おはようございます$", "^おやすみ$"]
    },
    "stats": {},
    "classify": { "batchSize": 50, "model": null, "apiKey": null },
    "analyze":  { "minClusterSize": 50, "maxClusterSize": 3000, "model": null, "apiKey": null },
    "synthesize": { "model": null, "apiKey": null },
    "embed":    { "model": null, "apiKey": null },
    "retrieve": { "topK": 5, "sentimentDiversity": true, "categoryDiversity": true },
    "generate": { "defaultTemperature": 0.7, "maxLength": 280, "numVariants": 1, "model": null, "apiKey": null },
    "evaluate": { "threshold": 6.0, "model": null, "apiKey": null }
  },

  "cacheDir": ".groa",
  "costLimitUsd": 10.0
}
```

### 6.2 設定解決ルール

#### `api` バックエンド時

```
1. steps.{stepName}.apiKey / steps.{stepName}.model  （工程別指定、最優先）
2. apiKeys.{provider} / models.{tier}                  （グローバル設定）
3. 環境変数 ANTHROPIC_API_KEY                            （フォールバック）
```

#### `claude-code` バックエンド時

```
1. steps.{stepName}.model                              （工程別指定、最優先）
2. models.{tier}                                        （グローバル設定）
3. Claude Codeのデフォルトモデル                            （フォールバック）
※ APIキーは不要（Claude Code自身の認証を使用）
※ Embedding (Step 5) はローカル実行（Transformers.js）のためAPIキー不要
```

### 6.3 ResolvedStepConfig 型定義

```typescript
interface ResolvedStepConfig {
  backend: BackendType;
  apiKey: string | null;
  model: ModelIdString;
  params: Record<string, unknown>;
}
```

各パッケージは `ResolvedStepConfig` のみを受け取る（設定全体への依存を禁止）。

### 6.4 設計制約

- APIキーは環境変数からの展開 (`${VAR}`) をサポートする
- `groa init` が生成する初期設定では全工程のオーバーライドは `null`。実行時にバックエンドをインタラクティブに選択する
- 設定ファイルが存在しない場合はデフォルト値 + 環境変数で動作する
- Zod スキーマで厳密にバリデーションし、不正なフィールドがあれば具体的なエラーメッセージを返す

---

## 7. I/O抽象とストレージ

> 対応する要件: spec.md §7.2

### 7.1 StorageAdapter インターフェース定義

CLI版とWeb版でI/O層を差し替える:

```typescript
interface StorageAdapter {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  listKeys(prefix: string): Promise<string[]>;
}
```

`pipeline` パッケージはこのインターフェースのみに依存し、ストレージの実体を知らない。

### 7.2 CLI実装

`node:fs/promises` ベースの実装。ファイルパスは `{cacheDir}/{key}` として解決する。

### 7.3 Web実装

IndexedDB + [idb](https://github.com/jakearchibald/idb) ライブラリを使用。

### 7.4 Float32Array の永続化方針

| 環境 | 方針 |
|------|------|
| CLI | JSON形式（`number[]` に変換してシリアライズ）。バイナリ形式も将来検討可 |
| Web | IndexedDB の Structured Clone で `Float32Array` を直接保存 |

---

## 8. エラーハンドリング実装

> 対応する要件: spec.md §9

### 8.1 PipelineError クラス定義

TypeScriptでは `Result` 型ではなく、型付きエラークラスの `throw` + `try/catch` パターンを採用する。

```typescript
class PipelineError extends Error {
  constructor(
    message: string,
    public readonly code: PipelineErrorCode,
    public readonly cause?: Error,
  ) {
    super(message);
  }
}
```

### 8.2 PipelineErrorCode 一覧

```typescript
type PipelineErrorCode =
  | "LLM_RATE_LIMIT"
  | "LLM_AUTH_ERROR"
  | "LLM_SERVER_ERROR"
  | "LLM_TIMEOUT"
  | "LLM_PARSE_ERROR"
  | "LLM_QUOTA_EXCEEDED"
  | "CLI_NOT_FOUND"
  | "CLI_EXEC_ERROR"
  | "PARSE_ERROR"
  | "IO_ERROR"
  | "VALIDATION_ERROR"
  | "CONFIG_ERROR"
  | "CACHE_ERROR";
```

### 8.3 エラーハンドリング方針

- 各ステップはエラーを `throw` で上位に伝播する。`catch` は `pipeline` パッケージでのみ行う
- レート制限は `llm-client` 内で自動リトライ後、最大回数を超えた場合にのみ throw する
- すべてのエラーにはユーザーが次にとるべきアクションを示すメッセージを含める

### 8.4 Logger インターフェース定義

```typescript
type LogLevel = "debug" | "info" | "warn" | "error";

interface Logger {
  log(level: LogLevel, step: string, message: string): void;
}
```

- CLI: stderr に出力。`--verbose` で `debug` レベルを有効化
- Web: `console` に委譲
- ログフォーマット: `[{timestamp}] [{level}] [{step}] {message}`

---

## 9. テスト戦略

> 対応する要件: spec.md §10.1

テストフレームワークには [Vitest](https://vitest.dev/) を使用する。

### 9.1 パッケージ別テスト方針表

| パッケージ | テスト種別 | フォーカス |
|-----------|----------|----------|
| `types` | ユニットテスト | Zodスキーマのバリデーション、branded typeの型安全性 |
| `preprocess` | ユニットテスト | 各フィルタ関数・正規化関数の入出力 |
| `stats` | ユニットテスト | 形態素解析ベースの語尾抽出、文字種比率、n-gram集計の正確性 |
| `classify` | スナップショットテスト | 固定入力に対するLLMレスポンスのパース結果 |
| `analyze` | スナップショットテスト | クラスタ分割ロジック + ClusterAnalysis生成結果 |
| `synthesize` | スナップショットテスト | 固定ClusterAnalysis群からのペルソナ文書合成結果 |
| `embed` | モックテスト | Embedder interfaceのモック実装 |
| `retrieve` | ユニットテスト | cosine similarity計算の正確性 + 多様性フィルタリング |
| `generate` | スナップショットテスト | プロンプト構築結果の検証（ペルソナ本文＋ボイスバンクの埋め込み） |
| `evaluate` | スナップショットテスト | 評価プロンプト構築（元ツイート直接比較形式）の検証 |
| `llm-client` (api) | モックテスト | fetchのモック。リクエスト構築・レスポンスパースの検証 |
| `llm-client` (claude-code) | モックテスト | `child_process.execFile` のモック。引数構築・JSON出力パース |
| `pipeline` | 結合テスト | モックLlmBackendでの全ステップ通し実行 |
| `config` | ユニットテスト | 設定解決ルール、環境変数展開、Zodバリデーション |

### 9.2 LLMテストの分離

実際のLLM呼び出しを含むテストは `vitest` のデフォルト実行から除外する。`vitest --project integration` で明示的に実行する。

### 9.3 テストデータ管理

- テスト用の固定ツイートデータセット（**100件程度**）をリポジトリに含める。実在のツイートは使用せず、合成データとする
- LLMレスポンスのスナップショットはリポジトリにコミットする

---

## 10. 設計判断の記録

spec.md に散在していた設計判断注記を以下に集約する。

### DJ-1: StyleStats の確定的算出

> **設計判断**: これらの数値は全て形態素解析とカウントで確定的に算出できる。LLMに「平均文字数を出して」と頼む必要はない。精度100%、コストゼロ、完全に再現可能。

- 対応する要件: spec.md §2.2（StyleStats型定義）
- 対応する実装: §2.3, §4.1

### DJ-2: PersonaDocument.body の自然言語形式

> **設計判断**: `body` はMarkdown形式の自然言語テキストであり、構造化フィールド（`avgLength: 42.3` 等）を持たない。LLMが「平均文字数42.3」から自然な文体を再現するのは困難だが、「この人は40字前後の短い文で、体言止めを多用し、末尾に"な"を付けることが多い。例: "フロントエンド、結局バンドラの問題な"」のような具体例付きの記述からは格段に再現しやすい。

- 対応する要件: spec.md §2.3（PersonaDocument型定義）
- 対応する実装: §2.5, §4.4

### DJ-3: カテゴリ別クラスタ分割

> **設計判断**: 旧設計の「2000件ずつの時系列チャンク → 平均化」から「カテゴリ別クラスタ → モード保持」に変更。これにより「技術の話をするときは断定的、日常の話では柔らかい」のようなモード切り替えが人格特徴として保存される。

- 対応する要件: spec.md §4.3（Step 3 クラスタ分析）
- 対応する実装: §4.3

### DJ-4: LLMには態度を聞き、統計は聞かない

> **設計判断**: LLMに「平均文字数は？」「よく使う句読点は？」と聞く必要はない — それは `StyleStats` に正確な数値がある。LLMには「この文体の統計的特徴を踏まえて、この人が技術について語るときの態度はどのようなものか」を聞く。

- 対応する要件: spec.md §4.3（Step 3 分析プロンプト設計方針）
- 対応する実装: §4.3

### DJ-5: 多様性フィルタリングによるfew-shot品質向上

> **設計判断**: Embedding検索だけでは「同じ話題の似たような態度のツイート」ばかり引くリスクがある。「技術への皮肉」と「技術への素直な感動」の両面がfew-shotに含まれることで、生成時にその人の態度の幅を再現できる。

- 対応する要件: spec.md §5.1（REQ-RET）
- 対応する実装: §4.6

### DJ-6: PersonaDocument.body がそのまま指示文となる設計

> **設計判断**: `PersonaDocument.body` は「LLMがシステムプロンプトとして直接使用できる自然言語文書」として設計されているため、JSONからプロンプトへの変換ロジックが不要。ペルソナ記述がそのまま指示文となる。

- 対応する要件: spec.md §5.2（REQ-GEN）
- 対応する実装: §4.7

### DJ-8: OpenAI Embedding API から Transformers.js + multilingual-e5-small への移行

> **設計判断**: OpenAI `text-embedding-3-small`（1536次元）から Transformers.js + `Xenova/multilingual-e5-small`（384次元）によるローカルEmbeddingに変更。理由は以下の通り:
>
> 1. **外部API依存の除去**: OpenAI APIキーの管理が不要になり、セットアップの障壁が下がる
> 2. **コスト削減**: Embedding生成のAPI呼び出しコストがゼロになる
> 3. **オフライン動作**: 初回のモデルダウンロード後はネットワーク接続不要で動作する
> 4. **環境統一**: Node.js / ブラウザの両方で同一のTransformers.js実装が動作し、バックエンド（api / claude-code）による分岐が不要になる
> 5. **サイズ効率**: 384次元で十分な類似検索精度を確保しつつ、インデックスサイズが約49MB→約12MBに縮小
>
> トレードオフとして、初回実行時にモデルファイル（約118MB）のダウンロードが発生する。ただしキャッシュされるため2回目以降の影響はない。

- 対応する要件: spec.md §4.5, §5.1
- 対応する実装: §3.5, §4.5, §4.6

### DJ-7: 元ツイート直接比較による評価

> **設計判断**: PersonaDocumentを介した間接評価は「プロファイルとの一致」を測るだけで「本人らしさ」を測れない。元ツイートとの直接比較により、プロファイルが捉え損ねた微細な特徴も評価に反映される。

- 対応する要件: spec.md §5.3（REQ-EVAL）
- 対応する実装: §4.8
