import { getUserById } from "./repositories/users";
/** 点击管理入口时获取新的签名链接，不持久化或记录链接中的登录签名。 */
import axios from "axios";
import { TRPCError } from "@trpc/server";
import { getSubscription, handleLemonEvent } from "./billing";
const failure = () =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Subscription management is unavailable. Use your payment receipt or contact support.",
  });
export function canManageSubscription() {
  return Boolean(process.env.LEMONSQUEEZY_API_KEY?.trim());
}
export async function readProviderSubscription(userId: string) {
  const subscription = await getSubscription(userId);
  if (!subscription) return null;
  if (subscription.provider !== "lemonsqueezy" || !canManageSubscription())
    throw failure();
  try {
    const response = await axios.get(
      `https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(subscription.lsSubscriptionId)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
          Accept: "application/vnd.api+json",
        },
        timeout: 10_000,
        maxRedirects: 0,
      }
    );
    const data = response.data?.data;
    const owner = await getUserById(userId);
    if (
      !owner ||
      typeof data?.attributes?.user_email !== "string" ||
      data.attributes.user_email.trim().toLowerCase() !==
        owner.email.trim().toLowerCase()
    )
      throw failure();
    if (
      data?.type !== "subscriptions" ||
      String(data.id) !== subscription.lsSubscriptionId ||
      !data.attributes ||
      (subscription.lsCustomerId &&
        String(data.attributes.customer_id) !== subscription.lsCustomerId)
    )
      throw failure();
    const applied = await handleLemonEvent(
      {
        meta: {
          event_name: "subscription_updated",
          custom_data: { user_id: userId },
        },
        data,
      },
      subscription.lsSubscriptionId
    );
    if (!applied.ok) throw failure();
    return data as {
      id: string;
      attributes: {
        urls?: { customer_portal?: string; update_payment_method?: string };
      };
    };
  } catch {
    throw failure();
  }
}
export async function subscriptionPortal(
  userId: string,
  action: "manage" | "payment"
) {
  const data = await readProviderSubscription(userId);
  if (!data) throw failure();
  const value =
    action === "payment"
      ? data.attributes.urls?.update_payment_method
      : data.attributes.urls?.customer_portal;
  if (!value) throw failure();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw failure();
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw failure();
  return { url: url.href };
}
