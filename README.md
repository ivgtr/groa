# groa

テキストから人格を抽出し、その人物として語らせ、会話させるペルソナ再現ツール。

## クイックスタート

```bash
# 1. 設定ファイルを生成（対話形式でバックエンドとモデルを選択）
pnpm groa init

# 2. テキストデータからプロファイルを構築
pnpm groa build alice data.json

# 3. プロファイルを使ってテキストを生成
pnpm groa generate tweet alice "技術トレンド"
```

生成モードは他にも連続会話（`converse`）、マルチプロファイル会話（`multi`）、インタラクティブチャット（`chat`）に対応しています。詳しくは[コマンドリファレンス](#コマンドリファレンス)を参照してください。

## 導入手順

### インストール

- Node.js >= 22
- pnpm >= 9.15

```bash
git clone <repository-url>
cd groa
pnpm install
pnpm build
```

### バックエンド設定

groa は 3つのバックエンドに対応しています。

```bash
pnpm groa init
```

対話形式でバックエンド種別とモデルを設定し、`groa.config.json` を生成します。
非対話モードで実行する場合は `--backend` フラグを指定してください。

#### anthropic バックエンド（推奨）

Anthropic Messages API を直接呼び出します。Batch API・Prompt Caching に対応し、コスト最適化が可能です。

```bash
pnpm groa init --backend anthropic
```

環境変数 `ANTHROPIC_API_KEY` を設定してください。

```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

または `groa.config.json` の `apiKeys.anthropic` に環境変数参照を記述できます（デフォルト設定）:

```json
{
  "apiKeys": {
    "anthropic": "${ANTHROPIC_API_KEY}"
  }
}
```

#### openrouter バックエンド

OpenRouter 経由で各種モデルにアクセスします。

```bash
pnpm groa init --backend openrouter
```

環境変数 `OPENROUTER_API_KEY` を設定してください。

```bash
export OPENROUTER_API_KEY=sk-or-...
```

#### claude-code バックエンド

Claude Code CLI（`claude` コマンド）をサブプロセスとして利用します。APIキー不要で手軽に試せます。

```bash
pnpm groa init --backend claude-code
```

前提条件:
- `claude` コマンドが PATH 上に存在すること
- Claude Code の認証が完了していること

既に `groa.config.json` がある場合は、以下のコマンドでバックエンドを切り替えできます:

```bash
pnpm groa config set backend claude-code
pnpm groa config set models.quick haiku
pnpm groa config set models.standard sonnet
pnpm groa config set models.deep opus
```

> Batch API・Prompt Caching・temperature 制御は claude-code バックエンドでは利用できません。

## コマンドリファレンス

### プロファイル構築（build）

テキストデータからペルソナプロファイルを構築します（Step 0-5）。

```bash
pnpm groa build <name> <data.json|data.js>
```

オプション:
- `--format <name>` — 入力フォーマットを指定（`twint`, `twitter-archive`）。詳細は[入力データ](#入力データ)を参照
- `--map-id <key>` — id フィールドのソースキー
- `--map-text <key>` — text フィールドのソースキー
- `--map-timestamp <key>` — timestamp フィールドのソースキー
- `--map-retweet <key>` — isRetweet フィールドのソースキー
- `--map-media <key>` — hasMedia フィールドのソースキー
- `--map-reply <key>` — replyTo フィールドのソースキー

### テキスト生成（generate）

構築済みプロファイルを使ってテキストを生成します（Step 6-8）。4つのモードに対応。

```bash
# 単発テキスト生成
pnpm groa generate tweet alice "技術トレンド"

# 連続会話（同一プロファイルが複数ターン）
pnpm groa generate converse alice "AIの未来" --turns 5

# マルチプロファイル会話
pnpm groa generate multi alice bob --topic "AIの未来"

# インタラクティブチャット
pnpm groa generate chat alice
```

共通オプション:
- `--temp <number>` — temperature 0.3-1.0（デフォルト: 0.7）
- `--max-length <number>` — 最大文字数（デフォルト: 280）

#### tweet

単発テキストを生成します。

- `-n, --num-variants <number>` — バリアント数（デフォルト: 1）
- `--style-hint <hint>` — スタイルヒント

#### converse

同一プロファイルによる連続会話を生成します。

- `--turns <number>` — ターン数（未指定で自動判断）
- `--auto-limit <number>` — 自動判断時の上限（デフォルト: 8）
- `--no-eval` — 最終評価をスキップ

#### multi

複数プロファイル間の会話を生成します。

- `--topic <topic>` — 会話トピック（省略時は自動生成）
- `--turns <number>` — 総ターン数

#### chat

インタラクティブチャットを開始します。

- `--eval` — セッション終了時に評価を有効化

### ユーティリティコマンド

```bash
pnpm groa inspect alice                 # PersonaDocument の内容を表示
pnpm groa cost alice                    # 累計コストを表示
pnpm groa clean alice                   # 全キャッシュを削除
pnpm groa clean alice --step classify   # 特定ステップ以降のキャッシュを削除
pnpm groa config                        # 現在の設定を表示
```

### グローバルオプション

すべてのコマンドで使用できます。

- `--force` — キャッシュを無視して再実行
- `--no-cost-limit` — コスト上限を無効化
- `--backend <type>` — バックエンド種別を一時的に指定（`anthropic` | `openrouter` | `claude-code`）

## 入力データ

### groa 形式

入力は以下の形式のJSON配列です:

```json
[
  {
    "id": "1234567890",
    "text": "テキスト本文",
    "timestamp": 1700000000000,
    "isRetweet": false,
    "hasMedia": false,
    "replyTo": null
  }
]
```

| フィールド | 型 | 説明 |
|-----------|------|------|
| `id` | string | テキストの一意なID |
| `text` | string | テキスト本文 |
| `timestamp` | number | Unix タイムスタンプ（ミリ秒） |
| `isRetweet` | boolean | 引用・転載かどうか |
| `hasMedia` | boolean | メディア（画像・動画）が添付されているか |
| `replyTo` | string \| null | 返信先のID（返信でなければ null） |

### 外部フォーマットからの変換

groa 形式以外のJSONデータ（スクレイパー出力等）は、組み込みの変換機能で自動的に変換できます。

```bash
# プリセット指定
pnpm groa build alice tweets.json --format twint
pnpm groa build alice tweets.js --format twitter-archive

# Twitter/X 公式エクスポートの tweets.js を直接指定（自動検知）
pnpm groa build alice tweets.js

# カスタムキーマッピング
pnpm groa build alice data.json --map-text body --map-timestamp posted_at --map-id tweet_id
```

#### 自動検知

`groa build` は入力されたJSONの先頭要素のキー構造を調べ、既知のフォーマット（Twint 等）を自動検知します。検知された場合は明示的な `--format` 指定なしで変換が行われます。

#### Twint / snscrape 形式

| Twint フィールド | groa フィールド | 変換ロジック |
|-----------------|---------------|------------|
| `id` | `id` | 数値 → 文字列 |
| `tweet` | `text` | そのまま |
| `created_at` | `timestamp` | 日時文字列パース → Unix epoch ms |
| `retweet` | `isRetweet` | そのまま |
| `photos` + `video` | `hasMedia` | 配列非空 or 値が truthy |
| `reply_to` + `conversation_id` | `replyTo` | reply_to が非空なら conversation_id を返却 |

#### Twitter/X 公式エクスポート（tweets.js）

Twitter/X の設定画面からダウンロードできるデータエクスポートの `tweets.js` ファイルを直接読み込めます。

```bash
pnpm groa build alice tweets.js
```

`tweets.js` は JavaScript 形式（`window.YTD.tweets.part0 = [...]`）ですが、groa が自動的にパース・変換します。`--format twitter-archive` で明示指定も可能です。

| Twitter フィールド | groa フィールド | 変換ロジック |
|-------------------|---------------|------------|
| `id_str` | `id` | そのまま |
| `full_text` | `text` | そのまま |
| `created_at` | `timestamp` | RFC 2822 風日時パース → Unix epoch ms |
| `full_text` | `isRetweet` | `"RT @"` 前置判定 |
| `entities.media` | `hasMedia` | 配列の有無 |
| `in_reply_to_status_id_str` | `replyTo` | null 許容 ID |

#### カスタムフォーマット

未知の形式の場合は `--map-*` オプションでキーマッピングを指定できます:

```bash
pnpm groa build mydata data.json --map-id tweet_id --map-text body --map-timestamp posted_at
```

Web版では、フォーマット検知後にマッピング設定画面が表示され、ドロップダウンでキーを選択できます。

## コスト見積

### anthropic バックエンド（10,000件入力）

| 工程 | モデル | 見積コスト |
|------|--------|-----------|
| Step 0-1: 前処理・文体分析 | なし | $0 |
| Step 2: 分類 | quick (Batch) | ~$0.17 |
| Step 3: クラスタ分析 | standard | ~$1.50 |
| Step 4: ペルソナ合成 | deep | ~$0.50 |
| Step 5: Embedding生成 | multilingual-e5-small（ローカル） | $0 |
| **プロファイル構築合計** | | **~$2.17** |
| Step 7: テキスト生成（1件） | standard (Cache) | ~$0.009 |
| Step 8: 品質評価（1件） | standard | ~$0.01 |
| **100件生成+評価** | | **~$1.90** |

### claude-code バックエンド（10,000件入力）

| 項目 | 見積コスト |
|------|-----------|
| プロファイル構築 | ~$2.33（Batch API不可のため約7%増） |
| 100件生成+評価 | ~$3.05（Prompt Caching効果が不確実） |

コスト上限はデフォルト $10.0 です。`groa.config.json` の `costLimitUsd` で変更できます。

## プライバシーと倫理に関する注意事項

### データ送信について

- 入力データは外部 LLM API（Anthropic）に送信されます
- CLI では初回実行時にデータ送信の同意確認が表示されます
- Web 版ではデータはブラウザの IndexedDB に留まり、groa 自身がサーバーにデータを送信することはありません（LLM API への直接通信を除く）

### セキュリティ

- API キーは中間結果の JSON ファイルに書き出されません
- ログ出力時、API キーや認証ヘッダの値は自動的にマスクされます
- `groa.config.json` に API キーを直接記述した場合、Unix 環境でファイルパーミッションが 0600 以外なら警告が表示されます

### .groa/ ディレクトリについて

`.groa/` ディレクトリには中間結果（前処理済みテキスト、分類結果、ペルソナプロファイル等）がキャッシュされます。

- このディレクトリには入力テキストの内容が含まれるため、`.gitignore` でデフォルト除外されています
- `pnpm groa clean` で全キャッシュを削除できます

### 倫理的ガイドライン

- 本ツールは**入力データの提供者本人による利用**を想定しています
- 第三者のデータを無断でプロファイリングに使用することは推奨しません
- 生成テキストが実在の人物の発言として誤認されることを防ぐため、生成テキストには**その旨の注記を付与する**ことを推奨します

### 免責事項

- 生成テキストは統計的な文体模倣に基づくものであり、入力者の意見・立場を正確に反映するものではありません
- 生成テキストの悪用（なりすまし、フェイクニュース、詐欺等）については、利用者が全責任を負います
- 本ツールの開発者は、生成テキストの内容およびその利用結果について一切の責任を負いません

## ライセンス

[MIT License](./LICENSE)
