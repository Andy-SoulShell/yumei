/** 创建器图片的统一美术规范与逐项语义；仅使用项目自身的 ComfyUI 链路。 */
import { CREATOR_IMAGE_GROUPS } from "../client/src/features/setup/creatorAssets";
import { createHash } from "node:crypto";

export const ART_DIRECTION =
  "YUMEI character preference catalogue, one clearly adult fictional person aged 28 to 35, fully clothed in opaque everyday clothing. Seamless warm light grey studio background #e9e4e1, soft diffused daylight from upper left, natural proportions, restrained navy, ivory and muted rose palette, calm premium editorial styling. Vertical portrait, entire requested framing inside the canvas, generous margin above hair and around the body. No text, labels, logos, watermark, collage, borders, nudity, lingerie, exaggerated anatomy or provocative pose.";
const HAIR: Record<string, string> = {
  braided:
    "Two clearly visible long braids, with individually interwoven strands over both shoulders. No ponytail or loose wavy hair.",
  longstraight:
    "Long, completely straight loose hair reaching the chest, a simple center part. No waves or braids.",
  bangs:
    "A clearly visible straight fringe covering the forehead to the eyebrows, with otherwise simple shoulder-length hair.",
  ponytail:
    "A single high ponytail, gathered at the crown with a visible hair tie, its tail visible beside the shoulder. No braids or bun.",
  short:
    "A simple short neat haircut; for a woman a chin-length bob with the ends clearly above the shoulders, for a man a neat short crop. No long hair or fade.",
  bun: "A single round hair bun gathered neatly high on the back of the head. Show it clearly in a three-quarter head view.",
  twobuns:
    "Exactly two symmetrical round hair buns, one on each side of the crown, both completely visible. No ponytails.",
  wavy: "Loose shoulder-length hair with broad, clearly defined S-shaped waves. No tight curls or braids.",
  pixie:
    "A distinctly very short feminine pixie haircut, cropped sides and nape, softly textured top, ears exposed. Not a chin-length bob.",
  bald: "A completely bald clean-shaven scalp with no hair or stubble on the head.",
  curly:
    "Dense clearly defined corkscrew ringlet curls across the entire head. Every visible lock curls into a small distinct spiral, including the front and sides. A recognizable curly haircut, not tousled straight hair or broad loose waves.",
  fade: "A clear modern fade haircut, sides graduating from very short at the ears to longer on top. Show the side transition.",
  manbun:
    "Long masculine hair gathered into one small bun at the back of the crown, no loose tail. Three-quarter view so the bun is visible.",
  mullet:
    "A clearly recognizable mullet, short hair at the front and sides, noticeably long hair at the back extending onto the neck.",
  pompadour:
    "A high swept-up pompadour with a voluminous front quiff and neat shorter sides. Show the height of the front clearly.",
  slickedback:
    "Medium-length hair combed smoothly straight back from the forehead, with visible combed strands and no raised quiff. No bun.",
};
const BODY: Record<string, string> = {
  slim: "A slim adult build, narrow shoulders and hips, slender arms and legs, realistic healthy proportions, no pronounced muscles.",
  athletic:
    "A lean athletic adult build with balanced shoulders, toned limbs and moderate natural muscle definition, like a recreational runner. Distinct from both very thin and bodybuilder builds.",
  muscular:
    "A powerful muscular adult strength athlete with noticeably broad shoulders, large muscular upper arms and strong thick thighs. Well-developed biceps and substantial muscle mass must be clearly different from a slim or lean runner. Healthy realistic proportions.",
  curvy:
    "A naturally curvy adult build with a clearly defined waist and fuller hips, balanced realistic proportions, distinct from a slender straight silhouette.",
  voluptuous:
    "A plus-size adult woman with a noticeably fuller torso, soft rounded waist, full upper arms and substantial thighs. Clearly and visibly fuller than the other body options. Positive, dignified, natural proportions, not a slim model.",
  dadbod:
    "An adult male dad-bod silhouette with an unmistakably round protruding soft belly beneath the opaque T-shirt. The stomach visibly pushes the shirt forward beyond the chest line; ordinary slim arms and average shoulders make the soft belly the clear defining feature. No flat abdomen, no six-pack or large muscles.",
  chubby:
    "A visibly plus-size adult man with a broad round torso, substantial soft round belly, thick upper arms, broad waist and full thighs. A distinctly large clothing size, noticeably fuller all over than the dad-bod option, with dignified natural adult proportions. Not a lean model, not a muscular bodybuilder.",
};
const VIBE: Record<string, string> = {
  purealluring:
    "Understated soft elegance on a clearly adult woman aged 28, clean ivory long-sleeved blouse, navy trousers, softly loose hair framing the face, poised gentle gaze and subtle natural makeup. Express the label through soft styling and refined confidence, not revealing clothing or a provocative pose.",
  angel:
    "Gentle celestial character: small white feathered wings visible behind shoulders, a subtle thin golden halo above the head, ivory high-neck long-sleeved outfit, serene expression. Keep the entire halo and wings inside frame.",
  demon:
    "Refined fantasy demon: two small unmistakable dark horns on the head, deep burgundy high-collared tailored jacket, composed intense expression, fully clothed. Not an ordinary person tinted red.",
  elf: "Elegant fantasy elf: two unmistakably long pointed ears fully visible, simple forest-green modest tunic with fine leaf trim, composed expression. Hair tucked behind ears so their shape is clear.",
  coolintellectual:
    "Cool intellectual adult woman, thoughtful reserved gaze, thin understated glasses, navy tailored blazer over an ivory high-neck top, upright composed posture. No fantasy features.",
  sweethealing:
    "Warm approachable adult woman, natural sincere smile, soft ivory knitted cardigan over a navy crew-neck shirt, relaxed open posture. Everyday cozy character, no fantasy features.",
  spicybold:
    "Confident expressive adult woman, short navy leather-style jacket over a fully opaque muted rose crew-neck shirt, simple trousers, bold modern styling and lively direct gaze. Express boldness through fashion and confidence, not exposed skin.",
  matureelegant:
    "Mature elegant adult woman in her thirties, refined calm smile, neatly styled hair, a simple pearl detail, long-sleeved ivory blouse and tailored navy trousers. Sophisticated everyday elegance.",
  newchinese:
    "Modern Chinese-inspired adult woman, modest high mandarin collar navy jacket with subtle asymmetric fabric buttons and ivory piping, contemporary trousers, simple hairpin. Understated modern traditional clothing, no historical costume or fantasy ears.",
  gentle:
    "Gentle adult man, warm sincere smile, soft ivory cardigan over a navy crew-neck shirt, relaxed welcoming posture, calm kind gaze.",
  cold: "Reserved adult man, composed unsmiling expression, neat short hair, clean navy high-collared coat, upright restrained posture. Distinct cool demeanor without violence.",
  sunny:
    "Sunny upbeat adult man, bright natural smile, clean ivory casual sweatshirt with a muted rose accent, energetic but relaxed open posture.",
  wild: "Confident adult man, distinctly tousled short hair and visible short neat stubble, navy casual field jacket over an opaque ivory shirt, direct self-assured gaze and relaxed posture. Keep the common studio background and the same rendering style as the other catalogue options.",
  refined:
    "Refined intellectual adult man, thin glasses, neat hair, navy fitted blazer over ivory knitwear, calm thoughtful gaze, tasteful polished everyday styling.",
};
const TEMPLATE: Record<string, string> = {
  "campus-beauty":
    "Adult university graduate student aged 28, neat ivory cardigan, navy midi skirt, holding two plain academic books, confident friendly smile. Clearly adult, not schoolchild styling or school uniform.",
  "girl-next-door":
    "Friendly adult neighbor aged 28, simple navy crew-neck T-shirt and ivory denim jacket with casual trousers, natural approachable smile, no glamorous costume.",
  "mature-lady":
    "Elegant professional adult woman in her thirties, tailored navy blazer and ivory long-sleeved blouse, a simple restrained accessory, confident mature posture.",
  "spicy-girl":
    "Bold fashionable adult woman aged 28, cropped navy leather-style jacket over a fully opaque muted rose crew-neck top and full-length trousers, confident direct gaze, no revealing clothing.",
  "cool-girl":
    "Cool independent adult woman aged 28, short practical haircut, structured navy utility jacket and ivory crew-neck shirt, relaxed self-assured expression, subtle modern styling.",
  "chinese-beauty":
    "Elegant adult woman aged 28 wearing a modest contemporary ivory mandarin-collar blouse with navy fabric-button details and full-length navy trousers, a simple decorative hairpin, composed graceful expression.",
  artist:
    "Clearly recognizable adult male artist aged 30, navy work apron over an ivory long-sleeved shirt with a few muted paint marks, holding a small palette and paintbrush naturally at waist level. Artist tools must be visible.",
  "bad-boy":
    "Rebellious but approachable adult man aged 28, navy leather-style jacket over an ivory crew-neck shirt, tousled hair, subtle ear stud and confident expression. No weapons or nudity.",
  ceo: "Clearly recognizable adult male business executive aged 32, well-tailored navy two-piece suit, ivory shirt and restrained tie, holding a slim closed document folder, polished hair and confident professional posture.",
  "dark-prince":
    "Adult fantasy prince aged 30 in a dignified high-collared navy formal coat with subtle silver embroidery and a small restrained crown, serious elegant gaze. Regal clothing clearly distinguishes him from a casual man; no bare torso.",
  "gentle-junior":
    "Gentle adult male university graduate student aged 28, ivory hoodie under a navy casual overshirt, plain canvas book bag and one academic notebook, soft friendly smile. Clearly adult, no schoolchild uniform.",
  senior:
    "Adult male university senior or graduate mentor aged 30, navy knitted sweater over an ivory collared shirt, holding a thick plain academic book, calm dependable expression and neat hair. Academic clothing and book distinguish him from an executive or artist.",
};
const BUST: Record<string, string> = {
  flat: "A clearly flat chest silhouette on a healthy fully adult woman. Keep all other body proportions normal and adult.",
  small:
    "A naturally small subtle bust silhouette on a fully adult woman, slightly fuller than a flat chest.",
  medium: "An average medium bust silhouette with realistic adult proportions.",
  large:
    "A naturally full bust silhouette, visibly fuller than average, with realistic proportions and completely covered by the crew-neck shirt.",
  xl: "A distinctly fuller adult bust silhouette than the large option, still anatomically plausible, fully covered by the same opaque crew-neck shirt. No cleavage, exposed skin or exaggeration.",
};
const HIPS: Record<string, string> = {
  skinny:
    "A very slender adult hip and seat silhouette, narrow pelvis outline and little volume, realistic adult proportions.",
  small:
    "A small modest adult hip and seat silhouette, slightly fuller than the very slender option.",
  medium:
    "A balanced average adult hip and seat silhouette, moderate natural width and volume.",
  large:
    "Naturally fuller, wider adult hips and seat silhouette, clearly distinct from the medium option, realistic everyday proportions.",
  athletic:
    "A firm athletic adult hip silhouette with strong upper legs and balanced natural proportions, like a regular runner, distinct from the soft fuller option.",
};

