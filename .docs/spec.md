# groa 要件定義書

> 大量のツイートデータから人格プロファイルを抽出し、その人物「らしい」新規テキストを生成するパイプラインツール

**Name**: groa
**Version**: 0.1.0-draft
**Language**: TypeScript (Node.js / ブラウザ)
**Last Updated**: 2026-03-22
**関連文書**:
- [設計仕様書 (design-spec.md)](./design-spec.md) — 実装の「どう作るか (How)」を定義
- [設計根拠書 (design-rationale.md)](./design-rationale.md) — 各工程の学術的根拠

---

## 0. 文書の位置づけ

本文書は groa の「何を実現するか (What)」を定義する要件定義書である。
- 実装の詳細（TypeScriptインターフェース、ディレクトリ構成、プロンプト設計等）は design-spec.md を参照
- 各工程の学術的根拠は design-rationale.md を参照
- 仕様書に記載のない機能追加や設計変更は確認を取ること

---

## 1. プロダクト概要

### 1.1 目的と概要

groa（北欧神話の女預言者Gróaに由来。死者に呪文を唱え、失われた声を蘇らせる存在）は、大量のツイートデータから人格プロファイルを抽出し、その人物「らしい」新規テキストを生成するパイプラインツールである。

groaはハイブリッドパイプライン（ローカル統計分析 + LLM意味理解）を採用する。文体の定量的特徴（語尾パターン、句読点使用、文字種比率等）はローカルの形態素解析で確定的に抽出し、意味理解が必要な特徴（皮肉の検出、論理展開パターンの命名、代表ツイートの選定等）のみをLLMに委ねる。この分離により、LLMへのプロンプトが短縮され、コストが削減され、分析結果の再現性が向上する。

### 1.2 ターゲットユーザー

以下の2パターンを想定する:

1. **個人ユーザー**: 自分のツイートデータから文体プロファイルを構築し、テキスト生成に活用したい個人（CLI/Webともに利用）
2. **開発者**: キャラクター生成やペルソナ分析ツールを必要とする開発者（CLIを中心に利用、APIキー管理に抵抗なし）

**前提スキル**: JSONファイルの準備ができること。CLI版はターミナル操作、Web版はブラウザ操作。

### 1.3 ユースケース

**UC-1: CLIでプロファイル構築→テキスト生成**

1. ツイートデータ（JSON）を用意
2. `groa init` で設定ファイルを生成、バックエンド（anthropic/openrouter/claude-code）を選択
3. `groa build alice tweets.json` でプロファイル構築（Step 0-5、進捗表示あり）
   - groa形式でない場合は自動検知で変換、または `--format twint` / `--map-*` で明示指定
4. `groa inspect alice` でPersonaDocumentの内容を確認
5. `groa generate tweet alice "AIの未来"` でテキスト生成（Step 6-8）
6. 生成結果とauthenticityスコアを確認

**UC-2: Webでプロファイル構築→テキスト生成**

1. ブラウザでgroaを開き、APIキーを入力（メモリのみ保持）
2. ツイートデータ（JSON）をファイルアップロード
   - groa形式でない場合はフォーマットマッピング画面でキー対応を設定
3. 「Build」でプロファイル構築（リアルタイム進捗表示）
4. 「Generate」でトピックを入力しテキスト生成
5. 生成結果と評価スコアを確認

**UC-3: CLIで連続会話**

1. `groa generate converse alice "AIの未来"` で連続会話セッションを開始
2. 同一プロファイルが前ターンの文脈を踏まえて複数ターンのテキストを生成
3. ターン数は `--turns 5` で指定、または未指定で自動判断（LLMが会話の終了を判断）
4. 全ターン完了後にセッション全体の品質評価を実施
5. 会話ログは `.groa/sessions/` に自動保存

**UC-4: CLIでマルチプロファイル会話**

1. `groa generate multi alice bob --topic "AIの未来"` で複数プロファイル間の会話を開始
2. 各プロファイルが交互に発言し、相手の発言に反応して会話を展開
3. 参加者数に上限なし。`--topic` 省略時はプロファイルの興味内容からLLMがトピックを自動生成
4. 会話ログは `.groa/sessions/` に自動保存

**UC-5: CLI/Webでチャット**

1. `groa generate chat alice` でインタラクティブチャットを開始
2. ユーザーが文字入力するとプロファイルが応答、コンテキストを維持して会話を継続
3. CLI版はreadlineベース、Web版はチャットUI
4. セッション終了時に会話ログを `.groa/sessions/` に自動保存

### 1.4 外部データ変換

外部ツール（Twint / snscrape 等のスクレイパー）から出力されたJSON配列を groa の `Tweet[]` 形式に変換する中継機能を提供する。

**対応するインターフェース**:
- CLI: `groa build <tweets> --format <name>` でプリセット指定、`--map-*` オプションでカスタムキーマッピング。指定なしの場合は自動検知を試みる。`.js` ファイル（Twitter/X エクスポート形式）も直接指定可能
- Web: ファイルアップロード時にフォーマットを自動検知し、groa 形式でなければマッピング設定画面を表示。`.json` と `.js`（Twitter/X エクスポート形式）に対応

**変換のデータフロー**:
```
外部JSON[]  → [detectFormat] → [convertTweets] → Tweet[] → パイプライン
tweets.js   → [parseTweetsJs] → unknown[] → [detectFormat] → [convertTweets] → Tweet[]
```

**フィールドマッピングの抽象化**:
- `ConverterDefinition`: 各 Tweet フィールドに対する `sourceKey`（外部キー名）+ `FieldTransformer<T>`（変換関数）の組み合わせ
- `SimpleFieldMapping`: キー名のみの簡易指定（デフォルト変換ロジック適用）
- 組み込みプリセット:
  - `TWINT_DEFINITION`（Twint / snscrape 出力形式）
  - `TWITTER_ARCHIVE_DEFINITION`（Twitter/X 公式データエクスポート形式）

**タイムスタンプ変換**: 以下の形式を自動判定して Unix epoch ミリ秒に変換する:
1. 数値（秒/ミリ秒を桁数で自動判定）
2. `"YYYY-MM-DD HH:MM:SS TZ"` 形式（JST, UTC, PST 等の略語対応）
3. `"YYYY-MM-DD HH:MM:SS"` 形式（UTCとして扱う）
4. RFC 2822 風（`"Thu Oct 21 23:00:23 +0000 2020"`）
5. ISO 8601 文字列

**変換失敗時の振る舞い**: 変換に失敗したレコードはスキップし警告を記録する。全件失敗した場合はエラーをスローする。

**Twitter/X 公式データエクスポート対応**:

Twitter/X のデータエクスポート機能で取得できる `tweets.js` ファイルを直接読み込める。このファイルは JSON ではなく JavaScript 形式（`window.YTD.tweets.part0 = [...]`）であるため、プレフィックス除去と JSON パースを行うユーティリティ関数 `parseTweetsJs` を提供する。

