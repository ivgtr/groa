# 要件マップ

> 対応する要件書: [spec.md](../spec.md)

## R1: プロジェクト基盤・型定義

> モノレポ構成の初期化と、全パッケージが共有する型定義・Zodスキーマの整備

- **F1.1: モノレポ基盤**
  - [T1.1.1](items/T1.1.1.md): pnpm workspace・ビルド・テスト・lint基盤セットアップ
- **F1.2: 共有型定義 (packages/types)**
  - [T1.2.1](items/T1.2.1.md): Branded Types・入力データ型のZodスキーマ
  - [T1.2.2](items/T1.2.2.md): 中間データ型のZodスキーマ
  - [T1.2.3](items/T1.2.3.md): 出力・Embeddingデータ型のZodスキーマ

## R2: 設定管理

> groa.json による設定の定義・読み込み・解決ロジック

- **F2.1: 設定スキーマ・読み込み**
  - [T2.1.1](items/T2.1.1.md): groa.json Zodスキーマ・デフォルト値・バリデーション
  - [T2.1.2](items/T2.1.2.md): 設定解決ロジック（優先順位・環境変数・パーミッション警告）

## R3: LLMバックエンド抽象層

> api / claude-code 2種のバックエンドを統一インターフェースで抽象化し、リトライ・コスト追跡を提供

- **F3.1: 共通基盤**
  - [T3.1.1](items/T3.1.1.md): LlmBackend インターフェース・リトライ・レート制限
  - [T3.1.2](items/T3.1.2.md): トークン使用量追跡・コスト計算
- **F3.2: API バックエンド**
  - [T3.2.1](items/T3.2.1.md): Anthropic Messages API クライアント
  - [T3.2.2](items/T3.2.2.md): Batch API 対応
  - [T3.2.3](items/T3.2.3.md): Prompt Caching 対応
- **F3.3: Claude Code バックエンド**
  - [T3.3.1](items/T3.3.1.md): Claude Code CLI バックエンド実装

## R4: Step 0 前処理

> 生ツイートデータのクリーニング・フィルタリング・正規化

- **F4.1: 前処理パイプライン**
  - [T4.1.1](items/T4.1.1.md): テキスト正規化・フィルタリング・TweetCorpus生成

## R5: Step 1 統計的文体分析

> kuromoji.jsを用いたローカル形態素解析と文体特徴量の抽出

- **F5.1: 統計分析**
  - [T5.1.1](items/T5.1.1.md): kuromoji.jsセットアップ・文字数/文字種分析
  - [T5.1.2](items/T5.1.2.md): 句読点パターン・語尾パターン抽出
  - [T5.1.3](items/T5.1.3.md): 頻出語彙・n-gram・絵文字・時間帯・構造分析

## R6: Step 2 分類・タグ付け

> Haikuによるツイートのカテゴリ・感情ラベル付与（バッチ処理）

- **F6.1: バッチ分類**
  - [T6.1.1](items/T6.1.1.md): 分類プロンプト構築・バッチ分割・実行
  - [T6.1.2](items/T6.1.2.md): レスポンスパース・フォールバック・失敗率監視

## R7: Step 3 クラスタ分析

> カテゴリ別クラスタからの人格特徴抽出（Sonnet使用）

- **F7.1: クラスタ構築・分析**
  - [T7.1.1](items/T7.1.1.md): クラスタ構築・固有StyleStats再集計
  - [T7.1.2](items/T7.1.2.md): LLM分析プロンプト構築・レスポンスパース

## R8: Step 4 ペルソナ合成

> 全クラスタ分析とStyleStatsを統合し、PersonaDocumentを生成（Opus使用）

- **F8.1: ペルソナ合成**
  - [T8.1.1](items/T8.1.1.md): 合成プロンプト構築・PersonaDocument生成

## R9: Step 5 Embedding生成

> Transformers.js + multilingual-e5-small によるローカルEmbedding

