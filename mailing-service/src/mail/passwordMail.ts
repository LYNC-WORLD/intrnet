import { PasswordMailPayload } from "../types";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

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
    from: `"NetClear" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
}

async function sendPasswordEmail(data:PasswordMailPayload) {
    const html = welcomeTemplate(data.name);
    const to = data.email;
    await sendEmail(to, "Welcome Email!!!", html);
}
function welcomeTemplate(name: string) {
  return `
    <h1>Welcome ${name}</h1>
    <p>Thanks for joining NetClear.</p>
  `;
}

const passwordMailData: PasswordMailPayload = {
    email: "vaibhav03joshi@gmail.com",
    name: "Vaibhav Joshi",
    password: "Anshu!1@2#3$4"
}

sendPasswordEmail(passwordMailData);