- ファイル形式: `.js`（`window.YTD.tweets.part0 = [...]` 形式）
- 各要素は `{ "tweet": { ... } }` でネストされているため、アンラップして変換に渡す
- フィールドマッピング:

| groa フィールド | Twitter ソースキー | 変換ロジック |
|---|---|---|
| `id` | `id_str` | `toTweetId`（文字列をそのまま使用） |
| `text` | `full_text` | `toText` |
| `timestamp` | `created_at` | `toTimestamp`（RFC 2822 風、既存パーサーで対応済み） |
| `isRetweet` | `full_text` | カスタム: `full_text.startsWith("RT @")` で判定（`retweeted` フィールドはアーカイブでは常に `false` のため不使用） |
| `hasMedia` | `entities` | カスタム: `entities.media` 配列の有無で判定 |
| `replyTo` | `in_reply_to_status_id_str` | `toNullableTweetId` |

- CLI: `--format twitter-archive` で明示指定、または自動検出
- Web: `.js` ファイルのアップロードに対応。`parseTweetsJs` でパース後、自動検出またはプリセット選択

**パッケージ配置**: `packages/convert/`（`@groa/types` のみに依存。CLI / Web 両環境で動作）

### 1.5 スコープ外（v0.1.0）

以下の機能はv0.1.0のスコープ外とする:

- マルチモーダル入力（画像、動画の分析）
- LoRAファインチューニング
- 複数人物のブレンド
- 差分更新（ツイート追加時の増分プロファイル更新）
- CORSプロキシの同梱
- Embeddingの次元圧縮
- Embeddingレス構成（Embedding未生成でのfew-shot検索）
- Pro/Maxモデルの定額コスト追跡

---

## 2. データモデル

TypeScriptのインターフェース定義は design-spec.md §2 を参照。

### 2.1 入力データ

**Tweet**

| フィールド | 型 | 説明 |
|---|---|---|
| id | TweetId (string) | ツイートの一意識別子 |
| text | string | ツイート本文 |
| timestamp | Timestamp (number) | Unix epoch ミリ秒 |
| isRetweet | boolean | リツイートか否か |
| hasMedia | boolean | メディア添付の有無 |
| replyTo | TweetId \| null | リプライ先のツイートID |

**TweetCorpus**

| フィールド | 型 | 説明 |
|---|---|---|
| tweets | Tweet[] | 前処理済みツイート群 |
| metadata | CorpusMetadata | コーパスのメタ情報 |

**CorpusMetadata**

| フィールド | 型 | 説明 |
|---|---|---|
| totalCount | number | 処理前の総ツイート数 |
| dateRange | { start: Timestamp, end: Timestamp } | データの日付範囲 |
| filteredCount | number | フィルタで除外された件数 |

### 2.2 中間データ

**カテゴリ・センチメント定義**

| 値 | 型 |
|---|---|
| "tech" \| "daily" \| "opinion" \| "emotion" \| "creative" \| "other" | Category |
| "positive" \| "negative" \| "neutral" \| "mixed" | Sentiment |

**TaggedTweet**

| フィールド | 型 | 説明 |
|---|---|---|
| tweet | Tweet | 元ツイート |
| category | Category | 分類カテゴリ |
| sentiment | Sentiment | 感情ラベル |
| topics | string[] | トピックタグ（最大5件） |

**TopicCluster**

| フィールド | 型 | 説明 |
|---|---|---|
| category | Category | クラスタのカテゴリ |
| tweets | TaggedTweet[] | クラスタ内ツイート |
| tweetCount | number | ツイート数 |

**ClusterAnalysis**

| フィールド | 型 | 説明 |
|---|---|---|
| category | Category | 分析対象のカテゴリ |
| tweetCount | number | 分析したツイート数 |
| portrait | string | このモードにおける人物の振る舞い（Markdown、500-1500字） |
| representativeTweets | TaggedTweet[] | 代表ツイート（最大10件） |
| attitudePatterns | AttitudePattern[] | 態度パターン（3-5件） |

**AttitudePattern**

| フィールド | 型 | 説明 |
|---|---|---|
| name | string | パターン名（例: "断言してから留保を入れる"） |
| description | string | パターンの説明 |
| exampleTweetIds | TweetId[] | パターンが現れるツイートのID |
| sourceCategories | Category[] | このパターンの由来モード |

**StyleStats**

文字数分布:

| フィールド | 型 | 説明 |
|---|---|---|
| lengthDistribution.mean | number | 平均文字数 |
| lengthDistribution.median | number | 中央値 |
| lengthDistribution.stdDev | number | 標準偏差 |
| lengthDistribution.percentiles | { p10, p25, p75, p90: number } | パーセンタイル |

句読点パターン:

| フィールド | 型 | 説明 |
|---|---|---|
| punctuation.sentenceEnders | Record<string, number> | 文末記号の分布 |
| punctuation.commaStyle | Record<string, number> | 読点の種類と頻度 |
| punctuation.bracketStyles | Record<string, number> | 括弧の種類と頻度 |

語尾パターン:

| フィールド | 型 | 説明 |
|---|---|---|
| sentenceEndings | { ending: string, frequency: number, exampleTweetIds: TweetId[] }[] | 語尾パターン上位20件。各パターンに実例ツイートID 3件を紐づけ |

文字種比率:

| フィールド | 型 | 説明 |
|---|---|---|
| charTypeRatio.hiragana | number | ひらがな比率 |
| charTypeRatio.katakana | number | カタカナ比率 |
| charTypeRatio.kanji | number | 漢字比率 |
| charTypeRatio.ascii | number | ASCII比率 |
| charTypeRatio.emoji | number | 絵文字比率 |

絵文字使用:

| フィールド | 型 | 説明 |
|---|---|---|
| topEmoji | { emoji: string, count: number }[] | 上位10件 |

頻出語彙:

| フィールド | 型 | 説明 |
|---|---|---|
| topTokens | { token: string, count: number, isNoun: boolean }[] | 上位50件（ストップワード除外） |

頻出n-gram:

| フィールド | 型 | 説明 |
|---|---|---|
| topNgrams.bigrams | { ngram: string, count: number }[] | 2-gram 上位20件 |
| topNgrams.trigrams | { ngram: string, count: number }[] | 3-gram 上位20件 |

投稿時間帯分布:

| フィールド | 型 | 説明 |
|---|---|---|
| hourlyDistribution | number[] | 24要素の配列（各時間帯の投稿比率） |

改行統計:

| フィールド | 型 | 説明 |
|---|---|---|
| lineBreaks.tweetsWithBreaks | number | 改行を含むツイートの割合 |
| lineBreaks.avgBreaksPerTweet | number | 1ツイートあたりの平均改行数 |

