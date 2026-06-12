# MindUp PWA Push Notifications

## 1. Tao VAPID keys

Tao mot cap VAPID key bang cong cu `web-push`:

```bash
npx web-push generate-vapid-keys
```

## 2. Dien public key vao frontend

Mo `pwa.js` va thay:

```js
const VAPID_PUBLIC_KEY = "REPLACE_WITH_YOUR_VAPID_PUBLIC_KEY";
```

bang public key vua tao.

## 3. Chay SQL migration

Chay file `SQL push notifications.sql` trong Supabase SQL Editor de tao bang:

```text
public.push_subscriptions
```

Bang nay luu endpoint cua cac thiet bi da bam cho phep thong bao.

## 4. Cau hinh Supabase Edge Function secrets

Dat cac secret sau cho Supabase project:

```bash
supabase secrets set VAPID_PUBLIC_KEY="PUBLIC_KEY"
supabase secrets set VAPID_PRIVATE_KEY="PRIVATE_KEY"
supabase secrets set VAPID_SUBJECT="mailto:admin@mindup.edu.vn"
```

Supabase da co san `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` trong Edge Function runtime.

## 5. Deploy Edge Function

```bash
supabase functions deploy send-push-notification
```

## 6. Cach gui push

Neu code tao row trong bang `notifications` bang `NotificationHelper.createNotification(...)` hoac `createBulkNotifications(...)`, he thong se tu goi Edge Function de gui push cho nguoi nhan da bat thong bao.

Co the gui truc tiep cho mot danh sach user:

```js
await NotificationHelper.sendPushToUsers({
  userIds: ["USER_ID"],
  title: "Nhac hoc phi",
  message: "Ban co hoc phi moi can thanh toan.",
  targetUrl: "tuition.html",
  type: "tuition_reminder"
});
```

Direct push chi danh cho admin/teacher. Push theo `notificationId` duoc phep khi nguoi goi la actor cua notification hoac la admin/teacher.
