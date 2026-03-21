# groa 設計根拠書 (Design Rationale)

> 各パイプライン工程が「なぜ必要で、なぜこの方法なのか」を、先行研究・学術的知見に基づいて説明する。

**対応する仕様書**: spec.md
**Last Updated**: 2026-03-22

---

## 全体設計: ハイブリッドパイプラインの根拠

### なぜ「ローカル統計分析 + LLM」の二層構造なのか

文体分析（stylometry）の研究は19世紀末のLutosławski (1890) に遡り、Mosteller & Wallace (1964) による連邦主義者論文の著者帰属が計算的手法の嚆矢となった。以来、著者帰属の研究で最も安定的に有効とされてきた特徴量は以下の通りである:

- **機能語（function words）の頻度分布**: 内容に依存しない語（助詞、助動詞、接続詞等）の使用パターンは著者固有であり、意図的な操作が困難。Stamatatos (2009) "A Survey of Modern Authorship Attribution Methods" がこの分野を体系的にまとめている。
- **文字n-gram**: Frantzeskou et al. (2006) のSCAP法以降、言語非依存の著者識別手法として広く使われる。Lagutina et al. (2019) "A Survey on Stylometric Text Features" が特徴量の体系的分類を提供。
- **句読点・記号パターン**: 表層的だが非常に個人差が大きい。Abbasi & Chen (2008) "Writeprints" が包括的な特徴セットを定義。

これらの特徴量は**計算的に抽出可能**（形態素解析＋カウント）であり、LLMに推論させる必要がない。一方、LLMでないと扱えない特徴もある:

- **皮肉・ユーモアの検出**: 表面的なテキストからは判定困難。文脈理解が必要。
- **論理展開パターンの命名・記述**: 「否定してから肯定する」のような抽象パターンの発見と命名は、統計処理では不可能。
- **代表ツイートの選定**: 「人物らしさが凝縮されている」という判断は意味理解を要する。

**結論**: 確定的に計算可能な特徴はローカルで抽出し（コスト$0、精度100%）、意味理解が必要な特徴のみLLMに委ねる。この分離により、LLMへのプロンプトが短縮され（数える作業を含めなくてよい）、コストが削減され、分析結果の再現性が向上する。

---

## Step 0: 前処理 — 根拠

### なぜフィルタリングが必要か

著者帰属研究では、テキストから**コンテンツ依存の要素を除去し、スタイル依存の要素を残す**ことが精度向上に寄与することが繰り返し示されている (Stamatatos 2009; Koppel et al. 2009)。RT、URL単体ツイート、定型あいさつはスタイル情報をほとんど含まず、ノイズとなる。

Bhargava et al. (2013) "Stylometric Analysis for Authorship Attribution on Twitter" では、140字以下のツイートでも著者帰属がチャンスレベルを有意に上回ることが示されたが、その前提としてRT・スパム・ボット的投稿の除去が行われている。

### なぜテキスト正規化が必要か

URLやメンションは投稿内容（コンテンツ）に依存するがスタイルには依存しないため、除去することでスタイル分析の精度が向上する。ただし、URL・メンションの**使用頻度そのもの**はスタイル特徴であるため、Step 1の `StyleStats` に `sharingRate` として保持する。

---

## Step 1: 統計的文体分析 — 根拠

### 各特徴量の根拠