共有率:

| フィールド | 型 | 説明 |
|---|---|---|
| sharingRate.urlRate | number | URL含有率 |
| sharingRate.mediaRate | number | メディア含有率 |

リプライ率:

| フィールド | 型 | 説明 |
|---|---|---|
| replyRate | number | リプライの割合 |

メタ情報:

| フィールド | 型 | 説明 |
|---|---|---|
| sampleSize | number | 分析対象のツイート件数 |
| analyzedAt | Timestamp | 分析実行日時 |

### 2.3 出力データ

**PersonaDocument**

| フィールド | 型 | 説明 |
|---|---|---|
| version | string | ドキュメントバージョン |
| createdAt | Timestamp | 作成日時 |
| body | string | ペルソナ記述本文（Markdown）。LLMのシステムプロンプトにそのまま使用可能。構成: (1)人物像サマリ (2)文体ルール (3)トピック別モード記述 (4)思考の癖 (5)感情表現の特徴 (6)語彙の特徴 |
| voiceBank | VoiceBankEntry[] | 代表ツイート20-30件 |
| attitudePatterns | AttitudePattern[] | 態度パターン一覧（全クラスタから統合、モード情報付き） |
| contradictions | string[] | 検出した矛盾の記録（モード間矛盾は保持、解消しない） |
| sourceStats | CorpusMetadata | 元データの統計情報 |

**VoiceBankEntry**

| フィールド | 型 | 説明 |
|---|---|---|
| tweet | TaggedTweet | 代表ツイート |
| selectionReason | string | 選定理由 |

**Session**

セッションは全てのテキスト生成の統一単位。単発ツイート生成も「1ターン・1参加者のセッション」として扱う。

| フィールド | 型 | 説明 |
|---|---|---|
| id | string | セッション一意識別子 |
| mode | SessionMode | "tweet" \| "converse" \| "multi" \| "chat" |
| topic | string | セッションのトピック |
| participants | SessionParticipant[] | 参加者一覧 |
| turns | SessionTurn[] | ターン一覧 |
| evaluation | SessionEvaluation \| null | セッション全体の評価（Step 8完了後に付与） |
| createdAt | Timestamp | セッション開始日時 |
| completedAt | Timestamp \| null | セッション完了日時 |

**SessionParticipant**

| フィールド | 型 | 説明 |
|---|---|---|
| buildName | string | ビルド名（chatモードのユーザーは "__user__"） |
| role | "persona" \| "human" | 参加者の種別 |

**SessionTurn**

| フィールド | 型 | 説明 |
|---|---|---|
| index | number | ターン番号（0始まり） |
| speakerId | string | 発言者のbuildName |
| text | string | 生成テキスト |
| fewShotIds | TweetId[] | few-shotに使用したツイートID |
| modelUsed | ModelIdString (string) | 使用したモデルID |
| timestamp | Timestamp | 生成日時 |

**SessionEvaluation**

| フィールド | 型 | 説明 | 範囲 |
|---|---|---|---|
| authenticity | number | tweetモード: 同一人物が書いたように読めるか / 会話モード: 各ターンがキャラクターらしいか | 0.0-10.0 |
| coherence | number | tweetモード: 文体の自然さ / 会話モード: 前文脈を踏まえた一貫性 | 0.0-10.0 |
| consistency | number | tweetモード: 態度・トーンの一致度 / 会話モード: 会話全体の自然さ | 0.0-10.0 |
| rationale | string | 評価の根拠（自然言語） | — |

### 2.4 Embeddingデータ

**TweetEmbedding**

| フィールド | 型 | 説明 |
|---|---|---|
| tweetId | TweetId | ツイートID |
| vector | 32bit浮動小数点配列 | Embeddingベクトル（Float32Array） |
| dimensions | number | ベクトルの次元数（384） |

**EmbeddingIndex**

| フィールド | 型 | 説明 |
|---|---|---|
| embeddings | TweetEmbedding[] | 全ツイートのEmbedding |
| model | ModelIdString (string) | 使用したモデルID |

---

## 3. パイプライン概要

### 3.1 全体データフロー図

```
Tweet[] (入力)
  │
  ▼
[Step 0: 前処理] ─────────────────────────────► TweetCorpus
  │                                                  │
  ▼                                                  ▼
[Step 1: 統計的文体分析] ─────────────────────► StyleStats
  │                                                  │
  ▼                                                  │
[Step 2: 分類・タグ付け] ─────────────────────► TaggedTweet[]
  │                                                  │
  ▼                                                  │
[Step 3: クラスタ分析] ◄── StyleStats ────────► ClusterAnalysis[]
  │                                                  │
  ▼                                                  │
[Step 4: ペルソナ合成] ◄── StyleStats, CorpusMetadata ─► PersonaDocument
  │
  ▼
[Step 5: Embedding生成] ──────────────────────► EmbeddingIndex
  ║
  ║  ═══════ ビルドフェーズ完了 ═══════
  ║
  ▼
[Step 6: 類似検索] ◄── トピック ──────────────► TaggedTweet[] (生成用 + 評価用)
  │
  ▼
[Step 7: セッション実行] ◄── PersonaDocument ──► Session（4モード対応）
  │
  ▼
[Step 8: セッション評価] ◄── 元ツイート ────────► SessionEvaluation
```

Step 0-1 はローカル処理（LLM不使用、コスト$0）。Step 5-6 もローカル計算（コスト$0）。

### 3.2 フェーズ区分

- **ビルドフェーズ (Step 0-5)**: プロファイル構築。`groa build` で一括実行
- **ジェネレートフェーズ (Step 6-8)**: セッション実行と評価。`groa generate <mode>` で一括実行。4つのモード（tweet / converse / multi / chat）に対応
- ビルドフェーズの成果物（PersonaDocument + EmbeddingIndex）は永続化され、ジェネレートフェーズで繰り返し利用可能

### 3.3 ステップ一覧表

| Step | 名称 | 入力 | 出力 | LLMモデル | コスト概算(api) |
|------|------|------|------|-----------|----------------|
| 0 | 前処理 | Tweet[] | TweetCorpus | なし | $0 |
| 1 | 統計的文体分析 | TweetCorpus | StyleStats | なし | $0 |
| 2 | 分類・タグ付け | TweetCorpus | TaggedTweet[] | quick (Batch) | ~$0.17 |
| 3 | クラスタ分析 | TaggedTweet[], StyleStats | ClusterAnalysis[] | standard | ~$1.50 |
| 4 | ペルソナ合成 | ClusterAnalysis[], StyleStats, CorpusMetadata | PersonaDocument | deep | ~$0.50 |
| 5 | Embedding生成 | TweetCorpus | EmbeddingIndex | multilingual-e5-small（ローカル） | $0 |
| 6 | 類似検索 | トピック, EmbeddingIndex, TaggedTweet[] | TaggedTweet[] (2*topK件) | multilingual-e5-small（ローカル、クエリのみ） | $0 |
| 7 | セッション実行 | PersonaDocument, TaggedTweet[] (few-shot), トピック | Session | standard + Prompt Caching | ~$0.009/件 |
| 8 | セッション評価 | Session, TaggedTweet[] (比較用), PersonaDocument | SessionEvaluation | standard | ~$0.01/件 |

