/** 変換処理のエラー */
export class ConversionError extends Error {
  readonly code = "CONVERSION_ERROR" as const;
  readonly fieldName: string;
  readonly rawValue: unknown;

  constructor(fieldName: string, rawValue: unknown, message: string) {
    super(message);
    this.name = "ConversionError";
    this.fieldName = fieldName;
    this.rawValue = rawValue;
  }
}
