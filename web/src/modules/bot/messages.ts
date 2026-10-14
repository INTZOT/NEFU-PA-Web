/**
 * 机器人回复文案（可在管理后台自定义）。
 *
 * 存储复用 site_settings 键值表（D-34）—— 不新建表、不加迁移。
 * 文案模板存在数据库、`fallback` 是代码里的默认值：
 * 管理员清空某项时回退到默认，**不会让机器人说不出话**。
 *
 * 为什么要有占位符校验（见 validate）：
 *   注册引导里 `{code}` 是**邀请码本身**。管理员改文案时若不小心删掉它，
 *   机器人就再也发不出邀请码了 —— 而且不会报错，只是「回复里没有码」，
 *   极难排查。因此保存时强制校验必填占位符。
 */

/** 可用的占位符及其含义（供管理界面展示）。 */
export const PLACEHOLDERS = {
  code: "邀请码",
  url: "网站地址（不含路径）",
  minPassword: "密码最小长度",
  // 群聊确认流程（D-45）用：
  name: "群内 @ 某人时的提醒（含 @ 段与姓名）",
  // 群内查询（D-46）用：
  count: "条数",
  list: "逐条列出的内容",
} as const;

export type Placeholder = keyof typeof PLACEHOLDERS;

export interface BotMessageDef {
  key: string;
  label: string;
  /** 使用场景说明，显示在管理界面上。 */
  hint: string;
  maxLength: number;
  /** 必须出现在模板里的占位符。 */
  required: Placeholder[];
  /** 至少出现一个的占位符（比如「引导语」三选一）。 */
  anyOf?: Placeholder[];
  fallback: string;
}

/**
 * 全部可自定义的机器人文案。
 *
 * 顺序即管理界面上的展示顺序，按对话流程排列（注册 → 重置）。
 */