---

## 4. 機能要件: ビルドフェーズ

各ステップには要件IDを付与。実装詳細（プロンプト設計、関数シグネチャ等）は design-spec.md §4 を参照。

### 4.0 REQ-PRE: 前処理

**責務**: 生ツイートデータのクリーニングとフィルタリング
**入力**: Tweet[]
**出力**: TweetCorpus
**LLM**: 不使用

**フィルタリング条件**:
- リツイートを除外
- テキストがURLのみで構成されるツイートを除外
- 正規化後のテキストが所定の最小文字数（デフォルト5文字）未満のツイートを除外
- 設定で指定された定型パターン（ボイラープレート）に一致するツイートを除外

**テキスト正規化ルール**:
- URLを `[URL]` プレースホルダに置換
- メンション（@ユーザー名）を除去
- 連続する空白文字を単一スペースに正規化し、前後の空白を除去

フィルタは合成可能な設計とし、新規フィルタの追加が既存コードの変更を要さないこと。

設計根拠: [design-rationale.md §Step 0](./design-rationale.md) を参照

### 4.1 REQ-STAT: 統計的文体分析

**責務**: ツイート群から文体の定量的特徴をローカルで抽出する
**入力**: TweetCorpus
**出力**: StyleStats
**LLM**: **不使用**
**依存ライブラリ**: kuromoji.js（形態素解析）

**抽出すべき特徴量**:
1. 文字数分布（平均・中央値・標準偏差・パーセンタイル）
2. 句読点パターン（文末記号・読点・括弧の種類と出現頻度）
3. 語尾パターン（形態素解析ベース、上位20件、各パターンに実例ツイートID 3件紐づけ）
4. 文字種比率（ひらがな/カタカナ/漢字/ASCII/絵文字）
5. 絵文字使用（上位10件）
6. 頻出語彙（名詞・動詞・形容詞、上位50件、ストップワード除外）
7. 頻出n-gram（2-gram/3-gram、各上位20件）
8. 投稿時間帯分布（24時間）
9. 構造分析（改行頻度、URL/メディア共有率、リプライ率）

**性能特性**:

| 指標 | 値 |
|------|-----|
| 処理時間（10,000件、Node.js） | 30秒以内 |
| コスト | $0 |
| 再現性 | 完全（同一入力→同一出力） |
| Web版 | kuromoji.js辞書は約20MB (gzip)、展開後約50MB。Web Workerでの実行が必要 |

設計根拠: [design-rationale.md §Step 1](./design-rationale.md) を参照

### 4.2 REQ-CLS: 分類・タグ付け

**責務**: 各ツイートへのカテゴリ・感情ラベルの付与
**入力**: TweetCorpus
**出力**: TaggedTweet[]
**LLM**: quick
**temperature**: 0.0
**API方式**: Batch API（anthropicバックエンド時、50%割引） / 逐次実行（claude-codeバックエンド時）

**要件**:
- 1回のリクエストに50件ずつ含める
- 出力はJSON形式とし、Zodスキーマでバリデーションする
- カテゴリとセンチメントは定義済みリテラル値のみ許容

**失敗時の振る舞い**:
- パースまたはバリデーション失敗のツイート → `category: "other"`, `sentiment: "neutral"` でフォールバック
- フォールバック発生時はログに警告
- 失敗率が10%を超えた場合、バッチ全体をリトライ（最大1回）

設計根拠: [design-rationale.md §Step 2](./design-rationale.md) を参照

### 4.3 REQ-ANA: クラスタ分析

**責務**: カテゴリ別にグルーピングされたツイート群から、各モードにおける人格特徴を抽出する
**入力**: TaggedTweet[], StyleStats
**出力**: ClusterAnalysis[]
**LLM**: standard
**temperature**: 0.0

**クラスタ分割戦略**:
- Step 2で付与された category でグルーピング
- 50件未満のカテゴリは "other" に統合
- 3000件超のカテゴリは時系列で分割し、複数のClusterAnalysisを生成後に統合

**クラスタ固有StyleStatsの再集計**:
- 各クラスタについて、クラスタ内ツイートに限定したStyleStatsのサブセット（語尾パターン上位5件・頻出表現上位10件）を再集計する
- 全体StyleStatsの完全な再計算は行わない

**LLMへのコンテキスト**（ローカル分析結果）:
- クラスタ固有の統計サブセット
- 語尾パターン上位5件と実例
- 頻出表現上位10件

**LLMに要求する出力**（意味理解が必要なもののみ）:
1. portrait: このモードでの人物像（500-1500字）
2. representativeTweets: 代表ツイート最大10件（選定理由付き）
3. attitudePatterns: 態度パターン3-5件（名前・説明・実例ツイートID）

設計根拠: [design-rationale.md §Step 3](./design-rationale.md) を参照

### 4.4 REQ-SYN: ペルソナ文書合成

**責務**: StyleStats + ClusterAnalysis[] を合成し、1つの PersonaDocument を生成する
**入力**: ClusterAnalysis[], StyleStats, CorpusMetadata
**出力**: PersonaDocument
**LLM**: deep
**temperature**: 0.2

**合成で行うべきこと**:
1. ペルソナ本文 (body) の生成: 6セクション構成の自然言語文書（3000-6000字）
2. ボイスバンクの選定: 各クラスタの代表ツイートから20-30件、カテゴリ多様性を確保
3. 態度パターンの統合: クラスタ間で重複するパターンを統合し、各パターンに由来モード情報（sourceCategories）を付与
4. 矛盾の検出と記録: モード依存の振る舞いは矛盾として解消せず保持。本質的矛盾のみ解消

**ペルソナ本文のクオリティ基準**:
- LLMがシステムプロンプトとして直接使用可能な自然言語であること
- 抽象記述には必ず具体例を併記すること
- 「〜のように書く」「〜とは書かない」の形式で文体ルールを明示すること
- 文体ルールセクションでは StyleStats の確定的データを人間可読な記述に変換して埋め込むこと

**deepティアを使用する根拠**: 複数モードの統合に高度な判断が必要。実行は1回のみでコストインパクト最小。ペルソナ文書の品質が後続全工程の品質上限を決定する。

設計根拠: [design-rationale.md §Step 4](./design-rationale.md) を参照

### 4.5 REQ-EMB: Embedding生成