| 特徴量 | 根拠 |
|--------|------|
| 文字数分布 | 文長は最も基本的な著者特徴の一つ。Mendenhall (1887) の先駆的研究以来、一貫して有効性が確認されている。平均値だけでなく分散・パーセンタイルを保持するのは、分布形状自体が個人差を反映するため。 |
| 句読点パターン | Abbasi & Chen (2008) "Writeprints" で定義された包括的特徴セットの主要要素。日本語では「。」「、」の使用有無、「！」「？」の頻度、括弧の種類が強い個人差を示す。 |
| 語尾パターン | 日本語の文体同定において極めて重要。「だ」「です」「よね」「な」等の選択は話者のフォーマリティ・親密度・態度を直接反映する。Lagutina et al. (2019) の分類における「構文的特徴」に該当。 |
| 文字種比率 | 日本語固有の特徴。ひらがな率は文体の硬さ・柔らかさに強く相関し、カタカナ率は外来語使用傾向を反映する。 |
| 頻出n-gram | 文字n-gramは言語非依存の著者帰属で最も成功した特徴の一つ (Frantzeskou et al. 2006; Stamatatos 2009)。2-gram, 3-gramは口癖・定型表現・助詞の使い方のパターンを捉える。 |
| 投稿時間帯 | 直接的なスタイル特徴ではないが、時間帯による文体変動（深夜は砕けた文体になる等）を分析する際のコンテキスト情報として有用。 |
| 形態素解析 | kuromoji.jsを用いた品詞情報の取得。機能語（助詞・助動詞）の頻度分布は著者帰属で最も安定的に有効な特徴とされる (Stamatatos 2009)。 |

### なぜ「実例ツイートIDの紐づけ」が必要か

語尾パターンの頻度だけでなく実例を保持する理由は、後続のLLM分析（Step 3）と合成（Step 4）で**具体例が抽象的記述よりも有効**であることが示されているため。Hicke & Mimno (2023) "T5 meets Tybalt" では、LLMによる著者文体の模倣において、抽象的なスタイル記述よりも実際のテキスト例を提示するほうが再現精度が高いことが報告されている。

---

## Step 2: 分類・タグ付け — 根拠

### なぜLLMによる分類が必要か

ツイートの話題分類は、後続のStep 3（トピッククラスタベースの分析）の前提条件である。ルールベースのキーワードマッチングでは「技術用語を含むが日常的な雑感」（例: "TypeScript書いてたら眠くなってきた"）のような境界事例を適切に分類できない。

LLMによるテキスト分類が従来手法を上回ることは多くの研究で確認されている。特にHaiku級の軽量モデルでも分類タスクでは十分な精度を発揮する。

### なぜ感情ラベル（sentiment）も付与するか

感情ラベルはStep 6（類似検索）の多様性フィルタリングで使用される。同一話題でも「肯定的に語るツイート」と「皮肉的に語るツイート」は人格再現において異なる役割を果たす。Embedding検索だけでは態度の多様性を保証できないため、明示的なラベルが必要。

### なぜBatch APIを使うか

8,000件 ÷ 50件/リクエスト = 160リクエスト。Batch APIにより50%のコスト削減と、レート制限を気にせずに一括投入できる運用上の利点がある。分類タスクは即時応答が不要であり、Batch APIの非同期処理が適している。

---

## Step 3: クラスタ分析 — 根拠

### なぜトピッククラスタベースの分割か（件数ベースでなく）

心理学におけるWalter Mischel (1968) の状況主義的アプローチ、およびFleeson (2001) の「個人内変動性（within-person variability）」研究が示すように、人間の行動は**状況・文脈に応じて変動する**のが普通であり、全状況にわたる平均的な行動記述は実態を反映しない。

ツイートの文脈では、「技術について語るとき」と「日常の雑感を述べるとき」では同一人物でもトーン・語彙・論理展開が異なる。件数ベースの均等分割（旧設計: 2000件ずつ）では、各チャンクにモードが混在し、統合時に「平均の平均」が生まれてモード固有の特徴が消失する。

トピッククラスタベースの分割により、「この人は技術の話では断定的だが、日常の話では柔らかい」というモード依存の振る舞いを人格特徴として保持できる。

### なぜLLMに自然言語portraitを書かせるか

Oxford Digital Scholarship in the Humanitiesに掲載されたGPT-4oの文体模倣研究 (2025) は、LLMが**表面的な文体属性の模倣には優れるが、深い因果推論や真正な著者の声の再現には課題がある**ことを示している。この知見は、構造化パラメータ（`avgLength: 42.3`）よりも、具体例を交えた自然言語記述のほうがLLMにとって情報量が多く有用であることを示唆する。

また、Bhandarkar et al. (2024) は4要素のゼロショットプロンプトでLLMにブログの文体模倣をさせたが、Zhou et al. (2024) "Using Prompts to Guide Large Language Models in Imitating a Real Person's Language Style" は、**実際のテキスト例を含むプロンプトがゼロショットを大きく上回る**ことを示した。

