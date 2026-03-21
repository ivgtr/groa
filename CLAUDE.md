# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**groa** はツイートデータから人格プロファイルを抽出し、その人物「らしい」テキストを生成する8段階パイプラインツール。
統計的文体分析（ローカル）とLLM意味理解のハイブリッド構成。TypeScript モノレポ（pnpm workspace）。

## Architecture

```
packages/
├── types/        # 共有型定義・Zodスキーマ
├── config/       # 設定管理（groa.json）
├── llm-client/   # LLM API抽象層（api / claude-code）
├── preprocess/   # Step 0: 前処理
├── stats/        # Step 1: 統計的文体分析（kuromoji.js）
├── classify/     # Step 2: 分類（Haiku）
├── analyze/      # Step 3: クラスタ分析（Sonnet）
├── synthesize/   # Step 4: ペルソナ合成（Opus）
├── embed/        # Step 5: Embedding（OpenAI）
├── retrieve/     # Step 6: 類似検索
├── generate/     # Step 7: テキスト生成（Sonnet）
├── evaluate/     # Step 8: 品質評価（Sonnet）
├── pipeline/     # パイプラインオーケストレーション
├── cli/          # CLIエントリポイント（Commander.js）
└── web/          # Webエントリポイント（Vite + React + Zustand + Tailwind）
```

## Coding Conventions

- ディレクトリ/ファイル: `kebab-case`、型: `PascalCase`、関数/変数: `camelCase`、定数: `SCREAMING_SNAKE_CASE`
- `strict: true`、`any` 禁止（`unknown` + 型ガード）
- Branded Types 使用（`TweetId`, `Timestamp`, `ModelIdString`）
- Zodスキーマと型定義の一体化（外部入力は `z.infer` で型導出）
- 副作用は `async` 関数で `Promise` 返却
- パッケージ間の依存は一方向のみ（`import/no-cycle` で強制）
- `types` は全パッケージから参照可能だが、他パッケージに依存しない

## Commands

```bash
pnpm install                                # 依存インストール
pnpm test                                   # 全パッケージテスト
pnpm vitest run --project <package>         # 単一パッケージテスト
pnpm build                                  # ビルド
pnpm lint                                   # リント
```

## Important Rules

- 実装の正しさは `.docs/spec.md`（要件定義書）との整合性で判断する
- 仕様書に記載のない機能追加や設計変更は確認を取ること
- 仕様変更時は `spec.md` と `design-spec.md` の整合性を確認すること
- 中間結果は `.groa/{stepName}.json` に永続化（入力ハッシュ一致時スキップ）
- APIキーは中間結果JSONに書き出さない・ログでマスク

### 仕様書（3層構造）

| 文書 | 役割 |
|------|------|
| `.docs/spec.md` | **要件定義書（What）** — データモデル、機能要件、非機能要件、品質基準 |
| `.docs/design-spec.md` | **設計仕様書（How）** — TypeScript型定義、インターフェース、プロンプト設計、テスト戦略 |
| `.docs/design-rationale.md` | **設計根拠書（Why）** — 各工程の学術的背景・先行研究 |
