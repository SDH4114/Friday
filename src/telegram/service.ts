import type { ToolExecutionPolicy } from "../types/tool.js";

type TelegramUpdate = {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
};

type TelegramResponse<T> = { ok: boolean; result: T };

type PendingApproval = { chatId: number; resolve: (approved: boolean) => void; timer: NodeJS.Timeout };

export type TelegramService = { stop(): Promise<void>; sendMessage(chatId: string | number, text: string): Promise<void> };

export function startTelegramService(input: {
  token: string;
  allowedChatId?: string;
  onPrompt: (text: string, policy: ToolExecutionPolicy) => Promise<string>;
  onError?: (error: Error) => void;
}): TelegramService {
  let running = true;
  let offset = 0;
  let work = Promise.resolve();
  const pending = new Map<string, PendingApproval>();
  const api = `https://api.telegram.org/bot${input.token}`;

  async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${api}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json() as TelegramResponse<T> & { description?: string };
    if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? "request failed"}`);
    return json.result;
  }

  async function send(chatId: number, text: string, keyboard?: unknown): Promise<void> {
    await call("sendMessage", { chat_id: chatId, text: text.slice(0, 4000), ...(keyboard ? { reply_markup: keyboard } : {}) });
  }

  function approvalPolicy(chatId: number): ToolExecutionPolicy {
    return {
      confirmDangerousAction: async (action, details) => new Promise<void>((resolve, reject) => {
        const id = crypto.randomUUID().slice(0, 12);
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("Remote action approval timed out."));
        }, 5 * 60_000);
        pending.set(id, { chatId, timer, resolve: (approved) => approved ? resolve() : reject(new Error("Remote action denied by user.")) });
        void send(chatId, `Approval required\nAction: ${action}\nDetails: ${details}`, { inline_keyboard: [[{ text: "Approve", callback_data: `raya:approve:${id}` }, { text: "Deny", callback_data: `raya:deny:${id}` }]] }).catch(reject);
      })
    };
  }

  async function handle(update: TelegramUpdate): Promise<void> {
    offset = update.update_id + 1;
    const callback = update.callback_query;
    if (callback?.data?.startsWith("raya:")) {
      const [, decision, id] = callback.data.split(":");
      const item = pending.get(id);
      if (item && callback.message?.chat.id === item.chatId) {
        clearTimeout(item.timer); pending.delete(id); item.resolve(decision === "approve");
        await call("answerCallbackQuery", { callback_query_id: callback.id, text: decision === "approve" ? "Approved" : "Denied" });
      }
      return;
    }
    const message = update.message;
    if (!message?.text) return;
    if (input.allowedChatId && input.allowedChatId !== String(message.chat.id)) {
      await send(message.chat.id, "This Raya session does not allow this chat.");
      return;
    }
    work = work.then(async () => {
      await send(message.chat.id, "Raya is working…");
      const answer = await input.onPrompt(message.text!, approvalPolicy(message.chat.id));
      await send(message.chat.id, answer || "Completed.");
    }).catch(async (error: unknown) => {
      const messageText = error instanceof Error ? error.message : String(error);
      input.onError?.(error instanceof Error ? error : new Error(messageText));
      await send(message!.chat.id, `Raya error: ${messageText}`);
    });
  }

  const loop = (async () => {
    while (running) {
      try {
        const updates = await call<TelegramUpdate[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] });
        for (const update of updates) void handle(update);
      } catch (error) {
        if (running) input.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }
  })();

  return { async stop() { running = false; await Promise.race([loop, new Promise((resolve) => setTimeout(resolve, 500))]); }, async sendMessage(chatId,text){await send(Number(chatId),text);} };
}
