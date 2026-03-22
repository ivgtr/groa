/** 非リトライ対象のAPIエラー */
export class ApiError extends Error {
  statusCode: number;
  nonRetryable = false;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}
