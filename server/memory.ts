import { getPublishedProductConfig } from "./repositories/productConfig";
import type { ProductConfig } from "../shared/productConfig";
import {
  memoryCategorySchema,
  renderPrompt,
  type MemoryConfig,
} from "../shared/aiConfig";
import { getLevelByPoints } from "../shared/intimacy";
/** 长期记忆的异步提取、去重存储、容量淘汰和聊天召回。 */

import axios from "axios";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  memorySourceDay,
  resolveMemoryEventDay,
} from "../shared/memorySemantics";
import {
  conversations,
  girlfriends,
  memories,
  companionPreferences,
  conversationSummaries,
  memoryEmbeddings,
  messages,
  type Memory,
} from "../drizzle/schema";
import {
  bigramOverlap,
  memoryCapacity,
  memoryInjectionK,
  normalizeMemoryText,
  scoreMemory,
} from "../shared/memory";
import type { ChatProvider } from "./_core/chatProvider";
import { log } from "./_core/log";
import { getDb, withUserTransaction, type DbTransaction } from "./database";
import {
  getCompanionPreferences,
  memoryFeatureEnabled,
  runMeteredAiTask,
} from "./aiTaskRuntime";
import {
  invalidateMemoryDerived,
  memoryContextRecord,
  memoryLocalDay,
  memorySemanticConfiguration,
  readMemorySummary,
  semanticMemoryScores,
  memoryTaskModel,
  sameMemoryRouting,
  memoryStatementRanges,
} from "./memoryDerived";
import { resolveChatProvider } from "./_core/chatProvider";

// ---------------------------------------------------------------------------
// 记忆提取。
// ---------------------------------------------------------------------------

const extractionResultSchema = (config: MemoryConfig) =>
  z.object({
    memories: z
      .array(
        z.object({
          category: memoryCategorySchema,
          content: z
            .string()
            .trim()
            .min(2)
            .max(config.maxExtractedLength * 2),
          importance: z.number().min(1).max(10),
        })
      )
      .max(config.extraction.maxResults),
  });

/** 经结构校验后的单条模型提取结果，包含类别、正文和重要性。 */
export type ExtractedMemory = z.infer<
  ReturnType<typeof extractionResultSchema>
>["memories"][number] & { sourceMessageId?: number };

/** 提取器只能引用当前窗口内真实用户消息的编号与原文。 */
export type MemorySourceMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: Date;
};

const groundedExtractionSchema = (config: MemoryConfig) =>
  z.object({
    memories: z
      .array(
        z.object({
          category: memoryCategorySchema,
          sourceMessageId: z.number().int(),
          quote: z.string().trim().min(2).max(config.maxExtractedLength),
          importance: z.number().min(1).max(10),
        })
      )
      .max(config.extraction.maxResults),
  });

/**
 * 提取模型回复中最外层 JSON，校验结构并裁剪记忆正文。
 *
 * @returns 无有效 JSON 或结构不符时返回 null，区别于合法的空结果
 */
function parseExtractionPayload(
  raw: string,
  config: MemoryConfig
): ExtractedMemory[] | null {
  // 模型可能在 JSON 外添加代码围栏或说明，尝试提取最外层对象。
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const result = extractionResultSchema(config).safeParse(parsed);
    if (!result.success) return null;
    return result.data.memories.map(m => ({
      ...m,
      content: m.content.trim().slice(0, config.maxExtractedLength),
    }));
  } catch {
    return null;
  }
}

/** 解析供界面与测试使用的提取结果；无有效 JSON 时返回空数组。 */
export function parseExtractionResponse(
  raw: string,
  config: MemoryConfig
): ExtractedMemory[] {
  return parseExtractionPayload(raw, config) ?? [];
}

/** 拒绝/假设/转述会限定同一条用户来源，不能靠只引用其中一句绕过；宁可不保存。 */
function hasUnsafeMemorySource(source: string) {
  const statements = memoryStatementRanges(source).map(range =>
    range.value.trim()
  );
  return statements.some(
    (statement, index) =>
      /^(?:如果|假如|假设|假設|要是|比如|例如|(?:刚才|刚刚|之前|上次)?你(?:刚才|之前|曾经|剛才)?说|你(?:剛才|之前)?說|她说|他说|听说|据说)/.test(
        statement
      ) ||
      /^(?:if\b|suppose\b|you said\b|she said\b|he said\b)/i.test(statement) ||
      /(?:不要|別|别|不想).{0,8}(?:记住|記住|记录|紀錄)|\b(?:do not|don't)\s+(?:remember|store)\b/i.test(
        statement
      ) ||
      !!petNameReference(statement)?.rejected ||
      /^(?:刚才|剛才|前面|以上|上述|这|這|那).{0,10}(?:只是|是).{0,8}(?:假设|假設|玩笑|举例|舉例|转述|轉述|别人|別人|朋友说|朋友說)|^(?:这|這|那)?(?:不是事实|不是事實|不是真的)|^(?:只是|仅仅是|僅僅是)(?:开|開)?(?:玩笑|假设|假設)|\b(?:that|this|the above).{0,12}(?:hypothetical|not true|a joke|someone else's)\b/i.test(
        statement
      ) ||
      (index > 0 &&
        statements
          .slice(0, index)
          .some(previous => !isMemoryControlStatement(previous)) &&
        /^(?:不是|不对|不對|其实不是|其實不是|更正|纠正|糾正|訂正|違う|いや|아니)|^(?:actually[,\s]+)?(?:no\b|not\b)|^correction\b|^I (?:was|am) joking\b/i.test(
          statement
        ))
  );
}