これらを総合すると、分析ステップの出力は「LLMが生成プロンプトとして使いやすい形式」であるべきであり、それは構造化JSONよりも**具体例を交えた自然言語記述**である。

### なぜ代表ツイートを選定させるか

PAN共有タスク (2013-2023) での著者検証研究では、**少数の代表的テキストサンプルが大量のテキストと同等以上の著者識別精度を示す**ケースが報告されている。これは、著者の文体的指紋が特定の典型的テキストに凝縮される傾向があることを示唆する。

groaにおいて代表ツイートは「ボイスバンク」としてペルソナ文書に組み込まれ、生成時のfew-shot例として直接使用される。「典型的な文体の実例」を提供することで、LLMの文体模倣精度が向上する。

---

## Step 4: ペルソナ文書合成 — 根拠

### なぜ自然言語ペルソナ文書なのか

先行研究が一貫して示しているのは、LLMの文体模倣において**実際のテキスト例がパラメトリックな記述よりも有効**であることである:

1. **Hicke & Mimno (2023)**: T5-largeモデルによる初期近代英語劇の著者帰属で、LLMが短いパッセージから正確に著者を特定できることを示した。これはLLMが文体の微細な特徴を捉える能力を持つことを意味する。
2. **Oxford DSH (2025) のGPT-4oスタイル模倣研究**: ストップワード（機能語）のような「些細な要素」が著者の文体的指紋の維持に重要であることを確認 (Eder 2011; Mikros & Perifanos 2011)。
3. **Zhou et al. (2024)**: 実在の人物の言語スタイル模倣において、テキスト例を含むプロンプトがゼロショットを大幅に上回ることを実証。

これらから導出される設計原則: ペルソナ文書は、(a) 自然言語による文体ルールの記述と、(b) 代表ツイートの実例集（ボイスバンク）の二層構造とすべきである。

### なぜ `StyleStats` をペルソナ文書に埋め込むか

ローカルで算出した確定的データ（語尾頻度、文字数分布等）は、LLMが「数える」必要のない正確な事実である。これをペルソナ文書の文体ルールセクションに人間可読な形で埋め込むことで:

- 生成時のLLMは「語尾"な"を使え」ではなく「語尾"な"を約1割の頻度で使う傾向がある（例: "フロントエンド、結局バンドラの問題な"）」という具体例付きの指示を受ける
- 具体例が含まれることで、LLMの文体模倣の精度が向上する（前述のZhou et al. 2024の知見）

### なぜモード間の矛盾を解消しないか

Fleeson (2001) の研究が示すように、個人内変動性は人格の特徴であって欠陥ではない。「技術の話では断定的、日常の話では曖昧」は矛盾ではなく、その人の「モード切り替え」パターンである。これを「やや断定的でやや曖昧」に平均化することは情報の損失であり、生成時に不自然な中間的テキストを生む原因となる。

---

## Step 5: Embedding生成 — 根拠

### なぜローカルEmbeddingモデルか（OpenAI API不使用）

旧設計ではOpenAI text-embedding-3-small を使用していたが、以下の理由によりローカルEmbeddingモデル（Transformers.js + multilingual-e5-small）に変更した。

#### 1. 日本語検索品質が同等以上

JMTEB（Japanese Massive Text Embedding Benchmark）のRetrieval（検索）タスクにおいて、multilingual-e5-small（67.27）はtext-embedding-3-small（66.39）を上回る (Tsukagoshi & Sasano, 2024 "Ruri: Japanese General Text Embeddings")。MIRACL日本語検索タスク（Wang et al., 2024）でも multilingual-e5-small（nDCG@10: 63.6, Recall@100: 95.2）は実用十分な性能を示す。

groaの用途はtop-k少数検索（k=5-10）であり、Recall@100が95%を超える性能は候補プールとして十分である。JMTEB全体平均ではtext-embedding-3-smallがやや上回る（69.18 vs 67.71）が、差は約1.5ポイントであり、groaが使用するRetrievalタスクに限れば逆転している。

#### 2. 低次元ベクトルの十分性

