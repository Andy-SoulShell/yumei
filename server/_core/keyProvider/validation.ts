/** 服务端保存前复用前后端一致的基本格式校验。 */
import {
  assertProviderKeyFormat,
  type KeyName,
} from "../../../shared/providerKeys";

/** 只检查格式，不向 Provider 发送认证请求。 */
export async function validateProviderKey(
  name: KeyName,
  value: string
): Promise<void> {
  assertProviderKeyFormat(name, value);
}
