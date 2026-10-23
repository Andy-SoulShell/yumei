import { useAuth } from "@/_core/hooks/useAuth";
import {
  formDraftKey,
  formDraftEpoch,
  readFormDraft,
  readDraftFile,
  writeDraftFile,
  writeFormDraft,
  removeFormDraft,
} from "@/lib/formDrafts";
import { readCharacterDraft, type CharacterDraft } from "./characterDraft";
import { characterFieldsError } from "@shared/experienceConfig";
import { useProductConfig } from "@/features/product/useProductConfig";
import { acceptsUpload, uploadDescription } from "@shared/operationalConfig";
import { apiErrorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import type { CharacterPreset } from "@shared/discovery";
import { useDiscovery } from "@/features/discovery/useDiscovery";
import {
  companionBehaviorSchema,
  type CompanionBehavior,
} from "@shared/companionBehavior";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { useLocation, useParams, useSearch } from "wouter";

export type SetupSection = "appearance" | "behavior" | "voice";
type CreatedCharacter = { id: number; name: string };
const creationKey = (key: string | null) => (key ? `${key}:created` : null);
function readCreatedCharacter(key: string | null): CreatedCharacter | null {
  const value = readFormDraft(creationKey(key));
  return value &&
    typeof value.id === "number" &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    typeof value.name === "string" &&
    value.name.length <= 100
    ? { id: value.id, name: value.name }
    : null;
}

/** 页面查询、草稿与操作流程；展示组件只消费此状态。 */
export function useSetupController() {
  const { t, locale } = useI18n();
  const product = useProductConfig();
  const { user } = useAuth();
  const trashDays = product.raw
    ? product.raw.runtime.maintenance.companionTrashRetentionMs / 86400000
    : "";
  const uploads = product.raw?.uploads;

  const [, setLocation] = useLocation();

  const params = useParams<{ id?: string }>();
  const isEditing = params.id !== undefined;
  const [advancedSections, setAdvancedSections] = useState<
    Record<SetupSection, boolean>
  >({ appearance: isEditing, behavior: isEditing, voice: false });
  const [createdCharacter, setCreatedCharacter] =
    useState<CreatedCharacter | null>(null);
  const [isOpeningChat, setIsOpeningChat] = useState(false);
  const [chatOpenError, setChatOpenError] = useState(false);
  const openingChat = useRef(false);

  const editId = params.id ? Number(params.id) : null;

  const validEditId = editId !== null && Number.isInteger(editId) && editId > 0;
  const initializedDraftKey = useRef<string | null>(null);
  const baselineDraft = useRef<CharacterDraft | null>(null);
  const draftCleared = useRef(false);
  const draftEpoch = useRef(formDraftEpoch());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const submittedDraft = useRef<{
    key: string | null;
    text: string;
    reference: File | null;
    avatar: File | null;
    epoch: number;
  } | null>(null);
  const [hydratedDraftKey, setHydratedDraftKey] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftFileWarning, setDraftFileWarning] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<
    CharacterPreset | null | undefined
  >(undefined);
  const submissionBusy = useRef(false);
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [isCloningVoice, setIsCloningVoice] = useState(false);
  const search = useSearch();
  const discovery = useDiscovery();
  const characters =
    discovery.data?.characters.filter(item => item.listed) ?? [];
  const requestedPresetId = new URLSearchParams(search).get("preset") || "";
  const draftKey = formDraftKey(
    user?.id,
    params.id
      ? `character-edit:${params.id}`
      : `character-new:${requestedPresetId || "custom"}`
  );

  const currentDraftKey = useRef(draftKey);
  currentDraftKey.current = draftKey;
  const initialPreset = !editId
    ? characters.find(item => item.id === requestedPresetId)
    : undefined;

  const [name, setName] = useState(initialPreset?.name || "");

  const [personality, setPersonality] = useState(
    initialPreset?.personality || ""
  );

  const [appearance, setAppearance] = useState(initialPreset?.appearance || "");

  const [interests, setInterests] = useState(initialPreset?.interests || "");

  const [behaviorDraft, setBehaviorDraft] = useState<
    CompanionBehavior | undefined
  >(() =>
    initialPreset ? structuredClone(initialPreset.behavior) : undefined
  );
  const behavior = behaviorDraft ?? product.raw?.characters.defaultBehavior;
  const setBehavior: Dispatch<SetStateAction<CompanionBehavior>> = useCallback(
    next => {
      setBehaviorDraft(previous => {
        const base = previous ?? product.raw?.characters.defaultBehavior;
        return typeof next === "function"
          ? base
            ? next(base)
            : undefined
          : next;
      });
    },
    [product.raw]
  );
  const [behaviorError, setBehaviorError] = useState(false);

  const [imageFile, setImageFileState] = useState<File | null>(null);
  const setImageFile = useCallback(
    (file: File | null) => {
      setImageFileState(file);
      writeDraftFile(draftKey, "reference", file);
    },
    [draftKey]
  );

  const [presetId, setPresetId] = useState<string | null>(
    initialPreset?.id || null
  );

  const imageInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);

  const [customPrompt, setCustomPrompt] = useState("");
  const [omnivoiceVoiceId, setOmnivoiceVoiceId] = useState("");

  const [showCustomPrompt, setShowCustomPrompt] = useState(false);

  const [showPromptPreview, setShowPromptPreview] = useState(false);

  // 头像相关状态
  const [avatarFile, setAvatarFileState] = useState<File | null>(null);
  const setAvatarFile = useCallback(
    (file: File | null) => {
      setAvatarFileState(file);
      writeDraftFile(draftKey, "avatar", file);
    },
    [draftKey]
  );

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [existingAvatarUrl, setExistingAvatarUrl] = useState<string | null>(
    null
  );

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  // 编辑读取角色资料；创建同时用实际角色数量显示剩余名额。
  const {
    data: girlfriends,
    isLoading: editLoading,
    error: editError,
    refetch: retryEdit,
  } = trpc.girlfriend.list.useQuery(undefined, {
    enabled: Boolean(user) && (!isEditing || validEditId),
  });
  const billing = trpc.billing.getInfo.useQuery(undefined, {
    enabled: Boolean(user) && !isEditing,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const capacityLimit =
    billing.data?.mode === "none" ? null : billing.data?.limits.maxGirlfriends;
  const capacityReady = Boolean(billing.data && girlfriends);
  const capacityRemaining =
    capacityLimit == null
      ? null
      : Math.max(0, capacityLimit - (girlfriends?.length ?? 0));
  const capacityFull = capacityReady && capacityRemaining === 0;
  const capacityError =
    (!billing.data && billing.error) || (!girlfriends && editError);

  // 获取全局提示词配置
  const { data: apiConfig } = trpc.apiConfig.get.useQuery();

  // 仅在当前账号和表单首次就绪时合并草稿；后台刷新不覆盖编辑。
  useEffect(() => {
    if (!draftKey || !product.raw || initializedDraftKey.current === draftKey)
      return;
    const role = validEditId
      ? girlfriends?.find(g => g.id === editId)
      : undefined;
    if (params.id && !role) return;
    if (!params.id && requestedPresetId && !initialPreset) return;
    const base: CharacterDraft = {
      name: role?.name ?? initialPreset?.name ?? "",
      personality: role?.personality ?? initialPreset?.personality ?? "",
      appearance: role?.appearance ?? initialPreset?.appearance ?? "",
      interests: role?.interests ?? initialPreset?.interests ?? "",
      customPrompt: role?.customPrompt ?? "",
      omnivoiceVoiceId: role?.omnivoiceVoiceId ?? "",
      presetId: role ? null : (initialPreset?.id ?? null),
      behavior: structuredClone(
        role?.behavior ??
          initialPreset?.behavior ??
          product.raw.characters.defaultBehavior
      ),
      pendingFiles: false,
    };
    const restored = readCharacterDraft(draftKey);
    const value = restored ?? base;
    initializedDraftKey.current = draftKey;
    draftEpoch.current = formDraftEpoch();
    baselineDraft.current = base;
    draftCleared.current = false;
    setName(value.name);
    setPersonality(value.personality);
    setAppearance(value.appearance);
    setInterests(value.interests);
    setCustomPrompt(value.customPrompt);
    setOmnivoiceVoiceId(value.omnivoiceVoiceId);
    setPresetId(value.presetId);
    setBehaviorDraft(value.behavior);
    setShowCustomPrompt(Boolean(value.customPrompt));
    setPendingPreset(undefined);
    setDraftRestored(Boolean(restored));
    const created = !isEditing ? readCreatedCharacter(draftKey) : null;
    setCreatedCharacter(created);
    setIsOpeningChat(false);
    if (created) draftCleared.current = true;
    setChatOpenError(false);
    setAdvancedSections({
      appearance: isEditing,
      behavior: isEditing,
      voice: false,
    });
    setExistingImageUrl(role?.referenceImageUrl ?? null);
    setExistingAvatarUrl(role?.avatarUrl ?? null);
    const reference = readDraftFile(draftKey, "reference"),
      avatar = readDraftFile(draftKey, "avatar");
    setImageFileState(reference);
    setAvatarFileState(avatar);
    setImagePreview(null);
    setAvatarPreview(null);
    setDraftFileWarning(
      Boolean(restored?.pendingFiles && !reference && !avatar)
    );
    for (const [file, setPreview] of [
      [reference, setImagePreview],
      [avatar, setAvatarPreview],
    ] as const) {
      if (!file) continue;
      const reader = new FileReader();
      reader.onloadend = () => {
        if (initializedDraftKey.current === draftKey)
          setPreview(String(reader.result));
      };
      reader.readAsDataURL(file);
    }
    setHydratedDraftKey(draftKey);
  }, [
    draftKey,
    product.raw,
    validEditId,
    girlfriends,
    editId,
    params.id,
    requestedPresetId,
    initialPreset,
    isEditing,
  ]);

  const draft: CharacterDraft | undefined = behavior
    ? {
        name,
        personality,
        appearance,
        interests,
        customPrompt,
        omnivoiceVoiceId,
        presetId,
        behavior,
        pendingFiles: Boolean(imageFile || avatarFile || draftFileWarning),
      }
    : undefined;
  const draftText = draft ? JSON.stringify(draft) : "";
  const hasUnsavedChanges = Boolean(
    draft &&
    baselineDraft.current &&
    draftText !== JSON.stringify(baselineDraft.current)
  );
  useEffect(() => {
    if (
      !draftKey ||
      hydratedDraftKey !== draftKey ||
      draftCleared.current ||
      draftEpoch.current !== formDraftEpoch() ||
      !draftText
    )
      return;
    if (draftText === JSON.stringify(baselineDraft.current))
      removeFormDraft(draftKey);
    else writeFormDraft(draftKey, JSON.parse(draftText));
  }, [draftKey, hydratedDraftKey, draftText]);
  useEffect(() => {
    if (!imageFile && !avatarFile) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [imageFile, avatarFile]);
  const clearDraft = () => {
    const saved = submittedDraft.current ?? {
      key: draftKey,
      text: draftText,
      reference: imageFile,
      avatar: avatarFile,
      epoch: draftEpoch.current,
    };
    if (saved.epoch !== formDraftEpoch()) return false;
    const stored = readFormDraft(saved.key);
    const unchanged = !stored || JSON.stringify(stored) === saved.text;
    if (unchanged) removeFormDraft(saved.key);
    for (const kind of ["reference", "avatar"] as const)
      if (readDraftFile(saved.key, kind) === saved[kind])
        writeDraftFile(saved.key, kind, null);
    const canLeave =
      mounted.current &&
      currentDraftKey.current === saved.key &&
      unchanged &&
      saved.epoch === formDraftEpoch();
    if (canLeave) draftCleared.current = true;
    return canLeave;
  };

  const utils = trpc.useUtils();
  const resumeConversation = trpc.conversation.resume.useMutation();
  const openCreatedConversation = async (
    created: CreatedCharacter,
    key = draftKey,
    epoch = formDraftEpoch()
  ) => {
    if (openingChat.current) return;
    const isCurrent = () =>
      mounted.current &&
      currentDraftKey.current === key &&
      epoch === formDraftEpoch();
    if (!isCurrent()) return;
    openingChat.current = true;
    setIsOpeningChat(true);
    setChatOpenError(false);
    try {
      const conversation = await resumeConversation.mutateAsync({
        girlfriendId: created.id,
        locale,
      });
      if (!isCurrent()) return;
      removeFormDraft(creationKey(key));
      void utils.conversation.invalidate().catch(() => undefined);
      setLocation(`/chat/${conversation.id}`, { replace: true });
    } catch {
      if (isCurrent()) setChatOpenError(true);
    } finally {
      openingChat.current = false;
      if (isCurrent()) setIsOpeningChat(false);
    }
  };

  const createGirlfriend = trpc.girlfriend.create.useMutation({
    onSettled: () => {
      submissionBusy.current = false;
    },
    onSuccess: async data => {
      const submitted = submittedDraft.current;
      const canLeave = clearDraft();
      const created = { id: data.id, name: data.name };
      if (submitted && submitted.epoch === formDraftEpoch())
        writeFormDraft(creationKey(submitted.key), created);
      void Promise.allSettled([
        utils.girlfriend.invalidate(),
        utils.billing.getInfo.invalidate(),
      ]);
      if (!canLeave) return;
      setCreatedCharacter(created);
      setImageFileState(null);
      setAvatarFileState(null);
      setImagePreview(null);
      setAvatarPreview(null);
      toast.success(t("setup:companionCreated"));
      await openCreatedConversation(created, submitted?.key, submitted?.epoch);
    },
    onError: error => {
      void Promise.allSettled([
        utils.girlfriend.invalidate(),
        utils.billing.getInfo.invalidate(),
      ]);
      toast.error(
        t("setup:couldNotCreateCompanion", { error: apiErrorMessage(error, t) })
      );
    },
  });

  // 亲密度经验值

  const updateGirlfriend = trpc.girlfriend.update.useMutation({
    onSettled: () => {
      submissionBusy.current = false;
    },
    onSuccess: async () => {
      const canLeave = clearDraft();
      await utils.girlfriend.invalidate();
      if (!canLeave) return;
      toast.success(t("setup:companionUpdated"));
      // 触发编辑资料亲密度经验值

      setLocation("/characters");
    },
    onError: error => {
      toast.error(
        t("setup:couldNotUpdate", { error: apiErrorMessage(error, t) })
      );
    },
  });

  const uploadAvatar = trpc.girlfriend.uploadAvatar.useMutation({
    onSuccess: async data => {
      setExistingAvatarUrl(data.avatarUrl);
      setAvatarFile(null);
      setAvatarPreview(null);
      setIsUploadingAvatar(false);
      await utils.girlfriend.invalidate();
      toast.success(t("setup:avatarUploaded"));
    },
    onError: error => {
      setIsUploadingAvatar(false);
      toast.error(
        t("setup:avatarUploadFailed", { error: apiErrorMessage(error, t) })
      );
    },
  });

  const deleteGirlfriend = trpc.girlfriend.delete.useMutation({
    onSuccess: () => {
      removeFormDraft(draftKey);
      writeDraftFile(draftKey, "reference", null);
      writeDraftFile(draftKey, "avatar", null);
      draftCleared.current = true;
      toast.success(
        t("common:movedToTrashYouCanRestoreItWithin", { days: trashDays })
      );
      setLocation("/characters");
    },
    onError: error => {
      toast.error(
        t("common:couldNotDelete", { error: apiErrorMessage(error, t) })
      );
    },
  });

  const removeAvatar = trpc.girlfriend.update.useMutation({
    onSuccess: async () => {
      setExistingAvatarUrl(null);
      setAvatarFile(null);
      setAvatarPreview(null);
      await utils.girlfriend.invalidate();
    },
    onError: error =>
      toast.error(
        t("setup:couldNotUpdate", { error: apiErrorMessage(error, t) })
      ),
    onSettled: () => setIsUploadingAvatar(false),
  });

  const handleDelete = () => {
    if (editId) {
      deleteGirlfriend.mutate({ id: editId });
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!uploads || !acceptsUpload(uploads.reference, file)) {
        toast.error(
          t(
            "setup:chooseAJPGPNGGIFOrWebPImage",
            uploads
              ? uploadDescription(uploads.reference)
              : { formats: "", maxSize: "" }
          )
        );
        e.target.value = "";
        return;
      }
      setImageFile(file);
      setDraftFileWarning(false);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const applyPreset = (preset: CharacterPreset | null) => {
    setPresetId(preset?.id || null);
    setName(preset?.name || "");
    setPersonality(preset?.personality || "");
    setAppearance(preset?.appearance || "");
    setInterests(preset?.interests || "");
    setBehavior(
      preset
        ? structuredClone(preset.behavior)
        : structuredClone(product.raw!.characters.defaultBehavior)
    );
    setBehaviorError(false);
    setCustomPrompt("");
    setOmnivoiceVoiceId("");
    setImageFile(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleSelectPreset = (preset: CharacterPreset | null) => {
    if (preset?.id === presetId || (!preset && !presetId)) return;
    if (hasUnsavedChanges) setPendingPreset(preset);
    else applyPreset(preset);
  };
  const confirmPresetChange = () => {
    if (pendingPreset === undefined) return;
    applyPreset(pendingPreset);
    setPendingPreset(undefined);
    setDraftFileWarning(false);
  };

  // 头像选择处理
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || isUploadingAvatar) return;

    if (!uploads || !acceptsUpload(uploads.avatar, file)) {
      toast.error(
        t(
          "setup:chooseAJPGPNGGIFOrWebPImage",
          uploads
            ? uploadDescription(uploads.avatar)
            : { formats: "", maxSize: "" }
        )
      );
      return;
    }

    setAvatarFile(file);
    setDraftFileWarning(false);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 上传头像
  const handleUploadAvatar = () => {
    if (!avatarFile || !editId || isUploadingAvatar) return;

    setIsUploadingAvatar(true);
    const reader = new FileReader();
    reader.onerror = () => {
      setIsUploadingAvatar(false);
      toast.error(t("setup:couldNotReadImage"));
    };
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadAvatar.mutate({
        girlfriendId: editId,
        imageBase64: base64,
        mimeType: avatarFile.type as
          "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      });
    };
    reader.readAsDataURL(avatarFile);
  };

  // 移除头像（设为 null）
  const handleRemoveAvatar = () => {
    if (!editId || isUploadingAvatar) return;
    setIsUploadingAvatar(true);
    removeAvatar.mutate({ id: editId, avatarUrl: null, avatarKey: null });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createdCharacter) {
      await openCreatedConversation(createdCharacter);
      return;
    }

    if (
      submissionBusy.current ||
      isCloningVoice ||
      isUploadingAvatar ||
      !behavior ||
      !product.raw
    )
      return;
    if (!isEditing && (!capacityReady || capacityFull)) {
      toast.error(
        t(capacityFull ? "explore:manageRoles" : "explore:checkingCapacity")
      );
      return;
    }
    if (draftFileWarning) {
      toast.error(t("setup:draftFilesNeedReselect"));
      return;
    }
    if (avatarFile) {
      toast.error(t("setup:confirmAvatarFirst"));
      return;
    }
    const resolvedAppearance =
      appearance.trim() ||
      (!isEditing ? t("setup:appearanceFromReference") : "");
    const focusField = (id: string, section?: SetupSection) => {
      if (section)
        setAdvancedSections(current => ({ ...current, [section]: true }));
      if (id === "customPrompt") setShowCustomPrompt(true);
      const key = draftKey;
      window.setTimeout(() => {
        if (mounted.current && currentDraftKey.current === key)
          document.getElementById(id)?.focus();
      }, 0);
    };
    const fields = { name, personality, appearance: resolvedAppearance };
    const invalid = Object.entries(fields).find(([, value]) => !value.trim());
    if (invalid) {
      toast.error(t("setup:fillInAllRequiredFields"));
      focusField(
        invalid[0],
        invalid[0] === "appearance" ? "appearance" : undefined
      );
      return;
    }

    const fieldError = characterFieldsError(
      {
        name,
        personality,
        appearance: resolvedAppearance,
        interests,
        customPrompt,
        behavior,
      },
      product.raw.characters
    );
    if (fieldError) {
      toast.error(fieldError);
      const values = { ...fields, interests, customPrompt };
      const invalidField = (
        Object.keys(values) as (keyof typeof values)[]
      ).find(key => values[key].length > product.raw!.characters.limits[key]);
      if (invalidField)
        focusField(
          invalidField,
          invalidField === "appearance" || invalidField === "interests"
            ? "appearance"
            : undefined
        );
      else {
        setBehaviorError(true);
        focusField("behavior-user-nickname", "behavior");
      }
      return;
    }
    const parsedBehavior = companionBehaviorSchema.safeParse(behavior);
    if (!parsedBehavior.success) {
      setBehaviorError(true);
      const firstInvalidExample = behavior.examples.findIndex(
        example => !example.user.trim() || !example.assistant.trim()
      );
      focusField(
        firstInvalidExample >= 0
          ? `behavior-example-${firstInvalidExample}-${
              behavior.examples[firstInvalidExample].user.trim()
                ? "assistant"
                : "user"
            }`
          : "behavior-user-nickname",
        "behavior"
      );
      return;
    }
    setBehaviorError(false);

    if (draft) writeFormDraft(draftKey, draft);
    submittedDraft.current = {
      key: draftKey,
      text: draftText,
      reference: imageFile,
      avatar: avatarFile,
      epoch: formDraftEpoch(),
    };
    if (editId) {
      submissionBusy.current = true;
      // 编辑模式
      updateGirlfriend.mutate({
        id: editId,
        name: name.trim(),
        personality: personality.trim(),
        appearance: appearance.trim(),
        interests: interests.trim(),
        customPrompt: customPrompt || null,
        behavior: parsedBehavior.data,
        omnivoiceVoiceId: omnivoiceVoiceId || null,
      });
    } else {
      // 创建模式
      if (!imageFile && !presetId) {
        toast.error(t("setup:uploadAReferencePhoto"));
        return;
      }

      if (!imageFile) {
        submissionBusy.current = true;
        createGirlfriend.mutate({
          name: name.trim(),
          personality: personality.trim(),
          appearance: resolvedAppearance,
          interests: interests || undefined,
          customPrompt: customPrompt || undefined,
          presetId: presetId!,
          behavior: parsedBehavior.data,
          omnivoiceVoiceId: omnivoiceVoiceId || null,
        });
        return;
      }

      submissionBusy.current = true;
      setIsReadingImage(true);
      const reader = new FileReader();
      reader.onerror = () => {
        submissionBusy.current = false;
        setIsReadingImage(false);
        toast.error(t("setup:couldNotReadImage"));
      };
      reader.onload = () => {
        const submitted = submittedDraft.current;
        if (
          !mounted.current ||
          currentDraftKey.current !== submitted?.key ||
          submitted.epoch !== formDraftEpoch()
        ) {
          submissionBusy.current = false;
          if (mounted.current) setIsReadingImage(false);
          return;
        }
        const base64 = (reader.result as string).split(",")[1];
        setIsReadingImage(false);
        createGirlfriend.mutate({
          name: name.trim(),
          personality: personality.trim(),
          appearance: resolvedAppearance,
          interests: interests || undefined,
          customPrompt: customPrompt || undefined,
          presetId: presetId || undefined,
          behavior: parsedBehavior.data,
          omnivoiceVoiceId: omnivoiceVoiceId || null,
          referenceImageBase64: base64,
          referenceImageMimeType: imageFile.type as
            "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        });
      };
      reader.readAsDataURL(imageFile);
    }
  };

  const editNotFound =
    isEditing &&
    (!validEditId ||
      (!editLoading &&
        !editError &&
        girlfriends &&
        !girlfriends.some(g => g.id === editId)));

  const isPending =
    createGirlfriend.isPending ||
    updateGirlfriend.isPending ||
    isReadingImage ||
    isCloningVoice ||
    isOpeningChat;

  const displayImage =
    imagePreview ||
    existingImageUrl ||
    (presetId ? characters.find(item => item.id === presetId)?.imageUrl : null);

  const displayAvatar = avatarPreview || existingAvatarUrl;
  return {
    draftLoading:
      !editError &&
      !product.error &&
      !discovery.error &&
      Boolean(draftKey) &&
      hydratedDraftKey !== draftKey &&
      !(params.id && girlfriends && !girlfriends.some(g => g.id === editId)) &&
      !(requestedPresetId && discovery.data && !initialPreset),
    draftRestored,
    advancedSections,
    setAdvancedSection: (section: SetupSection, open: boolean) =>
      setAdvancedSections(current => ({ ...current, [section]: open })),
    productError: product.error,
    retryProduct: product.refetch,
    createdCharacter,
    isOpeningChat,
    chatOpenError,
    openCreatedChat: () =>
      createdCharacter
        ? openCreatedConversation(createdCharacter)
        : Promise.resolve(),
    capacity: {
      ready: capacityReady,
      full: capacityFull,
      remaining: capacityRemaining,
      limit: capacityLimit,
      error: Boolean(capacityError),
      retry: () => Promise.all([billing.refetch(), retryEdit()]),
    },
    draftFileWarning,
    discardMissingDraftFiles: () => setDraftFileWarning(false),
    hasUnsavedChanges,
    pendingPreset,
    setPendingPreset,
    confirmPresetChange,
    characterLimits: product.raw?.characters.limits,
    trashDays,
    uploads,
    characters,
    presetLoading: !isEditing && discovery.isLoading,
    presetError: !isEditing ? discovery.error : null,
    retryPresets: discovery.refetch,
    presetNotFound:
      !isEditing && !!requestedPresetId && !!discovery.data && !initialPreset,
    setLocation,
    t,
    isEditing,
    editId: validEditId ? editId : null,
    setIsCloningVoice,
    editLoading,
    editError,
    editNotFound,
    retryEdit,
    handleSubmit,
    presetId,
    handleSelectPreset,
    avatarInputRef,
    displayAvatar,
    handleAvatarChange,
    avatarFile,
    handleUploadAvatar,
    isUploadingAvatar,
    setAvatarFile,
    setAvatarPreview,
    existingAvatarUrl,
    handleRemoveAvatar,
    displayImage,
    imageInputRef,
    handleImageChange,
    imageFile,
    setImageFile,
    setImagePreview,
    name,
    setName,
    personality,
    setPersonality,
    appearance,
    setAppearance,
    interests,
    setInterests,
    omnivoiceVoiceId,
    setOmnivoiceVoiceId,
    behavior: behavior!,
    setBehavior,
    behaviorError,
    showCustomPrompt,
    setShowCustomPrompt,
    customPrompt,
    previewMemoryEnabled:
      girlfriends?.find(g => g.id === editId)?.memoryEnabled ?? true,
    previewCharacter: {
      name,
      personality,
      appearance,
      interests,
      customPrompt,
      behavior,
      intimacyPoints:
        girlfriends?.find(g => g.id === editId)?.intimacyPoints ?? 0,
    },
    setCustomPrompt,
    showPromptPreview,
    setShowPromptPreview,
    apiConfig,
    isPending,
    deleteGirlfriend,
    handleDelete,
  };
}
export type SetupController = ReturnType<typeof useSetupController>;
