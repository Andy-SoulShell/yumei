/** 社区审核和人工结算只对独立管理会话开放。 */
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageError } from "@/components/PageError";
export function CommerceAdmin({ onLogout }: { onLogout: () => void }) {
  const query = trpc.economy.admin.queue.useQuery(undefined, {
      refetchInterval: 30000,
    }),
    utils = trpc.useUtils();
  const [notice, setNotice] = useState("");
  const moderate = trpc.economy.admin.moderate.useMutation({
    onSuccess: () => {
      setNotice("审核结果已保存。");
      void utils.economy.admin.queue.invalidate();
      void utils.economy.community.invalidate();
    },
    onError: () => setNotice("审核未完成，内容可能已更新，请重新读取后审核。"),
  });
  const settle = trpc.economy.admin.settlePayout.useMutation({
    onSuccess: () => {
      setNotice("结算状态已更新。");
      void utils.economy.admin.queue.invalidate();
    },
    onError: () =>
      setNotice("无法更新：请检查收益是否已被退款扣回，或申请是否已处理。"),
  });
  return (
    <main className="studio-account-page">
      <header className="flex flex-wrap justify-between gap-3">
        <h1>社区与创作者结算</h1>
        <Link className="underline" href="/admin">
          返回管理后台
        </Link>
        <Button variant="outline" onClick={onLogout}>
          退出管理
        </Button>
      </header>
      <Link href="/admin/billing?edit=economy" className="underline">
        配置金币、充值包和分成规则
      </Link>
      <p className="text-sm text-muted-foreground">
        审核通过后角色资料和图片会公开。结算申请需核验后在线下完成实际付款，再记录支付凭证；本页不会自动转账。
      </p>
      {notice && <p role="status">{notice}</p>}
      {query.error ? (
        <PageError onRetry={() => void query.refetch()} />
      ) : !query.data ? (
        <p role="status">正在读取…</p>
      ) : (
        <>
          <section className="space-y-4">
            <h2>角色审核（{query.data.characters.length}）</h2>
            {!query.data.characters.length && <p>没有待审核角色。</p>}
            {query.data.characters.map(item => {
              const row = {
                ...item,
                snapshot: item.pendingSnapshot ?? item.snapshot,
              };
              return (
                <article className="studio-account-card space-y-4" key={row.id}>
                  <img
                    src={row.snapshot.imageUrl}
                    alt={row.snapshot.name}
                    className="h-56 w-40 rounded-xl object-cover"
                  />
                  <h3>{row.snapshot.name}</h3>
                  <p className="text-sm whitespace-pre-wrap">
                    简介：{row.snapshot.summary}\n场景：{row.snapshot.scenario}
                  </p>
                  <details>
                    <summary>完整公开人设</summary>
                    <p className="whitespace-pre-wrap text-sm">
                      {row.snapshot.personality}\n{row.snapshot.appearance}\n
                      {row.snapshot.interests}
                    </p>
                  </details>
                  <form
                    className="studio-form-stack"
                    onSubmit={event => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      moderate.mutate({
                        id: row.id,
                        expectedImageKey: row.snapshot.imageKey,
                        expectedReviewVersion: row.reviewVersion,
                        status: String(form.get("status")) as
                          "published" | "rejected",
                        note: String(form.get("note")),
                      });
                    }}
                  >
                    <label>
                      审核结论
                      <select name="status" className="admin-select">
                        <option value="rejected">退回修改</option>
                        <option value="published">审核通过并公开</option>
                      </select>
                    </label>
                    <label>
                      反馈给创作者
                      <Textarea
                        name="note"
                        required
                        minLength={3}
                        maxLength={500}
                      />
                    </label>
                    <Button disabled={moderate.isPending}>确认审核结果</Button>
                  </form>
                </article>
              );
            })}
          </section>
          <details className="studio-account-card">
            <summary>已公开角色（{query.data.published.length}）</summary>
            <div className="space-y-4">
              {query.data.published.map(row => (
                <form
                  key={`${row.id}:${row.reviewVersion}`}
                  className="studio-form-stack border-t pt-4"
                  onSubmit={event => {
                    event.preventDefault();
                    moderate.mutate({
                      id: row.id,
                      expectedImageKey: (row.pendingSnapshot ?? row.snapshot)
                        .imageKey,
                      expectedReviewVersion: row.reviewVersion,
                      status: "unlisted",
                      note: String(
                        new FormData(event.currentTarget).get("note")
                      ),
                    });
                  }}
                >
                  <h3>{row.snapshot.name}</h3>
                  <label>
                    下架原因
                    <Textarea
                      name="note"
                      required
                      minLength={3}
                      maxLength={500}
                    />
                  </label>
                  <Button disabled={moderate.isPending} variant="outline">
                    确认下架并通知创作者
                  </Button>
                </form>
              ))}
            </div>
          </details>
          <section className="space-y-4">
            <h2>待处理结算（{query.data.payouts.length}）</h2>
            {!query.data.payouts.length && <p>没有待处理申请。</p>}
            {query.data.payouts.map(row => (
              <article key={row.id} className="studio-account-card space-y-4">
                <h3>{(row.amountCents / 100).toFixed(2)} USD</h3>
                <p className="text-sm break-all">
                  申请人：{row.email}
                  <br />
                  申请编号：{row.id}
                </p>
                <form
                  className="studio-form-stack"
                  onSubmit={event => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    settle.mutate({
                      id: row.id,
                      status: String(form.get("status")) as "paid" | "rejected",
                      reference: String(form.get("reference")),
                      note: String(form.get("note")),
                    });
                  }}
                >
                  <label>
                    处理结果
                    <select className="admin-select" name="status">
                      <option value="rejected">退回申请并释放待结算金额</option>
                      <option value="paid">实际付款已完成</option>
                    </select>
                  </label>
                  <label>
                    外部支付凭证号（已支付时必填）
                    <Input name="reference" maxLength={200} />
                  </label>
                  <label>
                    处理说明
                    <Textarea
                      name="note"
                      required
                      minLength={3}
                      maxLength={500}
                    />
                  </label>
                  <Button disabled={settle.isPending}>确认记录结果</Button>
                </form>
              </article>
            ))}
          </section>
          <details className="studio-account-card">
            <summary>
              最近处理的结算（{query.data.payoutHistory.length}）
            </summary>
            <ul className="studio-ledger">
              {query.data.payoutHistory.map(row => (
                <li key={row.id}>
                  <div className="text-sm">
                    <p>
                      {row.status === "paid" ? "已支付" : "已退回"} ·{" "}
                      {(row.amountCents / 100).toFixed(2)} USD
                    </p>
                    <p className="break-all">{row.id}</p>
                    <p className="break-all">{row.reference}</p>
                    <p>{row.note}</p>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </main>
  );
}
