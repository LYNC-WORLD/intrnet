import { PasswordMailPayload } from "../types";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { passwordEmailTemplate } from "./password-template";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendEmail(to: string, subject: string, html: string) {
  const info = await transporter.sendMail({
    from: `"Intrnet" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
}

export async function sendPasswordEmail(data: PasswordMailPayload) {
  const html = passwordEmailTemplate
    .replace(/{{name}}/g, data.name)
    .replace(/{{email}}/g, data.email)
    .replace(/{{password}}/g, data.password);
  const to = data.email;
  await sendEmail(to, "Temporary password", html);
}