**責務**: ツイートのベクトル化とインデックス構築
**入力**: TweetCorpus（前処理済み）
**出力**: EmbeddingIndex
**モデル**: multilingual-e5-small（Transformers.js経由、ローカル実行）
**外部API**: 不使用

**要件**:
- Transformers.js + ONNX Runtime で multilingual-e5-small を実行する
- Node.js（CLI）とブラウザ（Web）の両環境で同一モデルを使用する
- ONNX INT8量子化モデル（約118MB）を使用し、初回ダウンロード後はキャッシュする
- 永続化: JSONファイル（CLI）/ IndexedDB（Web）に保存。再実行時はスキップ
- サイズ見積: 384次元 × 8,000件 × 4bytes ≒ **約12MB**（Float32Array）。JSON形式では約18-25MB

設計根拠: [design-rationale.md §Step 5](./design-rationale.md) を参照

---

## 5. 機能要件: ジェネレートフェーズ

### 5.1 REQ-RET: 類似検索

**責務**: トピックに関連し、かつ態度の多様性を確保したツイートの検索
**入力**: トピック文字列, EmbeddingIndex, TaggedTweet[]
**出力**: TaggedTweet[] （生成用 topK 件 + 評価用 topK 件 = 2*topK 件）
**LLM**: multilingual-e5-small（ローカル、クエリEmbeddingのみ）

**検索アルゴリズム**:
1. Phase 1（意味的類似検索）: Cosine similarity で上位 topK * 6 件の候補を取得
2. Phase 2（多様性フィルタリング）: sentiment/category の多様性を確保しつつ 2*topK 件を選定
3. 選定結果を前半（生成用）と後半（評価用）に分割して返す

**設定パラメータ**:
- topK: デフォルト 5
- sentimentDiversity: デフォルト true
- categoryDiversity: デフォルト true

**候補不足時**: topK * 6 件に満たない場合、取得可能な全件から多様性フィルタリングを行う。2*topK 件に満たない場合、取得件数を半分に分割する。

設計根拠: [design-rationale.md §Step 6](./design-rationale.md) を参照

### 5.2 REQ-SESSION: セッション実行

**責務**: PersonaDocumentに基づく会話セッションの実行
**入力**: PersonaDocument, TaggedTweet[]（生成用few-shot）, トピック文字列, セッションパラメータ
**出力**: Session
**LLM**: standard + Prompt Caching（anthropicバックエンド時）
**temperature**: 0.7（0.3〜1.0で調整可能）

#### セッションモード

| モード | 説明 | 参加者 | ターン数 |
|--------|------|--------|---------|
| tweet | 単発テキスト生成（旧generateと等価） | 1 persona | 1 |
| converse | 連続会話（前ターンの文脈を踏まえた複数ターン生成） | 1 persona | N（指定 or 自動判断） |
| multi | マルチプロファイル会話（複数プロファイル間の対話） | N persona | N（ラウンドロビン） |
| chat | インタラクティブチャット（ユーザーとプロファイルの対話） | 1 persona + human | N（ユーザー終了まで） |

#### 共通フロー

各ターンで以下を実行する:
1. retrieve（Step 6）でトピックに関連するfew-shotツイートを取得
2. システムプロンプト（PersonaDocument.body + ボイスバンク + ルール）を構築
3. ユーザーメッセージ（トピック + few-shot + 会話履歴）を構築
4. LLMで生成

#### tweetモード固有

- 現行の `groa generate` と完全に等価な動作
- `numVariants > 1` の場合、独立したtweetセッションをN回実行
- `styleHint` による追加スタイル指示に対応

#### converseモード固有

- 各ターンの会話履歴をユーザーメッセージに「コンテキスト転写」として含める
- ターン数指定（`--turns N`）または自動判断（メタLLM判定）
- 自動判断: quickモデル（temperature 0.0）で「会話を続けるべきか」を判定。失敗時は続行にフォールバック
- 自動判断時の安全上限: `autoTurnLimit`（デフォルト8）
- 長文も許容（`maxLength` で制御）

#### multiモード固有

- 各ターンでシステムプロンプトを現在の話者のPersonaDocumentに切り替え
- 他の話者の発言は会話履歴としてユーザーメッセージに含める
- 話者順序はラウンドロビン
- トピック未指定時: 各参加者のPersonaDocumentの興味内容からLLMが共通トピックを自動生成
- 参加者数に上限なし

#### chatモード固有

- `getUserInput` コールバックでユーザー入力を受け取る（CLI: readline、Web: UIコンポーネント）
- ユーザーの発言もSessionTurnとして記録（`role: "human"`, `speakerId: "__user__"`）
- セッション実行エンジン自体はNode.js固有APIに依存しない（CLI/Web共通）

#### セッションパラメータ

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| mode | SessionMode | - | セッションモード（必須） |
| topic | string? | - | トピック（tweet/converseで必須、multi/chatは省略可。省略時はLLMが自動生成） |
| temperature | number | 0.7 | LLMのtemperature (0.3〜1.0) |
| maxLength | number | 280 | 1ターンの最大文字数 |
| maxTurns | number \| null | null | ターン数上限（null=自動判断） |
| autoTurnLimit | number | 8 | 自動判断時の安全上限 |
| numVariants | number | 1 | tweetモード専用、生成バリアント数 |
| styleHint | string \| null | null | 追加スタイル指示 |

#### セッションログの永続化

全セッションの結果を `.groa/sessions/{sessionId}.json` に保存する。
- `sessionId` の形式: `{mode}-{YYYYMMDD}-{6桁hex}`（例: `tweet-20260323-a3f2b1`）
- ビルドキャッシュ（`.groa/{buildName}/`）とは独立したディレクトリに保存
- セッション内の `participants[].buildName` で使用したビルドを追跡可能

設計根拠: [design-rationale.md §Step 7](./design-rationale.md) を参照

### 5.3 REQ-SESS-EVAL: セッション評価

**責務**: セッション全体の品質を評価する
**入力**: Session, TaggedTweet[]（評価用の元ツイート）, PersonaDocument
**出力**: SessionEvaluation
**LLM**: standard
**temperature**: 0.0

#### 評価手法

- tweetモード（1ターン）: 元ツイートと生成テキストを並べて「同一人物が書いたように読めるか」を直接判定（現行と同等）
- 会話モード（複数ターン）: 会話ログ全体を1回のLLM呼び出しで評価。各ターンの人物らしさ、文脈の一貫性、会話の自然さを判定

#### 評価軸（全モード共通スキーマ、解釈がモードで異なる）

| 軸 | tweetモードでの解釈 | 会話モードでの解釈 |
|---|---|---|
| authenticity | 同一人物が書いたように読めるか | 各ターンがキャラクターらしいか（平均） |
| coherence | 文体の自然さ | 前の発言を踏まえた文脈的一貫性 |
| consistency | 態度・トーンの一致度 | 会話全体の流れの自然さ |

