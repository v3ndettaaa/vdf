# رفع خطاهای GitHub Actions و پایدارسازی بیلد خودکار (Release Workflow)

هدف این برنامه، برطرف کردن کامل خطاهای پایپ‌لاین GitHub Actions است تا با هر بار Push مستقیم از AI Studio به شاخه `main` (یا ثبت تگ جدید)، بیلدهای دسکتاپ (ویندوز، مک و لینوکس) و فایل‌های فشرده افزونه مرورگر (Chrome و Firefox) بدون خطا ساخته شده و در بخش Releases گیت‌هاب منتشر یا آپدیت شوند.

## User Review & Critical Decisions

> [!IMPORTANT]
> تصمیم‌های زیر بر اساس پاسخ‌های شما نهایی شده‌اند و پایپ‌لاین بر همین اساس تنظیم خواهد شد:

- **ساخت خودکار بیلد و آپدیت ریلیز در هر Push به `main` و تگ‌ها**: پایپ‌لاین در هر پوش به `main` و تگ‌های `v*` اجرا شده و فایل‌های نصبی دسکتاپ و افزونه‌ها را در ریلیز مربوط به نسخه فعلی (`v2.0.0`) ایجاد یا به‌روزرسانی می‌کند.
- **نصب پایدار پکیج‌ها با `npm install` استاندارد**: وابستگی به کشِ قفل‌شده (`cache: 'npm'`) که به دلیل نبود فایل `package-lock.json` باعث توقف فوری پایپ‌لاین در مرحله اول می‌شد حذف می‌گردد تا نصب پکیج‌ها در تمام سیستم‌عامل‌ها بدون خطا انجام شود.

> [!NOTE]
> **پاسخ به سوال شما درباره انتقال به ریپوی اصلی (`veditor`):**
> نیازی به تغییر هیچ کدی در پروژه نیست چون نام‌ها و آدرس‌ها از قبل روی `veditor` و `com.v3ndettaaa.veditor` تنظیم شده‌اند.
> - **روش ۱ (کپی فایل‌ها):** اگر هر دو ریپو را کلون کنید، محتویات ریپوی قبلی (به جز پوشه مخفی `.git`) را پاک کنید و تمام فایل‌های این ریپو (شامل پوشه مخفی `.github` و `.gitignore`، به جز `.git`) را کپی و Push کنید، همه‌چیز کاملاً سالم کار خواهد کرد.
> - **روش ۲ (سریع‌تر و بدون دردسر کپی دستی):** می‌توانید روی سیستم خودتان داخل پوشه کلون‌شده همین ریپو، دستور `git push https://github.com/v3ndettaaa/veditor.git main --force` را اجرا کنید تا کل پروژه به همراه تمام فایل‌های مخفی و تاریخچه کامیت‌ها یک‌جا منتقل شود.

---

## 1. Overview & Core Concept

- **What It Does**: اصلاح پیکربندی GitHub Actions و فایل تنظیمات باندلر (`vite.config.ts`) برای اطمینان از سازگاری کامل با محیط‌های اجرای لینوکس، ویندوز و مک در گیت‌هاب.
- **Target Audience / Persona**: توسعه‌دهنده و کاربران نهایی `veditor` که نسخه‌های نصبی دسکتاپ و افزونه مرورگر را مستقیماً از بخش Releases گیت‌هاب دریافت می‌کنند.
- **Key Value**: حذف خطاهای مرحله راه‌اندازی Node.js، حذف خطای ماژول ES در خواندن نسخه پکیج، و تضمین اجرای بی‌نقص بیلدها بلافاصله پس از هر Push از داخل AI Studio.

---

## 2. User Experience & Visual Design

این تغییر در لایه زیرساخت بیلد و انتشار (CI/CD) انجام می‌شود و ظاهر رابط کاربری برنامه را تغییر نمی‌دهد، اما تجربه انتشار نسخه را به شکل زیر بهبود می‌بخشد:

