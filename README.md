# groa

ツイートデータから人格プロファイルを抽出し、その人物「らしい」テキストを生成する8段階パイプラインツール。

## 導入手順

### 必要環境

- Node.js >= 20.0.0
- pnpm >= 9.15

### インストール

```bash
git clone <repository-url>
cd groa
pnpm install
pnpm build
```

### バックエンド設定

groa は 2つのバックエンドに対応しています。

#### api バックエンド（推奨）

Anthropic Messages API を直接呼び出します。Batch API・Prompt Caching に対応し、コスト最適化が可能です。

```bash
groa init --backend api
```

`groa.json` が生成されます。環境変数 `ANTHROPIC_API_KEY` を設定してください。

```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

または `groa.json` の `apiKeys.anthropic` に環境変数参照を記述できます（デフォルト設定）:

```json
{
  "apiKeys": {
    "anthropic": "${ANTHROPIC_API_KEY}"
  }
}
```

#### claude-code バックエンド

Claude Code CLI（`claude` コマンド）をサブプロセスとして利用します。APIキー不要で手軽に試せます。

```bash
groa init --backend claude-code
```

前提条件:
- `claude` コマンドが PATH 上に存在すること
- Claude Code の認証が完了していること

> Batch API・Prompt Caching・temperature 制御は claude-code バックエンドでは利用できません。

## 使用方法

### プロファイル構築（build）

ツイートデータからペルソナプロファイルを構築します（Step 0-5）。

```bash
groa build <tweets.json|tweets.js>
```

groa 形式でない外部データ（Twint / snscrape 出力、Twitter/X 公式エクスポート等）は自動検知して変換されます。明示的にフォーマットを指定することもできます:

```bash
# プリセット指定
groa build tweets.json --format twint
groa build tweets.js --format twitter-archive

# Twitter/X 公式エクスポートの tweets.js を直接指定（自動検知）
groa build tweets.js

