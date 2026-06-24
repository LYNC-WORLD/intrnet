import dotenv from "dotenv";
import { Worker } from "bullmq";
import { connection, MAILING_QUEUE } from "./redis";
import { PasswordMailPayload } from "./types";
import { sendPasswordEmail } from "./mail/passwordMail";

dotenv.config();

const worker = new Worker(
  MAILING_QUEUE,
  async (job) => {
    if (job.name !== "send-password-mail") {
      return;
    }
    
    await sendPasswordEmail(job.data as PasswordMailPayload);
  },
  {
    connection,
  }
);

worker.on("completed", (job) => {
  console.log(`[copy-trade] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[copy-trade] Job ${job?.id} failed: ${err.message}`);
});

console.log(`Copy-trade worker listening on queue ${MAILING_QUEUE}`);