export function creatorAssetJobs() {
  return CREATOR_IMAGE_GROUPS.flatMap(group =>
    group.options.map(option => {
      const style =
        group.style === "realistic"
          ? "Photorealistic studio portrait, believable skin texture and natural fabric detail, no plastic skin, no anime or 3D render."
          : "Consistent high-quality 2D East Asian anime character illustration, clean refined linework, restrained cel shading, clearly adult facial structure and natural adult body proportions, no photorealism, no 3D render or chibi.";
      let detail: string;
      let framing =
        "Eye-level three-quarter-length portrait from head to mid-thigh, body facing almost forward, natural hands and relaxed posture.";
      if (group.category === "style")
        detail =
          "Neutral friendly adult appearance, dark brown hair, navy long-sleeved crew-neck top and ivory tailored trousers. No props or costume. Establish the common person and visual style for this catalogue branch.";
      else if (group.category === "hairstyle") {
        detail =
          group.gender === "male" && option.id === "short"
            ? "A neat masculine short cropped haircut, hair only 2 to 4 centimetres long on top, short sides above the ears, clean short nape. Adult male face. No chin-length bob or shoulder-length hair."
            : HAIR[option.id];
        framing =
          "Head-and-shoulders portrait, slightly turned three-quarter view. The entire hairstyle, including all buns, braids or ponytail, must be clearly visible with generous space around the head. Wear the same navy crew-neck top.";
      } else if (group.category === "bodytype") {
        detail = BODY[option.id];
        framing =
          "Full standing figure from head to shoes, body facing almost forward, relaxed arms apart from torso so the whole body silhouette is clear. Wear a well-fitting opaque navy short-sleeved crew-neck T-shirt, ivory straight-leg trousers and plain shoes. The upper arms and whole silhouette must be visible.";
      } else if (group.category === "breast") {
        detail = BUST[option.id];
        framing =
          "Neutral catalogue fit-comparison portrait from head to mid-thigh, standing almost forward with a slight three-quarter angle, arms relaxed at sides. Same opaque navy crew-neck long-sleeved top, ivory trousers. A modest nonsexual clothing fit comparison, never a chest close-up. Keep face, waist, background and clothing identical across options.";
      } else if (group.category === "butt") {
        detail = HIPS[option.id];
        framing =
          "Full standing adult figure from head to shoes in a neutral three-quarter rear view, face gently turned in profile, arms relaxed, straight upright posture, no bent-over pose. Same opaque ivory well-fitting straight-leg trousers, navy crew-neck long-sleeved top and plain shoes. A modest nonsexual clothing-fit silhouette comparison, never a body-part close-up.";
      } else if (group.category === "templates") detail = TEMPLATE[option.id];
      else detail = VIBE[option.id];
      if (!detail)
        throw new Error(
          `Missing semantic definition: ${group.category}/${option.id}`
        );
      const source = option.imageUrl.replace("/character-options/creator/", "");
      return {
        id: `${group.gender}/${group.style}/${group.category}/${option.id}`,
        gender: group.gender,
        style: group.style,
        category: group.category,
        option: option.id,
        source,
        prompt: [
          `Primary required attribute: ${detail}`,
          framing,
          `Subject: one fictional adult East Asian ${group.gender === "female" ? "woman with an oval face" : "man with a defined oval face"}, aged 30, brown eyes and calm natural expression.`,
          style,
          ART_DIRECTION,
        ].join("\n"),
        seed: createHash("sha256")
          .update(`yumei-studio-v2/${group.gender}/${group.style}`)
          .digest()
          .readUIntBE(0, 6),
        reference: null,
      };
    })
  ).sort(
    (a, b) =>
      Number(b.category === "style") - Number(a.category === "style") ||
      a.id.localeCompare(b.id)
  );
}
