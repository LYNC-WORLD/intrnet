import { Queue } from "bullmq";
import { connection, MAILING_QUEUE } from "./redis";
import { PasswordMailPayload } from "./types";

const tradeQueue = new Queue(MAILING_QUEUE, { connection });

export async function publishTradeJob(payload: PasswordMailPayload) {
  await tradeQueue.add("send-password-mail", payload);
}