- **Key User Flows**:
  1. کاربر تغییرات را از AI Studio به گیت‌هاب Push می‌کند.
  2. اکشن `Release` به صورت خودکار در گیت‌هاب آغاز می‌شود.
  3. چهار بیلد دسکتاپ (macOS ARM64، macOS Intel، Ubuntu Linux، Windows) به صورت موازی کامپایل می‌شوند.
  4. پس از اتمام بیلد دسکتاپ، افزونه‌های Chrome و Firefox ساخته و زیپ می‌شوند و به همان Release اضافه می‌گردند.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: حذف `cache: 'npm'` از مرحله `actions/setup-node@v4` و استفاده از Node 22**
  - *Chosen Approach*: حذف گزینه `cache: 'npm'` و ارتقای نسخه Node.js در پایپ‌لاین به نسخه LTS جدید (`22`) به همراه اجرای مستقیم `npm install`.
  - *Why*: اکشن `setup-node` در صورت فعال بودن `cache: 'npm'` الزاماً به دنبال فایل `package-lock.json` می‌گردد و در صورت نبود آن در همان ثانیه اول با خطا متوقف می‌شود. همچنین استفاده از Node 22 پشتیبانی کامل از ویژگی‌های مدرن جاوااسکریپت را تضمین می‌کند.
  - *Alternatives Considered*: ساخت و کامیت کردن فایل سنگین `package-lock.json` که ممکن است با تغییرات بعدی پکیج‌ها در محیط‌های مختلف دچار ناهماهنگی شود.

- **Decision 2: اصلاح دستور استخراج نسخه در گیت‌هاب اکشن برای سازگاری با ES Modules**
  - *Chosen Approach*: جایگزینی `require('./package.json').version` با خواندن استاندارد فایل از طریق ماژول `fs` در Node.js.
  - *Why*: از آنجایی که در `package.json` مقدار `"type": "module"` تعریف شده است، استفاده از `require` در محیط اجرایی جدید خطای `ReferenceError: require is not defined` ایجاد می‌کند.

- **Decision 3: سازگاری کامل مسیرها در `vite.config.ts`**
  - *Chosen Approach*: تعریف متغیر مسیر بر پایه `fileURLToPath(new URL('.', import.meta.url))` در کنار `import.meta.dirname`.
  - *Why*: اطمینان از اینکه در هر نسخه از Node.js روی سیستم‌های مختلف یا سرورهای CI، مسیر فایل‌ها بدون هیچ خطایی شناسایی شود.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Pipeline Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                   GitHub Push (main branch / v* tag)                 │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Job 1: build-tauri (Matrix: macOS ARM/x64, Ubuntu 22.04, Windows)    │
│  ├─ actions/checkout@v4                                              │
│  ├─ actions/setup-node@v4 (Node 22, no lockfile cache crash)         │
│  ├─ dtolnay/rust-toolchain@stable                                    │
│  ├─ Ubuntu System Dependencies (webkit2gtk-4.1, gtk-3, ssl, etc.)    │
│  ├─ npm install                                                      │
│  └─ tauri-apps/tauri-action@v0 (Builds & creates/updates Release)    │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ (needs: build-tauri)
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Job 2: package-extensions (Ubuntu Latest)                            │
│  ├─ actions/checkout@v4 & actions/setup-node@v4 (Node 22)            │
│  ├─ npm install & npm run package (Builds Chrome & Firefox zips)     │
│  ├─ Read version via ESM-compatible Node fs.readFileSync             │
│  └─ softprops/action-gh-release@v2 (Attaches zips to v__VERSION__)   │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Pipeline Modifications
- **اصلاح مرحله راه‌اندازی Node در هر دو Job**: حذف پارامتر `cache: 'npm'` و استفاده از `node-version: 22`.
- **تکمیل پکیج‌های سیستمی لینوکس برای Tauri v2**: اطمینان از نصب بودن هدرهای ضروری (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libssl-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `xdg-utils`, `build-essential`, `curl`, `wget`, `file`).
- **اصلاح خواندن نسخه در مرحله پکیج افزونه**: استفاده از دستور سازگار با ESM برای استخراج نسخه از `package.json` و آپلود بدون خطای فایل‌های `veditor-chrome.zip` و `veditor-firefox.zip` در ریلیز گیت‌هاب.
