import type { DbService, ReminderInsert } from "@/services/db";

export class ReminderRepository {
  constructor(private db: DbService) {}
  create(data: ReminderInsert) { return this.db.createReminder(data); }
}