/** 将片段扩为完整原句，完整来源先校验，提取和事务落库共用。 */
function completeUserStatement(
  source: string,
  quote: string,
  maxLength: number
): string | null {
  const start = source.indexOf(quote);
  if (
    start < 0 ||
    start !== source.lastIndexOf(quote) ||
    hasUnsafeMemorySource(source)
  )
    return null;
  for (const match of memoryStatementRanges(source)) {
    const from = match.index;
    if (from > start || from + match.value.length < start + quote.length)
      continue;
    const statement = match.value.trim();
    return statement.length <= maxLength && !/[?？]$/.test(statement)
      ? statement
      : null;
  }
  return null;
}

/** 单独的保存/称呼操作没有事实；带具体陈述的原句仍完整保留。 */
function isMemoryControlStatement(statement: string) {
  return /^(?:请|請)?(?:你)?(?:帮我|幫我)?(?:更新|更正|修改|修正)(?:一下)?(?:你的?|你对我(?:的)?)?(?:记忆|記憶)[。.!]*$|^(?:请|請)?(?:你)?(?:帮我|幫我)?(?:记住|記住)(?:这个|這個|这件事|這件事|这点|這點)?[。.!]*$|^(?:以后|以後|今后|今後)?(?:请|請)?(?:不要|别|別)(?:再)?(?:叫|称呼|稱呼|使用|用).{0,20}(?:旧|舊|原来|原來|以前).{0,8}(?:名字|名称|名稱|称呼|稱呼).{0,8}[。.!]*$|^(?:please\s+)?(?:remember\s+(?:this|that)|update\s+(?:your\s+)?memory)[.!]*$|^(?:please\s+)?(?:do not|don't|stop).{0,16}(?:use|using|call|calling).{0,16}(?:old|previous)\s+name[.!]*$|^(?:これを)?覚えて(?:おいて)?[。.!]*$|^(?:이걸\s*)?기억해\s*(?:줘|주세요)?[.!]*$/i.test(
    statement
  );
}

/** 跨句 quote 仍只接受逐字连续来源；任一句含不可信语境时不裁掉它去挽救断言。 */
function completeUserStatements(
  source: string,
  quote: string,
  maxLength: number
): string[] {
  const start = source.indexOf(quote);
  if (start < 0 || start !== source.lastIndexOf(quote)) return [];
  const end = start + quote.length;
  const ranges = memoryStatementRanges(source).filter(
    range =>
      normalizeMemoryText(
        source.slice(
          Math.max(start, range.index),
          Math.min(end, range.index + range.value.length)
        )
      ).length > 0
  );
  const statements = ranges.map(range =>
    completeUserStatement(source, range.value.trim(), maxLength)
  );
  if (!statements.length || statements.some(statement => statement === null))
    return [];
  const grounded = statements as string[];
  return grounded.filter(statement => !isMemoryControlStatement(statement));
}

/** 校验用户来源与完整陈述，防止截取原话时去掉否定或转述语境。 */
function parseGroundedExtraction(
  raw: string,
  sources: MemorySourceMessage[],
  config: MemoryConfig
): ExtractedMemory[] | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const result = groundedExtractionSchema(config).safeParse(
      JSON.parse(raw.slice(start, end + 1))
    );
    if (!result.success) return null;
    return result.data.memories.flatMap(candidate => {
      const source = sources.find(
        message =>
          message.role === "user" && message.id === candidate.sourceMessageId
      );
      if (!source) return [];
      return completeUserStatements(
        source.content,
        candidate.quote,
        config.maxExtractedLength
      ).map(statement => ({
        category: candidate.category,
        content: statement,
        importance: candidate.importance,
        sourceMessageId: source.id,
      }));
    });
  } catch {
    return null;
  }
}

