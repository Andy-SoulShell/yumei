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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarUpload } from "@/features/setup/AvatarUpload";
import { CharacterPrompt } from "@/features/setup/CharacterPrompt";
import { ReferenceUpload } from "@/features/setup/ReferenceUpload";
import { useSetupController } from "@/features/setup/useSetupController";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
export default function Setup() {
  const state = useSetupController();
  const {
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

  if (isEditing && editLoading)
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
  if (editNotFound)
    return (
      <PageError
        title={t("common:contentUnavailable")}
        actionLabel={t("explore:navCharacters")}
        onRetry={() => setLocation("/characters")}
      />
    );

  return (
    <div className="min-h-full bg-background app-surface p-3 sm:p-4">
      <div className="max-w-2xl mx-auto py-4 sm:py-8">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => setLocation("/characters")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("setup:back")}
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">
              <h1>
                {isEditing
                  ? t("setup:editCompanion")
                  : t("setup:createYourCompanion")}
              </h1>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <fieldset disabled={isPending} className="space-y-6">
                {!isEditing && (
                  <CharacterPresetPicker
                    selectedId={presetId}
                    onSelect={handleSelectPreset}
                  />
                )}
                {/* 头像上传区域 - 编辑模式显示 */}
                {isEditing && <AvatarUpload {...state} />}

                {/* 参考照片上传 */}
                <ReferenceUpload {...state} />

                {/* 名字 */}
                <div className="space-y-2">
                  <Label htmlFor="name">{t("setup:name")}</Label>
                  <Input
                    id="name"
                    maxLength={100}
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
                    rows={4}
                    className="max-h-64"
                    required
                  />
                </div>

                {/* 外貌描述 */}
                <div className="space-y-2">
                  <Label htmlFor="appearance">{t("setup:appearance")}</Label>
                  <Textarea
                    id="appearance"
                    placeholder={t("setup:forExampleLongFlowingHairASlimBuild")}
                    value={appearance}
                    onChange={e => setAppearance(e.target.value)}
                    rows={3}
                    className="max-h-64"
                    required
                  />
                </div>

                {/* 兴趣爱好 */}
                <div className="space-y-2">
                  <Label htmlFor="interests">
                    {t("setup:interestsOptional")}
                  </Label>
                  <Textarea
                    id="interests"
                    placeholder={t("setup:forExampleMoviesMusicTravelAndFood")}
                    value={interests}
                    onChange={e => setInterests(e.target.value)}
                    rows={2}
                  />
                </div>

                {/* 高级提示词定制 */}
                <CharacterPrompt {...state} />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isPending || isUploadingAvatar}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {isEditing ? t("common:saving") : t("setup:creating")}
                    </>
                  ) : isEditing ? (
                    t("setup:saveChanges")
                  ) : (
                    t("setup:createCompanion")
                  )}
                </Button>

                {/* 删除按钮 - 仅编辑模式显示 */}
                {isEditing && (
                  <div className="pt-4 border-t">
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
                            {t("setup:deleteConfirm", { name })}
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
                      {t("setup:restoreFromTrashWithin7DaysAfterThat")}
                    </p>
                  </div>
                )}
              </fieldset>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
