/** 当前账号的用户名与头像草稿，预览后独立保存，并更新共享用户缓存。 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, UserRound } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProductConfig } from "@/features/product/useProductConfig";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { acceptsUpload, uploadDescription } from "@shared/operationalConfig";
import {
  USER_NAME_MAX_LENGTH,
  userNameSchema,
  userProfileSchema,
} from "@shared/profile";
import type { z } from "zod";

type AvatarDraft = NonNullable<z.infer<typeof userProfileSchema>["avatar"]> & {
  preview: string;
};

/** 保留失败时的草稿；移除或更换头像只在点击保存后写入账号。 */
export function ProfileSettings() {
  const { user } = useAuth();
  const { t } = useI18n();
  const product = useProductConfig();
  const utils = trpc.useUtils();
  const mutation = trpc.auth.updateProfile.useMutation();
  const [nameDraft, setNameDraft] = useState<string>();
  const [avatar, setAvatar] = useState<AvatarDraft | null>();
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<FileReader | null>(null);
  const busyRef = useRef(false);
  useEffect(() => () => readerRef.current?.abort(), []);

  const name = nameDraft ?? user?.name ?? "";
  const preview = avatar === undefined ? user?.image : avatar?.preview;
  const dirty = name.trim() !== (user?.name ?? "") || avatar !== undefined;
  const pending = reading || saving;
  const limit = product.data?.uploads.avatar;
  const selectAvatar = (file: File | undefined) => {
    if (!file || busyRef.current) return;
    setError("");
    setSaved(false);
    if (!limit || !acceptsUpload(limit, file)) {
      if (limit)
        setError(
          t("setup:chooseAJPGPNGGIFOrWebPImage", uploadDescription(limit))
        );
      return;
    }
    busyRef.current = true;
    setReading(true);
    const reader = new FileReader();
    readerRef.current = reader;
    reader.onload = () => {
      const preview = reader.result as string;
      setAvatar({
        preview,
        imageBase64: preview.slice(preview.indexOf(",") + 1),
        mimeType: file.type as AvatarDraft["mimeType"],
      });
    };
    reader.onerror = () => setError(t("setup:couldNotReadImage"));
    reader.onloadend = () => {
      busyRef.current = false;
      setReading(false);
    };
    reader.readAsDataURL(file);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || busyRef.current || !dirty) return;
    setSaved(false);
    const parsed = userNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(
        t("settings:profileInvalidUsername", { max: USER_NAME_MAX_LENGTH })
      );
      return;
    }
    busyRef.current = true;
    setSaving(true);
    setError("");
    try {
      const updated = await mutation.mutateAsync({
        name: parsed.data,
        ...(avatar === undefined
          ? {}
          : {
              avatar: avatar && {
                imageBase64: avatar.imageBase64,
                mimeType: avatar.mimeType,
              },
            }),
      });
      utils.auth.me.setData(undefined, current =>
        current?.id === updated.id ? updated : current
      );
      setNameDraft(undefined);
      setAvatar(undefined);
      setSaved(true);
    } catch {
      setError(t("settings:profileSaveFailed"));
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };
  if (!user) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("settings:profileTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("settings:profileDescription")}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
          <div className="flex flex-wrap items-center gap-4">
            <Avatar className="size-20">
              <AvatarImage
                src={preview || undefined}
                alt={t("settings:profileAvatar")}
              />
              <AvatarFallback className="text-2xl">
                {name.trim() ? (
                  Array.from(name.trim())[0].toUpperCase()
                ) : (
                  <UserRound className="size-8" aria-hidden="true" />
                )}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2 flex-1 min-w-0">
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                aria-label={t("settings:profileChangeAvatar")}
                accept={limit?.mimeTypes.join(",")}
                disabled={pending || !limit}
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  selectAvatar(file);
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending || !limit}
                  onClick={() => inputRef.current?.click()}
                >
                  {reading ? (
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  {t("settings:profileChangeAvatar")}
                </Button>
                {preview && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setAvatar(null);
                      setError("");
                      setSaved(false);
                    }}
                  >
                    {t("settings:profileRemoveAvatar")}
                  </Button>
                )}
              </div>
              {limit && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    "setup:uploadAnAvatarForTheHomeAndChat",
                    uploadDescription(limit)
                  )}
                </p>
              )}
              {product.isError && !limit && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void product.refetch()}
                >
                  {t("explore:retry")}
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-username">
              {t("settings:profileUsername")}
            </Label>
            <Input
              id="profile-username"
              name="username"
              autoComplete="nickname"
              value={name}
              maxLength={USER_NAME_MAX_LENGTH}
              disabled={pending}
              aria-describedby="profile-username-hint"
              onChange={event => {
                setNameDraft(event.target.value);
                setError("");
                setSaved(false);
              }}
            />
            <p
              id="profile-username-hint"
              className="text-xs text-muted-foreground"
            >
              {t("settings:profileUsernameHint", { max: USER_NAME_MAX_LENGTH })}
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-sm text-primary">
              {t("settings:profileSaved")}
            </p>
          )}
          <Button type="submit" disabled={pending || !dirty}>
            {saving && (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            )}
            {saving ? t("common:saving") : t("settings:profileSave")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
