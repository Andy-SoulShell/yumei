/** 当前套餐、姿势和亲密度配置的初始数据，只在空库首次导入。 */
import data from "./product.json";
import { productConfigSchema } from "../../shared/productConfig";

/** 部署中的结账链接和变体映射仅在初始化时导入，以后由管理 API 编辑。 */
export function initialProductConfig() {
  const config = productConfigSchema.parse(data);
  for (const id of ["plus", "pro"]) {
    const plan = config.billing.plans.find(item => item.id === id)!;
    plan.checkoutUrl =
      process.env[`LEMONSQUEEZY_CHECKOUT_${id.toUpperCase()}`] || null;
    plan.lemonVariantId =
      process.env[`LEMONSQUEEZY_VARIANT_${id.toUpperCase()}`] || null;
  }
  return productConfigSchema.parse(config);
}
