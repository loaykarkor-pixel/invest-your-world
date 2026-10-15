import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ar" | "en";

const dict = {
  headline: { en: "Invest in Your Financial Future", ar: "استثمر بذكاء، وابنِ مستقبلك المالي" },
  sub: {
    en: "Global stocks and fractional premium real estate — in one secure portfolio.",
    ar: "أسهم عالمية وعقارات فاخرة بملكية جزئية — في محفظة واحدة آمنة.",
  },
  login: { en: "Log in", ar: "تسجيل الدخول" },
  signup: { en: "Create account", ar: "إنشاء حساب" },
  getStarted: { en: "Get started", ar: "ابدأ الآن" },
  email: { en: "Email", ar: "البريد الإلكتروني" },
  password: { en: "Password", ar: "كلمة المرور" },
  fullName: { en: "Full name", ar: "الاسم الكامل" },
  google: { en: "Continue with Google", ar: "المتابعة عبر Google" },
  or: { en: "or", ar: "أو" },
  haveAccount: { en: "Already have an account?", ar: "لديك حساب؟" },
  noAccount: { en: "New here?", ar: "مستخدم جديد؟" },
  alreadyExists: { en: "This email is already registered. Log in, or use Continue with Google if you signed up with Google.", ar: "هذا البريد مسجّل مسبقاً. سجّل الدخول، أو استخدم المتابعة عبر Google إن كنت سجلت بها." },
  badLogin: { en: "Wrong email or password. If you signed up with Google, use Continue with Google.", ar: "البريد أو كلمة المرور غير صحيحة. إن سجلت عبر Google فاستخدم زر المتابعة عبر Google." },
  forgot: { en: "Forgot password?", ar: "نسيت كلمة المرور؟" },
  enterEmailFirst: { en: "Enter your email first.", ar: "أدخل بريدك الإلكتروني أولاً." },
  resetSent: { en: "If this email is registered, a reset link was sent.", ar: "إن كان البريد مسجلاً فقد أرسلنا رابط إعادة التعيين." },
  newPassword: { en: "New password", ar: "كلمة المرور الجديدة" },
  passwordUpdated: { en: "Password updated.", ar: "تم تحديث كلمة المرور." },
  invalidLink: { en: "This reset link is invalid or expired. Request a new one.", ar: "رابط إعادة التعيين غير صالح أو منتهي. اطلب رابطاً جديداً." },
  checkEmail: { en: "Check your email to confirm your account.", ar: "تحقق من بريدك لتأكيد الحساب." },
  home: { en: "Home", ar: "الرئيسية" },
  stocks: { en: "Stocks", ar: "الأسهم" },
  properties: { en: "Properties", ar: "العقارات" },
  portfolio: { en: "Portfolio", ar: "المحفظة" },
  transactions: { en: "Transactions", ar: "المعاملات" },
  profile: { en: "Profile", ar: "الملف الشخصي" },
  admin: { en: "Admin", ar: "الإدارة" },
  signOut: { en: "Sign out", ar: "تسجيل الخروج" },
  welcome: { en: "Welcome back", ar: "مرحباً بعودتك" },
  totalValue: { en: "Total invested", ar: "إجمالي الاستثمار" },
  monthlyIncome: { en: "Est. monthly income", ar: "الدخل الشهري المتوقع" },
  annualIncome: { en: "Est. annual income", ar: "الدخل السنوي المتوقع" },
  pending: { en: "Pending", ar: "قيد المراجعة" },
  active: { en: "Active", ar: "نشط" },
  confirmed: { en: "Confirmed", ar: "مؤكد" },
  rejected: { en: "Rejected", ar: "مرفوض" },
  allocation: { en: "Allocation", ar: "توزيع الأصول" },
  invest: { en: "Invest", ar: "استثمر" },
  price: { en: "Price", ar: "السعر" },
  dividend: { en: "Dividend yield", ar: "عائد التوزيعات" },
  yield: { en: "Annual yield", ar: "العائد السنوي" },
  funded: { en: "Funded", ar: "نسبة التمويل" },
  minInvest: { en: "Min. investment", ar: "الحد الأدنى" },
  amount: { en: "Amount (USD)", ar: "المبلغ (دولار)" },
  payWith: { en: "Pay with", ar: "الدفع عبر" },
  sendTo: { en: "Send exactly this amount to:", ar: "أرسل هذا المبلغ بالضبط إلى:" },
  network: { en: "Network", ar: "الشبكة" },
  txHash: { en: "Transaction hash (TXID)", ar: "رقم المعاملة (TXID)" },
  submit: { en: "Submit for review", ar: "إرسال للمراجعة" },
  submitted: { en: "Submitted. Our team will verify your payment.", ar: "تم الإرسال. سيتحقق فريقنا من الدفعة." },
  copy: { en: "Copy", ar: "نسخ" },
  empty: { en: "Nothing here yet.", ar: "لا يوجد شيء بعد." },
  explore: { en: "Explore investments", ar: "استكشف الاستثمارات" },
  approve: { en: "Approve", ar: "موافقة" },
  reject: { en: "Reject", ar: "رفض" },
  pendingPayments: { en: "Payments awaiting review", ar: "دفعات بانتظار المراجعة" },
  calc: { en: "Income calculator", ar: "حاسبة الدخل" },
  monthly: { en: "Monthly", ar: "شهرياً" },
  save: { en: "Save", ar: "حفظ" },
  phone: { en: "Phone", ar: "الهاتف" },
  country: { en: "Country", ar: "الدولة" },
  disclaimer: {
    en: "Investing involves risk. Projected income is an estimate and not guaranteed.",
    ar: "ينطوي الاستثمار على مخاطر. الدخل المتوقع تقديري وغير مضمون.",
  },
  date: { en: "Date", ar: "التاريخ" },
  asset: { en: "Asset", ar: "الأصل" },
  status: { en: "Status", ar: "الحالة" },
  user: { en: "User", ar: "المستخدم" },
} as const;

export type Key = keyof typeof dict;

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string }>({
  lang: "ar",
  setLang: () => {},
  t: (k) => dict[k].ar,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");
  useEffect(() => {
    const s = localStorage.getItem("lang");
    if (s === "en" || s === "ar") setLangState(s);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  const setLang = (l: Lang) => {
    localStorage.setItem("lang", l);
    setLangState(l);
  };
  return <Ctx.Provider value={{ lang, setLang, t: (k) => dict[k][lang] }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