/** 使用同一发布快照中的模型、提示词和输出规则提取记忆。 */
export async function callExtractionModel(
  provider: ChatProvider,
  sources: MemorySourceMessage[],
  context: { userId: string; girlfriendId?: number; memoryEpoch?: number },
  configuration?: Awaited<ReturnType<typeof getPublishedProductConfig>>
): Promise<ExtractedMemory[]> {
  const policy = configuration ?? (await getPublishedProductConfig());
  if (!policy.memory.enabled) return [];
  const userMessages = sources.filter(message => message.role === "user");
  if (!userMessages.length) return [];
  const model = await memoryTaskModel(context.userId, provider, policy);
  const data = await runMeteredAiTask(
    {
      ...context,
      kind: "memory_extract",
      provider: provider.name,
      model,
      isByok: provider.isByok,
      promptVersion: `product-config/${policy.revision}:extract`,
    },
    async signal => {
      if (!(await sameMemoryRouting(context.userId, provider)))
        throw new Error("Memory routing changed");
      const response = await axios.post(
        `${provider.baseUrl}/chat/completions`,
        {
          model,
          messages: [
            {
              role: "system",
              content: renderPrompt(policy.prompts.extraction, {
                maxLength: String(policy.memory.maxExtractedLength),
              }),
            },
            {
              role: "user",
              content: JSON.stringify(
                userMessages.map(({ id, content }) => ({ id, content }))
              ),
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: policy.memory.extraction.maxTokens,
          temperature: policy.memory.extraction.temperature,
          ...(provider.name === "deepseek"
            ? {
                thinking: { type: "disabled" },
                max_tokens: policy.memory.extraction.maxTokens,
              }
            : {}),
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          signal,
        }
      );
      return { value: response.data, usage: response.data?.usage };
    },
    policy
  );
  const content = data?.choices?.[0]?.message?.content;
  const candidates =
    typeof content === "string"
      ? parseGroundedExtraction(content, userMessages, policy.memory)
      : null;
  if (!candidates) throw new Error("Invalid memory extraction response");
  if ((await getPublishedProductConfig()).revision !== policy.revision)
    throw new Error("Memory configuration changed during extraction");
  return candidates;
}

type PetNameReference = {
  species: "cat" | "dog";
  subject: string | null;
  name: string | null;
  rejected?: boolean;
};
/** 只给明确用户所属、可区分主体的宠物命名分配槽位；另一只/新养的宠物保持不确定。 */
function petNameReference(content: string): PetNameReference | null {
  const patterns = [
    /(?:我的|我家的|我家|用户的|用户家的|用户家|我养的|我養的)((?:黑|白|橘|灰)(?:色)?(?:的)?|第一只|第二只|另[一1]只|新(?:养|養)的|小|大)?(猫|貓|狗)(?:(?:现在|現在|如今)?(?:名叫|叫|改叫|改名(?:为|為|成|叫))|(?:的名字|名字)(?:现在|現在|如今)?(?:是|改成|改为|改為))(?=[^。！？!?；;，,\r\n])/gi,
    /\bmy\s+((?:black|white|orange|gr[ae]y|first|second|other|another|new|little|big)\s+)?(cat|dog)(?:(?:'s|’s)\s+name\s+(?:is\s+(?:now\s+)?|has\s+changed\s+to\s+)|\s+(?:is\s+)?(?:now\s+)?(?:called|named)\s+)(?=[^\s.!?;,\r\n])/gi,
    /(?:私の|うちの)((?:黒|白|茶|灰色|一匹目の|二匹目の|もう一匹の)?)(猫|犬)の名前(?:は|を)(?=[^。！？!?；;，,\r\n])/g,
    /(?:내|제|우리)\s*((?:(?:검은|하얀|회색|첫 번째|두 번째|다른)\s*)?)(고양이|개)(?:의)?\s*이름(?:은|이|을)\s*(?=[^\s.!?;,\r\n])/g,
  ];
  const matches = patterns.flatMap(pattern =>
    Array.from(content.matchAll(pattern))
  );
  const match = matches[0];
  if (!match) {
    // 明确还有/另养宠物即构成多主体证据，不要求用户同时说出名字。
    const additional =
      content.match(
        /(?:我|用户)(?:也|又|还|還)?(?:有|养|養|领养|領養|收养|收養)(?:了)?(?:(?:另外|另)?一只|另[一1]只|[两兩二三四五六七八九十\d]+只|一[条條])?(猫|貓|狗)/
      ) ??
      content.match(
        /\bI\s+(?:(?:also|now)\s+)?(?:have|adopted|got)\s+(?:an?|another|one(?:\s+more)?|two|second|new)\s+(cat|dog)\b/i
      );
    if (additional)
      return {
        species: /猫|貓|cat/i.test(additional[1]) ? "cat" : "dog",
        subject: null,
        name: null,
      };
    return null;
  }
  const species = /猫|貓|cat|고양이/i.test(match[2]) ? "cat" : "dog";
  const prefix = content.slice(0, match.index);
  if (
    /(?:不是|并非|並非|不(?:是|是说|是說))\s*$|(?:你|他|她|有人|别人|別人|朋友|家人|助手|模型).{0,6}(?:说|說|提到|以为|以為|认为|認為).{0,12}$|(?:听说|聽說|据说|據說).{0,12}$|\b(?:not|isn't|wasn't)\s*$|\b(?:you|he|she|they|someone|my friend|my mother|my father)\s+(?:said|say|thought|think|claimed)\b.{0,20}$/i.test(
      prefix
    )
  )
    return { species, subject: null, name: null, rejected: true };
  const qualifier = match[1]?.trim() ?? "";
  if (
    matches.length !== 1 ||
    /另|第二|新|other|another|second|new|二匹目|もう一匹|두 번째|다른/i.test(
      qualifier
    )
  )
    return { species, subject: null, name: null };
  const subjects: [string, RegExp][] = [
    ["black", /黑|black|黒|검은/i],
    ["white", /白|white|하얀/i],
    ["orange", /橘|orange|茶/i],
    ["gray", /灰|gr[ae]y|회색/i],
    ["first", /第一|first|一匹目|첫 번째/i],
    ["small", /小|little/i],
    ["big", /大|big/i],
  ];
  return {
    species,
    name: normalizeMemoryText(
      content
        .slice(match.index! + match[0].length)
        .split(/[。！？!?；;，,\r\n]|\.(?=\s|$)/)[0]
    ),
    subject: qualifier
      ? (subjects.find(([, pattern]) => pattern.test(qualifier))?.[0] ?? null)
      : "",
  };
}
function petNameKey(reference: PetNameReference) {
  return reference.subject === null
    ? null
    : `pet.${reference.species}${reference.subject ? `.${reference.subject}` : ""}.name`;
}

/** 识别有明确用户主语的单值资料；并列职业/兴趣不覆盖既有事实。 */
function factKey(content: string): string | null {
  const pet = petNameReference(content);
  if (pet) return petNameKey(pet);
  if (
    /(?:我|用户)(?:现在|目前|如今)?(?:住在|定居|生活在)|(?:我|用户).{0,15}(?:搬到|搬去|搬来)|\b(?:I live in|I moved to|I'm based in)\b/i.test(
      content
    )
  )
    return "profile.city";
  if (/(?:我|用户)(?:叫|的名字是|名字是)|\bmy name is\b/i.test(content))
    return "profile.name";
  if (/生日|\bmy birthday\b/i.test(content)) return "profile.birthday";
  if (/也|同时|兼职|\b(?:also|as well)\b/i.test(content)) return null;
  if (
    /(?:我是|用户是|现在当|改行|换工作|\bI am\b|\bI'm\b).{0,20}(?:经理|设计师|工程师|程序员|教师|老师|医生|护士|摄影师|学生|律师|厨师|研究员|designer|engineer|teacher|doctor|photographer|student)/i.test(
      content
    )
  )
    return "profile.occupation";
  if (
    /(?:我|用户).{0,20}(?:就职于|入职|任职于)|\bI work (?:at|for)\b/i.test(
      content
    )
  )
    return "profile.employer";
  return null;
}
function isExplicitChange(content: string) {
  return /更正|纠正|糾正|說錯|说错|记错|改成|改为|改喝|改名|改叫|不再|搬到|搬去|搬来|改行|换工作|更新.{0,8}(?:记忆|記憶)|以前.{0,30}(?:现在|如今)|(?:现在|現在|如今).{0,20}(?:是|叫|住|当|就职)|\b(?:correction|instead|no longer|moved to|now (?:live|work|am|called|named))\b|\b(?:update|correct|revise|change)\s+(?:(?:your|the|my)\s+)?(?:memory|memories|what you remember)\b|訂正|修正|改名|정정|이름.{0,16}(?:바꿨|바꾸|변경)|기억.{0,8}(?:수정|업데이트)/i.test(
    content
  );
}
function memoryMatch(
  candidate: ExtractedMemory & {
    factKey: string | null;
    eventDay: string | null;
    eventStatus: Memory["eventStatus"];
  },
  previous: Memory,
  existing: readonly Memory[],
  config: MemoryConfig
): "same" | "correction" | null {
  const normalize = (value: string) =>
    normalizeMemoryText(value).replace(/一名|一位|一个/g, "");
  if (normalize(candidate.content) === normalize(previous.content))
    return "same";
  if (candidate.category !== previous.category) return null;
  const pet =
    candidate.category === "fact" ? petNameReference(candidate.content) : null;
  const previousPet =
    previous.category === "fact" ? petNameReference(previous.content) : null;
  if (pet || previousPet) {
    if (
      !pet ||
      !previousPet ||
      !petNameKey(pet) ||
      petNameKey(pet) !== petNameKey(previousPet)
    )
      return null;
    // 多只同物种宠物时，“我的猫”不能可靠指向某一只，必须给出稳定身份。
    if (
      pet.subject === "" &&
      existing.filter(
        memory =>
          memory.category === "fact" &&
          petNameReference(memory.content)?.species === pet.species
      ).length > 1
    )
      return null;
    if (pet.name && pet.name === previousPet.name) return "same";
    return isExplicitChange(candidate.content) ? "correction" : null;
  }
  if (candidate.factKey || previous.factKey)
    return candidate.factKey &&
      candidate.factKey === previous.factKey &&
      isExplicitChange(candidate.content)
      ? "correction"
      : null;
  if (
    candidate.category === "event" &&
    previous.eventStatus === "planned" &&
    (candidate.eventStatus === "completed" ||
      candidate.eventStatus === "cancelled")
  )
    return candidate.eventDay &&
      candidate.eventDay === previous.eventDay &&
      eventTopic(candidate.content) &&
      eventTopic(candidate.content) === eventTopic(previous.content)
      ? "correction"
      : null;
  const similarity = Math.max(
    bigramOverlap(candidate.content, previous.content),
    bigramOverlap(previous.content, candidate.content)
  );
  if (similarity < config.matching.duplicateThreshold) return null;
  const negation = /不|没|無|无|\b(?:not|don't|no longer)\b/gi;
  const withoutNegation = (value: string) =>
    normalizeMemoryText(value.replace(negation, ""));
  if (
    isExplicitChange(candidate.content) ||
    ((candidate.content.match(negation)?.length ?? 0) !==
      (previous.content.match(negation)?.length ?? 0) &&
      Math.max(
        bigramOverlap(
          withoutNegation(candidate.content),
          withoutNegation(previous.content)
        ),
        bigramOverlap(
          withoutNegation(previous.content),
          withoutNegation(candidate.content)
        )
      ) >= config.matching.correctionThreshold)
  )
    return "correction";
  return null;
}

/** 只归并明确同类活动；无日期的取消只撤掉同类计划的主动联系资格。 */
function eventTopic(content: string): string | null {
  const topics: [string, RegExp][] = [
    ["interview", /面试|面試|\binterview\b/i],
    ["exam", /考试|考試|\bexam\b/i],
    ["defense", /答辩|答辯|\bdefen[cs]e\b/i],
    ["surgery", /手术|手術|\bsurgery\b/i],
    ["wedding", /婚礼|婚禮|\bwedding\b/i],
    ["meeting", /会议|會議|\bmeeting\b/i],
    ["travel", /旅行|旅游|旅遊|\btrip\b/i],
  ];
  return topics.find(([, pattern]) => pattern.test(content))?.[0] ?? null;
}

/** 相对日期锚定来源消息的自然日，无法确认时保持未知；禁止以提取日代替来源日。 */
export function anchorMemoryEvent(
  content: string,
  createdAt: Date | null,
  timeZone: string
) {
  const eventDay = createdAt
    ? resolveMemoryEventDay(content, createdAt, timeZone)
    : null;
  const sourceDay = createdAt ? memorySourceDay(createdAt, timeZone) : null;
  const cancelled =
    /取消|不(?:打算|准备|準備|计划|計劃|再)?(?:去|参加|參加|参与|參與)|cancelled|canceled|\b(?:will not|won't|not going to)\b/i.test(
      content
    ) &&
    !/(?:不想|不要|没有|沒有|没|沒)取消|\b(?:not cancelled|not canceled)\b/i.test(
      content
    );
  const eventStatus = cancelled
    ? ("cancelled" as const)
    : eventDay && sourceDay && eventDay > sourceDay
      ? ("planned" as const)
      : /完成了|已(?:经|經)?完成|做完|结束|結束|finished|completed|昨天|yesterday/i.test(
            content
          )
        ? ("completed" as const)
        : eventDay &&
            /要|将|將|计划|打算|tomorrow|will|going to|明日|내일/i.test(content)
          ? ("planned" as const)
          : ("unknown" as const);
  return { eventDay, eventStatus };
}

/** 外部模型结果没有写库权限，事务提交时重新查找同用户/角色的真实完整原话。 */
export async function storeExtractedMemories(
  userId: string,
  girlfriendId: number,
  candidates: ExtractedMemory[]
) {
  return withUserTransaction(userId, tx =>
    storeExtractedMemoriesInTransaction(tx, userId, girlfriendId, candidates)
  );
}

/** 捕获的 epoch 和遗忘消息边界阻止旧任务在更正、暂停、清空后重新写回。 */
export async function storeExtractedMemoriesInTransaction(
  tx: DbTransaction,
  userId: string,
  girlfriendId: number,
  candidates: ExtractedMemory[],
  expectedEpoch?: number,
  configuration?: ProductConfig
) {
  const policy = configuration ?? (await getPublishedProductConfig(tx));
  const config = policy.memory;
  const result = { inserted: 0, reinforced: 0, updated: 0 };
  const [role] = await tx
    .select()
    .from(girlfriends)
    .where(
      and(
        eq(girlfriends.id, girlfriendId),
        eq(girlfriends.userId, userId),
        isNull(girlfriends.deletedAt)
      )
    )
    .for("update");
  if (
    !role?.memoryEnabled ||
    !policy.memory.enabled ||
    (expectedEpoch !== undefined && expectedEpoch !== role.memoryEpoch)
  )
    return result;
  const [preferences] = await tx
    .select()
    .from(companionPreferences)
    .where(eq(companionPreferences.userId, userId));
  const timeZone = preferences?.timeZone || "UTC";
  const sourceIds = candidates.flatMap(candidate =>
    candidate.sourceMessageId === undefined ? [] : [candidate.sourceMessageId]
  );
  if (!sourceIds.length) return result;
  const sources = await tx
    .select({
      id: messages.id,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        inArray(messages.id, sourceIds),
        eq(messages.role, "user"),
        sql`COALESCE(${messages.generationStatus}, 'succeeded') = 'succeeded'`,
        isNull(messages.imageUrl),
        eq(conversations.userId, userId),
        eq(conversations.girlfriendId, girlfriendId),
        sql`${messages.id} > ${role.memoryForgottenThroughId}`
      )
    );
  const existing = await tx
    .select()
    .from(memories)
    .where(
      and(eq(memories.userId, userId), eq(memories.girlfriendId, girlfriendId))
    )
    .for("update");
  existing.sort((a, b) => (b.sourceMessageId ?? 0) - (a.sourceMessageId ?? 0));
  let invalidated = false;
  for (const raw of candidates) {
    const source = sources.find(message => message.id === raw.sourceMessageId);
    if (
      !source ||
      !memoryCategorySchema.options.includes(raw.category) ||
      !Number.isFinite(raw.importance)
    )
      continue;
    const statement = completeUserStatement(
      source.content,
      raw.content,
      config.maxExtractedLength
    );
    if (!statement) continue;
    const date =
      raw.category === "event"
        ? anchorMemoryEvent(statement, source.createdAt, timeZone)
        : { eventDay: null, eventStatus: "unknown" as const };
    const candidate = {
      ...raw,
      content: statement,
      factKey: raw.category === "fact" ? factKey(statement) : null,
      ...date,
    };
    if (
      raw.category === "event" &&
      (date.eventStatus === "cancelled" || date.eventStatus === "completed") &&
      !date.eventDay
    ) {
      const topic = eventTopic(statement);
      for (const previous of existing) {
        if (
          previous.category !== "event" ||
          previous.eventStatus !== "planned" ||
          (topic && eventTopic(previous.content) !== topic) ||
          (previous.sourceMessageId !== null &&
            previous.sourceMessageId >= source.id)
        )
          continue;
        if (!invalidated) {
          await invalidateMemoryDerived(tx, userId, girlfriendId);
          invalidated = true;
        }
        previous.eventStatus = "unknown";
        previous.contentVersion++;
        await tx
          .update(memories)
          .set({
            eventStatus: "unknown",
            contentVersion: previous.contentVersion,
          })
          .where(eq(memories.id, previous.id));
      }
    }
    const duplicate = existing.find(
      memory => memoryMatch(candidate, memory, existing, config) !== null
    );
    if (
      duplicate &&
      duplicate.sourceMessageId !== null &&
      source.id < duplicate.sourceMessageId
    )
      continue;
    if (duplicate && source.id === duplicate.sourceMessageId) continue;
    const provenance = {
      sourceMessageId: source.id,
      sourceType: "user_message" as const,
      sourceCreatedAt: source.createdAt,
      sourceTimeZone: timeZone,
      ...date,
    };
    if (duplicate) {
      if (
        memoryMatch(candidate, duplicate, existing, config) === "correction"
      ) {
        if (!invalidated) {
          await invalidateMemoryDerived(tx, userId, girlfriendId);
          invalidated = true;
        }
        const changes = {
          ...provenance,
          content: statement,
          factKey: candidate.factKey,
          category: raw.category,
          contentVersion: duplicate.contentVersion + 1,
          weight: Math.min(
            config.matching.initialWeightMax,
            Math.max(config.matching.initialWeightMin, raw.importance * 10)
          ),
          lastRecalledAt: new Date(),
        };
        await tx
          .update(memories)
          .set(changes)
          .where(eq(memories.id, duplicate.id));
        Object.assign(duplicate, changes);
        result.updated++;
      } else {
        const contentChanged =
          duplicate.content !== statement ||
          duplicate.eventDay !== date.eventDay ||
          duplicate.eventStatus !== date.eventStatus;
        if (contentChanged && !invalidated) {
          await invalidateMemoryDerived(tx, userId, girlfriendId);
          invalidated = true;
        }
        const changes = {
          ...provenance,
          content: statement,
          contentVersion: duplicate.contentVersion + (contentChanged ? 1 : 0),
          weight: Math.min(
            100,
            duplicate.weight + config.matching.reinforcement
          ),
          lastRecalledAt: new Date(),
        };
        await tx
          .update(memories)
          .set(changes)
          .where(eq(memories.id, duplicate.id));
        Object.assign(duplicate, changes);
        result.reinforced++;
      }
    } else {
      const [inserted] = await tx.insert(memories).values({
        userId,
        girlfriendId,
        category: raw.category,
        content: statement,
        factKey: candidate.factKey,
        ...provenance,
        weight: Math.min(
          config.matching.initialWeightMax,
          Math.max(config.matching.initialWeightMin, raw.importance * 10)
        ),
      });
      const [row] = await tx
        .select()
        .from(memories)
        .where(eq(memories.id, Number(inserted.insertId)));
      existing.push(row);
      result.inserted++;
    }
  }
  return result;
}

/** 容量淘汰同时清除派生引用，置顶项不会被自动遗忘。 */
export async function enforceMemoryCapacity(
  userId: string,
  girlfriendId: number,
  _intimacyLevel: number,
  transaction?: DbTransaction,
  configuration?: ProductConfig
): Promise<number> {
  const work = async (tx: DbTransaction) => {
    const policy = configuration ?? (await getPublishedProductConfig(tx));
    const role = await requireOwnedRole(tx, userId, girlfriendId);
    const level = getLevelByPoints(
      role.intimacyPoints,
      policy.intimacy.levels
    ).level;
    const rows = await tx
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          eq(memories.girlfriendId, girlfriendId)
        )
      )
      .orderBy(asc(memories.weight), asc(memories.createdAt));
    const ids = rows
      .filter(row => !row.pinned)
      .slice(0, Math.max(0, rows.length - memoryCapacity(level, policy.memory)))
      .map(row => row.id);
    if (!ids.length) return 0;
    await tx
      .delete(memoryEmbeddings)
      .where(inArray(memoryEmbeddings.memoryId, ids));
    await tx
      .delete(conversationSummaries)
      .where(
        and(
          eq(conversationSummaries.userId, userId),
          eq(conversationSummaries.girlfriendId, girlfriendId)
        )
      );
    await tx.delete(memories).where(inArray(memories.id, ids));
    return ids.length;
  };
  return transaction ? work(transaction) : withUserTransaction(userId, work);
}

/** 唤醒已登记的持久任务，失败由调度重试。 */
export async function maybeExtractMemories(params: {
  userId: string;
}): Promise<void> {
  try {
    if (!(await memoryFeatureEnabled())) return;
    void import("./memoryJobs")
      .then(module => module.runMemoryExtractionJobs(params.userId))
      .catch(() => log.warn("[memory] worker unavailable"));
  } catch {
    log.warn("[memory] configuration unavailable");
  }
}

/** 有界完整 JSON 条目注入，不裁掉分隔符；检索返回后再次检查 epoch 和版本。 */
export async function buildMemoryPromptBlock(
  userId: string,
  girlfriendId: number,
  userMessage: string,
  _intimacyLevel: number,
  options: {
    conversationId?: number;
    maxChars?: number;
    configuration?: Awaited<ReturnType<typeof getPublishedProductConfig>>;
  } = {}
): Promise<string> {
  const policy = options.configuration ?? (await getPublishedProductConfig());
  const db = (await getDb())!;
  const [role] = await db
    .select()
    .from(girlfriends)
    .where(
      and(
        eq(girlfriends.id, girlfriendId),
        eq(girlfriends.userId, userId),
        isNull(girlfriends.deletedAt)
      )
    );
  if (!role?.memoryEnabled || !policy.memory.enabled) return "";
  const vectors = await semanticMemoryScores(
    userId,
    girlfriendId,
    userMessage,
    policy
  ).catch(() => new Map<number, number>());
  const summary =
    options.conversationId === undefined
      ? null
      : await readMemorySummary(
          userId,
          girlfriendId,
          options.conversationId,
          policy
        );
  const preferences = await getCompanionPreferences(userId);
  return withUserTransaction(userId, async tx => {
    const [current] = await tx
      .select()
      .from(girlfriends)
      .where(
        and(eq(girlfriends.id, girlfriendId), eq(girlfriends.userId, userId))
      )
      .for("update");
    if (
      !current?.memoryEnabled ||
      current.deletedAt ||
      current.memoryEpoch !== role.memoryEpoch ||
      !(await memoryFeatureEnabled())
    )
      return "";
    const rows = await tx
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          eq(memories.girlfriendId, girlfriendId)
        )
      );
    const top = rows
      .map(memory => ({
        memory,
        score:
          scoreMemory(memory, userMessage, policy.memory) +
          Math.max(0, vectors.get(memory.id) ?? 0) *
            policy.memory.semantic.weight,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(
        0,
        memoryInjectionK(
          getLevelByPoints(current.intimacyPoints, policy.intimacy.levels)
            .level,
          userMessage,
          policy.memory
        )
      )
      .map(row => row.memory);
    const maxChars = Math.min(
      options.maxChars ?? policy.memory.recall.maxChars,
      policy.memory.recall.maxChars
    );
    const records: unknown[] = [];
    const pack = () =>
      renderPrompt(policy.prompts.memoryContext, {
        records: JSON.stringify(records)
          .replace(/</g, "\\u003c")
          .replace(/>/g, "\\u003e"),
      });
    for (const memory of top) {
      records.push(
        memoryContextRecord(
          memory,
          memoryLocalDay(new Date(), preferences.timeZone),
          policy.prompts
        )
      );
      if (pack().length > maxChars) records.pop();
    }
    if (summary && summary.memoryEpoch === current.memoryEpoch) {
      for (const topic of summary.topics) {
        records.push({ summaryTopic: topic });
        if (pack().length > maxChars) records.pop();
      }
    }
    if (!records.length) return "";
    const used = records.flatMap(record =>
      typeof record === "object" && record !== null && "id" in record
        ? [Number(record.id)]
        : []
    );
    if (used.length)
      await tx
        .update(memories)
        .set({ lastRecalledAt: new Date() })
        .where(and(eq(memories.userId, userId), inArray(memories.id, used)));
    return pack();
  });
}

/** 管理界面可查看暂停中的记忆，但不读取其他角色或已删除角色。 */
export async function listMemories(
  userId: string,
  girlfriendId: number
): Promise<Memory[]> {
  const db = (await getDb())!;
  const [role] = await db
    .select({ id: girlfriends.id })
    .from(girlfriends)
    .where(
      and(
        eq(girlfriends.id, girlfriendId),
        eq(girlfriends.userId, userId),
        isNull(girlfriends.deletedAt)
      )
    );
  return role
    ? db
        .select()
        .from(memories)
        .where(
          and(
            eq(memories.userId, userId),
            eq(memories.girlfriendId, girlfriendId)
          )
        )
        .orderBy(
          desc(memories.pinned),
          desc(memories.weight),
          desc(memories.createdAt)
        )
    : [];
}
async function requireOwnedRole(
  tx: DbTransaction,
  userId: string,
  girlfriendId: number
) {
  const [role] = await tx
    .select()
    .from(girlfriends)
    .where(
      and(
        eq(girlfriends.id, girlfriendId),
        eq(girlfriends.userId, userId),
        isNull(girlfriends.deletedAt)
      )
    )
    .for("update");
  if (!role)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Companion is unavailable",
    });
  return role;
}
/** 用户删除会使所有正在运行的派生任务和旧原文上下文失效。 */
export async function deleteMemory(
  userId: string,
  id: number,
  expectedVersion?: number
) {
  const db = (await getDb())!;
  const [owned] = await db
    .select()
    .from(memories)
    .where(and(eq(memories.id, id), eq(memories.userId, userId)));
  if (!owned) return;
  await withUserTransaction(userId, async tx => {
    await requireOwnedRole(tx, userId, owned.girlfriendId);
    const [current] = await tx
      .select()
      .from(memories)
      .where(and(eq(memories.id, id), eq(memories.userId, userId)))
      .for("update");
    if (!current) return;
    if (
      expectedVersion !== undefined &&
      current.contentVersion !== expectedVersion
    )
      throw new TRPCError({ code: "CONFLICT", message: "Memory has changed" });
    await invalidateMemoryDerived(tx, userId, owned.girlfriendId);
    await tx
      .delete(memories)
      .where(and(eq(memories.id, id), eq(memories.userId, userId)));
  });
}
/** 编辑视为用户新的明确输入，清除旧消息归属及旧事件日期。 */
export async function editMemory(
  userId: string,
  id: number,
  content: string,
  expectedVersion?: number
) {
  const parsed = z
    .string()
    .trim()
    .min(1)
    .max((await getPublishedProductConfig()).memory.maxEditedLength)
    .safeParse(content);
  if (!parsed.success)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid memory content",
    });
  await withUserTransaction(userId, async tx => {
    const [memory] = await tx
      .select()
      .from(memories)
      .where(and(eq(memories.id, id), eq(memories.userId, userId)))
      .for("update");
    if (!memory)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Memory is unavailable",
      });
    await requireOwnedRole(tx, userId, memory.girlfriendId);
    // 回包丢失后的相同更正不再推进遗忘边界，避免重试清掉刚继续的聊天。
    if (memory.content === parsed.data) return;
    if (
      expectedVersion !== undefined &&
      memory.contentVersion !== expectedVersion
    )
      throw new TRPCError({ code: "CONFLICT", message: "Memory has changed" });
    const [preferences] = await tx
      .select()
      .from(companionPreferences)
      .where(eq(companionPreferences.userId, userId));
    const timeZone = preferences?.timeZone || "UTC";
    const [duplicate] = await tx
      .select({ id: memories.id })
      .from(memories)
      .where(
        and(
          eq(memories.girlfriendId, memory.girlfriendId),
          eq(memories.content, parsed.data)
        )
      );
    if (duplicate && duplicate.id !== id)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Memory already exists",
      });
    await invalidateMemoryDerived(tx, userId, memory.girlfriendId);
    const now = new Date();
    await tx
      .update(memories)
      .set({
        content: parsed.data,
        contentVersion: memory.contentVersion + 1,
        sourceType: "user_edit",
        sourceMessageId: null,
        sourceCreatedAt: now,
        sourceTimeZone: timeZone,
        factKey: memory.category === "fact" ? factKey(parsed.data) : null,
        ...(memory.category === "event"
          ? anchorMemoryEvent(parsed.data, now, timeZone)
          : { eventDay: null, eventStatus: "unknown" as const }),
      })
      .where(eq(memories.id, id));
  });
}
/** 暂停与恢复均推进边界，恢复后只从新消息学习。 */
export async function setMemoryEnabled(
  userId: string,
  girlfriendId: number,
  enabled: boolean
) {
  await withUserTransaction(userId, async tx => {
    const role = await requireOwnedRole(tx, userId, girlfriendId);
    if (role.memoryEnabled !== enabled)
      await invalidateMemoryDerived(tx, userId, girlfriendId, enabled);
  });
}
/** 清空事实与衍生资料，旧消息不会被下一次任务重新学习。 */
export async function clearMemories(userId: string, girlfriendId: number) {
  await withUserTransaction(userId, async tx => {
    await requireOwnedRole(tx, userId, girlfriendId);
    await invalidateMemoryDerived(tx, userId, girlfriendId);
    await tx
      .delete(memories)
      .where(
        and(
          eq(memories.userId, userId),
          eq(memories.girlfriendId, girlfriendId)
        )
      );
  });
}
/** 更新共享 IANA 时区并作废全部角色的旧相对日期派生任务。 */
export async function setMemoryTimeZone(userId: string, timeZone: string) {
  try {
    if (!timeZone || timeZone.length > 64 || /^[+-]/.test(timeZone))
      throw new Error();
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid IANA time zone",
    });
  }
  await withUserTransaction(userId, async tx => {
    const [current] = await tx
      .select()
      .from(companionPreferences)
      .where(eq(companionPreferences.userId, userId))
      .for("update");
    if ((current?.timeZone ?? "UTC") === timeZone) return;
    await tx
      .insert(companionPreferences)
      .values({ userId, timeZone })
      .onDuplicateKeyUpdate({
        set: { timeZone, revision: sql`${companionPreferences.revision}+1` },
      });
    const roles = await tx
      .select({ id: girlfriends.id })
      .from(girlfriends)
      .where(eq(girlfriends.userId, userId))
      .for("update");
    for (const role of roles)
      await invalidateMemoryDerived(tx, userId, role.id);
  });
}
/** 记忆状态包含当前服务支持情况，不披露密钥或网关。 */
export async function getMemoryState(userId: string, girlfriendId: number) {
  const policy = await getPublishedProductConfig();
  const role = await withUserTransaction(userId, tx =>
    requireOwnedRole(tx, userId, girlfriendId)
  );
  const preferences = await getCompanionPreferences(userId);
  const provider = await resolveChatProvider(userId, policy);
  const summary = role.memoryEnabled
    ? await readMemorySummary(userId, girlfriendId, undefined, policy)
    : null;
  const facts = summary
    ? (await listMemories(userId, girlfriendId))
        .filter(memory =>
          summary.sources.some(
            source =>
              source.memoryId === memory.id &&
              source.contentVersion === memory.contentVersion
          )
        )
        .map(memory => memory.content)
    : [];
  return {
    enabled: role.memoryEnabled && policy.memory.enabled,
    timeZone: preferences.timeZone,
    summary: summary
      ? { content: summary.content, topics: summary.topics, facts }
      : null,
    semantic: memorySemanticConfiguration(provider, policy),
    rules: policy.memory,
    capacity: memoryCapacity(
      getLevelByPoints(role.intimacyPoints, policy.intimacy.levels).level,
      policy.memory
    ),
    configurationRevision: policy.revision,
  };
}
/** 置顶不改变事实内容，不取消已经有效的来源与索引。 */
export async function setMemoryPinned(
  userId: string,
  id: number,
  pinned: boolean
) {
  const db = (await getDb())!;
  await db
    .update(memories)
    .set({ pinned })
    .where(and(eq(memories.id, id), eq(memories.userId, userId)));
}
/** 主动联系只能引用日期可靠、尚未取消/完成且自然日未过期的未来事件。 */
export async function getFreshEventMemory(
  userId: string,
  girlfriendId: number
): Promise<Memory | null> {
  const db = (await getDb())!;
  const [role] = await db
    .select()
    .from(girlfriends)
    .where(
      and(
        eq(girlfriends.id, girlfriendId),
        eq(girlfriends.userId, userId),
        isNull(girlfriends.deletedAt)
      )
    );
  if (!role?.memoryEnabled || !(await memoryFeatureEnabled())) return null;
  const preferences = await getCompanionPreferences(userId);
  const today = memoryLocalDay(new Date(), preferences.timeZone);
  return (
    (await listMemories(userId, girlfriendId)).find(
      memory =>
        memory.category === "event" &&
        memory.eventStatus === "planned" &&
        !!memory.eventDay &&
        memory.eventDay >= today
    ) ?? null
  );
}