export const BOT_MESSAGES: BotMessageDef[] = [
  {
    key: "bot.register.reply",
    label: "发送「注册」时的回复",
    hint: "用户私聊「注册」且尚未注册时发送。必须含 {code}，否则用户拿不到邀请码。",
    maxLength: 500,
    required: ["code"],
    fallback:
      "你的邀请码：\n{code}\n\n注册地址：{url}/register\n\n" +
      "注册时填：姓名、学号、密码、邀请码。\nQQ 号会自动带入，不需要你填。\n\n" +
      "⚠️ 不要把邀请码转发给别人 —— 它等同于你的注册凭证。",
  },
  {
    key: "bot.register.already",
    label: "已注册却又发「注册」",
    hint: "该用户已有账号。应引导他去重置密码，因此 {reset} 必填。",
    maxLength: 300,
    required: [],
    fallback: "你已经注册过了，无需重复注册。\n如需重置密码，发送：重置密码",
  },
  {
    key: "bot.reset.prompt",
    label: "发送「重置密码」时的回复",
    hint: "提示用户输入新密码。建议保留 {minPassword}，否则用户不知道长度要求。",
    maxLength: 300,
    required: [],
    fallback:
      "请输入新密码（至少 {minPassword} 位）。\n" +
      "提醒：新密码会经过 QQ 聊天记录，请勿使用你在其他网站用过的密码。",
  },
  {
    key: "bot.reset.notRegistered",
    label: "未注册却发「重置密码」",
    hint: "该 QQ 号还没有账号，应引导他去注册。",
    maxLength: 300,
    required: [],
    fallback: "你还没有注册。发送「注册」获取邀请码。",
  },
  {
    key: "bot.reset.tooShort",
    label: "新密码太短",
    hint: "必须保留 {minPassword}，否则用户不知道要多长。",
    maxLength: 200,
    required: ["minPassword"],
    fallback: "密码至少 {minPassword} 位，请重新输入。",
  },
  {
    key: "bot.reset.done",
    label: "密码重置成功",
    hint: "提示用户可用新密码登录。建议说明其他设备已失效（系统确实会这样做）。",
    maxLength: 300,
    required: [],
    fallback: "密码已重置，其他设备上的登录已失效，可以用新密码登录了。",
  },
  {
    key: "bot.register.failed",
    label: "生成邀请码失败",
    hint: "系统异常时发送。建议引导用户联系管理员。",
    maxLength: 200,
    required: [],
    fallback: "生成邀请码失败，请稍后再试或联系管理员。",
  },
  {
    key: "bot.reset.failed",
    label: "重置密码失败",
    hint: "系统异常时发送。建议引导用户联系管理员。",
    maxLength: 200,
    required: [],
    fallback: "重置失败，请稍后再试或联系管理员。",
  },
  {
    key: "bot.unknown",
    label: "不认识的消息",
    hint: "用户发了机器人不认识的指令时。留空则不回复（静默）—— 想安静就清空这里。",
    maxLength: 300,
    required: [],
    fallback:
      "我可以帮你注册与重置密码。\n发送「注册」获取邀请码，发送「重置密码」修改密码。",
  },
  // ---- 群聊确认流程（D-45）----
  //
  // 这些文案发在**群聊**里，所有人都能看到 —— 因此**绝不可包含任何凭据**。
  // 唯一例外是 bot.group.resetLink（一次性改密链接），它走**私聊**，不发群。
  {
    key: "bot.group.confirmPrompt",
    label: "【群聊】请确认注册",
    hint: "注册时在群里 @ 本人。必须含 {name}，否则 @ 不到人。",
    maxLength: 300,
    required: ["name"],
    fallback:
      "{name} 请回复「确认注册」来完成注册。\n（如果你没有注册过，忽略这条消息即可）",
  },
  {
    key: "bot.group.confirmResetPrompt",
    label: "【群聊】请确认重置密码",
    hint:
      "重置密码时在群里 @ 本人。**务必保留「如果不是你，请忽略」那句** —— " +
      "它是对「别人替你发起重置、你误确认」这种社交工程的唯一防线。",
    maxLength: 300,
    required: ["name"],
    fallback:
      "{name} 有人请求重置你的密码。\n" +
      "如果这是你本人操作，请回复「确认重置」；\n" +
      "如果不是你，请忽略这条消息。",
  },
  {
    key: "bot.group.registerDone",
    label: "【群聊】注册成功",
    hint: "群内确认注册成功后的回复。",
    maxLength: 200,
    required: [],
    fallback: "✅ 注册成功，现在可以到网站登录了。",
  },
  {
    key: "bot.group.resetDone",
    label: "【群聊】重置已确认",
    hint:
      "群内确认重置后的回复。**改密在网站同一浏览器里完成，不发链接** ——" +
      "所以这条只应引导他回网站，不要写任何凭据。",
    maxLength: 220,
    required: [],
    fallback: "✅ 已确认。请回到刚才那个浏览器页面设置新密码（10 分钟内有效）。",
  },
  {
    key: "bot.group.confirmExpired",
    label: "【群聊】注册确认超时",
    hint: "待确认记录过期后才回复时。",
    maxLength: 200,
    required: [],
    fallback: "这次注册确认已超时，请回到网站重新发起。",
  },
  {
    key: "bot.group.resetExpired",
    label: "【群聊】重置确认超时",
    hint: "重置的待确认过期后。",
    maxLength: 200,
    required: [],
    fallback: "这次重置确认已超时，请回到网站重新发起。",
  },
  {
    key: "bot.group.confirmFailed",
    label: "【群聊】确认处理失败",
    hint: "系统异常时在群里回复。建议引导联系管理员。",
    maxLength: 200,
    required: [],
    fallback: "处理时出错了，请稍后再试或联系管理员。",
  },
  // ---- 群内查询（D-46）----
  {
    key: "bot.group.roomList",
    label: "【群聊】约球列表",
    hint:
      "群里发「查询约球」时的回复。**必须含 {list}** —— 否则一条约球都看不到。" +
      "{count} 是条数。",
    maxLength: 800,
    required: ["list"],
    fallback:
      "🏓 当前有 {count} 个约球：\n{list}\n\n" +
      "到网站「约球」页可以申请加入。",
  },
  {
    key: "bot.group.eventList",
    label: "【群聊】活动列表",
    hint: "群里发「查询活动」时的回复。**必须含 {list}**。",
    maxLength: 800,
    required: ["list"],
    fallback:
      "📅 即将开始的活动（{count} 个）：\n{list}\n\n" +
      "到网站「活动」页可以报名。",
  },
  {
    key: "bot.group.noRooms",
    label: "【群聊】没有约球",
    hint: "当前没有正在招募的约球时的回复。",
    maxLength: 200,
    required: [],
    fallback: "目前没有正在招募的约球。\n你可以在网站「约球」页发起一个。",
  },
  {
    key: "bot.group.noEvents",
    label: "【群聊】没有活动",
    hint: "当前没有即将开始的活动时的回复。",
    maxLength: 200,
    required: [],
    fallback: "目前没有即将开始的活动。",
  },
  {
    key: "bot.group.queryFailed",
    label: "【群聊】查询失败",
    hint: "查询约球/活动出错时的回复。",
    maxLength: 200,
    required: [],
    fallback: "查询出错了，请稍后再试。",
  },
  {
    key: "bot.group.help",
    label: "【群聊】帮助",
    hint:
      "群里发「帮助」时的回复。改这里即可调整命令列表 —— " +
      "**新增命令时记得同步这一条**，否则用户看不到它。",
    maxLength: 600,
    required: [],
    fallback:
      "我是社团机器人，在群里可以做这些事：\n" +
      "\n" +
      "· 查询约球 —— 看当前有哪些约球、还差几人\n" +
      "· 查询活动 —— 看即将开始的活动、还剩几个名额\n" +
      "· 确认注册 —— 完成注册（网站提交后会 @ 你）\n" +
      "· 确认重置 —— 确认重置密码（网站提交后会 @ 你）\n" +
      "\n" +
      "注册与找回密码都在网站上发起，不用私聊我。",
  },
];

/** 按 key 快速查找定义。 */
export function findMessageDef(key: string): BotMessageDef | undefined {
  return BOT_MESSAGES.find((m) => m.key === key);
}

/**
 * 校验模板里的占位符。
 *
 * 只允许已知占位符 —— 防止管理员写出 `{cod}` 这种拼错的占位符，
 * 它会原样出现在用户看到的回复里。
 */
export function validateTemplate(
  def: BotMessageDef,
  template: string,
): { ok: true } | { ok: false; error: string } {
  const used = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const known = Object.keys(PLACEHOLDERS) as string[];

  const unknown = used.filter((u) => !known.includes(u));
  if (unknown.length > 0) {
    const list = [...new Set(unknown)].join("、");
    return {
      ok: false,
      error: `含有未知的占位符 {${list}}。可用的是：${known.map((k) => `{${k}}`).join("、")}`,
    };
  }

  const missing = def.required.filter((r) => !used.includes(r));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `必须包含占位符 ${missing.map((m) => `{${m}}`).join("、")} —— 否则这条回复会缺少关键信息`,
    };
  }

  return { ok: true };
}