multilingual-e5-smallは384次元、text-embedding-3-smallは1,536次元。この次元差は一見大きいが、近年の研究はEmbedding次元の冗長性を明確に示している:

- **Takeshita et al. (2025)** "Randomly Removing 50% of Dimensions in Text Embeddings has Minimal Impact on Retrieval and Classification Tasks" (EMNLP 2025): Embeddingの次元を50%ランダムに削除しても検索タスクで元の性能の90%以上を保持。E5-largeの1,024次元中430次元（42%）が「有害な次元」（degrading dimensions）であり、存在することでむしろ性能を下げている。
- **Kusupati et al. (2022)** "Matryoshka Representation Learning" (NeurIPS 2022): 3,072次元を256次元（8%）に縮小しても、旧世代の1,536次元モデルを上回る性能を達成。検索タスクでフルサイズの50%でも1-4%ポイントの劣化のみ。

これらの知見は、384次元がgroaのfew-shot検索に十分であることを裏付ける。

#### 3. 外部API依存の除去

text-embedding-3-smallの使用には以下の問題があった:
- **OpenAI APIキーが別途必要**: `claude-code` バックエンドでも「APIキー不要」を完全に実現できなかった
- **ブラウザCORS非対応**: Web版からOpenAI APIへの直接呼び出しがCORSにより不可能。CLIで事前生成したEmbeddingIndexファイルのインポートという迂回策が必要だった
- **外部サービス障害のリスク**: API停止・レート制限・価格変更の影響を受ける

ローカルEmbeddingにより、これら全てが解消される。

#### 4. プライバシーの向上

groaが扱うツイートデータは個人の言語パターンを含む。ローカルEmbedding化により、Embedding生成のためにツイートテキストを外部サーバーに送信する必要がなくなり、プライバシーが向上する。これはspec.md §9.3（セキュリティ・プライバシー）および §9.4（倫理的ガイドライン）の方針と整合する。

#### 5. ストレージの大幅削減

384次元（Float32Array）× 8,000件 ≒ 12MB。旧設計の1,536次元 × 8,000件 ≒ 49MBから**75%削減**。Web版のIndexedDB容量問題が大幅に緩和される。

### なぜ multilingual-e5-small か

Wang et al. (2024) "Multilingual E5 Text Embeddings: A Technical Report" (arXiv:2402.05672) によれば、multilingual-e5シリーズは約10億件の多言語テキストペアでコントラスティブ事前学習 + 教師あり微調整されており、日本語のMr.TyDi MRR@10で89.1を達成。MIT ライセンスで完全オープンソースである。

smallモデル（117Mパラメータ）を選択する理由:
- ONNX INT8量子化で118MBとブラウザでの利用に現実的なサイズ
- baseモデル（278M）やlargeモデル（560M）はブラウザ環境でのメモリ・ダウンロード量が過大
- Retrieval性能はbaseとの差が約1ポイントであり、コスト対効果に優れる

### なぜ Transformers.js か

Transformers.js（Hugging Face公式）はONNX Runtime上でブラウザ・Node.jsの両環境で同一モデルを実行可能。groaのCLI/Web版で共通のEmbedding実装を提供できる唯一の選択肢である。

### 処理速度の見積もり

8,000件のツイート処理:
- WASM推論: 40-120秒（CPU依存）
- WebGPU推論: 2-8秒（GPU利用可能な場合）
- spec.mdの性能要件（Step 5: 2分以内）を満たす

---

## Step 6: 類似検索 + 多様性フィルタリング — 根拠

### なぜEmbedding検索だけでは不十分か

Embedding（multilingual-e5-small）はテキストの**意味的類似性**を捉えるが、**態度の多様性**は保証しない。「AIはすごい」と「AIの倫理問題を皮肉交じりに論じるツイート」はEmbedding空間上では近い位置にあるが、人格再現のためのfew-shot例としての役割は全く異なる。

PAN共有タスクにおけるクロスドメイン著者検証 (PAN 2020-2023) の知見として、**異なるジャンル・トピックにわたるテキスト対が著者検証の精度に影響する**ことが報告されている。同様に、few-shot例のジャンル・態度の多様性が生成テキストの質に影響すると推測される。

