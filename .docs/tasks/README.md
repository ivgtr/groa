# タスク管理

## 概要
ツイートデータから人格プロファイルを抽出し「らしい」テキストを生成する8段階パイプラインツール groa の実装タスク管理

## ドキュメント
- [要件書](../spec.md)
- [設計仕様書](../design-spec.md)
- [設計根拠書](../design-rationale.md)
- [要件マップ](requirements-map.md)
- [実行計画](milestones.md)
- [リスク・前提条件](risks.md)

## タスク一覧

| ID | タスク名 | 優先度 | サイズ | ステータス | 依存 |
|----|---------|--------|--------|-----------|------|
| [T1.1.1](items/T1.1.1.md) | pnpm workspace・ビルド・テスト・lint基盤セットアップ | Must | M | Todo | - |
| [T1.2.1](items/T1.2.1.md) | Branded Types・入力データ型のZodスキーマ | Must | M | Todo | T1.1.1 |
| [T1.2.2](items/T1.2.2.md) | 中間データ型のZodスキーマ | Must | M | Todo | T1.2.1 |
| [T1.2.3](items/T1.2.3.md) | 出力・Embeddingデータ型のZodスキーマ | Must | M | Todo | T1.2.2 |
| [T2.1.1](items/T2.1.1.md) | groa.json Zodスキーマ・デフォルト値・バリデーション | Must | M | Todo | T1.1.1 |
| [T2.1.2](items/T2.1.2.md) | 設定解決ロジック | Must | M | Todo | T2.1.1 |
| [T3.1.1](items/T3.1.1.md) | LlmBackendインターフェース・リトライ・レート制限 | Must | M | Todo | T2.1.2, T1.2.1 |
| [T3.1.2](items/T3.1.2.md) | トークン使用量追跡・コスト計算 | Must | M | Todo | T3.1.1 |
| [T3.2.1](items/T3.2.1.md) | Anthropic Messages API クライアント | Must | M | Todo | T3.1.1 |
| [T3.2.2](items/T3.2.2.md) | Batch API 対応 | Should | M | Todo | T3.2.1 |
| [T3.2.3](items/T3.2.3.md) | Prompt Caching 対応 | Should | S | Todo | T3.2.1 |
| [T3.3.1](items/T3.3.1.md) | Claude Code CLI バックエンド実装 | Must | M | Todo | T3.1.1 |
| [T4.1.1](items/T4.1.1.md) | テキスト正規化・フィルタリング・TweetCorpus生成 | Must | M | Todo | T1.2.1 |
| [T5.1.1](items/T5.1.1.md) | kuromoji.jsセットアップ・文字数/文字種分析 | Must | M | Todo | T1.2.2, T4.1.1 |
| [T5.1.2](items/T5.1.2.md) | 句読点パターン・語尾パターン抽出 | Must | M | Todo | T5.1.1 |
| [T5.1.3](items/T5.1.3.md) | 頻出語彙・n-gram・絵文字・時間帯・構造分析 | Must | M | Todo | T5.1.1 |
| [T6.1.1](items/T6.1.1.md) | 分類プロンプト構築・バッチ分割・実行 | Must | M | Todo | T1.2.2, T3.2.1, T3.2.2, T3.3.1 |
| [T6.1.2](items/T6.1.2.md) | レスポンスパース・フォールバック・失敗率監視 | Must | M | Todo | T6.1.1 |
| [T7.1.1](items/T7.1.1.md) | クラスタ構築・固有StyleStats再集計 | Must | M | Todo | T1.2.2, T5.1.2, T6.1.2 |
| [T7.1.2](items/T7.1.2.md) | LLM分析プロンプト構築・レスポンスパース | Must | M | Todo | T7.1.1, T3.1.1 |
| [T8.1.1](items/T8.1.1.md) | 合成プロンプト構築・PersonaDocument生成 | Must | M | Todo | T1.2.3, T7.1.2, T5.1.3 |
| [T9.1.1](items/T9.1.1.md) | Transformers.jsセットアップ・モデル管理 | Must | M | Todo | T1.2.3 |
| [T9.1.2](items/T9.1.2.md) | バッチEmbedding生成・インデックス永続化 | Must | M | Todo | T9.1.1, T4.1.1 |
| [T10.1.1](items/T10.1.1.md) | Cosine similarity検索・多様性フィルタリング | Must | M | Todo | T9.1.2, T1.2.2 |
| [T11.1.1](items/T11.1.1.md) | 生成プロンプト構築・実行・複数バリアント対応 | Must | M | Todo | T1.2.3, T3.2.3, T10.1.1, T8.1.1 |
| [T12.1.1](items/T12.1.1.md) | 評価プロンプト構築・スコア算出・合格判定 | Must | M | Todo | T1.2.3, T3.1.1, T10.1.1, T11.1.1 |
| [T13.1.1](items/T13.1.1.md) | ビルドフェーズオーケストレーション（Step 0-5） | Must | M | Todo | T4.1.1〜T9.1.2 |
| [T13.1.2](items/T13.1.2.md) | ジェネレートフェーズオーケストレーション（Step 6-8） | Must | M | Todo | T10.1.1〜T12.1.1 |
| [T13.2.1](items/T13.2.1.md) | 中間結果永続化・入力ハッシュスキップ | Must | M | Todo | T2.1.1 |
| [T13.2.2](items/T13.2.2.md) | 進捗表示・コスト上限ガード | Must | M | Todo | T3.1.2 |
| [T14.1.1](items/T14.1.1.md) | CLI基盤・init・configコマンド | Must | M | Todo | T2.1.2 |
| [T14.1.2](items/T14.1.2.md) | build・stepコマンド | Must | M | Todo | T14.1.1, T13.1.1, T13.2.2 |
| [T14.1.3](items/T14.1.3.md) | generateコマンド | Must | M | Todo | T14.1.1, T13.1.2 |
| [T14.1.4](items/T14.1.4.md) | inspect・cost・cleanコマンド・UX | Must | M | Todo | T14.1.1, T13.2.1 |
| [T15.1.1](items/T15.1.1.md) | Vite + React + Zustand + Tailwindセットアップ | Should | M | Todo | T1.1.1 |
| [T15.1.2](items/T15.1.2.md) | Web Worker (kuromoji.js + Transformers.js) | Should | M | Todo | T15.1.1, T5.1.1, T9.1.1 |
| [T15.1.3](items/T15.1.3.md) | IndexedDBストレージ・データ永続化 | Should | M | Todo | T15.1.1 |
| [T15.2.1](items/T15.2.1.md) | APIキー入力・CORS警告・同意ダイアログ | Should | M | Todo | T15.1.1 |
| [T15.2.2](items/T15.2.2.md) | ファイルアップロード・ビルド実行・進捗表示 | Should | M | Todo | T15.1.2, T15.1.3, T15.2.1, T13.2.2 |
| [T15.2.3](items/T15.2.3.md) | ペルソナ閲覧・ビジュアライズ | Should | M | Todo | T15.1.3, T15.2.2 |
| [T15.2.4](items/T15.2.4.md) | テキスト生成・評価結果表示 | Should | M | Todo | T15.2.2, T13.1.2 |
| [T15.2.5](items/T15.2.5.md) | 設定フォームUI・エクスポート機能 | Could | M | Todo | T15.1.3, T2.1.1 |
| [T16.1.1](items/T16.1.1.md) | テスト基盤・フィクスチャ・合成データセット | Must | M | Todo | T1.1.1, T1.2.1 |
| [T16.1.2](items/T16.1.2.md) | ローカル処理パッケージのユニットテスト | Must | M | Todo | T16.1.1, T4.1.1, T5.1.3, T10.1.1 |
| [T16.1.3](items/T16.1.3.md) | LLM利用パッケージのモック・スナップショットテスト | Must | M | Todo | T16.1.1, T6.1.2〜T12.1.1 |
| [T16.1.4](items/T16.1.4.md) | パイプライン結合テスト | Must | M | Todo | T16.1.1, T13.1.1〜T13.2.2 |
| [T16.2.1](items/T16.2.1.md) | README作成 | Must | M | Todo | T14.1.4 |
| [T16.2.2](items/T16.2.2.md) | セキュリティ対応 | Must | M | Todo | T3.1.1, T2.1.2 |

## 進捗サマリ
- Must: 0/39 完了
- Should: 0/8 完了
- Could: 0/1 完了