# カスタムキーマッピング
groa build tweets.json --map-text body --map-timestamp posted_at --map-id tweet_id
```

オプション:
- `--force` — キャッシュを無視して再実行
- `--no-cost-limit` — コスト上限を無効化
- `--format <name>` — 入力フォーマットを指定（`twint`, `twitter-archive`）
- `--map-id <key>` — id フィールドのソースキー
- `--map-text <key>` — text フィールドのソースキー
- `--map-timestamp <key>` — timestamp フィールドのソースキー
- `--map-retweet <key>` — isRetweet フィールドのソースキー
- `--map-media <key>` — hasMedia フィールドのソースキー
- `--map-reply <key>` — replyTo フィールドのソースキー

### テキスト生成（generate）

構築済みプロファイルを使ってテキストを生成します（Step 6-8）。

```bash
groa generate --topic "技術トレンド"
```

### ユーティリティコマンド

```bash
groa inspect          # PersonaDocument の内容を表示
groa cost             # 累計コストを表示
groa clean            # 全キャッシュを削除
groa clean --step <name>  # 特定ステップ以降のキャッシュを削除
groa config           # 現在の設定を表示
```

## コスト見積

### api バックエンド（10,000件入力）

| 工程 | モデル | 見積コスト |
|------|--------|-----------|
| Step 0-1: 前処理・文体分析 | なし | $0 |
| Step 2: 分類 | Haiku (Batch) | ~$0.17 |
| Step 3: クラスタ分析 | Sonnet | ~$1.50 |
| Step 4: ペルソナ合成 | Opus | ~$0.50 |
| Step 5: Embedding生成 | multilingual-e5-small（ローカル） | $0 |
| **プロファイル構築合計** | | **~$2.17** |
| Step 7: テキスト生成（1件） | Sonnet (Cache) | ~$0.009 |
| Step 8: 品質評価（1件） | Sonnet | ~$0.01 |
| **100件生成+評価** | | **~$1.90** |

### claude-code バックエンド（10,000件入力）

| 項目 | 見積コスト |
|------|-----------|
| プロファイル構築 | ~$2.33（Batch API不可のため約7%増） |
| 100件生成+評価 | ~$3.05（Prompt Caching効果が不確実） |

コスト上限はデフォルト $10.0 です。`groa.json` の `costLimitUsd` で変更できます。

## ツイートデータのフォーマット

入力は以下の形式のJSON配列です:

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

### フィールドマッピング

| フィールド | 型 | 説明 |
|-----------|------|------|
| `id` | string | ツイートの一意なID |
| `text` | string | ツイート本文 |
| `timestamp` | number | Unix タイムスタンプ（ミリ秒） |
| `isRetweet` | boolean | リツイートかどうか |
| `hasMedia` | boolean | メディア（画像・動画）が添付されているか |
| `replyTo` | string \| null | リプライ先のツイートID（リプライでなければ null） |

### 外部フォーマットからの変換

groa 形式以外のJSONデータ（スクレイパー出力等）は、組み込みの変換機能で自動的に変換できます。

#### 自動検知

`groa build` はアップロードされたJSONの先頭要素のキー構造を調べ、既知のフォーマット（Twint 等）を自動検知します。検知された場合は明示的な `--format` 指定なしで変換が行われます。

#### Twint / snscrape 形式

| Twint フィールド | groa フィールド | 変換ロジック |
|-----------------|---------------|------------|
| `id` | `id` | 数値 → 文字列 |
| `tweet` | `text` | そのまま |
| `created_at` | `timestamp` | 日時文字列パース → Unix epoch ms |
| `retweet` | `isRetweet` | そのまま |
| `photos` + `video` | `hasMedia` | 配列非空 or 値が truthy |
| `reply_to` + `conversation_id` | `replyTo` | reply_to が非空なら conversation_id を返却 |

#### カスタムフォーマット

未知の形式の場合は `--map-*` オプションでキーマッピングを指定できます:

```bash
groa build data.json --map-id tweet_id --map-text body --map-timestamp posted_at
```

Web版では、フォーマット検知後にマッピング設定画面が表示され、ドロップダウンでキーを選択できます。

#### Twitter/X 公式エクスポート（tweets.js）

Twitter/X の設定画面からダウンロードできるデータエクスポートの `tweets.js` ファイルを直接読み込めます。

```bash
groa build tweets.js
```

`tweets.js` は JavaScript 形式（`window.YTD.tweets.part0 = [...]`）ですが、groa が自動的にパース・変換します。`--format twitter-archive` で明示指定も可能です。

| Twitter フィールド | groa フィールド | 変換ロジック |
|-------------------|---------------|------------|
| `id_str` | `id` | そのまま |
| `full_text` | `text` | そのまま |
| `created_at` | `timestamp` | RFC 2822 風日時パース → Unix epoch ms |
| `full_text` | `isRetweet` | `"RT @"` 前置判定 |
| `entities.media` | `hasMedia` | 配列の有無 |
| `in_reply_to_status_id_str` | `replyTo` | null 許容 TweetId |

## プライバシーと倫理に関する注意事項

### データ送信について

- ツイートデータは外部 LLM API（Anthropic）に送信されます
- CLI では初回実行時にデータ送信の同意確認が表示されます
- Web 版ではデータはブラウザの IndexedDB に留まり、groa 自身がサーバーにデータを送信することはありません（LLM API への直接通信を除く）

### セキュリティ

- API キーは中間結果の JSON ファイルに書き出されません
- ログ出力時、API キーや認証ヘッダの値は自動的にマスクされます
- `groa.json` に API キーを直接記述した場合、Unix 環境でファイルパーミッションが 0600 以外なら警告が表示されます

### .groa/ ディレクトリについて

`.groa/` ディレクトリには中間結果（前処理済みツイート、分類結果、ペルソナプロファイル等）がキャッシュされます。

- このディレクトリにはツイートの内容が含まれるため、**公開リポジトリにコミットしないでください**
- `.gitignore` に `.groa/` を追加することを推奨します
- `groa clean` で全キャッシュを削除できます

### 倫理的ガイドライン

- 本ツールは**入力データの提供者本人による利用**を想定しています
- 第三者のツイートデータを無断でプロファイリングに使用することは推奨しません
- 生成テキストが実在の人物の発言として誤認されることを防ぐため、生成テキストには**その旨の注記を付与する**ことを推奨します

### 免責事項

- 生成テキストは統計的な文体模倣に基づくものであり、入力者の意見・立場を正確に反映するものではありません
- 生成テキストの悪用（なりすまし、フェイクニュース、詐欺等）については、利用者が全責任を負います
- 本ツールの開発者は、生成テキストの内容およびその利用結果について一切の責任を負いません

## ライセンス

[ライセンス情報をここに記載]
