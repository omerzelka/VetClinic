# VetClinic

A lightweight desktop app for small veterinary clinics — patient records, appointments, automatic follow-up reminders, notifications and WhatsApp reminders. Built with Electron and SQLite (sql.js). The interface is available in **English** and **Turkish**.

Küçük veteriner klinikleri için masaüstü uygulaması — hasta kayıtları, randevular, otomatik kontrol randevuları, bildirimler ve WhatsApp hatırlatmaları. Arayüz **Türkçe** ve **İngilizce** kullanılabilir.

## Features

- **Treatments** — owner, phone, pet, species, diagnosis, treatment, date and fee; search, date sorting, owner autocomplete
- **Appointments** — pending / completed / cancelled / overdue status, one-click or bulk WhatsApp reminders
- **Auto appointment rules** — e.g. a rabies vaccine automatically books a booster 180 days later
- **Notifications** — appointments in the next 3 days are highlighted on launch (today / tomorrow / upcoming)
- **Word export** — all records as a landscape `.docx` table
- **Settings** — clinic name, currency, WhatsApp country code, language (TR / EN switch in the header)

On first launch the language follows the operating system (Turkish systems start in Turkish, others in English), and the default treatment types, diagnoses and rules are created in that language. Everything can be changed later.

## Getting started

```bash
npm install
npm start
```

## Build

```bash
npm run build       # Windows portable .exe
npm run build:mac   # macOS .dmg
./build.sh --help   # more Windows targets (NSIS, MSI, ZIP, arch)
```

The portable Windows build stores its database (`veteriner.db`) next to the `.exe`; otherwise it lives in the app's user-data folder.

## Tech

Electron · sql.js (SQLite) · docx · vanilla HTML/CSS/JS