### 二段階検索の設計根拠

1. **Phase 1: 意味的類似検索** — トピックに無関係なツイートを排除する。情報検索の基本原則。
2. **Phase 2: 多様性フィルタリング** — 候補群から `sentiment` / `category` の多様性を確保して最終選定。Maximal Marginal Relevance (MMR; Carbonell & Goldstein 1998) の発想に基づく、関連性と多様性のバランス。

---

## Step 7: テキスト生成 — 根拠

### プロンプト構成の根拠

Zhou et al. (2024) が示した「実在の人物の言語スタイル模倣における効果的なプロンプト構成」に基づき、以下の要素を含む:

1. **ペルソナ記述（system prompt）**: 文体ルール + 態度パターンの自然言語記述。ExpertPrompting (Xu et al. 2023) の研究が、詳細で具体的なペルソナ記述が汎用的な記述より有効であることを示している。
2. **ボイスバンクからの例示**: 実際のツイート例の提示。In-context learning (ICL) の有効性は広く確認されている。
3. **few-shotツイート（retrieve結果）**: トピック固有の文体例。

### なぜPrompt Cachingが有効か

ペルソナ記述 + ボイスバンク部分は生成リクエストごとに同一であり、Prompt Cachingにより2回目以降のコストを90%削減できる。これはAnthropicのPrompt Caching仕様に基づく実用上の最適化。

---

## Step 8: 品質評価 — 根拠

### なぜ「元ツイートとの直接比較」なのか

旧設計では「PersonaDocumentとの一致度」を評価していたが、これには循環性の問題がある: LLMがプロファイルを作り、LLMがプロファイルに基づいて生成し、LLMがプロファイルとの一致度を評価する。この循環では「プロファイルの再現性」は測れても「本人らしさ」は測れない。

PAN共有タスク (2013-2023) で確立された**著者検証 (authorship verification)** のフレームワークがこの問題の解決策を提供する:

- **PAN 2020-2023**: 「2つのテキストが同一著者によって書かれたかを判定する」タスクが繰り返し実施されており、テキスト対の直接比較が著者同定の標準的手法として確立されている。
- **Huang et al. (2024)**: "Can Large Language Models Identify Authorship?" — LLMがゼロショットで著者検証・帰属タスクを効果的に実行できることを実証。特に言語的特徴に基づく説明可能な分析が可能。

これらに基づき、groaの評価は「生成テキストと元ツイートを並べて、同一人物によるテキストとして読めるかをLLMに判定させる」方式を採用する。これはPANの著者検証タスクのLLMベース実装と本質的に同じである。

### なぜ評価モデルにSonnetを使うか（Haikuでなく）

PAN共有タスクの知見として、短いテキスト（ツイート程度の長さ）での著者検証は**非常に困難なタスク**であることが繰り返し報告されている (Bhargava et al. 2013; PAN 2022-2023)。文体の微妙なニュアンスを読み取る能力が必要であり、軽量モデルでは精度が不十分と判断した。

### なぜ生成用と評価用のfew-shotを分離するか

生成時に直接参照したツイートで評価すると、「参照元をそのまま模写しているだけ」のテキストが高スコアを得る可能性がある。これはPAN共有タスクにおけるopen-set verification (PAN 2021) の設計思想 — 「未知のテキストでの検証」が閉じた検証セットより困難であることを反映している。

---

## カテゴリ分類の妥当性について

### 現行の6カテゴリ (`tech` / `daily` / `opinion` / `emotion` / `creative` / `other`) の根拠と限界

このカテゴリ分類は、日本語ツイートの一般的な内容分布に基づく実用的な設計であり、学術的に確立された分類体系ではない。しかし、以下の理由で合理的である:

1. **モード切り替えの粒度として十分**: Fleeson (2001) の個人内変動性モデルにおいて、モードの数は多すぎても少なすぎても情報量が低下する。5-6カテゴリは実用的なバランス。
2. **LLMによる分類が高精度で可能な粒度**: カテゴリの境界が曖昧すぎると分類精度が低下する。現行の6カテゴリはHaikuでも十分な精度で分類可能と期待される。
3. **50件未満のカテゴリは `other` に統合**: 統計的に有意な分析を行うには最低限のサンプル数が必要。この下限は明示的に設定に含まれている。

