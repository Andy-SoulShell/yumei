/** 图片生成导航入口，选择个人角色后打开原聊天页的自拍生成控件。 */
import { Link } from "wouter";
import { ImagePlus, Images, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCompanionChat } from "@/hooks/useCompanionChat";
import { Button } from "@/components/ui/button";
import { CharacterCard } from "@/components/CharacterCard";

/** 复用现有图片生成、会话、额度和相册，不增加生成服务或计费方式。 */
export default function Generate() {
  const { t } = useI18n();
  const { companions, isLoading, error, refetch, pending, open } =
    useCompanionChat();
  return (
    <div className="hub-page">
      <div className="hub-heading">
        <span className="section-eyebrow">
          <ImagePlus size={14} />
          {t("explore:navGenerate")}
        </span>
        <h1>{t("explore:generateTitle")}</h1>
        <p>{t("explore:generateSubtitle")}</p>
        <Button asChild variant="outline" className="mt-5">
          <Link href="/gallery">
            <Images />
            {t("common:photoGallery")}
          </Link>
        </Button>
      </div>
      {isLoading ? (
        <Loader2 className="mx-auto my-16 animate-spin" />
      ) : error ? (
        <div className="explore-empty">
          <p>{t("auth:networkErrorPleaseTryAgain")}</p>
          <Button onClick={() => void refetch()}>{t("explore:retry")}</Button>
        </div>
      ) : companions?.length ? (
        <>
          <div className="section-heading">
            <h2>{t("explore:chooseRole")}</h2>
            {pending !== null && <Loader2 className="animate-spin" />}
          </div>
          <div
            className={`character-grid ${pending !== null ? "is-pending" : ""}`}
            aria-busy={pending !== null}
          >
            {companions.map(role => (
              <CharacterCard
                key={role.id}
                name={role.name}
                image={role.referenceImageUrl}
                label={t("explore:generateAction")}
                description={role.interests || role.personality}
                onClick={() => void open(role.id, true)}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="explore-empty">
          <ImagePlus size={34} />
          <h2>{t("chat:noCompanionYet")}</h2>
          <p>{t("chat:createYourCompanionFirst")}</p>
          <Button asChild>
            <Link href="/explore">{t("explore:heroAction")}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
