const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** ビルド名をバリデーションして返す。不正な場合はエラーをスローする。 */
export function validateBuildName(name: string): string {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      `無効なビルド名: "${name}"。英数字・ハイフン・アンダースコアのみ使用可能です。`,
    );
  }
  return name;
}
