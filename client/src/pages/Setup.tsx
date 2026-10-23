import "@/features/setup/setup.css";
import { usePageBack } from "@/hooks/usePageBack";
import { PageError } from "@/components/PageError";
import { CharacterPresetPicker } from "@/components/CharacterPresetPicker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarUpload } from "@/features/setup/AvatarUpload";
import { BehaviorEditor } from "@/features/setup/BehaviorEditor";
import { CharacterPrompt } from "@/features/setup/CharacterPrompt";
import { CharacterVoice } from "@/features/setup/CharacterVoice";
import { ReferenceUpload } from "@/features/setup/ReferenceUpload";
import { useSetupController } from "@/features/setup/useSetupController";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Loader2,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
export default function Setup() {
  const goBack = usePageBack("/characters");
  const state = useSetupController();
  const {
    characterLimits,
    trashDays,
    setLocation,
    t,
    isEditing,
    handleSubmit,
    presetId,
    handleSelectPreset,
    name,
    setName,
    personality,
    setPersonality,
    appearance,
    setAppearance,
    interests,
    setInterests,
    isPending,
    deleteGirlfriend,
    handleDelete,
    editLoading,
    editError,
    editNotFound,
    retryEdit,
    isUploadingAvatar,
  } = state;

  if ((isEditing && editLoading) || state.presetLoading || state.draftLoading)
    return (
      <div className="flex min-h-full items-center justify-center">
        <Loader2
          className="size-8 animate-spin"
          aria-label={t("auth:working")}
        />
      </div>
    );
  if (isEditing && editError)
    return <PageError onRetry={() => void retryEdit()} />;
  if (state.presetError)
    return <PageError onRetry={() => void state.retryPresets()} />;
  if (state.productError)
    return <PageError onRetry={() => void state.retryProduct()} />;
  if (editNotFound || state.presetNotFound)
    return (
      <PageError
        title={t("common:contentUnavailable")}
        actionLabel={t("explore:navCharacters")}
        onRetry={() => setLocation("/characters")}
      />
    );

  if (state.createdCharacter)
    return (
      <div className="mx-auto max-w-xl p-4 py-8">
        <Card>
          <CardHeader>
            <Check className="size-8 text-primary" aria-hidden="true" />
            <CardTitle>
              <h1>
                {t("setup:createdTitle", { name: state.createdCharacter.name })}
              </h1>
            </CardTitle>
            <CardDescription>{t("setup:createdChatHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {state.chatOpenError && (
              <p role="alert" className="text-sm text-destructive">
                {t("setup:chatOpenError")}
              </p>
            )}
            <Button
              className="min-h-11 w-full"
              disabled={state.isOpeningChat}
              onClick={() => void state.openCreatedChat()}
            >
              {state.isOpeningChat ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ArrowRight />
              )}
              {t(state.isOpeningChat ? "setup:openingChat" : "setup:enterChat")}
            </Button>
            <Button variant="outline" className="min-h-11 w-full" asChild>
              <Link href="/characters">{t("explore:manageRoles")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="setup-page min-h-full bg-background app-surface p-3 sm:p-4">
      <AlertDialog
        open={state.pendingPreset !== undefined}
        onOpenChange={open => {
          if (!open) state.setPendingPreset(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("setup:replaceDraftTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("setup:replaceDraftDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={state.confirmPresetChange}>
              {t("setup:replaceDraftConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="max-w-2xl mx-auto py-4 sm:py-8">
        <Button variant="ghost" className="mb-4 min-h-11" onClick={goBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("setup:back")}
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">
              <h1>
                {isEditing
                  ? t("setup:editCompanion")
                  : t("setup:quickCreateTitle")}
              </h1>
            </CardTitle>
            {!isEditing && (
              <CardDescription>
                {t("setup:quickCreateDescription")}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {!isEditing && (
              <div
                id="setup-capacity"
                className="mb-5 rounded-xl border bg-muted/30 p-3 text-sm leading-relaxed"
                role={state.capacity.error ? "alert" : "status"}
              >
                {state.capacity.error ? (
                  <>
                    <p>{t("explore:capacityError")}</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-2 min-h-11"
                      onClick={() => void state.capacity.retry()}
                    >
                      {t("explore:retry")}
                    </Button>
                  </>
                ) : !state.capacity.ready ? (
                  t("explore:checkingCapacity")
                ) : state.capacity.full ? (
                  <>
                    <p>
                      {t("explore:characterCapacityFull", {
                        count: state.capacity.limit!,
                      })}
                    </p>
                    <Link
                      href="/characters"
                      className="mt-2 inline-flex min-h-11 items-center font-medium text-primary underline"
                    >
                      {t("explore:manageRoles")}
                    </Link>
                  </>
                ) : state.capacity.remaining === null ? (
                  t("explore:characterCapacityUnlimited")
                ) : (
                  t("explore:characterCapacityRemaining", {
                    count: state.capacity.remaining,
                  })
                )}
              </div>
            )}
            {state.draftRestored && (
              <p
                role="status"
                className="mb-4 rounded-lg bg-primary/5 p-3 text-sm"
              >
                {t("setup:draftRestored")}
              </p>
            )}
            {state.draftFileWarning && (
              <p
                role="alert"
                className="mb-4 text-sm text-amber-700 dark:text-amber-300"
              >
                {t("setup:draftFilesNeedReselect")}
                {(isEditing || presetId) && (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0"
                    onClick={state.discardMissingDraftFiles}
                  >
                    {t("setup:keepExistingDraftImages")}
                  </Button>
                )}
              </p>
            )}
            <form id="character-form" onSubmit={handleSubmit}>
              <fieldset disabled={isPending} className="space-y-6">
                {!isEditing && (
                  <CharacterPresetPicker
                    characters={state.characters}
                    selectedId={presetId}
                    onSelect={handleSelectPreset}
                  />
                )}
                {!isEditing && !presetId && (
                  <div className="space-y-2">
                    <ReferenceUpload {...state} compact />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t("setup:referenceAppearanceHint")}
                    </p>
                  </div>
                )}

                {/* 名字 */}
                <div className="space-y-2">
                  <Label htmlFor="name">{t("setup:name")}</Label>
                  <Input
                    id="name"
                    className="min-h-11"
                    maxLength={characterLimits?.name}
                    placeholder={t("setup:forExampleYumi")}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                  />
                </div>

                {/* 性格特征 */}
                <div className="space-y-2">
                  <Label htmlFor="personality">{t("setup:personality")}</Label>
                  <Textarea
                    id="personality"
                    placeholder={t(
                      "setup:forExampleGentleThoughtfulAffectionateAndALittle"
                    )}
                    value={personality}
                    onChange={e => setPersonality(e.target.value)}
                    rows={3}
                    maxLength={characterLimits?.personality}
                    className="max-h-64"
                    required
                  />
                </div>

                <div className="space-y-3 border-t pt-5">
                  <h2 className="text-sm font-semibold">
                    {t("setup:furtherCustomization")}
                  </h2>
                  <CustomizationSection
                    title={t("setup:appearanceSection")}
                    description={t("setup:appearanceSectionHint")}
                    open={state.advancedSections.appearance}
                    onOpenChange={open =>
                      state.setAdvancedSection("appearance", open)
                    }
                  >
                    {isEditing && <AvatarUpload {...state} />}
                    {(isEditing || presetId) && (
                      <ReferenceUpload {...state} compact />
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="appearance">
                        {t(
                          isEditing
                            ? "setup:appearance"
                            : "setup:appearanceOptional"
                        )}
                      </Label>
                      <Textarea
                        id="appearance"
                        placeholder={t(
                          "setup:forExampleLongFlowingHairASlimBuild"
                        )}
                        value={appearance}
                        onChange={e => setAppearance(e.target.value)}
                        rows={3}
                        maxLength={characterLimits?.appearance}
                        className="max-h-64"
                        required={isEditing}
                      />
                    </div>

                    {/* 兴趣爱好 */}
                    <div className="space-y-2">
                      <Label htmlFor="interests">
                        {t("setup:interestsOptional")}
                      </Label>
                      <Textarea
                        id="interests"
                        placeholder={t(
                          "setup:forExampleMoviesMusicTravelAndFood"
                        )}
                        value={interests}
                        onChange={e => setInterests(e.target.value)}
                        rows={2}
                        maxLength={characterLimits?.interests}
                      />
                    </div>
                  </CustomizationSection>
                  <CustomizationSection
                    title={t("setup:behaviorSection")}
                    description={t("setup:behaviorSectionHint")}
                    open={state.advancedSections.behavior}
                    onOpenChange={open =>
                      state.setAdvancedSection("behavior", open)
                    }
                  >
                    <BehaviorEditor {...state} />
                  </CustomizationSection>
                  <CustomizationSection
                    title={t("setup:voiceSection")}
                    description={t("setup:voiceSectionHint")}
                    open={state.advancedSections.voice}
                    onOpenChange={open =>
                      state.setAdvancedSection("voice", open)
                    }
                  >
                    <CharacterVoice key={state.editId ?? "new"} {...state} />
                  </CustomizationSection>

                  {/* 高级提示词定制 */}
                  <CharacterPrompt {...state} />
                </div>

                {/* 删除按钮 - 仅编辑模式显示 */}
                {isEditing && (
                  <div className="pt-4">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="destructive"
                          className="w-full"
                          disabled={deleteGirlfriend.isPending}
                        >
                          {deleteGirlfriend.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              {t("common:deleting")}
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-4 h-4 mr-2" />
                              {t("setup:deleteCompanion")}
                            </>
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t("common:confirmDeletion")}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("setup:deleteConfirm", {
                              name,
                              days: trashDays,
                            })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t("common:cancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {t("common:moveToTrash")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      {t("setup:restoreFromTrashWithin7DaysAfterThat", {
                        days: trashDays,
                      })}
                    </p>
                  </div>
                )}
              </fieldset>
            </form>
          </CardContent>
        </Card>
        <div className="setup-submit-bar mt-4 rounded-xl border bg-card p-3">
          {!isEditing && state.capacity.full ? (
            <Button className="min-h-11 w-full" asChild>
              <Link href="/characters">
                {t("explore:manageRoles")}
                <ArrowRight />
              </Link>
            </Button>
          ) : (
            <Button
              type="submit"
              form="character-form"
              className="min-h-11 w-full"
              disabled={
                isPending ||
                isUploadingAvatar ||
                (!isEditing &&
                  (!state.capacity.ready ||
                    state.capacity.error ||
                    !name.trim() ||
                    !personality.trim() ||
                    (!presetId && !state.imageFile)))
              }
              aria-describedby={!isEditing ? "setup-capacity" : undefined}
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isEditing ? t("common:saving") : t("setup:creating")}
                </>
              ) : isEditing ? (
                t("setup:saveChanges")
              ) : (
                <>
                  {t("setup:createAndChat")}
                  <ArrowRight />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 首次展开后保留内容，折叠不清空未提交的表单或录音选择。 */
function CustomizationSection({
  title,
  description,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState(open);
  return (
    <Collapsible
      open={open}
      onOpenChange={next => {
        if (next) setVisited(true);
        onOpenChange(next);
      }}
      className="rounded-xl border"
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="plain"
          size="none"
          className="flex min-h-14 w-full items-center justify-between gap-3 p-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">{title}</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              {description}
            </span>
          </span>
          <ChevronDown
            className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent
        forceMount={visited || open ? true : undefined}
        hidden={!open}
        className="space-y-4 px-3 pb-3"
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