- **F9.1: ローカルEmbedding**
  - [T9.1.1](items/T9.1.1.md): Transformers.jsセットアップ・モデル管理
  - [T9.1.2](items/T9.1.2.md): バッチEmbedding生成・インデックス永続化

## R10: Step 6 類似検索

> トピックに関連するツイートの意味検索と多様性フィルタリング

- **F10.1: 検索・フィルタリング**
  - [T10.1.1](items/T10.1.1.md): Cosine similarity検索・多様性フィルタリング

## R11: Step 7 テキスト生成

> PersonaDocumentに基づく新規テキスト生成（Sonnet + Prompt Caching）

- **F11.1: テキスト生成**
  - [T11.1.1](items/T11.1.1.md): 生成プロンプト構築・実行・複数バリアント対応

## R12: Step 8 品質評価

> 生成テキストの品質を元ツイートとの直接比較で評価（Sonnet使用）

- **F12.1: 評価**
  - [T12.1.1](items/T12.1.1.md): 評価プロンプト構築・スコア算出・合格判定

## R13: パイプラインオーケストレーション

> ビルド・ジェネレートフェーズの統合制御、キャッシュ、コスト管理

- **F13.1: パイプライン制御**
  - [T13.1.1](items/T13.1.1.md): ビルドフェーズオーケストレーション（Step 0-5）
  - [T13.1.2](items/T13.1.2.md): ジェネレートフェーズオーケストレーション（Step 6-8）
- **F13.2: キャッシュ・コスト管理**
  - [T13.2.1](items/T13.2.1.md): 中間結果永続化・入力ハッシュスキップ
  - [T13.2.2](items/T13.2.2.md): 進捗表示・コスト上限ガード

## R14: CLIインターフェース

> Commander.jsによるCLIコマンド群の実装

- **F14.1: コマンド実装**
  - [T14.1.1](items/T14.1.1.md): CLI基盤・init・configコマンド
  - [T14.1.2](items/T14.1.2.md): build・stepコマンド
  - [T14.1.3](items/T14.1.3.md): generateコマンド
  - [T14.1.4](items/T14.1.4.md): inspect・cost・cleanコマンド・UX

## R15: Webインターフェース

> Vite + React + Zustand + TailwindによるブラウザUI

- **F15.1: Web基盤**
  - [T15.1.1](items/T15.1.1.md): Vite + React + Zustand + Tailwindセットアップ
  - [T15.1.2](items/T15.1.2.md): Web Worker（kuromoji.js + Transformers.js）
  - [T15.1.3](items/T15.1.3.md): IndexedDBストレージ・データ永続化
- **F15.2: 画面実装**
  - [T15.2.1](items/T15.2.1.md): APIキー入力・CORS警告・同意ダイアログ
  - [T15.2.2](items/T15.2.2.md): ファイルアップロード・ビルド実行・進捗表示
  - [T15.2.3](items/T15.2.3.md): ペルソナ閲覧・ビジュアライズ
  - [T15.2.4](items/T15.2.4.md): テキスト生成・評価結果表示
  - [T15.2.5](items/T15.2.5.md): 設定フォームUI・エクスポート機能

## R16: 品質・非機能要件

> テスト、ドキュメント、セキュリティの横断的要件

- **F16.1: テスト**
  - [T16.1.1](items/T16.1.1.md): テスト基盤・フィクスチャ・合成データセット
  - [T16.1.2](items/T16.1.2.md): ローカル処理パッケージのユニットテスト
  - [T16.1.3](items/T16.1.3.md): LLM利用パッケージのモック・スナップショットテスト
  - [T16.1.4](items/T16.1.4.md): パイプライン結合テスト
- **F16.2: ドキュメント・セキュリティ**
  - [T16.2.1](items/T16.2.1.md): README作成
  - [T16.2.2](items/T16.2.2.md): セキュリティ対応
