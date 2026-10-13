# Onyx Guest Requests - מדריך העלאה לענן (Cloud Deployment Guide)

עמוד הווב לקהל (`Dj-OnyxDownloader-Guest-Requests/index.html`) בנוי כאפליקציית ווב עצמאית, ללא שרת מקומי, רספונסיבית ומותאמת לסמארטפונים.
העמוד תומך בשני המצבים:
1. **כשהאירוע פעיל:** חיפוש שירים ביוטיוב, סימון בקשה, הזנת שם והקדשה, ומסך אישור כרטיס.
2. **כשהאירוע כבוי / קישור ישן:** עמוד מסיבה חגיגי (חלופה 3 - תקליט ויניל מסתובב) עם הכיתוב: *"המוזיקה נחה, אבל הקצב לא מפסיק... 💿 נתראה באירוע הבא!"* וקרדיט ל-**DJ Shazz & DJ Sonic**.

---

## אפשרויות העלאה לענן בחינם (0 ₪)

### אפשרות 1: העלאה מיידית דרך Vercel (מומלץ ומהיר - 30 שניות)
1. התקן את כלי ה-CLI של Vercel (או היכנס לאתר [vercel.com](https://vercel.com)):
   ```bash
   npx vercel Dj-OnyxDownloader-Guest-Requests --prod
   ```
2. קבל כתובת ציבורית קבועה, לדוגמה: `https://onyx-requests.vercel.app`
3. הדבק את הכתובת בתוכנת Onyx תחת **Guest Requests -> הגדרות**.

---

### אפשרות 2: Netlify Drop (ללא התקנות, בגרירה בלבד)
1. היכנס ל-[app.netlify.com/drop](https://app.netlify.com/drop).
2. גרור את תיקיית `Dj-OnyxDownloader-Guest-Requests` אל הדפדפן.
3. האתר עולה מיידית לאוויר בחינם עם כתובת מאובטחת (HTTPS).

---

### אפשרות 3: Firebase Hosting
1. הרץ:
   ```bash
   npx firebase-tools init hosting
   npx firebase-tools deploy --only hosting
   ```
2. תקבל דומיין חינמי: `https://<your-project>.web.app`.

---

## חיבור מסד הנתונים בזמן אמת (Firebase Realtime Database)
כדי שהבקשות יזרמו מהטלפון של האורח ישירות לתוכנת ה-Onyx במחשב:
1. פתח פרויקט חינמי ב-[Firebase Console](https://console.firebase.google.com).
2. צור **Realtime Database** במסלול החינמי (Spark).
3. תחת חוקי האבטחה (Rules), אפשר קריאה וכתיבה:
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
4. העתק את אובייקט ה-`firebaseConfig` והדבק אותו בהגדרות של תוכנת Onyx ו/או בראש `Dj-OnyxDownloader-Guest-Requests/index.html`.
