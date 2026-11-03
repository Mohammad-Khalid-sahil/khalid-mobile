import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { stdin, stdout } from "node:process";
import { User } from "./models/index.js";

function readHidden(label) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") throw new Error("این فرمان را در یک ترمینال تعاملی اجرا کنید.");
  return new Promise((resolve, reject) => {
    let value = "";
    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("لغو شد."));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (value.length) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
        } else {
          value += char;
          stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}

try {
  const password = await readHidden("رمز جدید مدیر (حداقل ۶ نویسه): ");
  if (password.length < 6) throw new Error("رمز باید حداقل ۶ نویسه باشد.");

  const confirm = await readHidden("رمز را دوباره وارد کنید: ");
  if (password !== confirm) throw new Error("دو رمز یکسان نیستند.");

  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/khalid_mobile");
  const admin = await User.findOne({ username: "admin" }).select("+password");
  if (!admin) throw new Error("حساب admin پیدا نشد؛ هیچ داده‌ای تغییر نکرد.");

  admin.password = await bcrypt.hash(password, 10);
  admin.active = true;
  admin.mustChangePassword = true;
  admin.tokenVersion += 1;
  await admin.save();
  console.log("رمز مدیر بازنشانی شد. با نام کاربری admin و رمز جدید وارد شوید.");
} catch (error) {
  console.error(`بازنشانی انجام نشد: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
