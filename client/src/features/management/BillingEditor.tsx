/** 服务方式决定实际可操作的套餐；单份套餐在聚焦弹框内编辑。 */
import { useState } from "react";
import type { ProductConfig } from "@shared/productConfig";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupChoice } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { ConfigForm, type FormSchema } from "./ConfigForm";
import { SettingsFields } from "./SettingsFields";
import { newCollectionItem } from "./SettingsCollection";
import type { SettingsNavigation } from "./settingsModel";

type Props = {
  config: ProductConfig;
  schema?: FormSchema;
  issues: Record<string, string>;
  disabled: boolean;
  onChange: (next: ProductConfig) => void;
} & SettingsNavigation;
const name = (plan: ProductConfig["billing"]["plans"][number]) =>
  plan.label["zh-CN"] || "未命名套餐";
const price = (plan: ProductConfig["billing"]["plans"][number]) =>
  `${plan.price.amount} ${plan.price.currency} / ${plan.price.period === "year" ? "年" : "月"}`;
function ModeCards({ config, disabled, onChange }: Props) {
  return (
    <RadioGroup
      aria-label="服务提供方式"
      value={config.billing.mode}
      disabled={disabled}
      className="grid gap-2 sm:grid-cols-3"
      onValueChange={mode =>
        onChange({
          ...config,
          billing: {
            ...config.billing,
            mode: mode as ProductConfig["billing"]["mode"],
          },
        })
      }
    >
      {(
        [
          {
            value: "free",
            label: "免费提供服务",
            detail: "所有用户使用默认免费套餐",
          },
          {
            value: "lemonsqueezy",
            label: "付费订阅",
            detail: "按有效订阅授予套餐权益",
          },
          { value: "none", label: "自托管不限额", detail: "关闭套餐计量限制" },
        ] as const
      ).map(item => (
        <RadioGroupChoice
          key={item.value}
          value={item.value}
          className="space-y-2 border p-4"
        >
          <span className="block text-sm font-semibold">{item.label}</span>
          <span className="block text-xs text-muted-foreground">
            {item.detail}
          </span>
        </RadioGroupChoice>
      ))}
    </RadioGroup>
  );
}
export function PlanDialog({
  planId,
  config,
  schema,
  issues,
  disabled,
  onChange,
  onClose,
  view,
  onViewChange,
}: Props & { planId: string; onClose: () => void }) {
  const index = config.billing.plans.findIndex(plan => plan.id === planId),
    plan = config.billing.plans[index];
  const [tab, setTab] = useState("display");
  if (!plan) return null;
  const isDefault = plan.id === config.billing.defaultTierId,
    protectedPlan = isDefault || plan.id === config.billing.selfHostedTierId;
  const enabledContract = schema?.properties?.plans?.items;
  const contract: FormSchema = {
    ...enabledContract,
    properties: {
      ...enabledContract?.properties,
      enabled: {
        ...enabledContract?.properties?.enabled,
        readOnly: protectedPlan,
      },
      price: {
        ...enabledContract?.properties?.price,
        properties: {
          ...enabledContract?.properties?.price?.properties,
          amount: {
            ...enabledContract?.properties?.price?.properties?.amount,
            readOnly: isDefault,
          },
        },
      },
    },
  };
  const activeTab =
    tab === "payment" && config.billing.mode !== "lemonsqueezy"
      ? "display"
      : tab;
  const edit = (next: unknown) =>
    onChange({
      ...config,
      billing: {
        ...config.billing,
        plans: config.billing.plans.map(item =>
          item.id === plan.id ? (next as typeof plan) : item
        ),
      },
    });
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !disabled) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-3xl"
        showCloseButton={!disabled}
        onEscapeKeyDown={event => {
          if (disabled) event.preventDefault();
        }}
        onInteractOutside={event => {
          if (disabled) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>编辑套餐 · {name(plan)}</DialogTitle>
          <DialogDescription>
            {isDefault
              ? "默认免费套餐"
              : config.billing.mode === "none"
                ? "自托管模式 · 套餐额度暂不计量"
                : config.billing.mode === "free"
                  ? "备用套餐"
                  : "订阅套餐"}{" "}
            · 修改合入当前草稿
          </DialogDescription>
        </DialogHeader>
        <RadioGroup
          aria-label="套餐编辑内容"
          value={activeTab}
          disabled={disabled}
          className="flex flex-wrap gap-2"
          onValueChange={setTab}
        >
          <RadioGroupChoice value="display" variant="segment">
            展示与价格
          </RadioGroupChoice>
          <RadioGroupChoice value="limits" variant="segment">
            {config.billing.mode === "none" ? "备用权益" : "用户权益"}
          </RadioGroupChoice>
          {config.billing.mode === "lemonsqueezy" && (
            <RadioGroupChoice value="payment" variant="segment">
              支付关联
            </RadioGroupChoice>
          )}
        </RadioGroup>
        <div
          aria-label="编辑套餐"
          className="max-h-[60dvh] min-w-0 overflow-y-auto p-1"
        >
          {isDefault && activeTab === "display" && (
            <Badge variant="secondary" className="mb-4">
              免费默认 · 价格固定为 0
            </Badge>
          )}
          <SettingsFields
            key={plan.id + activeTab}
            value={plan}
            schema={contract}
            path={`billing.plans.${index}`}
            fields={
              activeTab === "limits"
                ? ["limits"]
                : activeTab === "payment"
                  ? ["checkoutUrl", "lemonVariantId"]
                  : ["label", "enabled", "price"]
            }
            config={config}
            issues={issues}
            disabled={disabled}
            onChange={edit}
            view={view}
            onViewChange={onViewChange}
          />
          {activeTab === "display" && (
            <label className="mt-4 block space-y-2 text-sm font-medium">
              展示与升级顺序
              <select
                aria-label="套餐排序位置"
                className="admin-select w-full"
                value={index}
                disabled={disabled}
                onChange={e => {
                  const plans = [...config.billing.plans];
                  plans.splice(index, 1);
                  plans.splice(Number(e.target.value), 0, plan);
                  onChange({
                    ...config,
                    billing: { ...config.billing, plans },
                  });
                }}
              >
                {config.billing.plans.map((item, at) => (
                  <option key={item.id} value={at}>
                    第 {at + 1} 位
                    {item.id === plan.id ? " · 当前位置" : ` · ${name(item)}`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled || protectedPlan}
              >
                删除套餐
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>从草稿中删除{name(plan)}？</AlertDialogTitle>
                <AlertDialogDescription>
                  保存并发布后才影响用户，发布前可重新读取已保存草稿。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>保留</AlertDialogCancel>
                <AlertDialogAction
                  disabled={disabled || protectedPlan}
                  onClick={() => {
                    onChange({
                      ...config,
                      billing: {
                        ...config.billing,
                        plans: config.billing.plans.filter(
                          item => item.id !== plan.id
                        ),
                      },
                    });
                    onClose();
                  }}
                >
                  删除草稿中的套餐
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" disabled={disabled} onClick={onClose}>
            完成套餐编辑
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function BillingSetupEditor(props: Props & { compact?: boolean }) {
  const { config, schema, disabled, issues, onChange, compact = false } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const selfHosted = config.billing.mode === "none",
    key = selfHosted ? "selfHostedTierId" : "defaultTierId";
  const plan = config.billing.plans.find(
    item => item.id === config.billing[key]
  );
  const choices = config.billing.plans.filter(
    item => item.enabled && (selfHosted || item.price.amount === 0)
  );
  return (
    <div className="space-y-4">
      <ModeCards {...props} />
      <section className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <label className="min-w-0 flex-1 space-y-2 text-sm font-medium">
          {selfHosted
            ? "自托管用户的套餐身份"
            : config.billing.mode === "free"
              ? "所有用户使用的免费套餐"
              : "没有有效订阅时的免费套餐"}
          <select
            aria-label={selfHosted ? "自托管用户的套餐身份" : "默认免费套餐"}
            className="admin-select mt-2 w-full"
            disabled={disabled}
            value={config.billing[key]}
            onChange={e =>
              onChange({
                ...config,
                billing: { ...config.billing, [key]: e.target.value },
              })
            }
          >
            {choices.map(item => (
              <option key={item.id} value={item.id}>
                {name(item)}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !plan}
          onClick={() => setEditing(plan!.id)}
        >
          编辑这份套餐
        </Button>
        {selfHosted && (
          <Badge variant="secondary">不限量 · 套餐额度不执行</Badge>
        )}
      </section>
      {!compact && (
        <section className="space-y-3 rounded-xl border p-4">
          <h3 className="text-sm font-semibold">当前聊天默认模型</h3>
          {config.models.chat.provider === "deepseek" ? (
            <ConfigForm
              value={config.models.chat.deepseekModel}
              path="models.chat.deepseekModel"
              schema={{ type: "string", minLength: 1, maxLength: 200 }}
              disabled={disabled}
              issues={issues}
              onChange={next =>
                onChange({
                  ...config,
                  models: {
                    ...config.models,
                    chat: {
                      ...config.models.chat,
                      deepseekModel: String(next),
                    },
                  },
                })
              }
            />
          ) : (
            <ConfigForm
              value={config.billing.defaultChatModel}
              path="billing.defaultChatModel"
              schema={schema?.properties?.defaultChatModel}
              disabled={disabled}
              issues={issues}
              onChange={next =>
                onChange({
                  ...config,
                  billing: {
                    ...config.billing,
                    defaultChatModel: String(next),
                  },
                })
              }
            />
          )}
        </section>
      )}
      {!compact && config.billing.mode === "lemonsqueezy" && (
        <ConfigForm
          value={config.billing.pastDueGraceMs}
          path="billing.pastDueGraceMs"
          schema={schema?.properties?.pastDueGraceMs}
          disabled={disabled}
          issues={issues}
          onChange={next =>
            onChange({
              ...config,
              billing: { ...config.billing, pastDueGraceMs: Number(next) },
            })
          }
        />
      )}
      {editing && (
        <PlanDialog
          key={editing}
          {...props}
          planId={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
export function PlanLibrary(props: Props) {
  const { config, disabled, onChange, view, onViewChange } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const search = view.searches["billing.plans"] ?? "";
  const selected =
    config.billing.plans.find(
      plan => plan.id === view.selections["billing.plans"]
    ) ?? config.billing.plans[0];
  return (
    <div className="space-y-5">
      <BillingSetupEditor {...props} compact />
      <div className="flex flex-wrap gap-3">
        <Input
          aria-label="搜索套餐"
          placeholder="搜索套餐名称"
          disabled={disabled}
          value={search}
          className="min-w-0 flex-1"
          onChange={e =>
            onViewChange({
              ...view,
              searches: { ...view.searches, "billing.plans": e.target.value },
            })
          }
        />
        <Button
          size="sm"
          variant="outline"
          disabled={
            disabled ||
            config.billing.plans.length >=
              (props.schema?.properties?.plans?.maxItems ?? 50)
          }
          onClick={() => {
            const plan = newCollectionItem(
              "plans",
              config.billing.plans,
              selected
            ) as typeof selected;
            onChange({
              ...config,
              billing: {
                ...config.billing,
                plans: [...config.billing.plans, plan],
              },
            });
            onViewChange({
              ...view,
              selections: { ...view.selections, "billing.plans": plan.id },
              searches: { ...view.searches, "billing.plans": "" },
            });
            setEditing(plan.id);
          }}
        >
          复制为新套餐
        </Button>
      </div>
      <div
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        aria-label="套餐内容库"
      >
        {config.billing.plans
          .filter(plan =>
            name(plan).toLowerCase().includes(search.toLowerCase())
          )
          .map(plan => (
            <button
              key={plan.id}
              type="button"
              aria-label={`编辑套餐：${name(plan)}`}
              disabled={disabled}
              className="space-y-3 rounded-xl border p-4 text-left hover:border-primary/40"
              onClick={() => {
                onViewChange({
                  ...view,
                  selections: { ...view.selections, "billing.plans": plan.id },
                });
                setEditing(plan.id);
              }}
            >
              <span className="flex flex-wrap items-center gap-2">
                <strong>{name(plan)}</strong>
                <Badge variant="secondary">
                  {!plan.enabled
                    ? "未开放"
                    : config.billing.mode === "none"
                      ? plan.id === config.billing.selfHostedTierId
                        ? "当前身份"
                        : "备用"
                      : config.billing.mode === "free"
                        ? plan.id === config.billing.defaultTierId
                          ? "当前使用"
                          : "备用"
                        : plan.id === config.billing.defaultTierId
                          ? "默认免费"
                          : "订阅权益"}
                </Badge>
              </span>
              <span className="block text-sm">{price(plan)}</span>
              <span className="block text-xs text-muted-foreground">
                {config.billing.mode === "none"
                  ? "当前模式不限额"
                  : plan.limits.dailyMessages === null
                    ? "聊天不限量"
                    : `每日 ${plan.limits.dailyMessages} 条聊天`}
              </span>
            </button>
          ))}
      </div>
      {editing && (
        <PlanDialog
          key={editing}
          {...props}
          planId={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