#### 評価用ツイートの選定

- Step 6で生成用とは異なるセットを使用（循環回避）
- ボイスバンクからも5件を評価コンテキストに含める

#### 合格判定

authenticity >= 6.0（設定で変更可能）

#### evaluationフィールドのライフサイクル

- Session生成直後は `evaluation: null`
- Step 8完了後に `evaluation` フィールドが付与される
- 一度付与された evaluation は不変
- chatモードではデフォルトで評価をスキップ（`--eval` オプションで明示的に有効化）

設計根拠: [design-rationale.md §Step 8](./design-rationale.md) を参照

---

## 6. LLMバックエンド要件

### 6.1 バックエンド概要

LLMプロバイダへのアクセス方法として3つのバックエンドを提供する。

| バックエンド | 識別名 | 概要 |
|-------------|--------|------|
| Anthropic API直接呼び出し | `anthropic` | Anthropic Messages APIにHTTPリクエスト。APIキーが必要 |
| OpenRouter API | `openrouter` | OpenRouter API (OpenAI互換) にHTTPリクエスト。OpenRouter APIキーが必要 |
| Claude Code CLI | `claude-code` | `claude -p`（printモード）をサブプロセスで起動。Claude Codeの認証を利用 |

**モデル指定**: ティア（quick / standard / deep）で指定し、具体的なモデルIDへの解決は設定管理層が行う。

**バックエンド選択の指針**:
- 手軽に試したい / APIキー不要 → `claude-code`
- コスト最適化 / 大量処理 → `anthropic`（Batch API・Prompt Caching対応）
- Web版 → `anthropic` 一択

### 6.2 機能対応表

| 機能 | `anthropic` | `openrouter` | `claude-code` |
|------|-------|-------|---------------|
| Anthropic Claude (Haiku/Sonnet/Opus) | ✓ | ✓ | ✓ |
| ローカルEmbedding (Transformers.js) | ✓ | ✓ | ✓ |
| Batch API (50%割引) | ✓ | ✗ | ✗ |
| Prompt Caching (明示的制御) | ✓ | ✗ | ✗（内部自動管理） |
| トークン使用量の取得 | ✓ | ✓ | ✓ |
| コスト見積の精密計算 | ✓ | ✓ | △（推計） |
| temperature制御 | ✓ | ✓ | ✗ |
| system prompt指定 | ✓ | ✓ | ✓ |
| モデル選択 | ✓ | ✓ | ✓ |
| APIキー不要での利用 | ✗ | ✗ | ✓ |
| Web版での利用 | ✓ | ✓ | ✗ |
| コスト上限制御 | ✓ | ✓ | ✓ |

### 6.3 Embedding要件・CORS制約

**Embedding生成**:
- Transformers.js + multilingual-e5-small によるローカル実行。外部APIへの依存なし
- CLI（Node.js）とWeb（ブラウザ）の両環境で同一モデルを使用
- ONNX INT8量子化モデル（約118MB）は初回実行時にダウンロードされ、以降はキャッシュされる

**Web版のCORS制約**:
- Anthropic Messages API: ブラウザからの直接呼び出しには `anthropic-dangerous-direct-browser-access: true` ヘッダの付与が必須。APIキーがブラウザの開発者ツールから閲覧可能になるリスクがあり、初回利用時にその旨をユーザーに通知すること
- Embedding生成はローカル実行のためCORS制約を受けない。Web版でもStep 5を含むフルパイプラインを実行可能

### 6.4 Claude Code CLI制約

- `claude -p` + `--max-turns 1` で単一ターンの応答を得る
- `--model` でモデル指定、`--system-prompt` でシステムプロンプト指定、`--output-format json` でJSON出力
- Batch API・Prompt Caching の明示的制御は不可
- temperature の明示的制御は不可（ログに info で通知し無視）
- タイムアウト: 180秒（API バックエンドより長い、初期化オーバーヘッド考慮）
- `claude` コマンドが PATH 上に存在すること。未検出時はインストール案内エラーを返す
- Node.js CLI でのみ使用可能。Web版では利用不可

---

## 7. インターフェース要件

### 7.1 CLIインターフェース

**一括実行コマンド**:
```
groa build <name> <tweets.json>                         # Step 0-5: プロファイル構築
groa build <name> <tweets.json> --backend claude-code   # バックエンド一時指定
groa generate tweet <name> <topic> [--n 5] [--temp 0.7] # 単発テキスト生成
groa generate converse <name> <topic> [--turns 5]       # 連続会話
groa generate multi <n1> <n2> [--topic <topic>]         # マルチプロファイル会話
groa generate chat <name>                               # インタラクティブチャット
```

**個別実行コマンド**:
```
groa step <name> preprocess <tweets.json>
groa step <name> stats / classify / analyze / synthesize / embed
```

**ユーティリティコマンド**:
```
groa init                              # 設定ファイル生成
groa inspect <name>                    # PersonaDocument表示
groa cost <name>                       # 累計コスト表示
groa clean <name> [--step <stepName>]  # キャッシュ削除
groa config                            # 現在の設定表示
```

`<name>` は各コマンドの第1位置引数（必須）。成果物は `.groa/<name>/` 以下に保存され、異なる名前で複数のビルド結果を共存できる。同名で再実行した場合はキャッシュヒットにより続行される。

**進捗表示**:
```
Backend: anthropic
[Step 0] Preprocessing... 10000 → 7823 tweets (2177 filtered)
[Step 1] Analyzing style... 7823 tweets [$0]
[Step 2] Classifying... 157/157 batches [$0.17]
[Step 3] Analyzing clusters... 5 clusters [$1.50]
[Step 4] Synthesizing persona... [$0.50]
[Step 5] Building embedding index... [$0]
✓ Profile built. Total cost: $2.17
```

**中断と復帰**: 各ステップ完了時にキャッシュを書き出し。再実行時、有効なキャッシュはスキップ。`--force` で無視して再実行。

### 7.2 Webインターフェース

**機能スコープ**:

| 機能 | CLI | Web |
|------|-----|-----|
| プロファイル構築 (build) | ✓ | ✓（全ステップ実行可） |
| Embedding生成 (Step 5) | ✓ | ✓（ローカル実行） |
| テキスト生成 | ✓ | ✓ |
| プロファイル閲覧 | テキスト表示 | ビジュアライズ |
| 設定編集 | JSON直接編集 | フォームUI |

**制約**:
- `anthropic` バックエンドのみ対応（`claude-code` は不可）
- kuromoji.js の形態素解析はメインスレッドをブロックするため、Web Worker での実行を必須とする
- Transformers.jsのモデルファイル（約118MB）は初回実行時にダウンロードされる。進捗表示を提供すること
- ブラウザ互換性: ES2022+（Chrome 94+, Firefox 93+, Safari 15.4+, Edge 94+）