**限界**: この分類はv0.1.0のヒューリスティクスであり、今後の実データでの検証を経て見直す可能性がある。カテゴリの追加・変更・再定義はconfigの `categories` フィールドとして外部化することをv0.2.0で検討する。

---

## 評価しきい値 (6.0) について

`authenticity >= 6.0` という合格しきい値は、**初期値としての経験的設定**であり、学術的根拠はない。v0.1.0でのリリース基準を満たすための出発点として設定し、実データでの運用を経てチューニングする。しきい値はconfigで変更可能としており、ユーザーが品質要件に応じて調整できる。

---

## 参考文献

- Abbasi, A. & Chen, H. (2008). "Writeprints: A stylometric approach to identity-level identification and similarity detection in cyberspace." ACM TOIS.
- Bhargava, M. et al. (2013). "Stylometric Analysis for Authorship Attribution on Twitter." BDA 2013.
- Bhandarkar, A., Argueta, L., & Wang, W.Y. (2024). "Personas as a Way to Model Truthfulness in Language Models." arXiv:2310.18168.
- Carbonell, J. & Goldstein, J. (1998). "The use of MMR, diversity-based reranking for reordering documents and producing summaries." SIGIR 1998.
- Eder, M. (2011). "Style-markers in authorship attribution: a cross-language study of the authorial fingerprint."
- Fleeson, W. (2001). "Toward a structure- and process-integrated view of personality: Traits as density distributions of states." JPSP.
- Frantzeskou, G. et al. (2006). "Source Code Author Identification Based on N-gram Author Profiles." AIAI 2006.
- Hicke, R. & Mimno, D. (2023). "T5 meets Tybalt: Author Attribution in Early Modern English Drama Using Large Language Models."
- Huang, H. et al. (2024). "Can Large Language Models Identify Authorship?"
- Koppel, M. et al. (2009). "Computational Methods in Authorship Attribution." JASIST.
- Kusupati, A., Bhatt, G., Rege, A., Wallingford, M., Sinha, A., Ramanujan, V., Howard-Snyder, W., Chen, K., Kakade, S., Jain, P. & Farhadi, A. (2022). "Matryoshka Representation Learning." NeurIPS 2022.
- Lagutina, K. et al. (2019). "A Survey on Stylometric Text Features." 
- Lutosławski, W. (1890). "Principes de stylométrie."
- Mendenhall, T.C. (1887). "The Characteristic Curves of Composition." Science.
- Mikros, G.K. & Perifanos, K. (2011). "Authorship Attribution in Greek Tweets Using Author's Multilevel N-gram Profiles." AAAI Spring Symposium.
- Mischel, W. (1968). "Personality and Assessment." Wiley.
- Mosteller, F. & Wallace, D.L. (1964). "Inference and Disputed Authorship: The Federalist." Addison-Wesley.
- PAN Shared Tasks (2013-2023). Authorship Verification Tasks at CLEF. https://pan.webis.de/
- Stamatatos, E. (2009). "A Survey of Modern Authorship Attribution Methods." JASIST.
- Takeshita, S., Takeshita, Y., Ruffinelli, D. & Ponzetto, S.P. (2025). "Randomly Removing 50% of Dimensions in Text Embeddings has Minimal Impact on Retrieval and Classification Tasks." EMNLP 2025.
- Tsukagoshi, H. & Sasano, R. (2024). "Ruri: Japanese General Text Embeddings." arXiv:2409.07737.
- Wang, L., Yang, N., Huang, X., Yang, L., Majumder, R. & Wei, F. (2024). "Multilingual E5 Text Embeddings: A Technical Report." arXiv:2402.05672.
- Xu, Y. et al. (2023). "ExpertPrompting: Instructing Large Language Models to be Distinguished Experts."
- Zhou, Y. et al. (2024). "Using Prompts to Guide Large Language Models in Imitating a Real Person's Language Style." arXiv:2410.03848.
