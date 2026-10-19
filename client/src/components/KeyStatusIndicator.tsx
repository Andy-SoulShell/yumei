/** 展示当前输入的格式状态，明确区分已保存与已认证。 */
import { assertProviderKeyFormat, type KeyName } from "@shared/providerKeys";

/** 密钥状态提示所需的 Provider、当前输入及已保存标记。 */
type Props = { name: KeyName; value: string; saved?: boolean };

/** 输入只做本地格式检查，不借用已保存凭据的查询结果宣称认证成功。 */
export function KeyStatusIndicator({ name, value, saved = false }: Props) {
  if (!value)
    return saved ? (
      <span className="text-xs text-muted-foreground">已保存 · 未验证</span>
    ) : null;
  try {
    assertProviderKeyFormat(name, value);
    return (
      <span className="text-xs text-muted-foreground">
        格式通过 · 待保存，未验证
      </span>
    );
  } catch {
    return <span className="text-xs text-red-500">格式不符</span>;
  }
}