**データ保持**:
- APIキー: メモリのみ（リロードで消失）
- 設定・中間結果・キャッシュ: IndexedDB
- PersonaDocument: IndexedDB + エクスポート機能（JSONダウンロード）
- EmbeddingIndex: IndexedDB。容量超過時（QuotaExceededError）はユーザーに通知

### 7.3 入力フォーマット

```json
[
  {
    "id": "1234567890",
    "text": "ツイート本文",
    "timestamp": 1700000000000,
    "isRetweet": false,
    "hasMedia": false,
    "replyTo": null
  }
]
```

Twitter/X 公式データエクスポートの `tweets.js` 形式にも対応する。詳細は §1.4 を参照。

### 7.4 入力データサイズの対応範囲

| 範囲 | ツイート件数 | 備考 |
|------|------------|------|
| 最小 | 100件 | これ未満は統計分析の精度が不十分。警告を表示し続行 |
| 推奨 | 3,000 - 10,000件 | パイプライン全体で最適な品質とコストのバランス |
| 上限 | 50,000件 | メモリ・EmbeddingIndexサイズの制約。超過時はエラー |

10件未満の場合はエラーとして中断する。

---

## 8. 設定管理要件

### 8.1 設定項目一覧

設定は `groa.config.json` で管理する。Zodスキーマでバリデーション。完全なJSONスキーマは design-spec.md §6 を参照。

**主要設定項目**:

| 項目 | デフォルト | 説明 |
|------|-----------|------|
| backend | "anthropic" | LLMバックエンド（"anthropic" \| "openrouter" \| "claude-code"） |
| apiKeys.anthropic | 環境変数 | Anthropic APIキー |
| models.quick / standard / deep | null（未設定） | モデルID指定 |
| steps.preprocess.minTweetLength | 5 | 最小ツイート文字数 |
| steps.preprocess.boilerplatePatterns | [] | 定型パターン（正規表現） |
| steps.classify.batchSize | 50 | 1リクエストあたりのツイート数 |
| steps.analyze.minClusterSize | 50 | クラスタ最小件数 |
| steps.analyze.maxClusterSize | 3000 | クラスタ最大件数 |
| steps.retrieve.topK | 5 | 検索件数 |
| steps.retrieve.sentimentDiversity | true | 感情多様性フィルタ |
| steps.retrieve.categoryDiversity | true | カテゴリ多様性フィルタ |
| steps.generate.defaultTemperature | 0.7 | 生成時のtemperature |
| steps.generate.maxLength | 280 | 最大文字数 |
| steps.generate.numVariants | 1 | 生成バリアント数 |
| steps.generate.autoTurnLimit | 8 | 自動ターン判断時の安全上限 |
| steps.evaluate.threshold | 6.0 | authenticity合格しきい値 |
| cacheDir | ".groa" | キャッシュベースディレクトリ（実際のパスは `{cacheDir}/{buildName}/`） |
| costLimitUsd | 10.0 | コスト上限（USD） |

steps.stats はパラメータなし（全値がハードコード: 上位件数等は型定義に規定済み）。

**各ステップ共通の工程別オーバーライド**: model, apiKey を steps.{stepName} 内で個別指定可能。

### 8.2 設定解決の優先順位

**`anthropic` バックエンド**:
1. steps.{stepName} の工程別指定（最優先）
2. グローバル設定（apiKeys.{provider} / models.{tier}）
3. 環境変数（ANTHROPIC_API_KEY）

**`openrouter` バックエンド**:
1. steps.{stepName} の工程別指定（最優先）
2. グローバル設定（apiKeys.openrouter / models.{tier}）
3. 環境変数（OPENROUTER_API_KEY）

**`claude-code` バックエンド**:
1. steps.{stepName}.model
2. models.{tier}
3. Claude Codeのデフォルトモデル
- APIキーは不要（Claude Code自身の認証）

設定ファイルが存在しない場合はデフォルト値 + 環境変数で動作する。

---

## 9. 非機能要件

### 9.1 エラーハンドリング方針

**基本方針**:
- 各ステップはエラーを throw で上位に伝播。catch は pipeline パッケージでのみ
- レート制限は llm-client 内で自動リトライ後、最大回数超過時にのみ throw
- 全エラーにユーザーが次にとるべきアクションを含める

**LLMレスポンスパース失敗時の統一リカバリ方針**:
1. JSONパース失敗 → 最大2回リトライ（同一プロンプトで再送信）
2. Zodバリデーション失敗 → ステップ固有のフォールバック:
   - classify: `category: "other"`, `sentiment: "neutral"`
   - analyze: 当該クラスタをスキップし、ログに警告
   - synthesize / generate / evaluate: リトライ（最大2回）、全失敗時はエラー停止
3. 全リトライ失敗 → エラーを throw しパイプラインを停止

**エッジケースの挙動**:
- 入力ツイート 0件 → VALIDATION_ERROR で即座に停止
- 前処理後 0件 → 警告を表示し、フィルタ条件の緩和を案内して停止
- 全カテゴリが50件未満 → 全て "other" に統合し、1クラスタで分析を続行
- Embeddingの候補が topK * 6 件に満たない → 取得可能な全件で処理

### 9.2 パフォーマンス要件

**処理時間目標（10,000件入力、anthropicバックエンド）**:

| ステップ | 目標時間 |
|---------|---------|
| Step 0: 前処理 | 5秒以内 |
| Step 1: 統計分析 | 30秒以内（Node.js） |
| Step 2: 分類（Batch API） | 30分以内（Batch応答待ち含む） |
| Step 3: クラスタ分析 | 10分以内 |
| Step 4: ペルソナ合成 | 5分以内 |
| Step 5: Embedding生成 | 2分以内 |
| ビルドフェーズ合計 | 約50分以内 |
| Step 6-8 (1件生成+評価) | 30秒以内 |

**Batch API応答待機**:
- ポーリング間隔: 30秒
- 最大待機時間: 60分
- 60分超過時はタイムアウトエラー

### 9.3 セキュリティ・プライバシー

- APIキーを中間結果のJSONファイルに書き出さない
- groa.config.json に直接APIキーを記述した場合、ファイルパーミッション警告を出す（CLIのみ、Unix環境で0600以外）
- ログ出力時、APIキーやAuthorizationヘッダの値をマスクする
- ツイートデータは外部LLM APIに送信される。初回実行時にその旨を通知する（CLI: インタラクティブ確認、Web: 同意ダイアログ）
- .groa/ ディレクトリの取り扱いについてREADMEで注意喚起
- Web版ではデータはブラウザのIndexedDBに留まり、groa自身がサーバーにデータを送信することはない（LLM API以外）

