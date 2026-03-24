import type { DbService, NotificationInsert } from "@/services/db";

export class NotificationRepository {
  constructor(private db: DbService) {}
  getAll(limit?: number) { return this.db.getNotifications(limit); }
  getByAppointmentIds(ids: string[]) { return this.db.getNotificationsByAppointmentIds(ids); }
  create(data: NotificationInsert) { return this.db.createNotification(data); }
  markRead(id: string) { return this.db.markNotificationRead(id); }
  markAllRead() { return this.db.markAllNotificationsRead(); }
  delete(id: string) { return this.db.deleteNotification(id); }
  subscribe(callback: () => void) { return this.db.subscribeToNotifications(callback); }
}
