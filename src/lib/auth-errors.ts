import type { Lang } from "./i18n";

const map: [RegExp, { ar: string; en: string }][] = [
  [/invalid login credentials/i, { ar: "البريد أو كلمة المرور غير صحيحة. إن سجلت عبر Google فاستخدم زر المتابعة عبر Google.", en: "Wrong email or password. If you signed up with Google, use Continue with Google." }],
  [/email not confirmed/i, { ar: "لم يتم تأكيد بريدك بعد. افتح رسالة التأكيد في بريدك ثم سجّل الدخول.", en: "Your email isn't confirmed yet. Open the confirmation email, then log in." }],
  [/already registered|already exists/i, { ar: "هذا البريد مسجّل مسبقاً. سجّل الدخول أو استعد كلمة المرور.", en: "This email is already registered. Log in or reset your password." }],
  [/password should be|weak|pwned|leaked/i, { ar: "كلمة المرور ضعيفة. استخدم 8 أحرف على الأقل مع أرقام وحروف.", en: "Password is too weak. Use at least 8 characters with letters and numbers." }],
  [/rate limit|too many|security purposes/i, { ar: "محاولات كثيرة. انتظر دقيقة ثم حاول مجدداً.", en: "Too many attempts. Wait a minute and try again." }],
  [/invalid.*email|unable to validate email/i, { ar: "صيغة البريد الإلكتروني غير صحيحة.", en: "Invalid email address." }],
  [/same.*password|different from the old/i, { ar: "كلمة المرور الجديدة يجب أن تختلف عن القديمة.", en: "New password must differ from the old one." }],
  [/expired|invalid.*token|otp/i, { ar: "انتهت صلاحية الرابط. اطلب رابطاً جديداً.", en: "This link has expired. Request a new one." }],
  [/fetch|network/i, { ar: "تعذر الاتصال بالخادم. تحقق من الإنترنت.", en: "Can't reach the server. Check your connection." }],
];

export function authError(message: string, lang: Lang) {
  for (const [re, m] of map) if (re.test(message)) return m[lang];
  return lang === "ar" ? "حدث خطأ غير متوقع. حاول مجدداً." : message;
}