### 9.4 倫理的ガイドライン

- 本ツールは入力データの提供者本人による利用を想定している
- 第三者のツイートデータを無断でプロファイリングに使用することは推奨しない
- 生成テキストが実在の人物の発言として誤認されることを防ぐため、生成テキストにはその旨の注記を付与することを推奨する
- 利用規約において、生成テキストの悪用（なりすまし、フェイクニュース等）に関する免責事項を記載すること
- READMEにプライバシーと倫理に関する注意事項を記載すること

### 9.5 コスト要件

**コスト見積（anthropicバックエンド、10,000件入力）**:

| 工程 | モデル | 見積コスト |
|------|--------|-----------|
| Step 0-1 | なし | $0 |
| Step 2 | quick (Batch) | ~$0.17 |
| Step 3 | standard | ~$1.50 |
| Step 4 | deep | ~$0.50 |
| Step 5 | multilingual-e5-small（ローカル） | $0 |
| **プロファイル構築合計** | | **~$2.17** |
| Step 7 (1件) | standard (Cache) | ~$0.009 |
| Step 8 (1件) | standard | ~$0.01 |
| **100件生成+評価** | | **~$1.90** |

**claude-code バックエンド時**:
- プロファイル構築: ~$2.33（Batch API不可のため約7%増）
- 100件生成+評価: ~$3.05（Prompt Caching効果が不確実）

**コスト上限ガード**:
- costLimitUsd（デフォルト $10.0）超過時、実行を中断しユーザーに確認
- `--no-cost-limit` フラグで無制限実行も可能

---

## 10. 品質基準

### 10.1 テスト要件

テストフレームワーク: Vitest

**テスト方針の概要**:
- ローカル処理パッケージ（preprocess, stats, retrieve）: ユニットテスト
- LLM利用パッケージ（classify, analyze, synthesize, generate, evaluate）: LLMレスポンスのモック + スナップショットテスト
- llm-client: fetch / execFileのモックテスト
- pipeline: モックLlmBackendでの結合テスト
- 実際のLLM呼び出しを含むテストは `vitest --project integration` で明示実行
- テスト用の固定ツイートデータセット（100件、合成データ）をリポジトリに含める

パッケージ別の詳細なテスト方針は design-spec.md §9 を参照。

### 10.2 リリース基準（v0.1.0）

1. `vitest` が全パッケージで成功すること
2. `anthropic` バックエンドで10,000件のツイートデータに対し、全ステップがエラーなく完了し PersonaDocument が生成されること（CLI）
3. `claude-code` バックエンドで同上（CLI）
4. Web版（anthropicバックエンドのみ）で、Step 0-5の実行 + 生成 + 評価の一連のフローが動作すること
5. 生成テキスト30件（temperature: 0.0）の authenticity スコアの平均が 6.0 以上であること
6. anthropic バックエンドでのビルドフェーズ全コスト合計が見積の2倍（$4.34）を超えないこと
7. READMEに以下が記載されていること: 導入手順（両バックエンド）、使用方法、コスト見積（バックエンド別）、ツイートデータのフィールドマッピング、プライバシーと倫理に関する注意事項

---

## 付録A. 用語集

### データ型

| 用語 | 定義 |
|------|------|
| Tweet | 入力となる1件のツイートデータ |
| TweetCorpus | 前処理済みのツイート群とメタ情報 |
| StyleStats | kuromoji.jsによるローカル統計分析結果。LLM不使用で算出される確定的データ |
| TaggedTweet | カテゴリとセンチメントが付与されたツイート |
| TopicCluster | カテゴリ別にグルーピングされたツイート群 |
| ClusterAnalysis | 各トピッククラスタから抽出されたモード固有の人格特徴 |
| AttitudePattern | 人物が特定のモードで取る典型的な態度パターン |
| PersonaDocument | groaの最終成果物。LLMのシステムプロンプトとして使用可能な自然言語文書 |
| VoiceBankEntry | ペルソナを代表するツイートとその選定理由 |
| Session | 全テキスト生成の統一単位（1ターン〜複数ターン・複数参加者） |
| SessionEvaluation | セッション全体の品質評価（authenticity / coherence / consistency） |
| EmbeddingIndex | 全ツイートのベクトル表現とインデックス |
| TweetEmbedding | 1件のツイートのEmbeddingベクトルとメタ情報 |
| CorpusMetadata | コーパスの統計情報（総件数、日付範囲、フィルタ除外数） |
| Category | ツイートの話題分類（tech, daily, opinion, emotion, creative, other） |
| Sentiment | ツイートの感情ラベル（positive, negative, neutral, mixed） |

### パイプライン用語

| 用語 | 定義 |
|------|------|
| ビルドフェーズ | Step 0-5。プロファイル構築の工程 |
| ジェネレートフェーズ | Step 6-8。テキスト生成と評価の工程 |
| モード | 話題領域（tech, daily, opinion等）に応じた人物の振る舞いパターン |
| ポートレート (portrait) | 特定モードにおける人物像の自然言語記述 |
| ボイスバンク (voice bank) | 人物らしさが凝縮された代表ツイート群 |

### LLMバックエンド

| 用語 | 定義 |
|------|------|
| anthropic バックエンド | Anthropic APIにHTTP直接呼び出しするバックエンド |
| openrouter バックエンド | OpenRouter API（OpenAI互換）経由でLLMにアクセスするバックエンド。OpenRouter APIキーが必要 |
| claude-code バックエンド | Claude Code CLI経由でLLMにアクセスするバックエンド |
| Batch API | Anthropicの非同期バッチ処理API。50%割引 |
| Prompt Caching | 同一プレフィックスの再利用で入力コストを90%削減する機能 |
| ModelTier | 工程の処理要件レベル（quick / standard / deep） |

### 品質指標

| 用語 | 定義 |
|------|------|
| authenticity | 同一人物が書いたように読めるかの総合スコア (0-10) |
| coherence | 文体の自然さ / 会話モードでは文脈的一貫性 (0-10) |
| consistency | 態度・トーンの一致度 / 会話モードでは会話全体の自然さ (0-10) |

---

## 付録B. 変更履歴

| 日付 | 版 | 主な変更内容 |
|------|-----|-------------|
| (初稿) | 0.1.0-draft | 初期要件定義 |
| 2026-03-22 | 0.1.0-draft-r5.1 | ハイブリッドパイプライン、設計根拠の追加 |
| 2026-03-22 | 0.1.0-draft-r6 | 要件書ブラッシュアップ: What/How分離（設計仕様をdesign-spec.mdに分離）、レビュー指摘37件への対応（Critical 3件・Major 13件・品質改善11件・Minor 10件）、セクション再構成、データモデル表形式化、プロダクト概要・ユースケース・データフロー図・非機能要件・倫理ガイドライン・用語集の追加 |
